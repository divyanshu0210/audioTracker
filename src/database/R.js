import {db, getDb} from './database';
import {buildQuery} from './dbUtils';
import {fastdb} from './FTSDatabase';

export const getFolderStackFromDB = async itemId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    const stack = [];

    const traverseUp = currentId => {
      fastdb.transaction(tx => {
        tx.executeSql(
          `
          SELECT id, source_id, title, parent_id, type
          FROM items
          WHERE source_id = ?
          AND deleted_at IS NULL
          LIMIT 1;
          `,
          [currentId],
          (_, results) => {
            if (results.rows.length > 0) {
              const item = results.rows.item(0);

              // Insert at beginning (root → child order)
              stack.unshift({
                id: item.id,
                source_id: item.source_id,
                title: item.title,
                type: item.type,
              });

              if (item.parent_id) {
                traverseUp(item.parent_id);
              } else {
                resolve(stack); // reached root
              }
            } else {
              resolve(stack); // not found
            }
          },
          (_, error) => {
            console.error('❌ Error fetching parent chain:', error);
            reject(error);
          },
        );
      });
    };

    traverseUp(itemId);
  });
};

export const getChildrenByParent = async (parentId = null, types = null) => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      const isRoot = parentId === null;

      let typeArray = null;
      if (types) {
        typeArray = Array.isArray(types) ? types : [types];
      }

      const typeCondition = typeArray
        ? `AND items.type IN (${typeArray.map(() => '?').join(',')})`
        : '';

      const baseParams = [];
      if (!isRoot) baseParams.push(parentId);
      if (typeArray) baseParams.push(...typeArray);

      const selectQuery = `
        SELECT
          items.*,
          youtube_meta.channel_title,
          youtube_meta.thumbnail
        FROM items
        LEFT JOIN youtube_meta
          ON youtube_meta.item_id = items.id
        WHERE
          ${isRoot ? 'items.out_show = 1' : 'items.parent_id = ?'}
          ${typeCondition}
          AND items.deleted_at IS NULL
        ORDER BY datetime(items.created_at) DESC;
      `;

      if (!isRoot) {
        const updateQuery = `
          UPDATE items
          SET in_show = 1
          WHERE parent_id = ?
          ${typeCondition}
          AND deleted_at IS NULL;
        `;

        // Going deep → update in_show
        tx.executeSql(
          updateQuery,
          baseParams,
          () => {
            tx.executeSql(
              selectQuery,
              baseParams,
              (_, results) => {
                const items = [];
                for (let i = 0; i < results.rows.length; i++) {
                  items.push(results.rows.item(i));
                }

                console.log(
                  `📂 Loaded ${items.length} children (parentId: ${parentId})`,
                );
                resolve(items);
              },
              (_, error) => reject(error),
            );
          },
          (_, error) => reject(error),
        );
      } else {
        // Root → NO parent filtering, just out_show = 1
        tx.executeSql(
          selectQuery,
          baseParams,
          (_, results) => {
            const items = [];
            for (let i = 0; i < results.rows.length; i++) {
              items.push(results.rows.item(i));
            }

            console.log(`🏠 Loaded ${items.length} visible root items`);
            resolve(items);
          },
          (_, error) => reject(error),
        );
      }
    });
  });
};

// ------------------------------notes

