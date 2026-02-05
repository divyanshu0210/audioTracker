// UserDatabaseInstance.js

import {UserDatabase} from './UserDatabase';

let dbInstance = null;

export const initUserDatabase = async userId => {
  // if (dbInstance) return dbInstance;
  dbInstance = new UserDatabase(userId);
  await dbInstance.init();
  return dbInstance;
};

export const getUserDatabase = () => {
  if (!dbInstance) throw new Error('UserDatabase has not been initialized yet');
  return dbInstance;
};
