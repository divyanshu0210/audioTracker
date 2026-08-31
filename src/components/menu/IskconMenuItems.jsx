// IskconMenuItems.jsx
//
// Menu entries for an Iskcon file: "Download" when no local copy exists yet,
// "Remove Download" once one does. Downloading runs in the background
// service (with its own notification); this just kicks it off and toasts.
// Only rendered (via BaseMenu) once a download isn't active — see
// IskconItem, which swaps this out for a progress indicator while
// queued/downloading — so the "download finished" store sync can't live
// here; it's handled in IskconItem instead, which stays mounted throughout.

import React, {useEffect, useState} from 'react';
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

  // Two things were wrong with reading `!!item.file_path` here.
  //
  // An iskcon file's file_path holds the remote url until a copy is actually
  // downloaded — ensureDbItem parks it there so the file is streamable — so a
  // file that had only ever been played looked downloaded, and the menu offered
  // to remove a download that was never made. A local copy means a non-http
  // path.
  //
  // And the path outlives the file: Android can reclaim the app's files
  // directory, and a file manager can delete out of it. Every other place
  // showing a download state asks the filesystem — IskconItem's badge a few
  // lines away does exactly this — so this asks too. It costs one check per
  // menu open rather than per row, because react-native-material-menu keeps its
  // children in a Modal, which renders nothing while closed.
  const claimsLocalCopy =
    !!item.file_path && !item.file_path.startsWith('http');
  const [downloaded, setDownloaded] = useState(claimsLocalCopy);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = claimsLocalCopy
        ? await RNFS.exists(item.file_path).catch(() => false)
        : false;
      if (mounted) setDownloaded(exists);
    })();
    return () => {
      mounted = false;
    };
  }, [claimsLocalCopy, item.file_path]);

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
      // Delete both item.file_path and the deterministic path handleDownload
      // checks against — they're normally the same, but if they ever drift,
      // deleting only item.file_path leaves the real file on disk, and the
      // next download attempt finds it via getLocalFilePath and wrongly
      // reports "already downloaded".
      const paths = new Set(
        [item.file_path, getLocalFilePath(item.source_id, item.title)].filter(Boolean),
      );
      for (const path of paths) {
        if (await RNFS.exists(path)) {
          await RNFS.unlink(path);
        }
      }
      await updateItemFields(item.id, {file_path: null});
      setIskconEntries(prev =>
        prev.map(f => (f.source_id === item.source_id ? {...f, file_path: null} : f)),
      );
      useDownloadStore.getState().notifyDownloadsChanged();
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