export const getAllNotesModifiedToday = () => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT rowid, source_id, source_type, title AS noteTitle, content AS noteContent, text_content, created_at 
         FROM notes 
         WHERE date(created_at) = date('now', 'localtime');`, // Filters only today's notes
        [],
        (txObj, resultSet) => {
          const results = [];
          for (let i = 0; i < resultSet.rows.length; i++) {
            results.push(resultSet.rows.item(i));
          }
          resolve(results);
        },
        (txObj, error) => {
          console.error("Error fetching today's notes:", error);
          reject(error);
        },
      );
    });
  });
};

export const fetchNotes = ({
  sourceId,
  sourceType,
  fileType, // 'audio' or 'video'
  searchQuery,
  date,
  offset = 0,
  limit = 20,
  sortBy = 'n.created_at',
  sortOrder = 'ASC',
} = {}) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      let query = `SELECT 
                      n.rowid, n.source_id, n.source_type,n.title as noteTitle, n.content, n.text_content, n.created_at,
                      json_object(
                        'id', COALESCE(v.id, f.id,d.id,nb.id),
                        'title', v.title,
                        'name', COALESCE(f.name,d.name,nb.name),
                        'color',nb.color,
                        'parent_id', v.parent_id,
                        'parentId', f.parent_id,
                        'out_show', v.out_show,
                        'in_show', v.in_show,
                        'fav', v.fav,
                        'ytube_id', v.ytube_id,
                        'driveId', COALESCE(f.drive_id,d.uuid),
                        'mimeType',COALESCE(f.mimeType,d.mimeType),
                        'file_path', COALESCE(f.file_path,d.file_path),
                        'duration', COALESCE(f.duration,d.duration,v.duration),
                        'created_at',  COALESCE(f.created_at,d.created_at,v.created_at)
                      ) AS relatedItem
                    FROM notes n
                    LEFT JOIN videos v ON n.source_id = v.ytube_id AND n.source_type = 'youtube'
                    LEFT JOIN files f ON n.source_id = f.drive_id AND n.source_type = 'drive'
                    LEFT JOIN device_files d ON n.source_id = d.uuid AND n.source_type = 'device'
                          LEFT JOIN notebooks nb ON n.source_id = nb.id`;

      let params = [];
      const conditions = [];

      // Apply filters dynamically
      if (sourceId !== undefined) {
        conditions.push(`n.source_id = ?`);
        params.push(sourceId);
      }
      if (sourceType !== undefined) {
        conditions.push(`n.source_type = ?`);
        params.push(sourceType);
      }
      // if (fileType && sourceType === 'drive') {
      //   conditions.push(`f.mimeType LIKE ?`);
      //   params.push(`${fileType}%`); // Match 'audio%' or 'video%'
      // }
      if (fileType) {
        if (sourceType === 'drive') {
          conditions.push(`f.mimeType LIKE ?`);
          params.push(`${fileType}%`);
        } else if (sourceType === 'device') {
          conditions.push(`d.mimeType LIKE ?`);
          params.push(`${fileType}%`);
        }
      }
      if (searchQuery) {
        conditions.push(`n.text_content MATCH ?`);
        params.push(`${searchQuery}*`);
      }
      if (date) {
        conditions.push(`DATE(n.created_at) = ?`);
        params.push(date);
      }

      if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
      }

      // Ensure valid sorting column and order
      // Default to 'n.created_at' if sortBy is falsy or invalid
      const validSortBy = ['n.rowid', 'n.created_at'].includes(sortBy)
        ? sortBy
        : 'n.created_at';

      // Default to 'DESC' (latest first) if sortOrder is falsy or invalid
      const validSortOrder = ['ASC', 'DESC'].includes(
        (sortOrder || '').toUpperCase(),
      )
        ? sortOrder.toUpperCase()
        : 'DESC';

      query += ` ORDER BY ${validSortBy} ${validSortOrder} LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      // console.log('Query:', query);
      // console.log('Params:', params);

      tx.executeSql(
        query,
        params,
        (_, result) => {
          const notes = [];
          for (let i = 0; i < result.rows.length; i++) {
            const note = result.rows.item(i);
            try {
              note.content = note.content;
              note.text_content = note.text_content;
              note.relatedItem = JSON.parse(note.relatedItem);
            } catch (error) {
              console.error('Failed to parse note content:', error);
              note.content = [];
              note.text_content = {};
              note.relatedItem = {};
            }
            notes.push(note);
          }
          resolve(notes);
        },
        (_, error) => {
          console.error('Error fetching notes:', error);
          reject(error);
        },
      );
    });
  });
};

export const fetchNotebooks = callback => {
  const fastdb = getDb();
  fastdb.transaction(tx => {
    tx.executeSql(
      'SELECT * FROM notebooks ORDER BY created_at DESC;',
      [],
      (_, {rows}) => callback(rows._array), // Pass notebooks array to callback
      error => console.error('Error fetching notebooks:', error),
    );
  });
};
// --------------------------------

