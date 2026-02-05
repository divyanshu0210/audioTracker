// components/CommonMenuItems.js
import { useNavigation } from '@react-navigation/core';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { MenuDivider, MenuItem } from 'react-native-material-menu';
import { removeItemFromCategory } from '../../categories/catDB';
import { useAppState } from '../../contexts/AppStateContext';
import AddNewNoteBtn from '../buttons/AddNewNoteBtn';

const CommonMenuItems = ({
  item,
  sourceId,
  sourceType,
  hideMenu,
  screen,
  showAddNote = true,
  showRemove = true,
}) => {
  const navigation = useNavigation();
  const {selectedCategory, setAddToCategoryModalVisible, filterAndSet} =
    useAppState();

  const handleAddToCategory = () => {
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

  const handleRemoveFromCategory = async () => {
    try {
      await removeItemFromCategory(selectedCategory, sourceId, sourceType);
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
                navigation.navigate('BacePlayer', {
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
                navigation.navigate('NotesListScreen');
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

      {selectedCategory && showRemove && (
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
