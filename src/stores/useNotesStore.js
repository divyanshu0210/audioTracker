import {create} from 'zustand';

export const useNotesStore = create((set, get) => ({
  notesList: [],
  mainNotesList: [],
  selectedNote: null,
  activeNoteId: null,
  notebooks: [],
  editingNotebook: null,
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

  removeItem: (type, id) => {
    switch (type) {
      case 'note':
        set(s => ({notesList: s.notesList.filter(i => i.rowid !== id)}));
        break;
      case 'notebook':
        set(s => ({notebooks: s.notebooks.filter(i => i.id !== id)}));
        break;
    }
  },
}));