import {create} from 'zustand';
import {fetchNotebookNoteCounts} from '../database/R';

// Rewrites which notebook a set of notes belongs to, in a single pass over
// both lists. `matches` picks the notes: callers select either by rowid (an
// explicit move) or by the notebook they currently sit in (a notebook being
// deleted). mainNotesList is every note regardless of notebook, so matched
// notes stay there and only their source fields change; notesList is the
// notebook-scoped list, so they do leave that one.
//
// `notebook` is the destination row itself, not an id to look up in
// s.notebooks: that lookup could miss (the notebook list not refetched yet, a
// notebook created moments ago by getOrCreateDefaultNotebook) and a miss fails
// silently — the note keeps rendering its old notebook's name, which is the
// exact bug this is here to fix.
const applyNotebookMove = (s, matches, notebook) => ({
  notesList: s.notesList.filter(n => !matches(n)),
  mainNotesList: s.mainNotesList.map(n =>
    matches(n)
      ? {
          ...n,
          source_id: String(notebook.id),
          source_type: 'notebook',
          // Keep the shown notebook name/colour in step with the move.
          relatedItem: {
            id: notebook.id,
            title: notebook.title,
            color: notebook.color,
            created_at: notebook.created_at,
          },
        }
      : n,
  ),
});

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

  // A notebook can come back from the dead: getOrCreateDefaultNotebook
  // restores a soft-deleted Default Notebook instead of inserting a duplicate.
  // Paths that patch `notebooks` in place rather than refetching (bulk delete
  // filters the list) would otherwise leave the revived one missing from the
  // Notebooks tab until the next full refresh — while its notes are already
  // pointing at it. No-ops when it's already listed.
  upsertNotebook: notebook =>
    set(s => {
      if (!notebook) return {};
      if (s.notebooks.some(nb => String(nb.id) === String(notebook.id))) {
        return {};
      }
      // `type` and the DESC-by-created_at order are what fetchNotebooks
      // produces; a row inserted here has to match or it renders wrong and
      // jumps position on the next refetch.
      const added = {type: 'notebook', ...notebook};
      return {
        notebooks: [...s.notebooks, added].sort((a, b) =>
          String(b.created_at || '').localeCompare(String(a.created_at || '')),
        ),
      };
    }),

  // Counts live in their own map rather than on the notebook rows: `notebooks`
  // gets wholesale-replaced by fetchNotebooks on every pull-to-refresh and by
  // NBMenuItems.refreshNotebooks, and rows straight from the DB carry no
  // count — so a count stored on the row vanishes on each of those. Keyed by
  // id as a string because callers hold ids as both.
  //
  // A separate loaded flag distinguishes "not counted yet" from "counted,
  // zero": a notebook with no notes is simply absent from the query's result.
  notebookNoteCounts: {},
  notebookCountsLoaded: false,

  // Counts can't be derived from mainNotesList — that's paginated — so they
  // have to come from the DB. Only the counts are refetched, never the
  // notebook list: in category mode `notebooks` holds just that category's
  // notebooks (HomeTabs.loadNotebooks), and refetching would replace it with
  // all of them.
  refreshNotebookCounts: async () => {
    try {
      const counts = await fetchNotebookNoteCounts();
      set({notebookNoteCounts: counts, notebookCountsLoaded: true});
    } catch (error) {
      console.error('Failed to refresh notebook counts:', error);
    }
  },

  setMovingNote: val => set({movingNote: val}),

  // Takes the whole batch in one set() rather than exposing a single-note
  // action a bulk caller would loop over: each set() rebuilds both lists in
  // full, so a per-note loop is O(notes x moved) array work plus a store
  // notification per note.
  // `notebook` is the destination row, handed over by SelectNotebookModal —
  // see applyNotebookMove.
  moveNotesInState: (rowids, notebook) =>
    set(s => {
      const moved = new Set(rowids);
      if (!moved.size || !notebook) return {};
      return applyNotebookMove(s, n => moved.has(n.rowid), notebook);
    }),

  moveNoteInState: (rowid, notebook) =>
    get().moveNotesInState([rowid], notebook),

  // Deleting a notebook but KEEPING its notes moves them to the Default
  // Notebook in the DB (moveNotesToDefaultNotebook). Without this, All Notes
  // goes on showing the deleted notebook's name and colour under each of
  // those notes — and their stale source_id points at a notebook that no
  // longer exists — until the next refetch.
  // `toNotebook` is the destination row (from moveNotesToDefaultNotebook), not
  // an id — see applyNotebookMove.
  reassignNotesOfNotebooks: (fromNotebookIds, toNotebook) =>
    set(s => {
      const from = new Set(fromNotebookIds.map(String));
      if (!from.size || !toNotebook) return {};
      return applyNotebookMove(
        s,
        n => n.source_type === 'notebook' && from.has(String(n.source_id)),
        toNotebook,
      );
    }),

  // Deleting a notebook *together with its notes* has to clear those notes
  // from All Notes too — removeItem('notebook') only drops the notebook row,
  // leaving its notes visible in mainNotesList until the next refetch.
  removeNotesOfNotebook: notebookId =>
    set(s => {
      const belongs = n =>
        n.source_type === 'notebook' &&
        String(n.source_id) === String(notebookId);
      return {
        notesList: s.notesList.filter(n => !belongs(n)),
        mainNotesList: s.mainNotesList.filter(n => !belongs(n)),
      };
    }),

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