export const fetchLatestWatchData = async videoId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    const today = new Date().toISOString().split('T')[0]; // Format: 'YYYY-MM-DD'

    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT watchedIntervals, todayIntervals, date, lastWatchTime,unfltrdWatchTimePerDay
         FROM video_watch_history 
         WHERE videoId = ? 
         ORDER BY date DESC 
         LIMIT 1`,
        [videoId],
        (_, latestResult) => {
          if (latestResult.rows.length > 0) {
            const latestEntry = latestResult.rows.item(0);
            const latestDate = latestEntry.date;

            tx.executeSql(
              `SELECT date, newWatchTimePerDay 
               FROM video_watch_history 
               WHERE videoId = ? 
               ORDER BY date ASC`,
              [videoId],
              (_, watchTimeResults) => {
                const newWatchTimes = [];
                for (let i = 0; i < watchTimeResults.rows.length; i++) {
                  newWatchTimes.push({
                    date: watchTimeResults.rows.item(i).date,
                    watchTime: watchTimeResults.rows.item(i).newWatchTimePerDay,
                  });
                }

                resolve({
                  latestWatchedIntervals: JSON.parse(
                    latestEntry.watchedIntervals,
                  ),
                  todayIntervals:
                    latestDate === today
                      ? JSON.parse(latestEntry.todayIntervals)
                      : [],
                  latestDate,
                  lastWatchTime: latestEntry.lastWatchTime,
                  unfltrdWatchTimePerDay:
                    latestDate === today
                      ? latestEntry.unfltrdWatchTimePerDay
                      : 0,
                  newWatchTimes,
                });
              },
              error => reject('Error fetching watch time per day:', error),
            );
          } else {
            resolve(null); // No data found
          }
        },
        error => reject('Error fetching latest watch data:', error),
      );
    });
  });
};

export const fetchLatestWatchDataAllFields = async videoId => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT * FROM video_watch_history 
         WHERE videoId = ? 
         ORDER BY date DESC 
         LIMIT 1`,
        [videoId],
        (txObj, resultSet) => {
          if (resultSet.rows.length > 0) {
            const raw = resultSet.rows.item(0);
            resolve({...raw}); // Ensures it's a plain object
          } else {
            resolve(null); // No data found
          }
        },
        (txObj, error) => {
          console.error('Error fetching latest watch data:', error);
          reject(error);
        },
      );
    });
  });
};

