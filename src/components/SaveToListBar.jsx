// The one way an externally-opened item joins the library.
//
// A link or share from another app no longer drops anything into a tab — it
// opens the thing itself and leaves this bar across the bottom of whatever
// screen it opened. Keeping something is a decision made after seeing it, on
// the screen where you saw it, which is also why the category is chosen here
// rather than being inherited from whichever category happened to be open
// when the link arrived.
//
// It renders on three surfaces: BacePlayer (videos and single files),
// PlaylistView and GoogleDriveViewer (the container itself). The `note` prop
// carries the warning the two container screens need — backing out of those
// loses the item, because nothing else lists a playlist or a folder the way
// watch history lists a video.

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';
import {Picker} from '@react-native-picker/picker';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {getAllCategories} from '../categories/catDB';
import {saveItemToList} from '../Linking/saveToList';

// Saving with no category is the common case and has to be reachable in one
// tap, so it is the default rather than something to scroll up to.
const NO_CATEGORY = '__none__';

const SaveToListBar = ({item, note}) => {
  const [saved, setSaved] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(NO_CATEGORY);
  const [busy, setBusy] = useState(false);

  // The player swaps items under this component as a queue advances, and a
  // "saved" state left over from the previous one would hide the bar for an
  // item that was never added.
  useEffect(() => {
    setSaved(false);
    setSelected(NO_CATEGORY);
  }, [item?.id]);

  const openPicker = useCallback(async () => {
    setPickerVisible(true);
    try {
      const cats = await getAllCategories();
      // The same filter CategorySelectionModal uses: shared-with-me categories
      // carry an email in their name and aren't somewhere to file your own
      // things.
      setCategories(cats.filter(cat => !/\([^\s@)]+@[^\s@)]+\)/.test(cat.name)));
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategories([]);
    }
  }, []);

  const handleSave = useCallback(async () => {
    setBusy(true);
    try {
      await saveItemToList(item, selected === NO_CATEGORY ? null : selected);
      setSaved(true);
      setPickerVisible(false);
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
  }, [item, selected]);

  // Hooks first, then the decision — this component mounts unconditionally on
  // screens where most items are already in the list.
  //
  // parent_id rules out the contents of a container being browsed: a video
  // inside a playlist and a file inside a Drive folder are both stored at
  // out_show 0 by design, and they belong to their container, not loose in the
  // root list.
  if (!item || item.out_show === 1 || item.parent_id || saved) return null;

  return (
    <>
      <View style={styles.bar}>
        {!!note && <Text style={styles.note}>{note}</Text>}
        <TouchableOpacity
          style={styles.addButton}
          onPress={openPicker}
          disabled={busy}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>Add to List</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={pickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => !busy && setPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <TouchableOpacity
              style={styles.closeIcon}
              onPress={() => setPickerVisible(false)}
              disabled={busy}>
              <Ionicons name="close" size={24} color="black" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Add to List</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {item.title}
            </Text>

            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={selected}
                enabled={!busy}
                onValueChange={value => setSelected(value)}
                style={styles.picker}>
                <Picker.Item label="No category" value={NO_CATEGORY} />
                {categories.map(category => (
                  <Picker.Item
                    key={category.id}
                    label={category.name}
                    value={category.id}
                  />
                ))}
              </Picker>
            </View>

            <TouchableOpacity
              style={styles.confirmButton}
              onPress={handleSave}
              disabled={busy}>
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.confirmButtonText}>Add</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ddd',
    elevation: 8,
  },
  note: {
    flex: 1,
    marginRight: 12,
    fontSize: 11,
    color: '#666',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 6,
    backgroundColor: '#34C759',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContainer: {
    backgroundColor: 'white',
    marginHorizontal: 20,
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#333',
  },
  modalSubtitle: {
    marginTop: 4,
    marginBottom: 15,
    fontSize: 12,
    textAlign: 'center',
    color: '#777',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    marginBottom: 15,
    overflow: 'hidden',
  },
  picker: {
    width: '100%',
  },
  confirmButton: {
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
    backgroundColor: '#34C759',
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  closeIcon: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
});

export default SaveToListBar;
