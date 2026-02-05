import SQLite from 'react-native-sqlite-2';
import { getDb } from './database';

// export const fastdb = SQLite.openDatabase(
//   {
//     name: 'DriveApp.db',
//     location: 'default',
//   },
//   () => {
//     console.log('Database opened successfully using fastdb');
//   },
//   error => console.error('Error opening database using fastdb:', error),
// );

export const initFTSDatabase = async() => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql('PRAGMA database_list;', [], (_, result) => {
      const dbPath = result.rows.item(0).file;
      console.log('📂 Database Location:', dbPath);
    });

    // tx.executeSql(
    //   `DROP TABLE IF EXISTS notes;`,
    //   [],
    //   () => console.log(" notes table dropped successfully"),
    //   (_, error) => console.error("Error dropping notes table:", error?.message || "Unknown error")
    // );
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
      `CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_rowid INTEGER,
        image_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`,
      [],
      () => console.log('images table created successfully'),
      error => console.error('Error creating images table:', error)
    );
    
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS notebooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            name TEXT, 
            color TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );`,
      [],
      () => console.log('notebooks table created successfully'),
      error => console.error('Error creating notebooks table:', error),
    );

    // ---------------------------------------- report 

    // tx.executeSql(
    //   `DROP TABLE IF EXISTS video_watch_history;`,
    //   [],
    //   () => console.log('video_watch_history table dropped successfully'),
    //   error => console.error('Error dropping video_watch_history table:', error)
    // );

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
      error => console.error('Error creating video watch history table:', error)
    );
    
  });
};



