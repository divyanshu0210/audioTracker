import {
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
  Pressable,
  Alert,
} from 'react-native';
import React, {useEffect, useState} from 'react';
import {useNavigation, useNavigationState} from '@react-navigation/core';
import {useAppState} from '../contexts/AppStateContext';
import RNFS from 'react-native-fs';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';
import YouTubeItem from './YouTubeItem';
import DeviceItem from './DeviceItem';
import DriveItem from './DriveItem';
import NotebookItem from './NoteBook/NotebookItem';
import FileViewer from 'react-native-file-viewer';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import BaseMenu from '../components/menu/BaseMenu';
import NoteItem from '../notes/notesListing/NoteItem';
import useAppStateStore from '../contexts/appStateStore';
import { CategoryItem } from '../categories/CategoryItem';

const BaseItem = ({type, item, isSelected, onSelect, onLongPress, screen}) => {
  const navigation = useNavigation();
  const {
    items,
    videos,
    validDeviceFiles,
    setFolderStack,
    folderStack,
    nonFolderFiles,
    nonFolderFilesInside,
    setActiveItem,
    setActiveNoteId,
    setSelectedNote,
  } = useAppState();
  const {setLoading} = useAppStateStore();

  const currentRoute = useNavigationState(
    state => state.routes[state.index].name,
  );

  const sourceId = item?.rowid || item?.source_id || item?.id?.toString();

  const handleYoutubePress = () => {
    if (item.type === 'youtube_playlist') {
      navigation.navigate('PlaylistView', {
        playListId: item.source_id,
        playListInfo: item,
      });
    } else {
      const dataSource = screen === ScreenTypes.IN ? videos : items;
      if (screen === 'search' || !dataSource || dataSource.length === 0) {
        navigation.navigate('BacePlayer', {item});
        return;
      }
      const videoItems = dataSource.filter(i => i.type !== 'youtube_playlist');
      const startingIndex = videoItems.findIndex(
        i => i.source_id === item.source_id,
      );
      navigation.navigate('BacePlayer', {
        items: videoItems,
        currentIndex: startingIndex,
      });
    }
  };

  const handleDevicePress = () => {
    if (item.file_path && isAudioOrVideo(item.mimeType)) {
      const startingIndex = validDeviceFiles.findIndex(
        f => f.source_id === item.source_id,
      );
      navigation.navigate('BacePlayer', {
        items: validDeviceFiles,
        currentIndex: startingIndex,
      });
    }
  };

  const handleDrivePress = () => {
    console.log(item);
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      setLoading(true);
      requestAnimationFrame(() => {
        setTimeout(() => {
          setFolderStack(prevStack => {
            const last = prevStack[prevStack.length - 1];
            if (last && last.source_id === item.source_id) {
              return prevStack; // Prevent duplicate
            }
            return [
              ...prevStack,
              {source_id: item.source_id, title: item.title},
            ];
          });
          navigation.push('GoogleDriveViewer', {driveInfo: item});
        }, 0);
      });
    } else {
      handleDriveFilePress();
    }
  };

  const handleDriveFilePress = async () => {
    if (item.file_path && isAudioOrVideo(item.mimeType)) {
      const exists = await RNFS.exists(item.file_path);
      if (!exists) {
        return;
      }
      console.log(`'trying to play'${item}`);
      const dataSource =
        screen === ScreenTypes.IN ? nonFolderFilesInside : nonFolderFiles;
      if (screen === 'search' || !dataSource || dataSource.length === 0) {
        navigation.navigate('BacePlayer', {item});
        return;
      }
      const startingIndex = dataSource.findIndex(
        f => f.source_id === item.source_id,
      );

      navigation.navigate('BacePlayer', {
        items: dataSource,
        currentIndex: startingIndex,
      });
    } else if (item.file_path) {
      const exists = await RNFS.exists(item.file_path);
      if (!exists) {
        return;
      }
      FileViewer.open(item.file_path, {showOpenWithDialog: true})
        .then(() => {
          // file opened successfully
        })
        .catch(error => {
          // console.error('Failed to open file:', error);
          Alert.alert(
            'Could not open file.',
            'You do not have a proper app to view this file',
          );
        });
    }
  };

  const handleNotebookPress = () => {
    navigation.navigate('NotebookNotesScreen', {notebook: item});
  };

  const handleNotePress = () => {
    item.source_type === 'notebook'
      ? handleNBNotePress(item)
      : handleMediaNotePress();
  };

  const handleCategoryPress = () => {
    navigation.navigate('CategoryDetailScreen', {item});
  };

  const handleMediaNotePress = () => {
    setSelectedNote(item);

    const targetScreen = 'BacePlayer';
    console.log('routeInfo', currentRoute);
    //WHY DOING THIS : bcz if already on bace player we dont want to switch screen
    if (currentRoute === targetScreen) {
      setActiveNoteId(item.rowid);
    } else if (currentRoute === 'Notes' || currentRoute === 'All Notes') {
      navigation.navigate(targetScreen, {
        item: item.relatedItem,
        currentNoteId: item.rowid,
        pauseOnStart: true,
      });
    } else {
      navigation.replace(targetScreen, {
        item: item.relatedItem,
        currentNoteId: item.rowid,
        pauseOnStart: true,
      });
    }
  };

  const handleNBNotePress = item => {
    try {
      if (item) {
        setSelectedNote(item);
        setActiveNoteId(item.rowid);
        navigation.navigate('NotesSectionWithBack');
      }
    } catch (error) {
      console.error('Error loading note:', error);
      Alert.alert('Error', 'Failed to load note');
    }
  };

  const handlePress = () => {
    setActiveItem({
      sourceId: sourceId,
      sourceType: item?.type || type,
      item: item,
    });

    if (onSelect) {
      onSelect(sourceId, type);
      return;
    }

    const action = typeConfigMap[type]?.onPress;
    if (action) action();
  };

  const renderItem = () => {
    const Component = typeConfigMap[type]?.Component;
    return Component ? <Component item={item} screen={screen} /> : null;
  };

  const renderBaseMenu = () => {
    const showMenuFn = typeConfigMap[type]?.showMenu;
    return showMenuFn ? showMenuFn(item, screen) : true;
  };

  const typeConfigMap = {
    [ItemTypes.YOUTUBE]: {
      Component: YouTubeItem,
      onPress: handleYoutubePress,
      showMenu: () => true,
    },
    [ItemTypes.DEVICE]: {
      Component: DeviceItem,
      onPress: handleDevicePress,
      showMenu: item => !!item.file_path,
    },
    [ItemTypes.DRIVE]: {
      Component: DriveItem,
      onPress: handleDrivePress,
      showMenu: () => false,
    },
    [ItemTypes.NOTEBOOK]: {
      Component: NotebookItem,
      onPress: handleNotebookPress,
      showMenu: () => true,
    },
    [ItemTypes.NOTE]: {
      Component: NoteItem,
      onPress: handleNotePress,
      showMenu: () => screen,
    },
    [ItemTypes.CATEGORY]: {
      Component: CategoryItem,
      onPress: handleCategoryPress,
      showMenu: () => false,
    },
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.5}
      android_ripple={{color: '#eee'}}
      style={[styles.wrapper, isSelected && styles.selected]}>
      {renderItem()}
      <View style={styles.menuWrapper}>
        {renderBaseMenu() && (
          <BaseMenu item={item} type={type} screen={screen} />
        )}
      </View>
    </Pressable>
  );
};

export default BaseItem;
const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    // borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  menuWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  selected: {
    backgroundColor: '#d6e8ff',
  },
});
