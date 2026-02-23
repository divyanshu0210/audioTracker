import {getDb} from '../database/database';
import {fetchNotes} from '../database/R';

// ─────────────────────────────────────────
// 🔹 Helper: Get Parent IDs In Category
// ─────────────────────────────────────────
const getCategoryParents = (categoryId, db) =>
  new Promise(resolve => {
    db.transaction(tx => {
      tx.executeSql(
        `
          SELECT items.id
          FROM items
          INNER JOIN category_items
            ON category_items.item_id = items.source_id
            AND category_items.item_type = items.type
          WHERE category_items.category_id = ?
          `,
        [categoryId],
        (_, {rows}) => {
          const ids = [];
          for (let i = 0; i < rows.length; i++) {
            ids.push(rows.item(i).id);
          }
          resolve(ids);
        },
        () => resolve([]),
      );
    });
  });

// ─────────────────────────────────────────
// 🔹 Helper: Recursively Get All Descendants
// ─────────────────────────────────────────
const getAllDescendants = async (parentIds, db) => {
  let allIds = [...parentIds];
  let currentLevel = [...parentIds];

  while (currentLevel.length > 0) {
    const placeholders = currentLevel.map(() => '?').join(',');

    const children = await new Promise(resolve => {
      db.transaction(tx => {
        tx.executeSql(
          `SELECT id FROM items WHERE parent_id IN (${placeholders})`,
          currentLevel,
          (_, {rows}) => {
            const ids = [];
            for (let i = 0; i < rows.length; i++) {
              ids.push(rows.item(i).id);
            }
            resolve(ids);
          },
          () => resolve([]),
        );
      });
    });

    const newChildren = children.filter(id => !allIds.includes(id));
    allIds.push(...newChildren);
    currentLevel = newChildren;
  }

  return allIds;
};

export const searchAllTables = async (
  query,
  filters = ['all'],
  parentId = null,
  categoryId = null,
) => {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;

  const includeAll = filters.includes('all');
  const selectedTypes = includeAll ? [] : filters.filter(Boolean);
  const results = [];

  // ─────────────────────────────────────────
  // 1️⃣ SEARCH ITEMS (UPDATED LOGIC)
  // ─────────────────────────────────────────
  if (includeAll || selectedTypes.length > 0) {
    let baseIds = [];

    // ✅ CASE 1: Inside Category
    if (categoryId !== null) {
      const parentIds = await getCategoryParents(categoryId, db);
      baseIds = await getAllDescendants(parentIds, db);
    }

    // ✅ CASE 2: Inside Folder (no category)
    else if (parentId !== null) {
      baseIds = await getAllDescendants([parentId], db);
    }

    let itemQuery = `
      SELECT
        items.*,
        youtube_meta.channel_title,
        youtube_meta.thumbnail
      FROM items
      LEFT JOIN youtube_meta
        ON youtube_meta.item_id = items.id
    `;

    const params = [];

    // 🔥 Subtree search
    if (baseIds.length > 0) {
      const placeholders = baseIds.map(() => '?').join(',');

      itemQuery += ` WHERE items.id IN (${placeholders})`;
      params.push(...baseIds);

      itemQuery += `
        AND (
          LOWER(items.title) LIKE ?
          OR LOWER(IFNULL(youtube_meta.channel_title,'')) LIKE ?
        )
      `;
      params.push(q, q);
    }

    // 🔥 Global search
    else {
      itemQuery += `
        WHERE (
          LOWER(items.title) LIKE ?
          OR LOWER(IFNULL(youtube_meta.channel_title,'')) LIKE ?
        )
      `;
      params.push(q, q);
    }

    // 🔥 Type filtering
    if (!includeAll && selectedTypes.length > 0) {
      itemQuery += `
        AND items.type IN (${selectedTypes.map(() => '?').join(',')})
      `;
      params.push(...selectedTypes);
    }

    await new Promise(res => {
      db.transaction(tx => {
        tx.executeSql(
          itemQuery,
          params,
          (_, {rows}) => {
            for (let i = 0; i < rows.length; i++) {
              results.push({
                ...rows.item(i),
                source_type: rows.item(i).type,
              });
            }
            res();
          },
          () => res(),
        );
      });
    });
  }

  // ─────────────────────────────────────────
  // 2️⃣ SEARCH NOTEBOOKS (UNCHANGED)
  // ─────────────────────────────────────────
  if (includeAll || filters.includes('notebook')) {
    let notebookQuery = `
      SELECT notebooks.*, 'notebook' as type
      FROM notebooks
    `;
    const notebookParams = [];

    if (categoryId !== null) {
      notebookQuery += `
        INNER JOIN category_items
          ON category_items.item_id = notebooks.id
          AND category_items.item_type = 'notebook'
          AND category_items.category_id = ?
      `;
      notebookParams.push(categoryId);
    }

    notebookQuery += ` WHERE LOWER(notebooks.title) LIKE ?`;
    notebookParams.push(q);

    await new Promise(res => {
      db.transaction(tx => {
        tx.executeSql(
          notebookQuery,
          notebookParams,
          (_, {rows}) => {
            for (let i = 0; i < rows.length; i++) {
              results.push({
                ...rows.item(i),
                source_type: 'notebook',
              });
            }
            res();
          },
          () => res(),
        );
      });
    });
  }

  return results;
};

export const searchNotebookNotesInCategory = async (categoryId, text) => {
  const db = getDb();

  // 1️⃣ Get notebooks in category
  const notebookIds = await new Promise(resolve => {
    db.transaction(tx => {
      tx.executeSql(
        `
        SELECT nb.id
        FROM notebooks nb
        INNER JOIN category_items ci
          ON ci.item_id = nb.id
          AND ci.item_type = 'notebook'
        WHERE ci.category_id = ?
        `,
        [categoryId],
        (_, {rows}) => {
          const ids = [];
          for (let i = 0; i < rows.length; i++) {
            ids.push(rows.item(i).id);
          }
          resolve(ids);
        },
        () => resolve([]),
      );
    });
  });

  if (!notebookIds.length) return [];

  // 2️⃣ Search notes per notebook
  const allNotes = [];

  for (const notebookId of notebookIds) {
    const notes = await fetchNotes({
      sourceType: 'notebook',
      sourceId: notebookId.toString(),
      searchQuery: text,
    });
    allNotes.push(...notes);
  }
  return allNotes;
};