export const getWatchHistoryByDate = date => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reject(new Error('Invalid date format. Expected YYYY-MM-DD.'));
    }

    // Ensure the date is valid
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return reject(new Error('Invalid date value.'));
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT vwh.*, 
                v.title AS title,
                COALESCE(f.name, d.name) AS name,
                COALESCE(f.file_path, d.file_path) AS file_path,
                CASE 
                  WHEN v.title IS NOT NULL THEN 'youtube'
                  WHEN f.name IS NOT NULL THEN 'drive'
                  WHEN d.name IS NOT NULL THEN 'device'
                  ELSE NULL 
                END AS source_type,
                CASE 
                  WHEN v.title IS NOT NULL THEN vwh.videoId
                  WHEN f.name IS NOT NULL THEN vwh.videoId
                  WHEN d.name IS NOT NULL THEN vwh.videoId
                  ELSE NULL
                END AS resolved_videoId,
                COALESCE(v.title, f.name, d.name) AS videoNameInfo,
                COALESCE(v.duration, f.duration, d.duration) AS duration
         FROM video_watch_history vwh
         LEFT JOIN videos v ON vwh.videoId = v.ytube_id
         LEFT JOIN files f ON vwh.videoId = f.drive_id
         LEFT JOIN device_files d ON vwh.videoId = d.uuid
         WHERE vwh.date = ?
           ORDER BY datetime(vwh.lastWatchedAt) DESC;`, // <-- Added this line
        [date],
        (_, result) => {
          const history = [];
          for (let i = 0; i < result.rows.length; i++) {
            const record = result.rows.item(i);
            try {
              record.watchedIntervals = JSON.parse(
                record.watchedIntervals || '[]',
              );
              record.todayIntervals = JSON.parse(record.todayIntervals || '[]');
            } catch (error) {
              console.error('Failed to parse intervals:', error);
              record.watchedIntervals = [];
              record.todayIntervals = [];
            }

            const normalizedRecord = {
              ...record,
              sourceDetails: null,
            };

            if (record.source_type === 'youtube') {
              normalizedRecord.sourceDetails = {
                ytube_id: record.resolved_videoId,
                title: record.title,
                duration: record.duration,
              };
            } else if (['drive', 'device'].includes(record.source_type)) {
              normalizedRecord.sourceDetails = {
                driveId: record.resolved_videoId,
                name: record.name,
                file_path: record.file_path,
                source_type: record.source_type,
                duration: record.duration,
              };
            }

            history.push(normalizedRecord);
          }
          resolve(history);
        },
        (_, error) => {
          console.error('Error fetching watch history:', error);
          reject(error);
        },
      );
    });
  });
};

export const getRecentlyWatchedVideos = () => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT vwh.*, 
                v.title AS title,
                COALESCE(f.name, d.name) AS name,
                COALESCE(f.file_path, d.file_path) AS file_path,
                CASE 
                  WHEN v.title IS NOT NULL THEN 'youtube'
                  WHEN f.name IS NOT NULL THEN 'drive'
                  WHEN d.name IS NOT NULL THEN 'device'
                  ELSE NULL 
                END AS source_type,
                CASE 
                  WHEN v.title IS NOT NULL THEN vwh.videoId
                  WHEN f.name IS NOT NULL THEN vwh.videoId
                  WHEN d.name IS NOT NULL THEN vwh.videoId
                  ELSE NULL
                END AS resolved_videoId,
                COALESCE(v.title, f.name, d.name) AS videoNameInfo,
                COALESCE(v.duration, f.duration, d.duration) AS duration
         FROM video_watch_history vwh
         LEFT JOIN videos v ON vwh.videoId = v.ytube_id
         LEFT JOIN files f ON vwh.videoId = f.drive_id
         LEFT JOIN device_files d ON vwh.videoId = d.uuid
         WHERE vwh.lastWatchedAt = (
           SELECT MAX(lastWatchedAt) 
           FROM video_watch_history 
           WHERE videoId = vwh.videoId
         )
         ORDER BY datetime(vwh.lastWatchedAt) DESC
         LIMIT 12;`,
        [],
        (_, result) => {
          const history = [];
          for (let i = 0; i < result.rows.length; i++) {
            const record = result.rows.item(i);
            try {
              record.watchedIntervals = JSON.parse(
                record.watchedIntervals || '[]',
              );
              record.todayIntervals = JSON.parse(record.todayIntervals || '[]');
            } catch (error) {
              console.error('Failed to parse intervals:', error);
              record.watchedIntervals = [];
              record.todayIntervals = [];
            }

            const normalizedRecord = {
              ...record,
              sourceDetails: null,
            };

            if (record.source_type === 'youtube') {
              normalizedRecord.sourceDetails = {
                ytube_id: record.resolved_videoId,
                title: record.title,
                duration: record.duration,
              };
            } else if (['drive', 'device'].includes(record.source_type)) {
              normalizedRecord.sourceDetails = {
                driveId: record.resolved_videoId,
                name: record.name,
                file_path: record.file_path,
                source_type: record.source_type,
                duration: record.duration,
              };
            }

            history.push(normalizedRecord);
          }
          resolve(history);
        },
        (_, error) => {
          console.error('Error fetching recently watched videos:', error);
          reject(error);
        },
      );
    });
  });
};

export const getSumOfWatchTimesByDate = date => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reject(new Error('Invalid date format. Expected YYYY-MM-DD.'));
    }

    // Ensure the date is valid
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return reject(new Error('Invalid date value.'));
    }

    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT 
            SUM(watchTimePerDay) AS totalWatchTime,
            SUM(newWatchTimePerDay) AS totalNewWatchTime,
            SUM(unfltrdWatchTimePerDay) AS totalUnfltrdWatchTime
         FROM video_watch_history 
         WHERE date = ?;`,
        [date],
        (_, result) => {
          const row = result.rows.item(0);
          resolve({
            totalWatchTime: row.totalWatchTime || 0,
            totalNewWatchTime: row.totalNewWatchTime || 0,
            totalUnfltrdWatchTime: row.totalUnfltrdWatchTime || 0,
          });
        },
        (_, error) => {
          console.error('Error fetching total watch time:', error);
          reject(error);
        },
      );
    });
  });
};

export const getMonthlyWatchTimes = (startDate, endDate) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT 
            date,
            SUM(watchTimePerDay) AS totalWatchTime,
            SUM(newWatchTimePerDay) AS totalNewWatchTime,
            SUM(unfltrdWatchTimePerDay) AS totalUnfltrdWatchTime
         FROM video_watch_history 
         WHERE date BETWEEN ? AND ?
         GROUP BY date;`,
        [startDate, endDate],
        (_, result) => {
          const data = {};
          for (let i = 0; i < result.rows.length; i++) {
            const row = result.rows.item(i);
            data[row.date] = {
              totalWatchTime: row.totalWatchTime || 0,
              totalNewWatchTime: row.totalNewWatchTime || 0,
              totalUnfltrdWatchTime: row.totalUnfltrdWatchTime || 0,
            };
          }
          resolve(data);
        },
        (_, error) => {
          console.error('Error fetching monthly watch times:', error);
          reject(error);
        },
      );
    });
  });
};

