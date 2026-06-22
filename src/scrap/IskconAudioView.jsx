// IskconAudioView.jsx
//
// Tab screen: shows only the ROOT listing of audio.iskcondesiretree.com.
// Tapping a folder leaves the Home tabs and pushes IskconFolderViewer (mirrors
// how Drive items open GoogleDriveViewer). Tapping a file plays it.

import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {loadFolderEntries} from './iskconActions';
import IskconList from './IskconList';
import {navigationRef} from '../handlers/navigationRef';
import useIskconPinsStore from '../stores/useIskconPinsStore';

const IskconAudioView = () => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pinnedFolders = useIskconPinsStore(state => state.pinnedFolders);
  const loadPins = useIskconPinsStore(state => state.loadPins);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {folders, files} = await loadFolderEntries('');
      setEntries([...folders, ...files]);
    } catch (e) {
      setError(e?.message || 'Failed to load. Check your connection.');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPins();
    load();
  }, [load, loadPins]);

  const onFolderPress = useCallback(folder => {
    navigationRef.navigate('IskconFolderViewer', {folder});
  }, []);

  // Pinned folders (which may live anywhere in the tree) surface here, at the
  // outermost screen, under their own "Pinned" header, so they're reachable
  // in one tap regardless of depth. Drop any root folder that's also pinned
  // so it isn't shown twice.
  const pinnedPaths = new Set(pinnedFolders.map(f => f.encodedPath));
  const restEntries = entries.filter(
    e => !(e.kind === 'folder' && pinnedPaths.has(e.encodedPath)),
  );
  const displayEntries = pinnedFolders.length
    ? [
        {kind: 'section', id: 'section-pinned', label: 'Pinned'},
        ...pinnedFolders.map(f => ({kind: 'folder', ...f})),
        ...(restEntries.length
          ? [{kind: 'section', id: 'section-all', label: 'All'}]
          : []),
        ...restEntries,
      ]
    : restEntries;

  return (
    <View style={styles.container}>
      <IskconList
        loading={loading}
        error={error}
        entries={displayEntries}
        onRetry={load}
        onFolderPress={onFolderPress}
      />
    </View>
  );
};

export default IskconAudioView;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},
});
