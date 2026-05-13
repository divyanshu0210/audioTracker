import {DRIVE_API_KEY} from '@env';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, Animated, SafeAreaView, StyleSheet} from 'react-native';
import {getItemBySourceId, upsertItem} from '../database/C';
import {getChildrenByParent} from '../database/R';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import useAppStateStore from '../stores/appStateStore';
import AppHeader from '../components/headers/AppHeader';
import {useMediaStore} from '../stores/useMediaStore';

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
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files?q='${source_id}'+in+parents&key=${DRIVE_API_KEY}&fields=files(id,name,mimeType)`,
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
// currentItems: items for folderStack[last]  (plain useState — no global store
//   needed for this anymore, which eliminates cross-screen re-renders)
// ─────────────────────────────────────────────────────────────────────────────

const GoogleDriveViewer = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {driveInfo} = route.params || {};

  // ── Local state ────────────────────────────────────────────────────────────
  const [folderStack, setFolderStack] = useState([
    {source_id: driveInfo.source_id, title: driveInfo.title ?? 'Drive'},
  ]);
  const [currentItems, setCurrentItems] = useState([]);
  const [loading, setLoading] = useState(false);
  

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
    slideAnim.setValue(1);   // start off-screen right
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [slideAnim]);

  const animateOut = useCallback(onDone => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start(onDone);
  }, [slideAnim]);

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 350],  // slide right = going back
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
      // folder = { source_id, title, mimeType, ... }
      setFolderStack(prev => {
        const last = prev[prev.length - 1];
        if (last?.source_id === folder.source_id) return prev; // guard duplicate
        return [...prev, {source_id: folder.source_id, title: folder.title}];
      });
      animateIn();
    },
    [animateIn],
  );

  // ── Go back one folder (internal pop) ─────────────────────────────────────
  const goBackFolder = useCallback(() => {
    if (folderStack.length <= 1) {
      // At root → let the navigator handle it (actual screen removal)
      navigation.goBack();
      return;
    }
    animateOut(() => {
      setFolderStack(prev => prev.slice(0, -1));
      slideAnim.setValue(0); // reset for next interaction
    });
  }, [folderStack.length, navigation, animateOut, slideAnim]);

  // ── Intercept hardware back / swipe gesture ────────────────────────────────
  // When the internal stack has depth > 1, preventDefault() stops the screen
  // from being removed and we pop internally instead.
  useFocusEffect(
    useCallback(() => {
      const onBeforeRemove = e => {
        if (folderStack.length > 1) {
          e.preventDefault();  // ← block actual nav removal
          goBackFolder();
        }
        // If folderStack.length === 1, allow the event: screen exits normally.
      };
      const unsubscribe = navigation.addListener('beforeRemove', onBeforeRemove);
      return () => unsubscribe();
    }, [navigation, folderStack.length, goBackFolder]),
  );

  // ── Breadcrumb jump: tap any ancestor folder ───────────────────────────────
  const handleBreadcrumbPress = useCallback(
  folderId => {
    const targetIndex = folderStack.findIndex(f => f.source_id === folderId);
    if (targetIndex === -1 || targetIndex === folderStack.length - 1) return;

    animateOut(() => {
      const targetFolder = folderStack[targetIndex];   // grab before slicing
      setFolderStack(prev => prev.slice(0, targetIndex + 1));
      slideAnim.setValue(0);
      // ← add this
      fetchDriveItems(
        targetFolder.source_id,
        folderCacheRef.current,
        setFolderCache,
        setCurrentItems,
        setLoading,
      );
    });
  },
  [folderStack, animateOut, slideAnim],
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
              {},                   // pass empty cache to force refresh
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