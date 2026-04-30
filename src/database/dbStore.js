// stores/dbStore.js
import {create} from 'zustand';
import SQLite from 'react-native-sqlite-2';

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

    set({db, currentUserId: userId});
    return db;
  },

  // Close current database
  closeDb: () => {
    set({db: null, currentUserId: null});
  },
}));

export default useDbStore;
