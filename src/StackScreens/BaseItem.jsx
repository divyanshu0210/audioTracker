import {StyleSheet, View, Pressable, Alert} from 'react-native';
import React, {useCallback, useRef} from 'react';
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
import {CategoryItem} from '../categories/CategoryItem';
import {useMediaStore} from '../stores/useMediaStore';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useNotesStore} from '../stores/useNotesStore';
import {navigationRef} from '../handlers/navigationRef';
import {useShallow} from 'zustand/react/shallow';
import {StackActions, useRoute} from '@react-navigation/core';

const BaseItem = ({type, item, subtype, screen, onFolderPress}) => {
   const route = useRoute();
  const currentRoute = route.name;
  const {setFolderStack} = useMediaStore(
    useShallow(state => ({
      setFolderStack: state.setFolderStack,
    })),
  );

  const {setActiveItem} = useSelectionStore(
    useShallow(state => ({
      setActiveItem: state.setActiveItem,
    })),
  );

  const {setSelectedItems, setSelectionMode} = useSelectionStore(
    useShallow(state => ({
      setSelectedItems: state.setSelectedItems,
      setSelectionMode: state.setSelectionMode,
    })),
  );

  const {setActiveNoteId, setSelectedNote} = useNotesStore(
    useShallow(state => ({
      setActiveNoteId: state.setActiveNoteId,
      setSelectedNote: state.setSelectedNote,
    })),
  );

  const sourceId = item?.rowid || item?.source_id || item?.id?.toString();

  const renderCount = useRef(0);
  renderCount.current++;
  console.log(
    `🎯 Render BASE ITEM #${renderCount.current}`,
    item?.type,
    sourceId,
  );

  const selected = useSelectionStore(
    useCallback(
      state =>
        state.selectedItems.some(i => i.id === sourceId && i.type === type),
      [sourceId, type],
    ),
  );

  const toggleSelection = useCallback(() => {
    setSelectedItems(prev =>
      prev.some(i => i.id === sourceId && i.type === type)
        ? prev.filter(i => !(i.id === sourceId && i.type === type))
        : [...prev, {id: sourceId, type, subtype}],
    );
  }, [setSelectedItems, sourceId, type, subtype]);

  const handleItemLongPress = useCallback(() => {
    const {selectionMode} = useSelectionStore.getState();
    if (!selectionMode) {
      setSelectedItems([{id: sourceId, type, subtype}]);
      setSelectionMode(true);
    }
  }, [setSelectedItems, setSelectionMode, sourceId, type, subtype]);

  const handleYoutubePress = useCallback(() => {
    const {videos, items} = useMediaStore.getState();
    if (item.type === 'youtube_playlist') {
      navigationRef.navigate('PlaylistView', {
        playListId: item.source_id,
        playListInfo: item,
      });
    } else {
      const dataSource = screen === ScreenTypes.IN ? videos : items;
      if (screen === 'search' || !dataSource || dataSource.length === 0) {
        navigationRef.navigate('BacePlayer', {item});
        return;
      }
      const videoItems = dataSource.filter(i => i.type !== 'youtube_playlist');
      const startingIndex = videoItems.findIndex(
        i => i.source_id === item.source_id,
      );
      navigationRef.navigate('BacePlayer', {
        items: videoItems,
        currentIndex: startingIndex,
      });
    }
  }, [item, screen]);

  const handleDevicePress = useCallback(() => {
    const {validDeviceFiles} = useMediaStore.getState();
    if (item.file_path && isAudioOrVideo(item.mimeType)) {
      const startingIndex = validDeviceFiles.findIndex(
        f => f.source_id === item.source_id,
      );
      navigationRef.navigate('BacePlayer', {
        items: validDeviceFiles,
        currentIndex: startingIndex,
      });
    }
  }, [item, screen]);

  const handleDrivePress = useCallback(() => {
    console.log(item);
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      //   onFolderPress is passed down: GoogleDriveViewer → BaseMediaListComponent → BaseItem
      if (onFolderPress) {
        onFolderPress(item);
      } else {
        // Fallback: old behaviour for any context that doesn't pass onFolderPress.
        // (e.g. search results screen rendering drive items)
        // useLoadingStore.setState({loading:true});
        requestAnimationFrame(() => {
          setTimeout(() => {
            setFolderStack(prevStack => {
              const last = prevStack[prevStack.length - 1];
              if (last && last.source_id === item.source_id) return prevStack;
              return [
                ...prevStack,
                {source_id: item.source_id, title: item.title},
              ];
            });
            navigationRef.dispatch(
              StackActions.push('GoogleDriveViewer', {
                driveInfo: item,
              }),
            );
          }, 0);
        });
      }
    } else {
      handleDriveFilePress();
    }
  }, [item, onFolderPress]);

  const handleDriveFilePress = useCallback(async () => {
    const {nonFolderFiles, nonFolderFilesInside} = useMediaStore.getState();
    if (item.file_path && isAudioOrVideo(item.mimeType)) {
      const exists = await RNFS.exists(item.file_path);
      if (!exists) {
        return;
      }
      console.log(`'trying to play'${item}`);
      const dataSource =
        screen === ScreenTypes.IN ? nonFolderFilesInside : nonFolderFiles;
      if (screen === 'search' || !dataSource || dataSource.length === 0) {
        navigationRef.navigate('BacePlayer', {item});
        return;
      }
      const startingIndex = dataSource.findIndex(
        f => f.source_id === item.source_id,
      );
      navigationRef.navigate('BacePlayer', {
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
        .catch(() => {
          Alert.alert(
            'Could not open file.',
            'You do not have a proper app to view this file',
          );
        });
    }
  }, [item, screen]);

  const handleNotebookPress = useCallback(() => {
    navigationRef.navigate('NotebookNotesScreen', {notebook: item});
  }, [item]);

  const handleNotePress = useCallback(() => {
    item.source_type === 'notebook'
      ? handleNBNotePress(item)
      : handleMediaNotePress();
  }, [item]);

  const handleCategoryPress = useCallback(() => {
    navigationRef.navigate('CategoryDetailScreen', {item});
  }, [item]);

  const handleMediaNotePress = useCallback(() => {
    setSelectedNote(item);
    const targetScreen = 'BacePlayer';
    if (currentRoute === targetScreen || currentRoute === 'ItemNotesScreen') {
      navigationRef.goBack();
      setActiveNoteId(item.rowid);
    } else if (
      currentRoute === 'Notes' ||
      currentRoute === 'All Notes' ||
      currentRoute === 'NotesListScreen'
    ) {
      navigationRef.navigate(targetScreen, {
        item: item.relatedItem,
        currentNoteId: item.rowid,
        pauseOnStart: true,
      });
    } else {
      navigationRef.dispatch(
        StackActions.replace(targetScreen, {
          item: item.relatedItem,
          currentNoteId: item.rowid,
          pauseOnStart: true,
        }),
      );
    }
  }, [item]);

  const handleNBNotePress = useCallback(
    item => {
      try {
        if (item) {
          setSelectedNote(item);
          setActiveNoteId(item.rowid);
          navigationRef.navigate('NotesSectionWithBack');
        }
      } catch (error) {
        console.error('Error loading note:', error);
        Alert.alert('Error', 'Failed to load note');
      }
    },
    [item],
  );

  const handlePress = useCallback(() => {
    const {selectionMode} = useSelectionStore.getState();
    if (selectionMode) {
      toggleSelection();
      return;
    }

    const action = typeConfigMap[type]?.onPress;
    if (action) action();

    setActiveItem({
      sourceId: sourceId,
      sourceType: item?.type || type,
      item: item,
    });
  }, [item, toggleSelection]);

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
      onLongPress={handleItemLongPress}
      delayLongPress={400}
      activeOpacity={0.5}
      android_ripple={{color: '#eee'}}
      style={[styles.wrapper, selected && styles.selected]}>
      {renderItem()}
      <View style={styles.menuWrapper}>
        {renderBaseMenu() && (
          <BaseMenu item={item} type={type} screen={screen} />
        )}
      </View>
    </Pressable>
  );
};

export default React.memo(BaseItem);
const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 8,
    paddingLeft: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
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
