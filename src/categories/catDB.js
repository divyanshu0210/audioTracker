import {getDb} from '../database/database';

export const addCategory = (name, color) => {
  const fastdb = getDb();
  return new Promise((resolve, reject) => {
    fastdb.transaction(
      tx => {
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
                (_, insertError) => reject(insertError),
              );
            }
          },
          (_, selectError) => reject(selectError),
        );
      },
      error => reject(error),
    );
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

export const getCategoryData = (categoryId, types) => {
  const db = getDb();

  if (!types) {
    return Promise.reject(new Error('Types are required'));
  }

  const typesArray = Array.isArray(types) ? types : [types];

  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      const queries = [];
      const params = [];

      typesArray.forEach(type => {
        let table;
        let joinCondition;

        if (
          [
            'youtube_video',
            'youtube_playlist',
            'device_file',
            'drive_file',
            'drive_folder',
          ].includes(type)
        ) {
          table = 'items';
          joinCondition = 'ci.item_id = t.source_id';
        } else if (type === 'note') {
          table = 'notes';
          joinCondition = 'ci.item_id = t.rowid';
        } else if (type === 'notebook') {
          table = 'notebooks';
          joinCondition = 'ci.item_id = t.id';
        } else {
          return; // skip unknown type
        }

        queries.push(`
          SELECT 
            t.*,
            ci.item_type,
            ci.created_at AS category_added_at
          FROM category_items ci
          JOIN ${table} t
            ON ${joinCondition}
          WHERE ci.category_id = ?
            AND ci.item_type = ?
        `);

        params.push(categoryId, type);
      });

      if (queries.length === 0) {
        resolve([]);
        return;
      }

      const finalQuery = `
        ${queries.join(' UNION ALL ')}
        ORDER BY category_added_at DESC
      `;

      tx.executeSql(
        finalQuery,
        params,
        (_, result) => {
          const data = [];

          for (let i = 0; i < result.rows.length; i++) {
            data.push(result.rows.item(i));
          }
          console.log('Fetched category data:', data);
          resolve(data || []);
        },
        (_, error) => reject(error),
      );
    }, reject);
  });
};
//for fetching notes same fn is used Fetch notes of database/R.js file 
// fetchNotesInCategory is removed and fetchNotes is used with categoryId as parameter to fetch notes of category

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
