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
import {playFile as playIskconFile} from '../iskcon/iskconActions';
import IskconItem from '../iskcon/IskconItem';
import NoteItem from '../notes/notesListing/NoteItem';
import {CategoryItem} from '../categories/CategoryItem';
import {useMediaStore} from '../stores/useMediaStore';
import {offerSharedCopyDownload} from '../share/shareDeviceFile';
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

  // A row out of the Iskcon browser's scraped listing rather than our DB:
  // folders exist only on audio.iskcondesiretree.com, so there is nothing to
  // select, assign, categorise or put in a menu — a tap just walks into them.
  // DB-backed iskcon rows (Downloads, search, a category listing) never carry
  // `kind`, so they keep behaving exactly as before.
  const isIskconFolder = type === ItemTypes.ISKCON && item?.kind === 'folder';

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
    if (isIskconFolder) return;
    const {selectionMode} = useSelectionStore.getState();
    if (!selectionMode) {
      setSelectedItems([selectionEntry]);
      setSelectionMode(true);
    }
  }, [setSelectedItems, setSelectionMode, selectionEntry, isIskconFolder]);

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

    // Files whose bytes are gone are listed now instead of hidden, so a tap
    // on one has to say why nothing plays — and offer the way back when
    // there is a copy on Drive to fetch.
    const present = validDeviceFiles.some(
      f => f.source_id === item.source_id,
    );
    if (!present) {
      // One alert for both cases — it decides for itself whether there is a
      // Drive copy to offer, and either way it can clear the row from the list.
      offerSharedCopyDownload(item);
      return;
    }

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

    if (isAudioOrVideo(item.mimeType)) {
      // No file_path check on the way in any more: audio and video stream from
      // Drive, so a row with nothing on disk is playable too. The player works
      // out where the bytes come from — local copy, stream, or neither when
      // there's no connection — because every other route into it (queue,
      // history, a note's timestamp) needs the same answer.
      const dataSource =
        screen === ScreenTypes.IN ? nonFolderFilesInside : nonFolderFiles;
      if (screen === 'search' || !dataSource || dataSource.length === 0) {
        navigationRef.navigate('BacePlayer', {item});
        return;
      }
      const startingIndex = dataSource.findIndex(
        f => f.source_id === item.source_id,
      );
      // A row the queue doesn't contain (a search result, a stale list) would
      // otherwise start the player at index -1 and play nothing at all.
      if (startingIndex < 0) {
        navigationRef.navigate('BacePlayer', {item});
        return;
      }
      navigationRef.navigate('BacePlayer', {
        items: dataSource,
        currentIndex: startingIndex,
      });
    } else if (filePath) {
      // Everything else still opens in another app, which needs real bytes on
      // disk — there is nothing to hand a viewer but a path.
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
    // Browsing the site's tree: a folder row goes deeper instead of playing.
    if (item?.kind === 'folder') {
      onFolderPress?.(item);
      return;
    }
    // DB rows only exist for files that were played or downloaded, so
    // file_path is always set (remote URL until a local copy exists).
    playIskconFile(item, item.file_path);
  }, [item, onFolderPress]);

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
      // Tapping a scraped folder mid-selection would navigate away from the
      // selection the user is still building, and it can't be selected either
      // — so it does nothing until selection mode is closed.
      if (!isIskconFolder) toggleSelection();
      return;
    }

    const action = typeConfigMap[type]?.onPress;
    if (action) action();

    if (isIskconFolder) return;

    setActiveItem({
      sourceId: sourceId,
      sourceType: item?.type || type,
      item: item,
    });
  }, [item, toggleSelection, isIskconFolder]);

  const renderItem = () => {
    // itemComponent wins when a list supplies its own row visual — the rest
    // of this component (press dispatch, selection, menu) is unchanged, so
    // such a row behaves exactly like every other item in the app.
    const Component = itemComponent ?? typeConfigMap[type]?.Component;
    return Component ? <Component item={item} screen={screen} /> : null;
  };

  const renderBaseMenu = () => {
    // Nothing in the menu applies to a remote folder — and unlike the per-type
    // answer below, this has to hold even when an itemComponent override is in
    // play.
    if (isIskconFolder) return false;
    // Otherwise a caller-supplied visual can't be carrying its own menu, so
    // the per-type answer must not suppress one here — drive says false only
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
    // Same arrangement as DRIVE below: the type's own row visual renders its
    // own BaseMenu — IskconItem has to, because it swaps that menu for a
    // download progress indicator, and only the row stays mounted for the
    // whole download. A list that supplies its own visual instead (Downloads,
    // via DownloadCard) gets the menu back through the itemComponent override
    // in renderBaseMenu, exactly as Drive rows do there.
    [ItemTypes.ISKCON]: {
      Component: IskconItem,
      onPress: handleIskconPress,
      showMenu: () => false,
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
