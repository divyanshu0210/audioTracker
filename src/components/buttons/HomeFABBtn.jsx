import {useFocusEffect} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {
  AppState,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import {FAB, Portal} from 'react-native-paper';

import {useAppState} from '../../contexts/AppStateContext';
import {
  handleLinkSubmit,
  pickAndImportDeviceFiles,
} from '../../Linking/utils/handleLinkSubmit';
import DriveLinkModal from '../modules/DriveLink';
import MyModal from '../MyModal';
import {createNewNote} from '../../notes/richDB';
import {getOrCreateDefaultNotebook} from '../../database/C';
import {fetchNotebooks} from '../../database/R';
import useDbStore from '../../database/dbStore';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import {generateId, useNoteController} from '../../notes/useNoteController';
import { useMediaStore } from '../../stores/useMediaStore';
import { useShallow } from 'zustand/react/shallow';
import { useSelectionStore } from '../../stores/useSelectionStore';
import { useNotesStore } from '../../stores/useNotesStore';
import { navigationRef } from '../../handlers/navigationRef';

const colors = ['#FFECB3', '#FFAB91', '#A5D6A7', '#90CAF9', '#CE93D8'];

const HomeFABBtn = () => {
  const [open, setOpen] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const primaryColor = '#0F56B3';

  const {setDriveLinksList, setItems, setDeviceFiles} = useMediaStore(
    useShallow(state => ({
      setDriveLinksList: state.setDriveLinksList,
      setItems: state.setItems,
      setDeviceFiles: state.setDeviceFiles,
    })),
  );

  const selectedCategory = useSelectionStore(state => state.selectedCategory);

  const setActiveNoteId = useNotesStore(state => state.setActiveNoteId);
  const setDefaultNotebookId = useNotesStore(state => state.setDefaultNotebookId);

  const {addNBbottomSheetRef, mentorMenteeRequestBottomSheetRef} =
    useAppState();
  const {createNoteInstant} = useNoteController();
  const setInserting = useDbStore(state => state.setInserting);
  //  Media ---------------------
  // Reset modal visibility on screen blur or keyboard hide
  useFocusEffect(
    useCallback(() => {
      return () => {
        setModalVisible(false);
      };
    }, []),
  );

  useEffect(() => {
    const keyboardListener = Keyboard.addListener('keyboardDidHide', () => {
      setModalVisible(false);
    });
    return () => keyboardListener.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') setModalVisible(false);
    });
    return () => subscription.remove();
  }, []);

  const onLinkSubmit = async inputLink => {
    console.log('Processing link:', inputLink);
    await handleLinkSubmit(inputLink, {
      setDriveLinksList,
      setItems,
      setDeviceFiles,
      selectedCategory,
    });
    setModalVisible(false);
  };

  const handleDeviceFilePick = async () => {
    try {
      await pickAndImportDeviceFiles(setDeviceFiles, selectedCategory);
    } finally {
      setModalVisible(false);
    }
  };

  //notes--------------
  const handleAddNoteButton = async () => {
    setInserting(true);
    try {
      // Resolved here rather than read from defaultNotebookId, which is set
      // once at login: delete the Default Notebook mid-session and that id
      // points at a soft-deleted notebook, so the new note lands somewhere
      // the Notebooks tab can't reach. This revives it instead (same id).
      const defaultNotebook = await getOrCreateDefaultNotebook();
      setDefaultNotebookId(defaultNotebook.id);

      const noteId = generateId();
      setActiveNoteId(noteId);
      createNoteInstant(
        defaultNotebook.id,
        'notebook',
        defaultNotebook,
        noteId,
      );
      navigationRef.navigate('NotesSectionWithBack');
    } catch (error) {
      console.error('Note creation failed:', error);
    } finally {
      setInserting(false);
      ToastAndroid.show('Note Added to Default Notebook', ToastAndroid.SHORT);
    }
  };
  //notes--------------

  const handlePress = type => {
    switch (type) {
      case 'notebook':
        addNBbottomSheetRef.current?.expand();
        break;
      case 'note':
        handleAddNoteButton();
        break;
      case 'media':
        setModalVisible(true);
        break;
      case 'connection':
        mentorMenteeRequestBottomSheetRef.current?.expand();
        break;
      default:
        break;
    }
  };

  return (
    <Portal>
      <FAB.Group
        open={open}
        icon={open ? 'close' : 'plus'}
        color="white"
        backdropColor="rgba(255, 255, 255, 0.8)"
        fabStyle={{backgroundColor: primaryColor}}
        style={{zIndex: 1}}
        actions={[
          {
            icon: 'book',
            label: 'Notebook',
            labelTextColor: 'black',
            color: 'white',
            style: {backgroundColor: primaryColor},
            onPress: () => handlePress('notebook'),
          },
          {
            icon: 'note-text',
            label: 'Note',
            labelTextColor: 'black',
            color: 'white',
            style: {backgroundColor: primaryColor},
            onPress: () => handlePress('note'),
          },
          {
            icon: () => (
              <MaterialIcons name="video-collection" size={24} color="white" />
            ),
            label: 'Media',
            labelTextColor: 'black',
            color: 'white',
            style: {backgroundColor: primaryColor},
            onPress: () => handlePress('media'),
          },
          {
            icon: () => (
              <FontAwesome5 name="user-plus" size={18} color="white" />
            ),
            label: 'Connections',
            labelTextColor: 'black',
            color: 'white',
            style: {backgroundColor: primaryColor},
            onPress: () => handlePress('connection'),
          },
        ]}
        onStateChange={({open}) => setOpen(open)}
        visible
      />

      <MyModal withInput isOpen={modalVisible}>
        <View style={styles.modalContent}>
          <DriveLinkModal
            closeModal={() => setModalVisible(false)}
            onSubmit={onLinkSubmit}
          />

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.filePickerContainer}>
            <Pressable
              style={styles.filePickerButton}
              onPress={handleDeviceFilePick}>
              <Text style={styles.filePickerText}>Pick from Device</Text>
            </Pressable>
          </View>
        </View>
      </MyModal>
    </Portal>
  );
};

export default HomeFABBtn;

const styles = StyleSheet.create({
  modalContent: {
    width: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 16,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 6,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  filePickerContainer: {
    alignItems: 'center',
  },
  filePickerButton: {
    backgroundColor: '#EEF1F6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d0d0d0',
    width: '100%',
    alignItems: 'center',
  },
  filePickerText: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
});
