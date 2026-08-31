import {StyleSheet, View, Pressable, Alert, ToastAndroid} from 'react-native';
import React, {useCallback, useMemo, useRef} from 'react';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';
import YouTubeItem from './YouTubeItem';
import DeviceItem from './DeviceItem';
import DriveItem from './DriveItem';
import NotebookItem from './NoteBook/NotebookItem';
import FileViewer from 'react-native-file-viewer';
import {ItemTypes, ScreenTypes} from '../contexts/constants';
import BaseMenu from '../components/menu/BaseMenu';
import {playFile as playIskconFile} from '../scrap/iskconActions';
import NoteItem from '../notes/notesListing/NoteItem';
import {CategoryItem} from '../categories/CategoryItem';
import {useMediaStore} from '../stores/useMediaStore';
import RNFS from 'react-native-fs';
import {useSelectionStore} from '../stores/useSelectionStore';
import {useNotesStore} from '../stores/useNotesStore';
import {navigationRef} from '../handlers/navigationRef';
import {useShallow} from 'zustand/react/shallow';
import {StackActions, useRoute} from '@react-navigation/core';

const BaseItem = ({
  type,
  item,
  subtype,
  screen,
  onFolderPress,
  itemComponent,
}) => {
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

  // dbId/file_path/title ride along for bulk actions (delete needs the
  // internal PK + local path to unlink downloads; Assign never needed them,
  // only id/type/subtype). source_type/source_id are the note's own origin —
  // bulk Move needs them to tell notebook notes (movable) from notes attached
  // to a drive/youtube/device item (not movable), and to know which notebook
  // the selection is currently in.
  const selectionEntry = useMemo(
    () => ({
      id: sourceId,
      type,
      subtype,
      dbId: item?.id,
      file_path: item?.file_path,
      title: item?.title,
      source_type: item?.source_type,
      source_id: item?.source_id,
    }),
    [
      sourceId,
      type,
      subtype,
      item?.id,
      item?.file_path,
      item?.title,
      item?.source_type,
      item?.source_id,
    ],
  );

  const toggleSelection = useCallback(() => {
    setSelectedItems(prev =>
      prev.some(i => i.id === sourceId && i.type === type)
        ? prev.filter(i => !(i.id === sourceId && i.type === type))
        : [...prev, selectionEntry],
    );
  }, [setSelectedItems, sourceId, type, selectionEntry]);

  const handleItemLongPress = useCallback(() => {
    const {selectionMode} = useSelectionStore.getState();
    if (!selectionMode) {
      setSelectedItems([selectionEntry]);
      setSelectionMode(true);
    }
  }, [setSelectedItems, setSelectionMode, selectionEntry]);

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
    const {nonFolderFiles, nonFolderFilesInside, driveLinksList, data} =
      useMediaStore.getState();
    // Use store's file_path — item prop may be stale (e.g. GoogleDriveViewer local state)
    const storeFile =
      driveLinksList.find(f => f.source_id === item.source_id) ||
      data.find(f => f.source_id === item.source_id);
    const filePath = storeFile?.file_path ?? item.file_path ?? null;

    if (filePath && isAudioOrVideo(item.mimeType)) {
      // Checked, not repaired. Clearing file_path here would make the next tap
      // fall through both of these branches — they're gated on filePath — and go
      // back to doing nothing silently. DriveItem already renders a Download
      // button off its own existence check, so the row is not misleading; the
      // only thing missing was saying why the tap did nothing.
      if (!(await RNFS.exists(filePath))) {
        ToastAndroid.show('Download is no longer on this device', ToastAndroid.SHORT);
        return;
      }
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
    } else if (filePath) {
      if (!(await RNFS.exists(filePath))) {
        ToastAndroid.show('Download is no longer on this device', ToastAndroid.SHORT);
        return;
      }
      FileViewer.open(filePath, {showOpenWithDialog: true}).catch(() => {
        Alert.alert(
          'Could not open file.',
          'You do not have a proper app to view this file',
        );
      });
    }
  }, [item, screen]);

  const handleIskconPress = useCallback(() => {
    // DB rows only exist for files that were played or downloaded, so
    // file_path is always set (remote URL until a local copy exists).
    playIskconFile(item, item.file_path);
  }, [item]);

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
    // itemComponent wins when a list supplies its own row visual — the rest
    // of this component (press dispatch, selection, menu) is unchanged, so
    // such a row behaves exactly like every other item in the app.
    const Component = itemComponent ?? typeConfigMap[type]?.Component;
    return Component ? <Component item={item} screen={screen} /> : null;
  };

  const renderBaseMenu = () => {
    // A caller-supplied visual can't be carrying its own menu, so the
    // per-type answer must not suppress one here — drive says false only
    // because DriveItem renders BaseMenu itself, and DriveItem is exactly
    // what an override replaces. Without this, swapping the visual silently
    // takes the menu away from every drive row in that list.
    if (itemComponent) return true;
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
    [ItemTypes.ISKCON]: {
      Component: DeviceItem,
      onPress: handleIskconPress,
      showMenu: () => true,
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
