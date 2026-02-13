import AsyncStorage from '@react-native-async-storage/async-storage';
import useDbStore from './dbStore';
import SQLite from 'react-native-sqlite-2';

// Helper function to get db from store with error handling
export const getDb = () => {
  const db = useDbStore.getState().db;
  if (!db) {
    throw new Error(
      'Database not initialized. Please make sure user is logged in.',
    );
  }
  return db;
};

export const resetDatabase = async () => {
  const fastdb = getDb();
  const tables = [
    'folders',
    'files',
    'videos',
    'playlists',
    'device_files',
    'notes',
    'notebooks',
    'settings',
    'video_watch_history',
    'richNotes',
    'images',
    'categories',
    'category_items',
  ];

  fastdb.transaction(
    tx => {
      tables.forEach(table => {
        tx.executeSql(
          `DROP TABLE IF EXISTS ${table};`,
          [],
          () => console.log(`${table} table dropped successfully`),
          (_, error) =>
            console.error(
              `Error dropping ${table} table:`,
              error?.message || 'Unknown error',
            ),
        );
      });
    },
    error => console.error('Transaction error:', error),
    () => {
      console.log('Database reset successful');
      // initDatabase(); // Recreate tables
    },
  );
};

// Initialize the database (create table if it doesn't exist)
export const initDatabase = async () => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql('PRAGMA database_list;', [], (_, result) => {
      const dbPath = result.rows.item(0).file;
      useDbStore.getState().setDbPath(dbPath);

      console.log('📂 Database Location:', dbPath);
    });

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );`,
      [],
      () => console.log('Settings table created successfully'),
      error => console.error('Error creating Settings table:', error),
    );

    // tx.executeSql(
    //   "DROP TABLE IF EXISTS folders;",
    //   [],
    //   () => console.log("folders table dropped successfully"),
    //   (_, error) => console.error("Error dropping folders table:", error?.message || "Unknown error")
    // );
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                drive_id TEXT UNIQUE,
                name TEXT,
                parent_id TEXT,
                  out_show INTEGER DEFAULT 0,
                in_show INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              );`,
      [],
      () => console.log('Folders table created successfully'),
      error => console.error('Error creating folders table:', error),
    );

    // tx.executeSql(
    //   "DROP TABLE IF EXISTS files;",
    //   [],
    //   () => console.log("files table dropped successfully"),
    //   (_, error) => console.error("Error dropping files table:", error?.message || "Unknown error")
    // );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS files (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              drive_id TEXT UNIQUE,
              name TEXT,
              parent_id TEXT,
              mimeType TEXT,
               file_path TEXT, 
                   out_show INTEGER DEFAULT 0,
               in_show INTEGER DEFAULT 0,
                  duration INTEGER DEFAULT 0,
                   
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );`,
      [],
      () => console.log('Files table created successfully'),
      error => console.error('Error creating files table:', error),
    );

    //   tx.executeSql(
    //   "DROP TABLE IF EXISTS device_files;",
    //   [],
    //   () => console.log("device_files table dropped successfully"),
    //   (_, error) => console.error("Error dropping device_files table:", error?.message || "Unknown error")
    // );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS device_files (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              uuid TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              file_path TEXT,
              mimeType TEXT NOT NULL,
              duration INTEGER DEFAULT 0, 
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`,
      [],
      () => console.log('device_files table created successfully'),
      error => console.error('Error creating device_files table:', error),
    );
    //    tx.executeSql(
    //   `ALTER TABLE files ADD COLUMN duration INTEGER DEFAULT 0;`,
    //   [],
    //   () => console.log("Column 'duration' added successfully."),
    //   (_, error) => console.error("Error adding column 'duration':", error)
    // );

    // tx.executeSql(
    //   "DROP TABLE IF EXISTS videos;",
    //   [],
    //   () => console.log("Videos table dropped successfully"),
    //   (_, error) => console.error("Error dropping videos table:", error?.message || "Unknown error")
    // );

    // tx.executeSql(
    //   "DROP TABLE IF EXISTS playlists;",
    //   [],
    //   () => console.log("playlist table dropped successfully"),
    //   (_, error) => console.error("Error dropping playlist table:", error?.message || "Unknown error")
    // );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
        ytube_id TEXT UNIQUE,
        title TEXT NOT NULL,
        thumbnail TEXT,
        channel_title TEXT,
        out_show INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
      [],
      () => console.log('Playlist table created successfully'),
      error => console.error('Error creating playlist table:', error),
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ytube_id TEXT UNIQUE,
        title TEXT,
        channel_title TEXT,
        parent_id INTEGER,
        out_show INTEGER DEFAULT 0,
        in_show INTEGER DEFAULT 0,  
        fav INTEGER DEFAULT 0, 
         duration INTEGER DEFAULT 0,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,          
        FOREIGN KEY (parent_id) REFERENCES playlists(id) ON DELETE CASCADE
    );`,
      [],
      () => console.log('Videos table created successfully'),
      (_, error) =>
        console.error(
          'Error creating videos table:',
          error?.message || 'Unknown error',
        ),
    );

    tx.executeSql('SELECT sqlite_version();', [], (_, result) => {
      console.log('SQLite Version:', result.rows.item(0));
    });
    //   tx.executeSql(
    //   `DROP TABLE IF EXISTS items;`,
    //   [],
    //   () => console.log(" items table dropped successfully"),
    //   (_, error) => console.error("Error dropping items table:", error?.message || "Unknown error")
    // );
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      source_id TEXT,

      type TEXT NOT NULL CHECK (
        type IN (
          'youtube_video',
          'youtube_playlist',
          'drive_file',
          'drive_folder',
          'device_file'
        )
      ),

      title TEXT NOT NULL,
      parent_id INTEGER,

      mimeType TEXT,
      file_path TEXT,

      duration INTEGER DEFAULT 0,
      fav INTEGER DEFAULT 0,
      out_show INTEGER DEFAULT 0,
      in_show INTEGER DEFAULT 0,

      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deleted_at TIMESTAMP DEFAULT NULL,

      UNIQUE (type, source_id),
      FOREIGN KEY (parent_id) REFERENCES items(id) ON DELETE CASCADE
    );`,
      [],
      () => console.log('Items table created successfully'),
      (_, error) =>
        console.error(
          'Error creating items table:',
          error?.message || 'Unknown error',
        ),
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS youtube_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    item_id INTEGER NOT NULL,

    channel_title TEXT,
    thumbnail TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (item_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
  );`,
      [],
      () => console.log('youtube_meta table created successfully'),
      (_, error) =>
        console.error(
          'Error creating youtube_meta table:',
          error?.message || 'Unknown error',
        ),
    );
    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_items_type_parent
   ON items(type, parent_id);`,
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_items_deleted_at
   ON items(deleted_at);`,
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_youtube_meta_item_id
   ON youtube_meta(item_id);`,
    );
    //   tx.executeSql(
    //   `DROP TABLE IF EXISTS categories;`,
    //   [],
    //   () => console.log(" categories table dropped successfully"),
    //   (_, error) => console.error("Error dropping categories table:", error?.message || "Unknown error")
    // );

    // Create categories table
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );`,
      [],
      () => console.log('Categories table created successfully'),
      error => console.error('Error creating categories table:', error),
    );
    // tx.executeSql(
    //     `DROP TABLE IF EXISTS category_items;`,
    //     [],
    //     () => console.log(" category_items table dropped successfully"),
    //     (_, error) => console.error("Error dropping category_items table:", error?.message || "Unknown error")
    //   );
    // Create category_items junction table
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS category_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        item_id TEXT NOT NULL, 
        item_type TEXT NOT NULL CHECK(item_type IN ('youtube','notebook', 'drive', 'device', 'note')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(category_id, item_id, item_type)  
      );`,
      [],
      () => console.log('Category_items table created successfully'),
      error => console.error('Error creating category_items table:', error),
    );
  });
};

// ----------------notes
