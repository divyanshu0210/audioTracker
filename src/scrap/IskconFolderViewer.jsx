// IskconFolderViewer.jsx
//
// Stacked screen (pushed from the Iskcon tab) that walks deeper into the
// audio.iskcondesiretree.com folder tree. Like GoogleDriveViewer it keeps an
// internal folderStack: tapping a folder pushes onto it, hardware/gesture back
// pops it, and only at the root does back remove the screen.

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import {useFocusEffect, useNavigation, useRoute} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {loadFolderEntries} from './iskconActions';
import IskconList from './IskconList';
import AppHeader from '../components/headers/AppHeader';
import SearchBarToggle from '../appMentor/SearchBarToggle';

const IskconFolderViewer = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {folder} = route.params || {};

  const [folderStack, setFolderStack] = useState([folder]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchBarRef = useRef();

  const current = folderStack[folderStack.length - 1];

  const load = useCallback(async encodedPath => {
    setLoading(true);
    setError(null);
    try {
      const {folders, files} = await loadFolderEntries(encodedPath);
      setEntries([...folders, ...files]);
    } catch (e) {
      setError(e?.message || 'Failed to load. Check your connection.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(current.encodedPath);
    setSearchQuery('');
    searchBarRef.current?.close();
  }, [current.encodedPath, load]);

  const displayEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? entries.filter(e => e.title?.toLowerCase().includes(q)) : entries;
  }, [entries, searchQuery]);

  const onFolderPress = useCallback(f => {
    setFolderStack(prev => [
      ...prev,
      {encodedPath: f.encodedPath, path: f.path, title: f.title},
    ]);
  }, []);

  const goBack = useCallback(() => {
    if (folderStack.length <= 1) {
      navigation.goBack();
      return;
    }
    setFolderStack(prev => prev.slice(0, -1));
  }, [folderStack.length, navigation]);

  const jumpTo = useCallback(folderId => {
    setFolderStack(prev => {
      const idx = prev.findIndex(f => f.encodedPath === folderId);
      return idx === -1 ? prev : prev.slice(0, idx + 1);
    });
  }, []);

  // Intercept gesture / hardware back so it pops the internal stack first.
  useFocusEffect(
    useCallback(() => {
      const onBeforeRemove = e => {
        if (folderStack.length > 1) {
          e.preventDefault();
          setFolderStack(prev => prev.slice(0, -1));
        }
      };
      const unsub = navigation.addListener('beforeRemove', onBeforeRemove);
      return () => unsub();
    }, [navigation, folderStack.length]),
  );

  return (
    <SafeAreaView style={styles.container}>
      <AppHeader
        showBack={!searchActive}
        onBackPress={goBack}
        breadcrumbs={
          searchActive
            ? []
            : folderStack.map(f => ({id: f.encodedPath, title: f.title}))
        }
        onBreadcrumbPress={jumpTo}
        rightComponent={
          <SearchBarToggle
            ref={searchBarRef}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search in folder..."
            autoFocus
            onToggle={setSearchActive}
            icon={
              <MaterialIcons
                name={searchActive ? 'close' : 'search'}
                size={22}
                color="#222"
              />
            }
          />
        }
      />
      <IskconList
        loading={loading}
        error={error}
        entries={displayEntries}
        onRetry={() => load(current.encodedPath)}
        onFolderPress={onFolderPress}
      />
    </SafeAreaView>
  );
};

export default IskconFolderViewer;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
});
