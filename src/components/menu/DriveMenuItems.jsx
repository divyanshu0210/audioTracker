import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, Text, ToastAndroid, TouchableOpacity, View} from 'react-native';
import RNFS from 'react-native-fs';
import {Menu, MenuDivider, MenuItem} from 'react-native-material-menu';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import {softDeleteItem} from '../../database/D';
import {updateItemFields} from '../../database/U';
import { useMediaStore } from '../../stores/useMediaStore';
import { useShallow } from 'zustand/react/shallow';
import { navigationRef } from '../../handlers/navigationRef';
import useDownloadStore from '../../stores/useDownloadStore';
import {enqueueDriveDownload} from '../buttons/Download';
import useInMenteeCategory from '../../appMentor/useInMenteeCategory';
import {
  downloadSharedCopy,
  removeSharedCopy,
} from '../../share/shareDeviceFile';

const DriveMenuItems = ({item, screen, hideMenu}) => {
const {
  setDriveLinksList,
  setDeviceFiles,
  setData,
} = useMediaStore(
  useShallow(state => ({
    setDriveLinksList: state.setDriveLinksList,
    setDeviceFiles: state.setDeviceFiles,
    setData: state.setData,
  })),
);

  console.log(item);
  const isFolder = item.type === 'drive_folder';
  const isDevice = item?.type === 'device_file';

  // A device file that was shared has a copy on Drive that goes with it, and
  // any link already handed out stops working — worth saying before the tap,
  // not after.
  const hasSharedCopy = !!item?.drive_file_id;

  // Read off validDeviceFiles, which setDeviceFiles already built by asking
  // the filesystem — no second stat per menu.
  const isMissing = useMediaStore(
    s =>
      isDevice && s.deviceFilesChecked && !s.validDeviceIds[item.source_id],
  );

  // Only while the file is missing and a copy exists to fetch. Once it lands,
  // the download service writes file_path back, the row rejoins
  // validDeviceFiles, and this gives way to the ordinary Delete entry.
  const canRestoreFromDrive = isDevice && isMissing && hasSharedCopy;

  // Downloading a Drive file used to be the row's whole action, because
  // playing one required it. It streams now, so it belongs in here with
  // everything else — and the row keeps its menu instead of swapping it for a
  // button.
  const isDriveFile = !isFolder && !isDevice;

  // Hidden while a mentor is inside a mentee's category: there Delete looks
  // like "unassign" and instead removes the item from the mentor's own
  // library. See useInMenteeCategory.
  const inMenteeCategory = useInMenteeCategory();

  // The path outlives the file: Android can reclaim the app's files directory
  // and a file manager can delete out of it, so this asks the filesystem
  // rather than trusting file_path. One check per menu open, not per row —
  // react-native-material-menu renders nothing while closed.
  const [downloaded, setDownloaded] = useState(!!item?.file_path);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = item?.file_path
        ? await RNFS.exists(item.file_path).catch(() => false)
        : false;
      if (mounted) setDownloaded(exists);
    })();
    return () => {
      mounted = false;
    };
  }, [item?.file_path]);

  const isDownloading = useDownloadStore(s => {
    const active = s.downloads[item?.source_id];
    return active?.status === 'queued' || active?.status === 'downloading';
  });



  // Un-shares without deleting anything else: trashes the Drive copy, drops
  // the mapping, leaves the file and its row alone. Until this existed there
  // was no way to take back a shared link short of deleting the file itself.
  const handleDeleteFromDriveOnly = async () => {
    await removeSharedCopy(item.id);
    ToastAndroid.show('Shared copy removed from Drive', ToastAndroid.SHORT);
  };

  const handleDeleteConfirm = () => {
    // A device file with a copy on Drive has two things that can be deleted,
    // and they are not the same decision — one takes back the link, the other
    // gets rid of the file. Collapsing them into a single "Delete" meant the
    // only way to un-share was to delete the file as well.
    if (isDevice && hasSharedCopy) {
      Alert.alert(
        'Confirm Deletion',
        isMissing
          ? 'This file is not on this device, so the copy in your Drive is the only one left. Deleting it cannot be undone, and any link you shared will stop working.'
          : 'This file has a copy in your Drive. Deleting that copy stops any link you shared from working; the file stays on this device.',
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Delete from Drive',
            onPress: handleDeleteFromDriveOnly,
          },
          {
            text: 'Delete everywhere',
            style: 'destructive',
            onPress: handleDeleteDeviceFile,
          },
        ],
      );
      return;
    }

    const message = isFolder
      ? 'This will also delete all related contents.'
      : isDevice
        ? 'This will delete the device file.'
        : 'This will undownload the file.';

    Alert.alert('Confirm Deletion', message, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        onPress: () =>
          isFolder
            ? handleDeleteFolder()
            : isDevice
              ? handleDeleteDeviceFile()
              : handleDeleteDriveFile(),
        style: 'destructive',
      },
    ]);
  };

  const handleDeleteFolder = async () => {
    try {
      await softDeleteItem(item.type, item.source_id);
      ToastAndroid.show('Folder deleted', ToastAndroid.SHORT);
      setDriveLinksList(prev =>
        prev.filter(f => f.source_id !== item.source_id),
      );
    } catch (error) {
      console.error('❌ Error deleting folder:', error);
    }
  };

  const handleDeleteDeviceFile = async () => {
    try {
      if (await RNFS.exists(item.file_path)) {
        await RNFS.unlink(item.file_path);
      }
      // Before the row goes: the shared copy is readable by anyone with the
      // link, so it cannot outlive the file it is a copy of.
      await removeSharedCopy(item.id);
      await updateItemFields(item.id, {file_path: null});
      await softDeleteItem(item.type, item.source_id);
      ToastAndroid.show('File deleted', ToastAndroid.SHORT);
      setDeviceFiles(prev => prev.filter(f => f.source_id !== item.source_id));
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  const handleDeleteDriveFile = async () => {
    try {
      if (await RNFS.exists(item.file_path)) {
        await RNFS.unlink(item.file_path);
      }
      await updateItemFields(item.id, {file_path: null});
      if (screen === 'out') {
        await softDeleteItem(item.type, item.source_id);
      }
      handleLocalDelete(item);
      useDownloadStore.getState().notifyDownloadsChanged();
      ToastAndroid.show(
        screen === 'in' ? 'Download removed' : 'File deleted',
        ToastAndroid.SHORT,
      );
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  const handleLocalDelete = item => {
    if (screen === 'in') {
      setData(prev => {
        const updated = prev.map(f =>
          f.id === item.id ? {...f, file_path: null} : f,
        );

        return [...updated]; // force new array reference
      });
    } else {
      setDriveLinksList(prev => {
        const updated = prev.filter(f => f.source_id !== item.source_id);

        return [...updated]; // explicit new array
      });
    }
  };

  const renderFolderSpecificItems = () => (
    <>
      <MenuItem>
        <TouchableOpacity
          onPress={() => {
            hideMenu();
            navigationRef.navigate('GDriveFolderOverview', {
              driveLink: item.source_id,
            });
          }}>
          <Text style={styles.menuItemText}>Overview</Text>
        </TouchableOpacity>
      </MenuItem>
      <MenuDivider />
    </>
  );

  return (
    <View>
      {isFolder && renderFolderSpecificItems()}

      {canRestoreFromDrive && (
        <MenuItem
          onPress={() => {
            hideMenu();
            // Straight to the download, no confirmation. That alert exists
            // for a *tap on the row* that could not play — it explains why and
            // offers the fetch. Reaching this entry is already the decision,
            // and the alert's "File not on this device" no longer fits either:
            // the file plays now, streamed from the same Drive copy this
            // downloads.
            downloadSharedCopy(item);
          }}>
          <Text style={styles.menuItemText}>Download</Text>
        </MenuItem>
      )}

      {isDriveFile && !downloaded && !isDownloading && (
        <MenuItem
          onPress={() => {
            hideMenu();
            enqueueDriveDownload(item);
          }}>
          <Text style={styles.menuItemText}>Download</Text>
        </MenuItem>
      )}

      {/* Inside a folder this entry only ever means "remove the local copy",
          so with nothing downloaded there is nothing for it to do. It used to
          be unreachable in that state anyway — the row showed a download
          button instead of this menu. */}
      {/* screen === 'out' as well: inside a Drive folder this entry reads
          "Remove Download", which is useful and not misleading, and the
          category filter does not apply there anyway. */}
      {!(inMenteeCategory && screen === 'out') &&
        !(isDriveFile && !downloaded && screen === 'in') && (
        <MenuItem
          onPress={() => {
            hideMenu();
            handleDeleteConfirm();
          }}>
          <Text style={styles.menuItemText}>
            {isFolder
              ? 'Delete Folder'
              : screen === 'in'
                ? 'Remove Download'
                : 'Delete'}
          </Text>
        </MenuItem>
      )}
    </View>
  );
};

export default DriveMenuItems;

const styles = StyleSheet.create({
  menuContainer: {
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
  disabledText: {
    color: '#aaa',
  },
});
