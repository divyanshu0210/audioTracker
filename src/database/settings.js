import {getDb} from './database';
import {fastdb} from './FTSDatabase';
import {getUserDatabase} from './UserDatabaseInstance';

export const getSetting = async key => {
  const db = getUserDatabase().getDb();
  const fastdb = db || getDb();
  // Define known special key types
  const BOOLEAN_KEYS = ['BACKUP_ENABLED', 'BACKUP_TASK_SCHEDULED', 'SPECIAL_BACKUP_ALLOWED', 'autoplay'];
  const ARRAY_KEYS = [];
  // const ARRAY_KEYS = ['Mentor Mobile Numbers'];

  return new Promise((resolve, reject) => {
    fastdb.transaction(tx => {
      tx.executeSql(
        'SELECT value FROM settings WHERE key = ?',
        [key],
        (_, {rows}) => {
          if (rows.length > 0) {
            let value = rows.item(0).value;

            if (value === null || value === undefined) {
              resolve(null);
            } else if (BOOLEAN_KEYS.includes(key)) {
              resolve(value === 'true' || value === '1' || value === 1);
            } else if (ARRAY_KEYS.includes(key)) {
              try {
                resolve(JSON.parse(value || '[]'));
              } catch (e) {
                console.error(`Error parsing ${key}:`, e);
                resolve([]);
              }
            } else if (typeof value === 'string') {
              console.log('string', value);
              resolve(value); // For strings like ISO timestamps
            } else if (!isNaN(value)) {
              console.log('number');
              resolve(Number(value));
            } else {
              resolve(value);
            }
          } else {
            resolve(null); // Key not found
          }
        },
        error => {
          console.error('Error fetching setting:', error);
          reject(error);
        },
      );
    });
  });
};

export const getAllSettings = async callback => {
  const fastdb = getDb();

  // Define known special key types
  const BOOLEAN_KEYS = ['BACKUP_ENABLED', 'BACKUP_TASK_SCHEDULED', 'SPECIAL_BACKUP_ALLOWED', 'autoplay'];
  const ARRAY_KEYS = [];

  fastdb.transaction(tx => {
    tx.executeSql(
      'SELECT key, value FROM settings',
      [],
      (_, {rows}) => {
        let settings = {};
        for (let i = 0; i < rows.length; i++) {
          const {key, value} = rows.item(i);

          if (value === null || value === undefined) {
            settings[key] = null;
          } else if (BOOLEAN_KEYS.includes(key)) {
            settings[key] = value === 'true' || value === '1' || value === 1;
          } else if (ARRAY_KEYS.includes(key)) {
            try {
              settings[key] = JSON.parse(value || '[]');
            } catch (e) {
              console.error(`Error parsing ${key}:`, e);
              settings[key] = [];
            }
          } else if (!isNaN(value) && value !== '') {
            settings[key] = Number(value);
          } else {
            settings[key] = value;
          }
        }

        callback(settings);
      },
      error => {
        console.error('Error fetching settings:', error);
        callback({});
      },
    );
  });
};

export const setSetting = async (key, value) => {
  const fastdb = getDb();

  // Convert values for storage
  let storageValue;
  if (typeof value === 'boolean') {
    storageValue = value ? '1' : '0'; // Store as '1'/'0' for consistency
  } else if (Array.isArray(value)) {
    storageValue = JSON.stringify(value);
  } else {
    storageValue = String(value);
  }

  fastdb.transaction(tx => {
    tx.executeSql(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      [key, storageValue],
      () => console.log(`Setting ${key}=${value} saved successfully`),
      error => console.error('Error saving setting:', error),
    );
  });
};
