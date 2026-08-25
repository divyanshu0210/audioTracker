import {create} from 'zustand';

export const useNotesStore = create((set, get) => ({
  notesList: [],
  mainNotesList: [],
  selectedNote: null,
  activeNoteId: null,
  notebooks: [],
  editingNotebook: null,
  movingNote: null,
  defaultNotebookId: null,

  setDefaultNotebookId: val => set({defaultNotebookId: val}),

  setNotesList: val =>
    set(s => ({notesList: typeof val === 'function' ? val(s.notesList) : val})),

  setMainNotesList: val =>
    set(s => ({
      mainNotesList: typeof val === 'function' ? val(s.mainNotesList) : val,
    })),

  setSelectedNote: val => set({selectedNote: val}),

  setActiveNoteId: val => set({activeNoteId: val}),

  setNotebooks: val =>
    set(s => ({
      notebooks: typeof val === 'function' ? val(s.notebooks) : val,
    })),

  setEditingNotebook: val => set({editingNotebook: val}),

  setMovingNote: val => set({movingNote: val}),

  removeItem: (type, id) => {
    switch (type) {
      case 'note':
        // AllNotesScreen (the list rendered for "All Notes" and for a
        // category's Notes tab) reads mainNotesList, not notesList — both
        // need filtering or the removed note stays visible until refetch.
        set(s => ({
          notesList: s.notesList.filter(i => i.rowid !== id),
          mainNotesList: s.mainNotesList.filter(i => i.rowid !== id),
        }));
        break;
      case 'notebook':
        set(s => ({notebooks: s.notebooks.filter(i => i.id !== id)}));
        break;
    }
  },
}));