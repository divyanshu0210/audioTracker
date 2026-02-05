import {getDb} from '../database/database';

export const addCategory = (name, color) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      // First, check if the category already exists
      tx.executeSql(
        'SELECT id FROM categories WHERE name = ?;',
        [name],
        (_, selectResult) => {
          if (selectResult.rows.length > 0) {
            // Category already exists, return its ID
            const existingId = selectResult.rows.item(0).id;
            resolve(existingId);
          } else {
            // Insert new category
            tx.executeSql(
              'INSERT INTO categories (name, color) VALUES (?, ?);',
              [name, color],
              (_, insertResult) => resolve(insertResult.insertId),
              (_, insertError) => reject(insertError)
            );
          }
        },
        (_, selectError) => reject(selectError)
      );
    }, error => reject(error));
  });
};
export const getAllCategories = () => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          `SELECT * FROM categories 
           WHERE name NOT LIKE '%[MENTEE_CAT_Filter]%' 
           ORDER BY created_at DESC;`,
          [],
          (_, result) => {
            const categories = [];
            for (let i = 0; i < result.rows.length; i++) {
              categories.push(result.rows.item(i));
            }
            resolve(categories);
          },
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const addItemToCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          'INSERT OR IGNORE INTO category_items (category_id, item_id, item_type) VALUES (?, ?, ?);',
          [categoryId, itemId, itemType],
          (_, result) => resolve(result),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};


export const removeItemFromCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          'DELETE FROM category_items WHERE category_id = ? AND item_id = ? AND item_type = ?;',
          [categoryId, itemId, itemType],
          (_, result) => resolve(result),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const getYouTubeItemsInCategory = categoryId => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `
        SELECT 
          ci.*,
          COALESCE(v.id, p.id) as id,
          COALESCE(v.title, p.title) as title,
          COALESCE(v.ytube_id, p.ytube_id) as ytube_id,
          COALESCE(v.channel_title, p.channel_title) as channel_title,
          v.duration,
          v.parent_id as parent_id,
          p.thumbnail as thumbnail,
          CASE 
            WHEN v.ytube_id IS NOT NULL THEN 'youtube'
            WHEN p.ytube_id IS NOT NULL THEN 'playlist'
            ELSE ci.item_type
          END as type
        FROM category_items ci
        LEFT JOIN videos v ON ci.item_type = 'youtube' AND ci.item_id = v.ytube_id
        LEFT JOIN playlists p ON ci.item_type = 'youtube' AND ci.item_id = p.ytube_id
        WHERE ci.category_id = ?;
        `,
        [categoryId],
        (_, result) => {
          const items = [];
          for (let i = 0; i < result.rows.length; i++) {
            const item = result.rows.item(i);
            // Set parent_id only if present in video
            item.parent_id = item.parent_id || null;
           if (item.id !== null) {
              items.push(item);
            }
          }
          console.log('Ytube',items)
          resolve(items);
        },
        (_, error) => reject(error),
      );
    }, reject);
  });
};

export const getFileItemsInCategory = categoryId => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `
        SELECT 
          ci.*,
          COALESCE(f.id, fo.id) as id,
          COALESCE(f.name, fo.name) as name,
          COALESCE(f.drive_id, fo.drive_id) as driveId,
          COALESCE(f.parent_id, fo.parent_id) as parentId,
          f.file_path,
          f.duration,
          CASE 
            WHEN f.drive_id IS NOT NULL THEN f.mimeType
            WHEN fo.drive_id IS NOT NULL THEN 'application/vnd.google-apps.folder'
            ELSE ci.item_type
          END as mimeType
        FROM category_items ci
        LEFT JOIN files f ON ci.item_type = 'drive' AND ci.item_id = f.drive_id
        LEFT JOIN folders fo ON ci.item_type = 'drive' AND ci.item_id = fo.drive_id
        WHERE ci.category_id = ?;
        `,
        [categoryId],
        (_, result) => {
          const items = [];
          for (let i = 0; i < result.rows.length; i++) {
            const item = result.rows.item(i);
            if (item.id !== null) {
              items.push(item);
            }
          }
          console.log('Drive',items)
          resolve(items);
        },
        (_, error) => reject(error),
      );
    }, reject);
  });
};

