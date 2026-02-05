import { create } from 'zustand';
import { getAllSettings, setSetting } from "../database/settings";

const useSettingsStore = create((set, get) => ({
  settings: {
    TARGET_WATCH_TIME: 30,
    TARGET_NEW_WATCH_TIME: 30,
    BACKUP_ENABLED: true,
    BACKUP_TASK_SCHEDULED: true,
    LAST_BACKUP_TIME: null,
    LAST_BACKUP_LOCAL_TIME: null,
    autoplay: true,
  },

  // Initialize the store by loading settings from database
  initialize: async () => {
    try {
      const dbSettings = await new Promise((resolve, reject) => {
        getAllSettings((settings) => {
          resolve(settings);
        });
      });
  
      const parsedSettings = { ...get().getDefaultSettings(), ...dbSettings };
      console.log('paresed settings being set',parsedSettings)
      set({ settings: parsedSettings });
      return parsedSettings; // <-- Return the merged settings
    } catch (error) {
      console.error("Failed to initialize settings:", error);
    }
  },
  

  getDefaultSettings: () => {
    return {
      TARGET_WATCH_TIME: 30,
      TARGET_NEW_WATCH_TIME: 30,
      BACKUP_ENABLED: true,
      BACKUP_TASK_SCHEDULED: true,
      LAST_BACKUP_TIME: null,
      LAST_BACKUP_LOCAL_TIME: null,
      autoplay: true,
    };
  },

  //to save settings to DB and update the store
  updateSettings: (newSettings) => {
    const currentSettings = get().settings;
    const updatedSettings = { ...currentSettings, ...newSettings };

    // Update the store
    set({ settings: updatedSettings });

    // Persist to database
    Object.entries(newSettings).forEach(([key, value]) => {
      try {
        let storedValue;
        
        if (value === null || value === undefined) {
          storedValue = null;
        } 
        // Handle boolean values (convert to '1'/'0')
        else if (key === "BACKUP_ENABLED" || 
                key === "BACKUP_TASK_SCHEDULED" || 
                key === "autoplay" || 
                typeof value === 'boolean') {
          storedValue = value ? '1' : '0';
        } 
        // Handle arrays (convert to JSON)
        else if (Array.isArray(value)) {
          storedValue = JSON.stringify(value);
        }
        // Handle numbers (convert to string)
        else if (typeof value === 'number') {
          storedValue = String(value);
        }
        // Default case (strings)
        else {
          storedValue = String(value);
        }

        setSetting(key, storedValue);
      } catch (error) {
        console.error(`Failed to store setting ${key}:`, error);
      }
    });
  },
}));

export default useSettingsStore;