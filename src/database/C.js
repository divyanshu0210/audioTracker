// import SQLite from 'react-native-sqlite-storage';

import {getDb} from './database';

export const upsertItem = ({
  source_id,
  type,
  title,
  parent_id = null,
  mimeType = null,
  file_path = null,
  out_show = 0,
  in_show = 0,
  fav = 0,
  duration = 0,
}) => {
  const fastdb = getDb();

  console.log(`\n🟡 [UPSERT START]`, { source_id, type, title });

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        INSERT INTO items (
          source_id,
          type,
          title,
          parent_id,
          mimeType,
          file_path,
          out_show,
          in_show,
          fav,
          duration
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(type, source_id)
        DO UPDATE SET
          title      = excluded.title,
          parent_id  = COALESCE(excluded.parent_id, items.parent_id),
          mimeType   = COALESCE(excluded.mimeType, items.mimeType),
          file_path  = COALESCE(excluded.file_path, items.file_path),
          out_show   = excluded.out_show,
          in_show    = excluded.in_show,
          fav        = excluded.fav,
          duration   = excluded.duration,
          created_at = CURRENT_TIMESTAMP
        WHERE items.deleted_at IS NULL;
        `,
        [
          source_id,
          type,
          title,
          parent_id,
          mimeType,
          file_path,
          out_show,
          in_show,
          fav,
          duration,
        ],
        () => {
          // 🔽 Immediately fetch the full row
          tx.executeSql(
            `
            SELECT * FROM items
            WHERE type = ? AND source_id = ? AND deleted_at IS NULL
            LIMIT 1;
            `,
            [type, source_id],
            (_, { rows }) => {
              if (rows.length > 0) {
                const fullRow = rows.item(0);

                console.log(`🟢 [UPSERT SUCCESS - FULL ROW]`, fullRow);

                resolve(fullRow);
              } else {
                console.warn('⚠️ UPSERT completed but row not found.');
                resolve(null);
              }
            },
            (_, error) => {
              console.error('🔴 Failed to fetch row after upsert:', error);
              reject(error);
            },
          );
        },
        (_, error) => {
          console.error(`🔴 [UPSERT FAILED]`, error?.message || error);
          reject(error);
        },
      );
    });
  });
};

export const upsertYoutubeMeta = ({
  item_id,
  channel_title,
  thumbnail,
}) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        INSERT INTO youtube_meta (item_id, channel_title, thumbnail)
        VALUES (?, ?, ?)
        ON CONFLICT(item_id)
        DO UPDATE SET
          channel_title = excluded.channel_title,
          thumbnail = excluded.thumbnail;
        `,
        [item_id, channel_title, thumbnail],
        () => resolve(true),
        (_, error) => reject(error),
      );
    });
  });
};

export const getItemBySourceId = (source_id, type = null) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      let query = `
        SELECT *
        FROM items
        WHERE source_id = ?
        AND deleted_at IS NULL
      `;

      const params = [source_id];

      if (type) {
        query += ` AND type = ?`;
        params.push(type);
      }

      query += ` LIMIT 1;`;

      tx.executeSql(
        query,
        params,
        (_, { rows }) => {
          if (rows.length > 0) {
            const item = rows.item(0);
            console.log('🟢 Item found:', item);
            resolve(item);
          } else {
            console.warn('⚠️ Item not found:', { source_id, type });
            resolve(null);
          }
        },
        (_, error) => {
          console.error('🔴 getItemBySourceId error:', error);
          reject(error);
        },
      );
    });
  });
};

export const createNewNoteinDB = (sourceId, sourceType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      const createdAt = new Date()
        .toISOString()
        .replace('T', ' ')
        .split('.')[0]; // Format: YYYY-MM-DD HH:mm:ss

      tx.executeSql(
        `INSERT INTO notes (source_id, source_type,title, content, text_content, created_at) VALUES (?, ?, ?, ?,?, ?);`,
        [sourceId, sourceType, '', '', '', createdAt], // Include created_at timestamp
        (_, result) => {
          // Fetch the rowid of the last inserted note
          tx.executeSql(
            `SELECT rowid FROM notes WHERE source_id = ? AND source_type = ? ORDER BY rowid DESC LIMIT 1;`,
            [sourceId, sourceType],
            (_, res) => {
              if (res.rows.length > 0) {
                resolve(res.rows.item(0).rowid); // Return latest note's rowid
              } else {
                reject(new Error("Failed to retrieve inserted note's rowid."));
              }
            },
            (_, error) => reject(error),
          );
        },
        (_, error) => reject(error), // Reject on insertion failure
      );
    });
  });
};

