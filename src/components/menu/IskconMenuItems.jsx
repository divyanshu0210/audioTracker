// IskconMenuItems.jsx
//
// Menu entries for an Iskcon file: "Download" when no local copy exists yet,
// "Remove Download" once one does. Downloading runs in the background
// service (with its own notification); this just kicks it off and toasts.
// Rendered as a child of react-native-material-menu's <Menu>, which keeps
// its children mounted even while closed (only the native Modal toggles),
// so it's safe to track this item's download status here rather than in
// the always-shared BaseMenu.

import React, {useEffect} from 'react';
import {Alert, StyleSheet, Text, ToastAndroid} from 'react-native';
import RNFS from 'react-native-fs';
import {MenuItem} from 'react-native-material-menu';
import {useShallow} from 'zustand/react/shallow';
import {updateItemFields} from '../../database/U';
import {useMediaStore} from '../../stores/useMediaStore';
import {enqueueDownload} from '../../backgroundService/backgroundDownloadService';
import {ensureDbItem, getLocalFilePath} from '../../scrap/iskconActions';
import useDownloadStore from '../../stores/useDownloadStore';

const IskconMenuItems = ({item, hideMenu}) => {
  const {setIskconEntries} = useMediaStore(
    useShallow(state => ({setIskconEntries: state.setIskconEntries})),
  );
  const status = useDownloadStore(state => state.downloads[item.source_id]?.status);
  const removeDownload = useDownloadStore(state => state.removeDownload);

  useEffect(() => {
    if (status !== 'done') return;
    const localPath = useDownloadStore.getState().downloads[item.source_id]?.localPath;
    setIskconEntries(prev =>
      prev.map(f => (f.source_id === item.source_id ? {...f, file_path: localPath} : f)),
    );
    removeDownload(item.source_id);
  }, [status]);

  const downloaded = !!item.file_path;

  const handleDownload = async () => {
    const localPath = getLocalFilePath(item.source_id, item.title);
    if (await RNFS.exists(localPath)) {
      Alert.alert('Already downloaded', 'File is already saved locally.');
      return;
    }
    const dbItem = await ensureDbItem(item);
    if (dbItem.id !== item.id) {
      setIskconEntries(prev =>
        prev.map(f => (f.source_id === item.source_id ? {...f, id: dbItem.id} : f)),
      );
    }
    await enqueueDownload({
      id: dbItem.id,
      sourceId: item.source_id,
      title: item.title,
      url: item.url,
      localPath,
      type: 'iskcon_file',
      mimeType: 'audio/mpeg',
    });
    ToastAndroid.show('Preparing download. See notification for details', ToastAndroid.LONG);
  };

  const handleRemove = async () => {
    try {
      if (await RNFS.exists(item.file_path)) {
        await RNFS.unlink(item.file_path);
      }
      await updateItemFields(item.id, {file_path: null});
      setIskconEntries(prev =>
        prev.map(f => (f.source_id === item.source_id ? {...f, file_path: null} : f)),
      );
      ToastAndroid.show('Download removed', ToastAndroid.SHORT);
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  const handleRemoveConfirm = () => {
    Alert.alert('Confirm Deletion', 'This will delete the downloaded copy.', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: handleRemove},
    ]);
  };

  return (
    <MenuItem
      onPress={() => {
        hideMenu();
        downloaded ? handleRemoveConfirm() : handleDownload();
      }}>
      <Text style={styles.menuItemText}>
        {downloaded ? 'Remove Download' : 'Download'}
      </Text>
    </MenuItem>
  );
};

export default IskconMenuItems;

const styles = StyleSheet.create({
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
