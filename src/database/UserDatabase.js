import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLite from 'react-native-sqlite-2';

export class UserDatabase {
  db = null;
  dbPath = '';
  userId = null;

  constructor(userId = null) {
    this.userId = userId;
  }

  async init() {
    try {
      if (!this.userId) {
        this.userId = await AsyncStorage.getItem('userId');
        if (!this.userId) {
          throw new Error('User ID not found in AsyncStorage');
        }
      }

      this.db = await this.getDatabaseForUser();

      await this.fetchDbPath();
    } catch (err) {
      console.error('[UserDatabase] Initialization failed:', err);
      throw err;
    }
  }

  async getDatabaseForUser() {
    try {
      const dbName = `DriveApp_${this.userId}.db`;

      return new Promise((resolve, reject) => {
        const db = SQLite.openDatabase(
          {
            name: dbName,
            location: 'default',
          },
          () => {
            console.log(`[BackupTask] Database opened for user ${this.userId}`);
            resolve(db);
          },
          error => {
            console.error(`[BackupTask] Failed to open database:`, error);
            reject(error);
          },
        );
      });
    } catch (err) {
      console.error('[BackupTask] Error fetching database for user:', err);
      throw err;
    }
  }

  async fetchDbPath() {
    return new Promise((resolve, reject) => {
      this.db.readTransaction(tx => {
        tx.executeSql(
          'PRAGMA database_list;',
          [],
          (_, result) => {
            this.dbPath = result.rows.item(0).file;
            console.log('📂 Database Location:', this.dbPath);
            resolve(this.dbPath);
          },
          (_, error) => {
            console.error(
              '[UserDatabase] Error fetching database path:',
              error,
            );
            reject(error);
          },
        );
      });
    });
  }

  getDb() {
    return this.db;
  }

  getDbPath() {
    return this.dbPath;
  }
}
