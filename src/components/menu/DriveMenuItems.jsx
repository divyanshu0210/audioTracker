import React, {useState} from 'react';
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

  const handleDeleteConfirm = () => {
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
