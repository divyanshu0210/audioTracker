// richNoteDB.js
// import SQLite from 'react-native-sqlite-2';
// import { Alert } from 'react-native';

import { getDb } from "../database/database";

// export const db = SQLite.openDatabase(
//   { name: 'DriveApp.db', location: 'default' },
//   () => {
//     console.log('Database opened successfully');
//     initDatabase();
//   },
//   error => {
//     console.error('Error opening database:', error);
//     Alert.alert('Database Error', 'Failed to initialize database');
//   }
// );
// import { getDb } from "./database";
export const initDatabase = () => {
   const fastdb = getDb();
   fastdb.transaction(
    tx => {

      // tx.executeSql('DROP TABLE IF EXISTS richNotes;');
      // tx.executeSql('DROP TABLE IF EXISTS images;');
      // tx.executeSql('DROP TABLE IF EXISTS notes;'); // Drop FTS5 virtual table
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
        () => console.log('notes table created successfully'),
        error => console.error('Error creating notes table:', error)
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
    },
    error => {
      console.error('Transaction error:', error);
    },
    () => {
      console.log('Database initialization completed');
    }
  );
};

export const createNewNote = ( sourceId, sourceType ) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO notes (source_id, source_type, title, content, text_content, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP);',
        [sourceId, sourceType, '', '', ''],
        (_, result) => resolve(result.insertId),
        (_, error) => {
          console.error('Error creating note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


export const updateNote = (noteRowId, content, textContent) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'UPDATE notes SET content = ?, text_content = ?, created_at = CURRENT_TIMESTAMP  WHERE rowid = ?;',
        [ content, textContent, noteRowId],
        resolve,
        (_, error) => {
          console.error('Error saving note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


// Add this to your richDB.js
export const updateNoteTitle = async (noteId, newTitle) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'UPDATE notes SET title = ? WHERE rowid = ?',
        [newTitle, noteId],
        (_, result) => resolve(result),
        (_, error) => reject(error),
      );
    });
  });
};

export const saveImage = (noteRowId, imageData) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO images (note_rowid, image_data) VALUES (?, ?);',
        [noteRowId, imageData],
        (_, result) => resolve(result.insertId),
        (_, error) => {
          console.error('Error saving image:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


export const getNoteById = noteRowId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT title, content, text_content FROM notes WHERE rowid = ?;',
        [noteRowId],
        (_, { rows: { _array } }) => resolve(_array[0] || {}),
        (_, error) => {
          console.error('Error fetching note:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};

export const getImagesForNote = noteRowId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT id, image_data FROM images WHERE note_rowid = ?;',
        [noteRowId],
        (_, { rows: { _array } }) => resolve(_array),
        (_, error) => {
          console.error('Error fetching images:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


export const deleteUnusedImages = (noteRowId, usedIds) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    usedIds = Array.isArray(usedIds) ? usedIds : [];

    fastdb.transaction(tx => {
      const placeholders = usedIds.map(() => '?').join(',');
      const query = usedIds.length
        ? `DELETE FROM images WHERE note_rowid = ? AND id NOT IN (${placeholders});`
        : `DELETE FROM images WHERE note_rowid = ?;`;

      const params = usedIds.length ? [noteRowId, ...usedIds] : [noteRowId];

      tx.executeSql(
        query,
        params,
        resolve,
        (_, error) => {
          console.error('Error deleting unused images:', error);
          reject(error);
          return false;
        }
      );
    });
  });
};


 export const deleteNoteById = (noteId) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
      tx.executeSql(
        `DELETE FROM notes WHERE rowid = ?;`, // Use rowid instead of id
        [noteId],
        (_, result) => {
          console.log(`Note ${noteId} deleted successfully.`);
        },
        (_, error) => {
          console.error(`Failed to delete note ${noteId}:`, error);
          Alert.alert('Error', 'Failed to delete note.');
        }
      );
    });
  };
