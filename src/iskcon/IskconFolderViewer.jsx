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

import {loadIskconFolderEntries} from './iskconActions';
import IskconList from './IskconList';
import AppHeader from '../components/headers/AppHeader';
import SearchBarToggle from '../appMentor/SearchBarToggle';
import {useMediaStore} from '../stores/useMediaStore';

const IskconFolderViewer = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const {folder} = route.params || {};

  // folderStack stays local — it's this screen's navigation state, exactly as
  // GoogleDriveViewer keeps its own. The listing, though, lives in the store
  // (useMediaStore.data is Drive's equivalent), so a row can read its download
  // state from there instead of this screen prop-drilling it down.
  const [folderStack, setFolderStack] = useState([folder]);
  const entries = useMediaStore(state => state.iskconFolderEntries);
  const setEntries = useMediaStore(state => state.setIskconFolderEntries);
  // Loading and error stay local: they describe this screen's fetch, not the
  // data. PlaylistView keeps its `loading` local the same way.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchBarRef = useRef();

  const current = folderStack[folderStack.length - 1];

  const load = useCallback(
    async encodedPath => {
      setLoading(true);
      setError(null);
      try {
        await loadIskconFolderEntries(encodedPath);
      } catch (e) {
        setError(e?.message || 'Failed to load. Check your connection.');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [setEntries],
  );

  useEffect(() => {
    load(current.encodedPath);
    setSearchQuery('');
    searchBarRef.current?.close();
  }, [current.encodedPath, load]);

  // Clear on unmount so the next folder opened doesn't flash the last one's
  // contents before its fetch lands — same cleanup GoogleDriveViewer does for
  // useMediaStore.data.
  useEffect(
    () => () => useMediaStore.getState().setIskconFolderEntries([]),
    [],
  );

  // One unlabelled group: a folder's contents are its contents, and the base
  // list's date grouping means nothing for entries scraped off a web page.
  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const displayEntries = q
      ? entries.filter(e => e.title?.toLowerCase().includes(q))
      : entries;
    return displayEntries.length ? [{title: '', data: displayEntries}] : [];
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
        sections={sections}
        showSectionHeaders={false}
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