export const getLatestWatchHistory = () => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT vwh.*, 
                v.title AS title,
                COALESCE(f.name, d.name) AS name,
                COALESCE(f.file_path, d.file_path) AS file_path,
                CASE 
                  WHEN v.title IS NOT NULL THEN 'youtube'
                  WHEN f.name IS NOT NULL THEN 'drive'
                  WHEN d.name IS NOT NULL THEN 'device'
                  ELSE NULL 
                END AS source_type,
                COALESCE(v.title, f.name, d.name) AS videoNameInfo,
                COALESCE(v.duration, f.duration, d.duration) AS duration
         FROM video_watch_history vwh
         LEFT JOIN videos v ON vwh.videoId = v.ytube_id
         LEFT JOIN files f ON vwh.videoId = f.drive_id
         LEFT JOIN device_files d ON vwh.videoId = d.uuid
         ORDER BY vwh.lastWatchedAt DESC
         LIMIT 20;`,
        [],
        (_, result) => {
          const history = [];
          for (let i = 0; i < result.rows.length; i++) {
            const item = result.rows.item(i);
            try {
              item.watchedIntervals = JSON.parse(item.watchedIntervals || '[]');
            } catch {
              item.watchedIntervals = [];
            }
            history.push(item);
          }
          resolve(history);
        },
        (_, error) => {
          console.error('Error fetching latest watch history:', error);
          reject(error);
        },
      );
    });
  });
};

export const getAggregatedWatchHistory = (startDate, endDate) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `
        SELECT vwh.videoId,
               SUM(vwh.watchTimePerDay) AS totalWatchTime,
               SUM(vwh.newWatchTimePerDay) AS totalNewWatchTime,
               SUM(vwh.unfltrdWatchTimePerDay) AS totalUnfltrdWatchTime,
               MAX(vwh.lastWatchedAt) AS lastWatchedAt,
               GROUP_CONCAT(vwh.watchedIntervals, '|') AS combinedIntervals,
               
               v.title AS title,
               COALESCE(f.name, d.name) AS name,
               COALESCE(f.file_path, d.file_path) AS file_path,
               CASE 
                 WHEN v.title IS NOT NULL THEN 'youtube'
                 WHEN f.name IS NOT NULL THEN 'drive'
                 WHEN d.name IS NOT NULL THEN 'device'
                 ELSE NULL 
               END AS source_type,
               COALESCE(v.title, f.name, d.name) AS videoNameInfo,
               COALESCE(v.duration, f.duration, d.duration) AS duration
        FROM video_watch_history vwh
        LEFT JOIN videos v ON vwh.videoId = v.ytube_id
        LEFT JOIN files f ON vwh.videoId = f.drive_id
        LEFT JOIN device_files d ON vwh.videoId = d.uuid
        WHERE vwh.date BETWEEN ? AND ?
        GROUP BY vwh.videoId
        ORDER BY datetime(lastWatchedAt) DESC;
        `,
        [startDate, endDate],
        (_, result) => {
          const aggregated = [];

          let totalWatchTime = 0;
          let totalNewWatchTime = 0;
          let totalUnfltrdWatchTime = 0;

          for (let i = 0; i < result.rows.length; i++) {
            const record = result.rows.item(i);
            let mergedIntervals = [];

            try {
              const allRaw = (record.combinedIntervals || '')
                .split('|')
                .flatMap(json => JSON.parse(json || '[]'));

              mergedIntervals = mergeTimeIntervals(allRaw);
            } catch (e) {
              console.error('Interval parsing error:', e);
            }

            const watch = Number(record.totalWatchTime);
            const newWatch = Number(record.totalNewWatchTime);
            const unfltrd = Number(record.totalUnfltrdWatchTime);

            totalWatchTime += watch;
            totalNewWatchTime += newWatch;
            totalUnfltrdWatchTime += unfltrd;

            aggregated.push({
              videoId: record.videoId,
              source_type: record.source_type,
              videoNameInfo: record.videoNameInfo,
              duration: record.duration,
              lastWatchedAt: record.lastWatchedAt,
              totalWatchTime: watch,
              totalNewWatchTime: newWatch,
              totalUnfltrdWatchTime: unfltrd,
              mergedIntervals,
              sourceDetails:
                record.source_type === 'youtube'
                  ? {
                      ytube_id: record.videoId,
                      title: record.title,
                      duration: record.duration,
                    }
                  : {
                      driveId: record.videoId,
                      name: record.name,
                      file_path: record.file_path,
                      duration: record.duration,
                      source_type: record.source_type,
                    },
            });
          }

          resolve({
            aggregated,
            totalWatchTime,
            totalNewWatchTime,
            totalUnfltrdWatchTime,
          });
        },
        (_, error) => {
          console.error('Aggregation query failed:', error);
          reject(error);
        },
      );
    });
  });
};

function mergeTimeIntervals(intervals) {
  if (!Array.isArray(intervals)) return [];

  // Sort intervals by start time
  intervals.sort((a, b) => a[0] - b[0]);

  const merged = [];
  for (const [start, end] of intervals) {
    if (merged.length === 0 || merged[merged.length - 1][1] < start) {
      merged.push([start, end]);
    } else {
      merged[merged.length - 1][1] = Math.max(
        merged[merged.length - 1][1],
        end,
      );
    }
  }

  return merged;
}

//unused
export const fetchNotesBySource = (sourceId, sourceType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT rowid, source_id, source_type, content,text_content, created_at 
           FROM notes 
           WHERE source_id = ? AND source_type = ? 
           ORDER BY rowid ASC`, // Use rowid instead of id
        [sourceId, sourceType],
        (_, result) => {
          const notes = [];
          for (let i = 0; i < result.rows.length; i++) {
            const note = result.rows.item(i);
            try {
              note.content = note.content; // Parse JSON content
              note.text_content = note.text_content;
            } catch (error) {
              console.error('Failed to parse note content:', error);
              note.content = []; // Fallback to empty array if parsing fails
              note.text_content = {};
            }
            notes.push(note);
          }
          resolve(notes);
        },
        (_, error) => {
          console.error('Error fetching notes:', error);
          reject(error);
        },
      );
    });
  });
};

