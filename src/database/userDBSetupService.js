// database.js
import SQLite from 'react-native-sqlite-2';
import { create } from 'zustand';

let userDatabases = {}; // Cache for user databases



export const getDatabaseForUser = (userId) => {
  if (!userId) {
    throw new Error('User ID is required to get database');
  }

  // Return cached database if exists
  if (userDatabases[userId]) {
    return userDatabases[userId];
  }

  // Create new database for user
  const dbName = `DriveApp_${userId}.db`;
  const db = SQLite.openDatabase(
    {
      name: dbName,
      location: 'default',
    },
    () => console.log(`Database opened for user ${userId}`),
    (error) => console.error(`Error opening database for user ${userId}:`, error)
  );

  // Cache the database
  userDatabases[userId] = db;
  return db;
};

export const closeUserDatabase = (userId) => {
  if (userDatabases[userId]) {
    // Note: SQLite doesn't have a direct close method in react-native-sqlite-2
    // We'll just remove it from cache
    delete userDatabases[userId];
  }
};