export const getDeviceFilesInCategory = categoryId => {
  const db = getDb();
  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT 
          ci.*, df.*, ci.item_type as type,
          df.name as name, df.uuid as driveId
         FROM category_items ci
         JOIN device_files df ON ci.item_type = 'device' AND ci.item_id = df.uuid
         WHERE ci.category_id = ?;`,
        [categoryId],
        (_, result) => {
          const items = [];
          for (let i = 0; i < result.rows.length; i++) {
            items.push(result.rows.item(i));
          }
          resolve(items);
        },
        (_, error) => reject(error),
      );
    }, reject);
  });
};

export const fetchNotesInCategory = categoryId => {
  const fastdb = getDb();

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      const query = `
        SELECT 
          n.rowid, n.source_id, n.source_type, n.title AS noteTitle, n.content, n.text_content, n.created_at,
          json_object(
            'id', COALESCE(v.id, f.id, d.id,nb.id),
            'title', v.title,
            'name', COALESCE(f.name, d.name,nb.name),
            'color', nb.color,
            'parent_id', v.parent_id,
            'parentId', f.parent_id,
            'out_show', v.out_show,
            'in_show', v.in_show,
            'fav', v.fav,
            'ytube_id', v.ytube_id,
            'driveId', COALESCE(f.drive_id, d.uuid),
            'mimeType', COALESCE(f.mimeType, d.mimeType),
            'file_path', COALESCE(f.file_path, d.file_path),
            'duration', COALESCE(f.duration, d.duration, v.duration),
            'created_at', COALESCE(f.created_at, d.created_at,v.created_at)
          ) AS relatedItem
        FROM category_items ci
        JOIN notes n ON n.rowid = ci.item_id AND ci.item_type = 'note'
        LEFT JOIN videos v ON n.source_id = v.ytube_id AND n.source_type = 'youtube'
        LEFT JOIN files f ON n.source_id = f.drive_id AND n.source_type = 'drive'
        LEFT JOIN device_files d ON n.source_id = d.uuid AND n.source_type = 'device'
        LEFT JOIN notebooks nb ON n.source_id = nb.id
        WHERE ci.category_id = ?
        ORDER BY n.created_at DESC
      `;

      tx.executeSql(
        query,
        [categoryId],
        (_, result) => {
          const notes = [];
          for (let i = 0; i < result.rows.length; i++) {
            const note = result.rows.item(i);
            try {
              note.content = note.content;
              note.text_content = note.text_content;
              note.relatedItem = JSON.parse(note.relatedItem);
            } catch (err) {
              console.error('Parse error:', err);
              note.content = [];
              note.text_content = '';
              note.relatedItem = {};
            }
            notes.push(note);
          }
          resolve(notes);
        },
        (_, error) => {
          console.error('Error fetching notes in category:', error);
          reject(error);
        },
      );
    });
  });
};

export const fetchNotebooksInCategory = (categoryId, callback) => {
  const db = getDb();
  db.transaction(tx => {
    tx.executeSql(
      `
      SELECT notebooks.*
      FROM notebooks
      INNER JOIN category_items 
        ON category_items.item_id = notebooks.id
      WHERE category_items.category_id = ?
        AND category_items.item_type = 'notebook'
      ORDER BY notebooks.created_at DESC
      `,
      [categoryId],
          (_, {rows}) => {
        console.log('Fetched notebooks in category:', rows._array);
        callback(rows._array);
      },
      error => console.error('Error fetching notebooks in category:', error),
    );
  });
};

export const checkItemInCategory = (categoryId, itemId, itemType) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        tx.executeSql(
          `SELECT 1 FROM category_items 
             WHERE category_id = ? AND item_id = ? AND item_type = ?;`,
          [categoryId, itemId, itemType],
          (_, result) => resolve(result.rows.length > 0),
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};

export const deleteCategories = categoryIds => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
        // First delete the category items
        tx.executeSql(
          'DELETE FROM category_items WHERE category_id IN (' +
            categoryIds.map(() => '?').join(',') +
            ');',
          categoryIds,
          () => {
            // Then delete the categories themselves
            tx.executeSql(
              'DELETE FROM categories WHERE id IN (' +
                categoryIds.map(() => '?').join(',') +
                ');',
              categoryIds,
              (_, result) => resolve(result),
              (_, error) => reject(error),
            );
          },
          (_, error) => reject(error),
        );
      },
      error => reject(error),
    );
  });
};


// export const getItemsInCategory = categoryId => {
//   const fastdb = getDb();
//   return new Promise((resolve, reject) => {
//     fastdb.transaction(
//       tx => {
//         // This is a simplified query - you might need to join with specific tables
//         tx.executeSql(
//           `SELECT ci.*, 
//               CASE 
//                 WHEN ci.item_type = 'youtube' THEN v.title
//                 WHEN ci.item_type = 'drive' THEN f.name
//                 WHEN ci.item_type = 'device_file' THEN df.name
//                 ELSE 'Unknown'
//               END as item_name,
//               CASE 
//                 WHEN ci.item_type = 'youtube' THEN v.duration
//                 WHEN ci.item_type = 'drive' THEN f.duration
//                 WHEN ci.item_type = 'device_file' THEN df.duration
//                 ELSE 0
//               END as duration
//             FROM category_items ci
//             LEFT JOIN videos v ON ci.item_type = 'youtube' AND ci.item_id = v.ytube_id
//             LEFT JOIN files f ON ci.item_type = 'drive' AND ci.item_id = f.drive_id
//             LEFT JOIN device_files df ON ci.item_type = 'device_file' AND ci.item_id = df.uuid
//             WHERE ci.category_id = ?;`,
//           [categoryId],
//           (_, result) => {
//             const items = [];
//             for (let i = 0; i < result.rows.length; i++) {
//               items.push(result.rows.item(i));
//             }
//             resolve(items);
//           },
//           (_, error) => reject(error),
//         );
//       },
//       error => reject(error),
//     );
//   });
// };

// export const getSegregatedItemsInCategory = categoryId => {
//   const fastdb = getDb();
//   return new Promise((resolve, reject) => {
//     fastdb.transaction(
//       tx => {
//         tx.executeSql(
//           `SELECT 
//             ci.*,
//             ci.item_type as type,
//             COALESCE(v.id, f.id, df.id) as id,
//             COALESCE(v.title, f.name, df.name) as name,
//             v.parent_id as video_parent_id,
//             f.parent_id as file_parent_id,
//             v.out_show, v.in_show,
//             v.fav,
//             v.title as title,
//             v.ytube_id,
//             COALESCE(f.drive_id, df.uuid) as driveId,
//             COALESCE(f.mimeType, df.mimeType) as mimeType,
//             COALESCE(f.file_path, df.file_path) as file_path,
//             COALESCE(f.duration, df.duration, v.duration) as duration,
//             COALESCE(f.created_at, df.created_at, v.created_at) as created_at
//           FROM category_items ci
//           LEFT JOIN videos v ON ci.item_type = 'youtube' AND ci.item_id = v.ytube_id
//           LEFT JOIN files f ON ci.item_type = 'drive' AND ci.item_id = f.drive_id
//           LEFT JOIN device_files df ON ci.item_type = 'device_file' AND ci.item_id = df.uuid
//           WHERE ci.category_id = ?;`,
//           [categoryId],
//           (_, result) => {
//             const items = {
//               youtube: [],
//               file: [],
//               device_file: [],
//             };

//             for (let i = 0; i < result.rows.length; i++) {
//               const item = result.rows.item(i);
//               try {
//                 if (item.sourceItem) {
//                   item.sourceItem = JSON.parse(item.sourceItem);
//                 }
//               } catch (error) {
//                 console.error('Error parsing item data:', error);
//               }

//               if (item.type === 'youtube') {
//                 item.parent_id = item.video_parent_id;
//                 items.youtube.push(item);
//               } else if (item.type === 'drive') {
//                 item.parent_id = item.file_parent_id;
//                 items.file.push(item);
//               } else if (item.type === 'device_file') {
//                 items.device_file.push(item);
//               }
//             }
//             resolve(items);
//           },
//           (_, error) => reject(error),
//         );
//       },
//       error => reject(error),
//     );
//   });
// };




// export const getFileItemsInCategory = categoryId => {
//   const db = getDb();
//   return new Promise((resolve, reject) => {
//     db.transaction(tx => {
//       tx.executeSql(
//         `SELECT 
//           ci.*, f.*, ci.item_type as type,
//           f.name as name, f.drive_id as driveId
//          FROM category_items ci
//          JOIN files f ON ci.item_type = 'drive' AND ci.item_id = f.drive_id
//          WHERE ci.category_id = ?;`,
//         [categoryId],
//         (_, result) => {
//           const items = [];
//           for (let i = 0; i < result.rows.length; i++) {
//             const item = result.rows.item(i);
//             item.parent_id = item.parent_id || item.file_parent_id;
//             items.push(item);
//           }
//           resolve(items);
//         },
//         (_, error) => reject(error),
//       );
//     }, reject);
//   });
// };

// export const getYouTubeItemsInCategory = categoryId => {
//   const db = getDb();
//   return new Promise((resolve, reject) => {
//     db.transaction(tx => {
//       tx.executeSql(
//         `SELECT 
//           ci.*, v.*, ci.item_type as type,
//           v.title as name, v.ytube_id as ytube_id
//          FROM category_items ci
//          JOIN videos v ON ci.item_type = 'youtube' AND ci.item_id = v.ytube_id
//          WHERE ci.category_id = ?;`,
//         [categoryId],
//         (_, result) => {
//           const items = [];
//           for (let i = 0; i < result.rows.length; i++) {
//             const item = result.rows.item(i);
//             item.parent_id = item.parent_id || item.video_parent_id;
//             items.push(item);
//           }
//           resolve(items);
//         },
//         (_, error) => reject(error),
//       );
//     }, reject);
//   });
// };
