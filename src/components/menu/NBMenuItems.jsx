import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert} from 'react-native';
import {Menu, MenuItem, MenuDivider} from 'react-native-material-menu';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useNavigation} from '@react-navigation/native';
import {deleteNotebook} from '../../database/D';
import {moveNotesToDefaultNotebook} from '../../database/C';
import {fetchNotebooks} from '../../database/R';
import {useAppState} from '../../contexts/AppStateContext';

const NBMenuItems = ({item, hideMenu}) => {
  const {setNotebooks, setEditingNotebook} = useAppState();

  // Handle Edit
  const handleEdit = () => {
    setEditingNotebook(item);
  };

  const handleDelete = notebookId => {
    // setNotebooks(prev => prev.filter(nb => nb.id !== notebookId));
    fetchNotebooks(setNotebooks);
  };

  const handleDeleteDefaultNotebook = async notebookId => {
    Alert.alert(
      'Delete Default Notebook',
      'This will delete All Notes in this Notebook',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteNotebook(notebookId, {deleteNotes: true});
              handleDelete(notebookId);
            } catch (error) {
              console.error('Error deleting notebook:', error);
            }
          },
        },
      ],
    );
  };

  const handleDeleteNotebook = async notebookId => {
    Alert.alert(
      'Delete Notebook',
      'Are you sure you want to delete?',
      [
        {
          text: 'Delete notebook and all notes',
          onPress: async () => {
            try {
              await deleteNotebook(notebookId, {deleteNotes: true});
              handleDelete(notebookId);
            } catch (error) {
              console.error('Error deleting notebook and notes:', error);
            }
          },
          style: 'destructive',
        },
        {
          text: 'Delete notebook, keep notes',
          onPress: async () => {
            try {
              await moveNotesToDefaultNotebook(notebookId);
              await deleteNotebook(notebookId, {deleteNotes: false});
              handleDelete(notebookId);
            } catch (error) {
              console.error('Error moving notes or deleting notebook:', error);
            }
          },
        },
        {text: 'Cancel', style: 'cancel'},
      ],
      {cancelable: true},
    );
  };

  const triggerEdit = () => {
    hideMenu();
    handleEdit();
  };

  return (
    <View>
      <MenuItem onPress={triggerEdit}>
        <Text style={styles.menuItemText}>Edit</Text>
      </MenuItem>
      <MenuDivider />
      <MenuItem
        onPress={() => {
          console.log(item);
          if (item.name === 'Default Notebook') {
            handleDeleteDefaultNotebook(item.id);
          } else {
            handleDeleteNotebook(item.id);
          }

          hideMenu();
        }}>
        <Text style={styles.menuItemText}>Delete</Text>
      </MenuItem>
    </View>
  );
};

export default NBMenuItems;

const styles = StyleSheet.create({
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