export const fetchPaginatedNotes = (offset = 0, limit = 20) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT rowid, source_id, source_type, content,text_content, created_at 
           FROM notes 
           ORDER BY rowid ASC 
           LIMIT ? OFFSET ?`,
        [limit, offset],
        (_, result) => {
          const notes = [];
          for (let i = 0; i < result.rows.length; i++) {
            const note = result.rows.item(i);
            try {
              note.content = note.content;
              note.text_content = note.text_content;
            } catch (error) {
              console.error('Failed to parse note content:', error);
              note.content = [];
              note.text_content = {};
            }
            notes.push(note);
          }
          resolve(notes);
        },
        (_, error) => {
          console.error('Error fetching paginated notes:', error);
          reject(error);
        },
      );
    });
  });
};

export const searchNotes = (query, offset = 0, limit = 20) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        `SELECT rowid, source_id, source_type, content,text_content, created_at 
           FROM notes 
           WHERE content MATCH ? 
           ORDER BY rowid ASC
           LIMIT ? OFFSET ?`, // Paginate search results
        [`${query}*`, limit, offset],
        (_, result) => {
          const notes = [];
          for (let i = 0; i < result.rows.length; i++) {
            const note = result.rows.item(i);
            try {
              note.content = note.content; // Parse JSON content
              note.text_content = note.text_content;
            } catch (error) {
              console.error('Failed to parse note content:', error);
              note.content = []; // Fallback to empty array if parsing fails
              note.text_content = {};
            }
            notes.push(note);
          }
          resolve(notes);
        },
        (_, error) => {
          console.error('Error searching notes:', error);
          reject(error);
        },
      );
    });
  });
};
