// MoveNoteModal.jsx
//
// Mounted once at the app root (see GlobalModals) rather than inside
// NoteMenuItems — NoteMenuItems lives inside react-native-material-menu's
// <Menu>, which unmounts its children once the menu closes. hideMenu() runs
// right before this modal would need to open, so a modal nested in there
// flashes open and immediately disappears along with the closing menu.
// Driven by useNotesStore.movingNote so NoteMenuItems can trigger it with
// just setMovingNote(item).

import React from 'react';
import {Alert} from 'react-native';
import {useShallow} from 'zustand/react/shallow';
import {useNotesStore} from '../../stores/useNotesStore';
import {moveNoteToNotebook} from '../../database/U';
import SelectNotebookModal from './SelectNotebookModal';

const MoveNoteModal = () => {
  const {movingNote, setMovingNote, moveNoteInState} = useNotesStore(
    useShallow(state => ({
      movingNote: state.movingNote,
      setMovingNote: state.setMovingNote,
      moveNoteInState: state.moveNoteInState,
    })),
  );

  const handleMoveNotebook = async newNotebook => {
    if (!movingNote) return;
    try {
      const success = await moveNoteToNotebook(
        movingNote.rowid,
        newNotebook.id,
      );
      if (success) {
        Alert.alert('Success', 'Note moved successfully');
        // Only leaves the notebook-scoped list — a moved note still belongs
        // in All Notes, just under a different notebook.
        moveNoteInState(movingNote.rowid, newNotebook);
      } else {
        Alert.alert('Failed', 'Failed to move note. Please try again.');
      }
    } catch (error) {
      Alert.alert('Error', 'An error occurred while moving the note.');
      console.error(error);
    }
  };

  return (
    <SelectNotebookModal
      visible={!!movingNote}
      onClose={() => setMovingNote(null)}
      onSelect={handleMoveNotebook}
      selectedNotebookId={movingNote?.source_id}
    />
  );
};

export default MoveNoteModal;
