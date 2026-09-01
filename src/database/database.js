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
    `CREATE TABLE IF NOT EXISTS backup_files (
          file TEXT PRIMARY KEY,
          level INTEGER NOT NULL,
          start_epoch INTEGER NOT NULL,
          end_epoch INTEGER NOT NULL,
          state TEXT NOT NULL DEFAULT 'local' CHECK (state IN ('local', 'synced', 'ghost')),
          drive_id TEXT UNIQUE
      );`,
    [],
    () => console.log('Backup table created successfully'),
    error => console.error('Error creating Backup table:', error),
    );

    // The updated_at triggers below are created with IF NOT EXISTS, so an
    // existing database would keep an older definition forever. Drop them
    // first so a changed trigger body actually takes effect on upgrade.
    [
      'trg_items_updated_at',
      'trg_youtube_meta_updated_at',
      'trg_images_updated_at',
      'trg_notebooks_updated_at',
      'trg_categories_updated_at',
      'trg_category_items_updated_at',
      'trg_shared_drive_copies_updated_at',
    ].forEach(trigger => {
      tx.executeSql(`DROP TRIGGER IF EXISTS ${trigger};`);
    });

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
          'device_file',
          'iskcon_file'
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
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

    // A device file has no link of its own to share — it came off the phone,
    // not from anywhere a recipient could reach. Sharing one uploads a copy to
    // the user's Drive; this remembers which Drive file that copy is, so the
    // link can be rebuilt later and the copy is never uploaded twice.
    //
    // A side table rather than a column on items: only the handful of files
    // actually shared get a row, instead of every item carrying a column for
    // something almost none of them use. Shaped exactly like youtube_meta —
    // surrogate id, UNIQUE item_id, cascade — because restore upserts on
    // ON CONFLICT(id) and a table keyed only on item_id would silently fall
    // through to DO NOTHING and never take an update.
    //
    // It also outlives the local file on purpose: a device file whose copy is
    // gone after a restore still has a Drive id here to fetch it back from.
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS shared_drive_copies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      drive_file_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (item_id),
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
    );`,
      [],
      () => console.log('shared_drive_copies table created successfully'),
      (_, error) =>
        console.error('Error creating shared_drive_copies table:', error),
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_shared_drive_copies_updated_at
       AFTER UPDATE ON shared_drive_copies
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE shared_drive_copies SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => {},
      (_, error) =>
        console.error('Error creating shared_drive_copies trigger:', error),
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS youtube_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    item_id INTEGER NOT NULL,

    channel_title TEXT,
    thumbnail TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

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

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_items_updated_at
       AFTER UPDATE ON items
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('items updated_at trigger created successfully'),
      error => console.error('Error creating items updated_at trigger:', error),
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_youtube_meta_updated_at
       AFTER UPDATE ON youtube_meta
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE youtube_meta SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('youtube_meta updated_at trigger created successfully'),
      error => console.error('Error creating youtube_meta updated_at trigger:', error),
    );

    // ---------------------------------------- FTS5 for notes

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY,
        note_rowid INTEGER,
        image_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME DEFAULT NULL
      );`,
      [],
      () => console.log('images table created successfully'),
      error => console.error('Error creating images table:', error),
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_images_deleted_at
   ON images(deleted_at);`,
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_images_updated_at
       AFTER UPDATE ON images
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE images SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('images updated_at trigger created successfully'),
      error => console.error('Error creating images updated_at trigger:', error),
    );


    tx.executeSql(
      `CREATE VIRTUAL TABLE IF NOT EXISTS notes USING fts5(
            source_id,
            source_type UNINDEXED,
            title,
            content,
            text_content,
            created_at UNINDEXED,
            updated_at UNINDEXED,
            deleted_at UNINDEXED,
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP DEFAULT NULL
          );`,
      [],
      () => console.log('notebooks table created successfully'),
      error => console.error('Error creating notebooks table:', error),
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_notebooks_deleted_at
   ON notebooks(deleted_at);`,
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_notebooks_updated_at
       AFTER UPDATE ON notebooks
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE notebooks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('notebooks updated_at trigger created successfully'),
      error => console.error('Error creating notebooks updated_at trigger:', error),
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
        name TEXT NOT NULL,
        color TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP DEFAULT NULL
      );`,
      [],
      () => console.log('Categories table created successfully'),
      error => console.error('Error creating categories table:', error),
    );

    tx.executeSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_live
   ON categories(name) WHERE deleted_at IS NULL;`,
      [],
      () => console.log('idx_categories_name_live created successfully'),
      error => console.error('Error creating idx_categories_name_live:', error),
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_categories_deleted_at
   ON categories(deleted_at);`,
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_categories_updated_at
       AFTER UPDATE ON categories
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('categories updated_at trigger created successfully'),
      error => console.error('Error creating categories updated_at trigger:', error),
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS category_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        item_type TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP DEFAULT NULL,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
      );`,
      [],
      () => console.log('Category_items table created successfully'),
      error => console.error('Error creating category_items table:', error),
    );

    tx.executeSql(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_category_items_live
   ON category_items(category_id, item_id, item_type) WHERE deleted_at IS NULL;`,
      [],
      () => console.log('idx_category_items_live created successfully'),
      error => console.error('Error creating idx_category_items_live:', error),
    );

    tx.executeSql(
      `CREATE INDEX IF NOT EXISTS idx_category_items_deleted_at
   ON category_items(deleted_at);`,
    );

    tx.executeSql(
      `CREATE TRIGGER IF NOT EXISTS trg_category_items_updated_at
       AFTER UPDATE ON category_items
       WHEN NEW.updated_at IS OLD.updated_at
       BEGIN
         UPDATE category_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
       END;`,
      [],
      () => console.log('category_items updated_at trigger created successfully'),
      error => console.error('Error creating category_items updated_at trigger:', error),
    );
  });
};
