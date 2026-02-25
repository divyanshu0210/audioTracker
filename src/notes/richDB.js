import { getDb } from "../database/database";

export const createNewNote = (noteId, sourceId, sourceType ) => {
  console.log(noteId)
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO notes (rowid,source_id, source_type, title, content, text_content, created_at) VALUES (?,?, ?, ?, ?, ?, CURRENT_TIMESTAMP);',
        [noteId,sourceId, sourceType, '', '', ''],
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
        (_, result) => {resolve(result); console.log(`Note updated! ID: ${noteRowId}`);},
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
        'UPDATE notes SET title = ?,created_at = CURRENT_TIMESTAMP WHERE rowid = ?',
        [newTitle, noteId],
        (_, result) => {resolve(result); console.log(`Note title updated! ID: ${noteId}, New Title: ${newTitle}`);},
        (_, error) => reject(error),
      );
    });
  });
};

export const saveImage = (imageId, noteRowId, imageData) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'INSERT INTO images (id,note_rowid, image_data) VALUES (?,?,?);',
        [imageId,noteRowId, imageData],
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
