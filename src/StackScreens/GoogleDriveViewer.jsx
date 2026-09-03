import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Animated, SafeAreaView, StyleSheet} from 'react-native';
import {useMediaStore} from '../stores/useMediaStore';
import {getItemBySourceId, upsertItem} from '../database/C';
import {getChildrenByParent} from '../database/R';
import BaseMediaListComponent from './BaseMediaListComponent';
import SaveToListBar from '../components/SaveToListBar';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import AppHeader from '../components/headers/AppHeader';
import useLoadingStore from '../stores/useLoadingStore';
import {getGoogleAccessToken} from '../auth/tokenManager';

export const fetchDriveItems = async (
  source_id,
  folderCache,
  setFolderCache,
  setCurrentItems,
  setLoading,
) => {
  if (!source_id) {
    console.error('Error', 'Invalid Drive ID');
    return;
  }

  // ── 1. Check local in-memory cache first (instant, no DB round-trip) ──────
  if (folderCache[source_id]) {
    console.log('Cache hit:', source_id);
    setCurrentItems(folderCache[source_id]);
    return;
  }

  try {
    setLoading?.(true);

    // ── 2. Try database ───────────────────────────────────────────────────────
    const parentItem = await getItemBySourceId(source_id, 'drive_folder');
    if (!parentItem) {
      console.log('Parent folder not found in DB:', source_id);
      setCurrentItems([]);
      return;
    }

    const storedFiles = await getChildrenByParent(parentItem.id, [
      'drive_file',
      'drive_folder',
    ]);
    if (storedFiles.length > 0) {
      setCurrentItems(storedFiles);
      setFolderCache(source_id, storedFiles);
      console.log('Got files from database');
      return;
    }

    // ── 3. Not in DB → fetch from Google Drive API ────────────────────────────
    console.log('Not found in DB, fetching via API...');
    // Ask as the signed-in user, not with the bare API key. An API key only
    // sees "anyone with the link" content, so a folder from the user's own
    // Drive listed as empty: the query matched nothing visible to an
    // anonymous caller and came back 200 with files: [] — no error to show,
    // just a folder that looked empty. handleDriveLink already reads the
    // folder's own metadata with this token, which is why adding it worked
    // while opening it did not.
    const accessToken = await getGoogleAccessToken();
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        `'${source_id}' in parents and trashed = false`,
      )}&fields=files(id,name,mimeType)&pageSize=1000`,
      {headers: {Authorization: `Bearer ${accessToken}`}},
    );

    const driveFiles = response.data.files;
    if (!driveFiles?.length) {
      setCurrentItems([]);
      console.log('Google Drive returned no files');
      return;
    }

    console.log(`Storing ${driveFiles.length} new items...`);
    const storedItems = await storeInDB(driveFiles, parentItem.id);
    setCurrentItems(storedItems);
    setFolderCache(source_id, storedItems);
    console.log('Fetch + store complete');
  } catch (error) {
    console.error('Failed to fetch/store Google Drive data:', error);
    Alert.alert('Error', 'Failed to fetch Google Drive data.');
    setCurrentItems([]);
  } finally {
    setLoading?.(false);
  }
};

const storeInDB = async (files, parentInternalId) => {
  try {
    const insertedItems = [];
    for (const file of files) {
      try {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        const inserted = await upsertItem({
          source_id: file.id,
          type: isFolder ? 'drive_folder' : 'drive_file',
          title: file.name,
          parent_id: parentInternalId,
          mimeType: file.mimeType,
          file_path: null,
          in_show: 1,
        });
        insertedItems.push(inserted);
        console.log(`✅ Stored: ${file.name}`);
      } catch (err) {
        console.error(`❌ Failed to store ${file.name}:`, err);
      }
    }
    return insertedItems;
  } catch (error) {
    console.error('❌ Error in storeInDB:', error);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component: GoogleDriveViewer
//
// Architecture change:
//   BEFORE → push a new GoogleDriveViewer screen per sub-folder (stack grows)
//   AFTER  → one screen with an internal folderStack array.
//            Swipe-back / hardware-back pops the internal stack;
//            only when we're at the root does it remove the screen from nav.
//
// folderStack shape: Array<{ source_id: string, title: string }>
//   index 0  = root folder (the driveInfo passed via route.params)
//   last     = currently visible folder
//
// currentItems: items for folderStack[last] — stored in useMediaStore.data so
//   DownloadButton's setData update propagates to DriveItem without prop drilling.
// ─────────────────────────────────────────────────────────────────────────────

const GoogleDriveViewer = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {driveInfo} = route.params || {};

  const renderCount = useRef(0);
  renderCount.current++;
  console.log(`🎯 Render GOOGLE DRIVE VIEWER #${renderCount.current}`);

  // ── State ──────────────────────────────────────────────────────────────────
  const [folderStack, setFolderStack] = useState([
    {source_id: driveInfo.source_id, title: driveInfo.title ?? 'Drive'},
  ]);
  // currentItems lives in the media store so DownloadButton's setData update
  // is visible to DriveItem's file_path selector without prop drilling.
  const currentItems = useMediaStore(state => state.data);
  const setCurrentItems = useMediaStore(state => state.setData);
  const setLoading = useLoadingStore(state => state.setLoading);
  const loading = useLoadingStore(state => state.loading);

  // Clear store data when viewer unmounts so stale folder items don't linger.
  useEffect(() => () => useMediaStore.getState().setData([]), []);

  // In-memory folder cache: { [source_id]: items[] }
  // Stored in a ref so it survives re-renders without causing them.
  const folderCacheRef = useRef({});

  const setFolderCache = useCallback((source_id, items) => {
    folderCacheRef.current[source_id] = items;
  }, []);

  // ── Slide animation ────────────────────────────────────────────────────────
  // slideAnim goes 0→1 on push (slide in from right), 1→0 on pop (slide out to right).
  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateIn = useCallback(() => {
    slideAnim.setValue(1); // start off-screen right
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      // easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 350],
  });

  // ── Fetch items whenever the top of the folder stack changes ─────────────
  const currentFolder = folderStack[folderStack.length - 1];

  useEffect(() => {
    if (!currentFolder?.source_id) {
      Alert.alert('Invalid URL', 'Please enter a valid Google Drive link.');
      return;
    }
    fetchDriveItems(
      currentFolder.source_id,
      folderCacheRef.current,
      setFolderCache,
      setCurrentItems,
      setLoading,
    );
  }, [currentFolder?.source_id]);

  // ── Navigate INTO a sub-folder (called by BaseItem instead of StackActions.push) ──
  // Expose via a ref so BaseItem / DriveItem can call it without prop-drilling.
  // See note below about how BaseItem calls this.
  const openFolder = useCallback(
    folder => {
      const cached = folderCacheRef.current[folder.source_id];
      animateIn();
      if (cached) setCurrentItems(cached);
      else setCurrentItems([]);
      setFolderStack(prev => {
        const last = prev[prev.length - 1];
        if (last?.source_id === folder.source_id) return prev;
        return [...prev, {source_id: folder.source_id, title: folder.title}];
      });
    },
    [animateIn],
  );

  // ── Go back one folder (internal pop) ─────────────────────────────────────
  const goBackFolder = useCallback(() => {
    if (folderStack.length <= 1) {
      navigation.goBack();
      return;
    }
    const prevFolder = folderStack[folderStack.length - 2];
    const cached = folderCacheRef.current[prevFolder.source_id];
    animateIn();
    if (cached) setCurrentItems(cached);
    else setCurrentItems([]);
    setFolderStack(prev => prev.slice(0, -1));
  }, [folderStack, navigation, animateIn]);

  // ── Intercept hardware back / swipe gesture ────────────────────────────────
  // When the internal stack has depth > 1, preventDefault() stops the screen
  // from being removed and we pop internally instead.
  useFocusEffect(
    useCallback(() => {
      const onBeforeRemove = e => {
        if (folderStack.length > 1) {
          e.preventDefault(); // ← block actual nav removal
          goBackFolder();
        }
        // If folderStack.length === 1, allow the event: screen exits normally.
      };
      const unsubscribe = navigation.addListener(
        'beforeRemove',
        onBeforeRemove,
      );
      return () => unsubscribe();
    }, [navigation, folderStack.length, goBackFolder]),
  );

  // ── Breadcrumb jump: tap any ancestor folder ───────────────────────────────
  const handleBreadcrumbPress = useCallback(
    folderId => {
      const targetIndex = folderStack.findIndex(f => f.source_id === folderId);
      if (targetIndex === -1 || targetIndex === folderStack.length - 1) return;

      const targetFolder = folderStack[targetIndex];
      const cached = folderCacheRef.current[targetFolder.source_id];
      animateIn();
      if (cached) setCurrentItems(cached);
      else setCurrentItems([]);
      setFolderStack(prev => prev.slice(0, targetIndex + 1));
    },
    [folderStack, animateIn],
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header / Breadcrumbs ── */}
      <AppHeader
        breadcrumbs={folderStack.map(f => ({
          id: f.source_id,
          title: f.title,
        }))}
        onBreadcrumbPress={handleBreadcrumbPress}
        onBackPress={goBackFolder}
        enableSearch
        searchParams={{
          initialSearchActive: true,
          mode: 'items',
          sourceId: driveInfo.id,
          initialActiveFilters: ['drive_file', 'drive_folder'],
        }}
      />

      {/* ── Animated list container ── */}
      <Animated.View style={[styles.listWrapper, {transform: [{translateX}]}]}>
        <BaseMediaListComponent
          mediaList={currentItems}
          emptyText={'No items in this folder.'}
          onRefresh={() =>
            fetchDriveItems(
              currentFolder.source_id,
              {}, // pass empty cache to force refresh
              setFolderCache,
              setCurrentItems,
              setLoading,
            )
          }
          loading={loading}
          type={ItemTypes.DRIVE}
          screen={ScreenTypes.IN}
          onFolderPress={openFolder}
        />
      </Animated.View>

      {/* Only at the root of the stack, and only for a folder that isn't in
          the Drive list yet — that pairing is a folder opened from a shared
          link. A subfolder is not a separate thing to keep: it comes with its
          parent, and browsing into one shouldn't offer to file it on its own.
          Same warning as PlaylistView: a folder has no history to be found in
          again. */}
      {folderStack.length === 1 && (
        <SaveToListBar
          item={driveInfo}
          note="Not in your list — add it now, or you'll need the link again."
        />
      )}
    </SafeAreaView>
  );
};

export default GoogleDriveViewer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  listWrapper: {
    flex: 1,
  },
});