import {useNavigation} from '@react-navigation/native';
import React, {useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import RNFS from 'react-native-fs';
import {Menu, MenuDivider, MenuItem} from 'react-native-material-menu';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext';
import {
  deleteDriveFileItemFromDB,
  deleteFolderAndContents,
} from '../../database/D';
import {updateDeviceFilePath, updateFilePath} from '../../database/U';
import CommonMenuItems from './CommonMenuItems';

const DriveMenuItems = ({item, screen, hideMenu}) => {
  const navigation = useNavigation();
  const {setDriveLinksList, setDeviceFiles, setData} = useAppState();

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
      await deleteFolderAndContents(item.source_id);
      Alert.alert('Success', 'Folder and its contents deleted successfully.');
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
      // await updateDeviceFilePath(item.id, null);
      await updateItemFields(item.id, {file_path: null});
      handleLocalDelete(item);
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
      // await updateFilePath(item.driveId, null);
      await updateItemFields(item.id, {file_path: null});
      if (screen === 'out') {
        await deleteDriveFileItemFromDB(item.source_id, screen);
      }
      //   handleLocalDelete(item);
      setDeviceFiles(prev => prev.filter(f => f.id !== item.id));
    } catch (error) {
      Alert.alert('Delete failed');
      console.error('Delete failed:', error);
    }
  };

  const handleLocalDelete = item => {
    if (screen === 'in') {
      setData(prev =>
        prev.map(f => (f.id === item.id ? {...f, file_path: null} : f)),
      );
    } else {
      setDriveLinksList(prev =>
        prev.filter(f => f.source_id !== item.source_id),
      );
    }
  };

  const renderFolderSpecificItems = () => (
    <>
      <MenuItem>
        <TouchableOpacity
          onPress={() => {
            hideMenu();
            navigation.navigate('GDriveFolderOverview', {
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

      <MenuItem onPress={hideMenu}>
        <TouchableOpacity onPress={handleDeleteConfirm}>
          <Text style={styles.menuItemText}>
            {isFolder
              ? 'Delete Folder'
              : screen === 'in'
                ? 'Remove Download'
                : 'Delete'}
          </Text>
        </TouchableOpacity>
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
