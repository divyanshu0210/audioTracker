// The one way an externally-opened item joins the library.
//
// A link or share from another app no longer drops anything into a tab — it
// opens the thing itself and leaves this bar across the bottom of whatever
// screen it opened. Keeping something is a decision made after seeing it, on
// the screen where you saw it.
//
// It renders on three surfaces: BacePlayer (videos and single files),
// PlaylistView and GoogleDriveViewer (the container itself).
//
// Adding is all it does; no category is chosen here. Filing an item is
// already a thing the app does from the item's own menu, and it is the same
// menu for something added this way as for anything else — so folding a
// category picker into this button would only put a second decision in front
// of the first one. It also settles the question this flow raised: an
// external link is no longer filed into whatever category happened to be open
// when it arrived, because it is filed nowhere until the user says so.

import React, {useCallback, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import {saveItemToList} from '../Linking/saveToList';
import {useMediaStore} from '../stores/useMediaStore';
import useIskconPinsStore from '../stores/useIskconPinsStore';

// Which of the store's lists would hold this item once it is added. Reading
// the list back is how the bar knows it is done: saveItemToList prepends the
// saved row, so the bar disappears the moment the item is really in the list,
// with no success flag of its own to go stale when the player advances to the
// next item.
const listFor = (state, type) => {
  if (type === 'drive_file' || type === 'drive_folder') {
    return state.driveLinksList;
  }
  if (type === 'device_file') return state.deviceFiles;
  return state.items;
};

const SaveToListBar = ({item}) => {
  const [busy, setBusy] = useState(false);

  // An Iskcon file has no list to join - the IDT tab is a live listing of the
  // site, not a library - so for one of those this bar pins instead. Pinning
  // is the app's existing way of keeping an Iskcon thing to hand, and it was
  // offered for folders only; a file heard once and wanted again had nowhere
  // to be kept.
  const isIskcon = item?.type === 'iskcon_file';
  const pinnedFiles = useIskconPinsStore(state => state.pinnedFiles);
  const togglePinFile = useIskconPinsStore(state => state.togglePinFile);
  const isPinned =
    isIskcon && pinnedFiles.some(f => f.source_id === item.source_id);

  const inList = useMediaStore(
    useCallback(
      state =>
        !!item &&
        listFor(state, item.type).some(i => i.source_id === item.source_id),
      [item],
    ),
  );

  const handleAdd = useCallback(async () => {
    setBusy(true);
    try {
      await saveItemToList(item);
      ToastAndroid.show('Added to your list', ToastAndroid.SHORT);
    } catch (error) {
      console.error('Failed to add to list:', error);
      Alert.alert(
        'Could not add this',
        item?.file_path?.startsWith('content://')
          ? 'The file could not be copied into the app. It may have been moved, or the app that shared it may no longer be granting access.'
          : 'Something went wrong while adding this to your list.',
      );
    } finally {
      setBusy(false);
    }
  }, [item]);

  // Hooks first, then the decision — this component mounts unconditionally on
  // screens where most items are already in the list.
  //
  // parent_id rules out the contents of a container being browsed: a video
  // inside a playlist and a file inside a Drive folder are both stored at
  // out_show 0 by design, and they belong to their container, not loose in the
  // root list.
  // Never for an Iskcon file. There is no list for one to join: the IDT tab is
  // a live listing of the site, not a library the user builds, and a row only
  // exists at all because the file was played or downloaded. It was offering
  // to add every one of them, and would have added it to `items` — the
  // YouTube list — because that is what listFor falls through to.
  // Gone once pinned, exactly as the add bar goes once an item is in the list.
  // The bar is an offer to keep something, not a toggle - undoing it belongs
  // with the pinned row itself, on the IDT screen.
  if (isIskcon) {
    if (isPinned) return null;

    return (
      <View style={styles.bar}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => togglePinFile(item)}>
          <MaterialCommunityIcons name="pin-outline" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Pin</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!item || item.out_show === 1 || item.parent_id || inList) return null;

  return (
    <View style={styles.bar}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={handleAdd}
        disabled={busy}>
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addButtonText}>Add to List</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  // Absolute rather than part of the flow: this drops onto three screens with
  // three different layouts (an animated player, two lists) and none of them
  // should have to make room for it.
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    elevation: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#007AFF',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default SaveToListBar;
