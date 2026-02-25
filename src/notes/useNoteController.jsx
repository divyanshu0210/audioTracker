import {useEffect, useRef} from 'react';
import {updateNote, updateNoteTitle, deleteNoteById} from './richDB';
import {createNewNote} from './richDB';
import {useAppState} from '../contexts/AppStateContext';

export const generateId = () =>
  Date.now() * 1000 + Math.floor(Math.random() * 1000);

export const useNoteController = () => {
  const {setNotesList, notesList, setMainNotesList, setSelectedNote} =
    useAppState();

  // 🚀 Instant note creation
  const createNoteInstant = async (
    sourceId,
    sourceType,
    relatedItem,
    noteId,
  ) => {
    const tempNote = {
      rowid: noteId,
      source_id: sourceId,
      source_type: sourceType,
      noteTitle: '',
      content: '',
      text_content: '',
      created_at: new Date().toISOString(),
      relatedItem,
      isTemp: true,
    };

    setNotesList(prev => [tempNote, ...prev]);
    setMainNotesList(prev => [tempNote, ...prev]);
    setSelectedNote(tempNote);

    const id = createNewNote(noteId, String(sourceId), sourceType);
    return id;
  };

  const saveContent = async (noteId, html, text) => {
    console.log('saving notes');
    setTimeout(() => {
      updateNote(noteId, html, text);
    }, 0);

    updateNoteInState(noteId, {
      content: html,
      text_content: text,
    });
  };

  const saveTitle = async (noteId, title) => {
    await updateNoteTitle(noteId, title);
    updateNoteInState(noteId, {noteTitle: title});
  };

  const deleteNote = async noteId => {
    await deleteNoteById(noteId);

    setNotesList(prev => prev.filter(n => n.rowid !== noteId));
    setMainNotesList(prev => prev.filter(n => n.rowid !== noteId));
  };

  const updateNoteInState = (noteId, updatedFields) => {
    console.log('UPDATING NOTELIST', notesList, noteId);
    setNotesList(prevNotes =>
      prevNotes.map(note =>
        note.rowid === noteId ? {...note, ...updatedFields} : note,
      ),
    );

    setMainNotesList(prevNotes =>
      prevNotes.map(note =>
        note.rowid === noteId ? {...note, ...updatedFields} : note,
      ),
    );

    setSelectedNote(prev =>
      prev?.rowid === noteId ? {...prev, ...updatedFields} : prev,
    );
  };

  return {
    createNoteInstant,
    saveContent,
    saveTitle,
    deleteNote,
  };
};
