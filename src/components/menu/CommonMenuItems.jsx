// components/CommonMenuItems.js
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MenuDivider, MenuItem } from 'react-native-material-menu';
import { removeItemFromCategory } from '../../categories/catDB';
import { useAppState } from '../../contexts/AppStateContext';
import AddNewNoteBtn from '../buttons/AddNewNoteBtn';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useShallow } from 'zustand/react/shallow';
import { useMediaStore } from '../../stores/useMediaStore';
import { useNotesStore } from '../../stores/useNotesStore';
import { navigationRef } from '../../handlers/navigationRef';
import { ScreenTypes } from '../../contexts/constants';


export const filterAndSet = (type, id) => {
  const mediaTypes = ['youtube', 'device', 'drive', 'iskcon'];
  const notesTypes = ['note', 'notebook'];

  if (mediaTypes.includes(type)) {
    useMediaStore.getState().removeItem(type, id);
    return;
  }

  if (notesTypes.includes(type)) {
    useNotesStore.getState().removeItem(type, id);
  }
};

const CommonMenuItems = ({
  item,
  sourceId,
  sourceType,
  hideMenu,
  screen,
  showAddNote = true,
  showRemove = true,
}) => {
const {
  selectedCategory,
  setAddToCategoryModalVisible,
  setCategoryModalBulkItems,
} = useSelectionStore(
  useShallow(state => ({
    selectedCategory: state.selectedCategory,
    setAddToCategoryModalVisible:
      state.setAddToCategoryModalVisible,
    setCategoryModalBulkItems: state.setCategoryModalBulkItems,
  })),
);

  const handleAddToCategory = () => {
    // Make sure a leftover bulk selection from a previous SelectionHeader
    // action doesn't hijack this single-item add.
    setCategoryModalBulkItems(null);
    setAddToCategoryModalVisible(true);
  };

  const confirmRemove = () => {
    Alert.alert(
      'Confirm Removal',
      'Are you sure to remove the item from this category',
      // file.mainscreen_show?'FILE FOUND IN HOME!!\nThis will Delete related file from HOME also.':'This will undownload the file',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Remove',
          onPress: () => {
            handleRemoveFromCategory();
          },
          style: 'destructive',
        },
      ],
    );
  };

  // category_items.item_type stores the raw subtype for media items
  // ('drive_file'/'drive_folder', 'youtube_video'/'youtube_playlist',
  // 'device_file' — see handleDriveLink's addItemToCategory call and
  // getCategoryData's ITEM_TYPES_THAT_USE_ITEMS_TABLE), not the generic
  // ItemTypes enum ('drive'/'youtube'/'device'/'iskcon') that sourceType is
  // for these. Notes/notebooks have no such subtype split, so sourceType
  // ('note'/'notebook') already matches what's stored for them.
  // 'iskcon' belongs here for the same reason as the rest — the link is
  // stored as 'iskcon_file' (the add path takes item.type, so removal has to
  // as well, or it looks for a link that was never written under that name).
  const MEDIA_TYPES_NEEDING_SUBTYPE = ['drive', 'device', 'youtube', 'iskcon'];

  const handleRemoveFromCategory = async () => {
    try {
      const categoryItemType = MEDIA_TYPES_NEEDING_SUBTYPE.includes(sourceType)
        ? item?.type
        : sourceType;
      await removeItemFromCategory(selectedCategory, sourceId, categoryItemType);
      filterAndSet(sourceType, sourceId, screen);
    } catch (err) {
      console.error('Error removing from category:', err);
    }
  };

  return (
    <>
      {showAddNote && (
        <>
          <MenuItem onPress={hideMenu}>
            <AddNewNoteBtn
              renderItem={() => (
                <Text style={styles.menuItemText}>Add Notes</Text>
              )}
              onNoteAdded={noteId => {
                navigationRef.navigate('BacePlayer', {
                  item: item,
                  currentNoteId: noteId,
                  pauseOnStart: true,
                });
                hideMenu();
              }}
            />
          </MenuItem>
          <MenuItem onPress={hideMenu}>
            <TouchableOpacity
              onPress={() => {
                hideMenu();
                navigationRef.navigate('NotesListScreen');
              }}>
              <Text style={styles.menuItemText}>Show All Notes</Text>
            </TouchableOpacity>
          </MenuItem>
        </>
      )}

      <MenuItem
        onPress={() => {
          handleAddToCategory();
          hideMenu();
        }}>
        <Text style={styles.menuItemText}>Add to Category</Text>
      </MenuItem>

      {/* "Remove from this category" only makes sense on the screen that is
          actually filtered by the selected category — the Home tabs. Elsewhere
          (Downloads, search, a playlist, inside a Drive folder, an item's
          notes) the list has nothing to do with that category, and selectedCategory
          is just whatever was left selected back on Home, so offering to unlink
          from it there acts on a category the user isn't looking at.
          ScreenTypes.MAIN is what every Home tab passes, explicitly or by
          BaseMediaListComponent's default. */}
      {selectedCategory && screen === ScreenTypes.MAIN && showRemove && (
        <>
          <MenuDivider />
          <MenuItem onPress={hideMenu}>
            <TouchableOpacity
              onPress={() => {
                confirmRemove();
                hideMenu();
              }}>
              <Text style={styles.menuItemText}>Remove</Text>
            </TouchableOpacity>
          </MenuItem>
        </>
      )}
    </>
  );
};

export default CommonMenuItems;

const styles = StyleSheet.create({
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