export const addNotebook = (name, color, callback) => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      'INSERT INTO notebooks (name, color) VALUES (?, ?);',
      [name, color],
      (_, result) => {
        console.log('Notebook saved! ID:', result.insertId);
        if (callback) callback(); // Call fetchNotebooks after adding
      },
      error => console.error('Error saving notebook:', error),
    );
  });
};

export const getOrCreateDefaultNotebookId = async () => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      // Step 1: Check if a notebook with the name "Default Notebook" exists
      tx.executeSql(
        `SELECT id FROM notebooks WHERE name = ? LIMIT 1;`,
        ['Default Notebook'],
        (_, result) => {
          if (result.rows.length > 0) {
            // Exists: return the id
            const notebookId = result.rows.item(0).id;
            resolve(notebookId);
          } else {
            // Step 2: Create it and return the new id
            tx.executeSql(
              `INSERT INTO notebooks (name, color) VALUES (?, ?);`,
              ['Default Notebook', '#3B82F6'],
              (_, insertResult) => {
                const newId = insertResult.insertId;
                resolve(newId);
              },
              (_, error) => {
                console.error('Error inserting default notebook:', error);
                reject(error);
                return false;
              },
            );
          }
        },
        (_, error) => {
          console.error('Error checking default notebook:', error);
          reject(error);
          return false;
        },
      );
    });
  });
};

export const moveNotesToDefaultNotebook = async notebookId => {
  const fastdb = getDb();
  const defaultNotebookId = await getOrCreateDefaultNotebookId();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `UPDATE notes SET source_id = ?, source_type = 'notebook' WHERE source_id = ? AND source_type = 'notebook';`,
        [String(defaultNotebookId), String(notebookId)],
        (_, result) => {
          console.log(
            `Moved notes to default notebook (ID: ${defaultNotebookId})`,
          );
          resolve(result);
        },
        (_, error) => {
          console.error('Failed to move notes to default notebook:', error);
          reject(error);
        },
      );
    });
  });
};

export const saveWatchProgress = async (
  videoId,
  mergedIntervals,
  todayIntervals,
  todayWatchTime,
  todayNewWatchTime,
  lastWatchTime,
  unfltrdWatchTime,
) => {
  const fastdb = getDb();
  // Use UTC date for consistency across time zones
  const todayDate = new Date().toISOString().split('T')[0];

  fastdb.transaction(tx => {
    tx.executeSql(
      `INSERT INTO video_watch_history (videoId, watchedIntervals,todayIntervals, date, watchTimePerDay,newWatchTimePerDay,lastWatchTime,unfltrdWatchTimePerDay)
         VALUES (?, ?, ?, ?,?,?,?,?)
         ON CONFLICT(videoId, date) DO UPDATE SET
          watchedIntervals = excluded.watchedIntervals,
          todayIntervals = excluded.todayIntervals,
          watchTimePerDay = excluded.watchTimePerDay,
          newWatchTimePerDay = excluded.newWatchTimePerDay,
          lastWatchTime = excluded.lastWatchTime,
          unfltrdWatchTimePerDay = excluded.unfltrdWatchTimePerDay`,
      [
        videoId,
        JSON.stringify(mergedIntervals || []),
        JSON.stringify(todayIntervals || []),
        todayDate,
        todayWatchTime,
        todayNewWatchTime,
        lastWatchTime,
        unfltrdWatchTime,
      ],
      () => {
        console.log(`Watch progress saved for ${videoId} on ${todayDate}`);
      },
      (_, error) => {
        console.error(`Database error: ${error.message}`);
        return true; // Returning `true` to indicate an error occurred
      },
    );
  });
};
