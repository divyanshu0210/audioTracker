// stores/dbStore.js
import {create} from 'zustand';
import SQLite from 'react-native-sqlite-2';
import {initDatabase} from './database';

const useDbStore = create((set, get) => ({
  db: null,
  dbPath: null,
  currentUserId: null,
  loading: false,
  inserting: false,
  setLoading: isLoading => set({loading: isLoading}),
  setInserting: inserting => set({inserting: inserting}),

  setDb: dbInstance => set({db: dbInstance}),
  setDbPath: dbPath => set({dbPath: dbPath}),



  // Initialize database for a user
  initDb: async userId => {
    if (userId === useDbStore.getState().currentUserId) {
      return useDbStore.getState().db; // Already initialized
    }

    const dbName = `DriveApp_${userId}.db`;
    const db = SQLite.openDatabase(
      {
        name: dbName,
        location: 'default',
      },
      () => console.log(`Database opened for user ${userId}`),
      error =>
        console.error(`Error opening database for user ${userId}:`, error),
    );

    // The schema before the handle, so that `db` in this store never means a
    // file with no tables in it. An open database and a usable one are ~800ms
    // apart on a fresh install, and anything that reads the moment the handle
    // appears - ContinueWatchingSheet does - spent that gap compiling against
    // an empty file and failing with `no such table`.
    await initDatabase(db);

    set({db, currentUserId: userId});
    return db;
  },

  // Close current database
  closeDb: () => {
    set({db: null, currentUserId: null});
  },
}));

export default useDbStore;
