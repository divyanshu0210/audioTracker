import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useState} from 'react';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {Menu, MenuItem} from 'react-native-material-menu';
import Share from 'react-native-share';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAppState} from '../../contexts/AppStateContext.jsx';
import {moveNoteToNotebook} from '../../database/U.js';
import {deleteNoteById} from '../../notes/richDB.js';
import {convertToPdf} from '../../notes/utils/convertToPDF.js';
import {convertToDocx} from '../../notes/utils/covertToDOCX.js';
import SelectNotebookModal from '../modals/SelectNotebookModal.jsx';
import CommonMenuItems from './CommonMenuItems.jsx';

export const handleExport = async (noteId, format) => {
  try {
    let filePath;
    let mimeType;
    let title;

    if (format === 'doc') {
      filePath = await convertToDocx(noteId);
      mimeType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      title = 'Share Notes DOCX';
    } else if (format === 'pdf') {
      filePath = await convertToPdf(noteId);
      mimeType = 'application/pdf';
      title = 'Share Notes PDF';
    } else {
      Alert.alert('Error', 'Unsupported file format selected.');
      return; // Stop execution if format is invalid
    }

    if (!filePath) {
      Alert.alert('Error', 'File path could not be generated.');
      return;
    }

    // Attempt to share the file
    await Share.open({
      url: `file://${filePath}`,
      type: mimeType,
      title,
    });
  } catch (error) {
    // console.error('Export Error:', error);

    Alert.alert(
      'Export Cancelled',
      // 'An error occurred while exporting your notes. Please try again.',
      [{text: 'OK'}],
    );
  }
};

const NoteMenuItems = ({item, hideMenu}) => {
  const {setNotesList,setMainNotesList, bottomSheetRef} = useAppState();


  const [moveModalVisible, setMoveModalVisible] = useState(false);

  const onDelete = noteId => {
    setNotesList(prev => prev.filter(note => note.rowid !== noteId));
    setMainNotesList(prev => prev.filter(note => note.rowid !== noteId));
  };

  const handleDelete = noteId => {
    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteNoteById(noteId, onDelete(noteId)),
      },
    ]);
  };
  // Handle moving the note to selected notebook
  const handleMoveNotebook = async newNotebookId => {
    try {
      const success = await moveNoteToNotebook(item.rowid, newNotebookId);
      if (success) {
        Alert.alert('Success', 'Note moved successfully');
        setMoveModalVisible(false);
        onDelete(item.rowid); // Notify parent or refresh list
      } else {
        Alert.alert('Failed', 'Failed to move note. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while moving the note.');
      console.error(error);
    }
  };
  const openNoteDetailsMenu = useCallback(() => {
    bottomSheetRef.current?.snapToIndex(0);
  }, [bottomSheetRef]);

  return (
    <View>
      <MenuItem
        onPress={() => {
          hideMenu();
          handleExport(item.rowid, 'pdf');
        }}>
        <Text style={styles.menuItemText}>Share as PDF</Text>
      </MenuItem>

      {/* <MenuItem onPress={hideMenu}>
          <TouchableOpacity onPress={()=>{hideMenu();handleExport(item,'doc')}}>
            <Text style={styles.menuItemText}>Share as DOC</Text>
          </TouchableOpacity>
        </MenuItem> */}
      {item.source_type === 'notebook' && (
        <MenuItem
          onPress={() => {
            hideMenu();
            setMoveModalVisible(true);
          }}>
          <Text style={styles.menuItemText}>Move</Text>
        </MenuItem>
      )}

      {/* <MenuItem onPress={hideMenu}>
          <TouchableOpacity>
            <Text style={styles.menuItemText}>Pin</Text>
          </TouchableOpacity>
        </MenuItem> */}
   
      <MenuItem
        onPress={() => {
          hideMenu();
          handleDelete(item.rowid);
        }}>
        <Text style={styles.menuItemText}>Delete</Text>
      </MenuItem>
      {/* <MenuDivider /> */}
      <MenuItem onPress={hideMenu}>
        <TouchableOpacity
          onPress={() => {
            hideMenu();
            openNoteDetailsMenu();
          }}>
          <Text style={styles.menuItemText}>Details</Text>
        </TouchableOpacity>
      </MenuItem>

      {/* Move Note Modal */}
      <SelectNotebookModal
        visible={moveModalVisible}
        onClose={() => setMoveModalVisible(false)}
        onSelect={handleMoveNotebook}
        selectedNotebookId={item.source_id}
      />
    </View>
  );
};

export default NoteMenuItems;

const styles = StyleSheet.create({
  menuContainer: {
    borderRadius: 8,
    backgroundColor: '#fff',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    zIndex: 0,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    paddingVertical: 8,
  },
});
