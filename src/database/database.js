import useDbStore from './dbStore';

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
    'items',
    'youtube_meta',
    'notes',
    'notebooks',
    'settings',
    'video_watch_history',
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
    // tx.executeSql('SELECT sqlite_version();', [], (_, result) => {
    //   console.log('SQLite Version:', result.rows.item(0));
    // });

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
      out_show INTEGER NOT NULL DEFAULT 0,
      in_show INTEGER NOT NULL DEFAULT 0,

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

    // ---------------------------------------- FTS5 for notes

    
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_rowid INTEGER,
        image_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      [],
      () => console.log('images table created successfully'),
      error => console.error('Error creating images table:', error),
    );

    tx.executeSql(
      `CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(
            source_id,
            source_type UNINDEXED,
            title,
            content,
            text_content,  
            created_at UNINDEXED,
            tokenize='porter'
        );`,
      [],
      () => console.log('fast Notes table created successfully'),
      error => console.error('Error creating fast Notes table:', error),
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS notebooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            title TEXT, 
            color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );`,
      [],
      () => console.log('notebooks table created successfully'),
      error => console.error('Error creating notebooks table:', error),
    );

    // ---------------------------------------- report

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS video_watch_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          videoId TEXT NOT NULL,
          watchedIntervals TEXT NOT NULL, -- JSON format to store intervals like [[10, 12], [11, 15]]
          todayIntervals TEXT NOT NULL, -- JSON format to store intervals like [[10, 12], [11, 15]]
          date TEXT NOT NULL DEFAULT (DATE('now')), -- Stores the date in YYYY-MM-DD format
           lastWatchedAt TEXT NOT NULL DEFAULT (DATETIME('now')), -- Full timestamp
           lastWatchTime INTEGER NOT NULL DEFAULT 0,  
          watchTimePerDay INTEGER NOT NULL DEFAULT 0, -- Total watch time in seconds per day
          newWatchTimePerDay INTEGER NOT NULL DEFAULT 0, -- Total new watch time in seconds per day
          unfltrdWatchTimePerDay INTEGER NOT NULL DEFAULT 0, -- Total infltrd watch time in seconds per day
          UNIQUE(videoId, date) -- ✅ Ensures uniqueness for ON CONFLICT to work
      );`,
      [],
      () => console.log('Video watch history table created successfully'),
      error =>
        console.error('Error creating video watch history table:', error),
    );


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

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS category_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        item_id TEXT NOT NULL, 
        item_type TEXT NOT NULL,
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

