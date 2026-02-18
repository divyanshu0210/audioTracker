import {DRIVE_API_KEY} from '@env';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import axios from 'axios';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InteractionManager,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../contexts/AppStateContext';
import {getItemBySourceId, upsertItem} from '../database/C';
import {getChildrenByParent} from '../database/R';
import BaseMediaListComponent from './BaseMediaListComponent';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import useAppStateStore from '../contexts/appStateStore';
import AppHeader from '../components/headers/AppHeader';

export const fetchDriveItems = async (
  source_id,
  folderCache,
  getFolderFromCache,
  setFolderCache,
  setData,
  setLoading,
) => {
  if (!source_id) {
    console.error('Error', 'Invalid Drive ID');
    return;
  }
  console.log('parent_id', source_id);

  try {
    setLoading?.(true);
    console.log('folderCache:', folderCache);
    // const cached = getFolderFromCache(source_id);
    // if (cached) {
    //   console.log('Using cached memory data');
    //   setData(cached);
    //   setLoading?.(false);
    //   return;
    // }
    // ── First try database ────────────────────────────────────────
    const parentItem = await getItemBySourceId(source_id, 'drive_folder');
    if (!parentItem) {
      console.log('Parent folder not found in DB:', source_id);
      setData([]);
      return;
    }

    const storedFiles = await getChildrenByParent(parentItem.id, [
      'drive_file',
      'drive_folder',
    ]);
    if (storedFiles.length > 0) {
      setData(storedFiles); // ← already correct shape
      // ✅ Save to memory cache
      setFolderCache(source_id, storedFiles);

      console.log('Got files from database');
      return;
    }
    // ── Not in DB → fetch from Google Drive API ───────────────────
    console.log('Not found in DB, fetching via API...');
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files?q='${source_id}'+in+parents&key=${DRIVE_API_KEY}&fields=files(id,name,mimeType)`,
    );

    const driveFiles = response.data.files;

    if (!driveFiles?.length) {
      setData([]);
      console.log('Google Drive returned no files');
      return;
    }

    // ── Store in DB and get back the created/upserted records ─────
    console.log(`Storing ${driveFiles.length} new items...`);
    const storedItems = await storeInDB(driveFiles, parentItem.id);
    setData(storedItems);
    // ✅ Cache API results too
    setFolderCache(source_id, storedItems);

    console.log('Fetch + store complete');
  } catch (error) {
    console.error('Failed to fetch/store Google Drive data:', error);
    Alert.alert('Error', 'Failed to fetch Google Drive data.');
    setData([]); // ← or keep previous data — your choice
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
          // out_show: 0,
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

const GoogleDriveViewer = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const {driveInfo, folderStack: passedStack} = route.params || {};
  const {loading, setLoading} = useAppStateStore();
  const breadcrumbListRef = useRef(null);
  const {data, setData, folderStack, setFolderStack} = useAppState();
  const folderCache = useAppStateStore(state => state.folderCache);
  const setFolderCache = useAppStateStore(state => state.setFolderCache);
  const getFolderFromCache = useAppStateStore(
    state => state.getFolderFromCache,
  );
  const isProgrammaticPop = useRef(false);

  useFocusEffect(
    React.useCallback(() => {
      const onBeforeRemove = e => {
        if (isProgrammaticPop.current) {
          isProgrammaticPop.current = false;
          return;
        }
        if (folderStack.length > 0) {
          handleBackPress((navigate = false));
        }
      };
      const unsubscribe = navigation.addListener(
        'beforeRemove',
        onBeforeRemove,
      );
      return () => unsubscribe();
    }, [navigation, folderStack]),
  );

  useFocusEffect(
    useCallback(() => {
      if (driveInfo.source_id) {
        fetchDriveItems(
          driveInfo.source_id,
          folderCache,
          getFolderFromCache,
          setFolderCache,
          setData,
          setLoading,
        );
        if (passedStack) {
          setFolderStack(passedStack);
        }
      } else {
        Alert.alert('Invalid URL', 'Please enter a valid Google Drive link.');
      }
    }, [driveInfo, passedStack]),
  );

  useEffect(() => {
    if (folderStack.length > 0) {
      console.log(folderStack);
      setTimeout(
        () => breadcrumbListRef.current?.scrollToEnd({animated: false}),
        10,
      );
    }
  }, [folderStack]);

  const handleBreadcrumbClick = folderId => {
    setLoading(true);

    // Give React one frame to render loader
    requestAnimationFrame(() => {
      setTimeout(() => {
        doNavigation(folderId);
      }, 0);
    });
  };

  const doNavigation = folderId => {
    const state = navigation.getState();
    const routes = state.routes;

    const targetIndex = routes.findIndex(
      r =>
        r.name === 'GoogleDriveViewer' &&
        r.params?.driveInfo?.source_id === folderId,
    );

    if (targetIndex !== -1) {
      const popCount = routes.length - 1 - targetIndex;
      isProgrammaticPop.current = true;

      setFolderStack(prevStack => {
        const indexInStack = prevStack.findIndex(f => f.source_id === folderId);
        if (indexInStack === -1) return prevStack;
        return prevStack.slice(0, indexInStack + 1);
      });

      navigation.pop(popCount);
    }
  };

  const handleBackPress = (navigate = true) => {
    const newStack = [...folderStack];
    newStack.pop();
    setFolderStack(newStack);
    if (navigate) {
      navigation.goBack();
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        breadcrumbs={folderStack.map(f => ({
          id: f.source_id,
          title: f.title,
        }))}
        onBreadcrumbPress={handleBreadcrumbClick}
        onBackPress={handleBackPress}
        enableSearch
        searchParams={{
          initialSearchActive: true,
          mode: 'items',
          sourceId: driveInfo.id,
          initialActiveFilters:['drive_file','drive_folder']
        }}
      />

      {loading ? (
        <ActivityIndicator size="large" color="#0000ff" style={styles.loader} />
      ) : (
        <BaseMediaListComponent
          mediaList={data}
          emptyText={'No items in this folder.'}
          onRefresh={() => {}}
          loading={loading}
          type={ItemTypes.DRIVE}
          screen={ScreenTypes.IN}
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
  loader: {
    marginTop: 20,
  },
});
