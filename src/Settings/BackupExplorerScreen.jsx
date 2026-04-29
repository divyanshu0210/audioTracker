import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import {ScrollView} from 'react-native';
import JSONTree from 'react-native-json-tree';

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFetchBlob from 'react-native-blob-util';

import {getDb} from '../database/database';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { getGoogleAccessToken } from '../auth/tokenManager';
import {  DRIVE_MAIN_FOLDER_NAME, getOrCreateDriveFolder } from '../backupRestore/restoreManager';
const BACKUP_DIR = `${RNFS.DocumentDirectoryPath}/backups`;

const theme = {
  scheme: 'monokai',
  base00: '#111',
  base01: '#222',
  base02: '#444',
  base03: '#888',
  base04: '#aaa',
  base05: '#f8f8f2',
  base06: '#f5f4f1',
  base07: '#f9f8f5',
  base08: '#f92672',
  base09: '#fd971f',
  base0A: '#f4bf75',
  base0B: '#a6e22e',
  base0C: '#a1efe4',
  base0D: '#66d9ef',
  base0E: '#ae81ff',
  base0F: '#cc6633',
};

// =========================
// DRIVE LIST
// =========================
const listDriveFiles = async folderId => {
  try {
    const accessToken = await getGoogleAccessToken();

    const res = await RNFetchBlob.fetch(
      'GET',
      `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,size,modifiedTime,mimeType)`,
      {Authorization: `Bearer ${accessToken}`},
    );

    return res.json().files || [];
  } catch (e) {
    console.log('[DRIVE] List error:', e);
    return [];
  }
};

// =========================
// DB FETCH
// =========================
const getAllDbFiles = async () => {
  const db = getDb();

  return new Promise((resolve, reject) => {
    db.transaction(tx => {
      tx.executeSql(
        `SELECT file, level, state, drive_id FROM backup_files`,
        [],
        (_, res) => {
          const rows = [];
          for (let i = 0; i < res.rows.length; i++) {
            rows.push(res.rows.item(i));
          }
          resolve(rows);
        },
        (_, err) => reject(err),
      );
    });
  });
};

export const deleteFile = (file) => {
  const db = getDb();

  console.log(`[DB] Deleting file entry → ${file}`);

  return new Promise((resolve, reject) => {
    db.transaction(
      tx => {
        tx.executeSql(
          `DELETE FROM ${TABLE} WHERE file=?`,
          [file],
          (_, res) => {
            console.log(`[DB] File deleted → ${file}, rowsAffected: ${res.rowsAffected}`);
            resolve();
          },
          (_, err) => {
            console.error(`[DB] SQL error deleting ${file}:`, err);
            reject(err);
            return true;
          },
        );
      },
      error => {
        console.error('[DB] Transaction error (DELETE):', error);
        reject(error);
      },
    );
  });
};

// =========================
// HELPERS
// =========================
const formatSize = bytes => {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = date => {
  if (!date) return '--';
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
};

export const extractEpochs = name => {
  if (!name) return {};

  try {
    const clean = name.replace('.json', '');

    // ✅ extract level (L0, L1, etc.)
    const levelMatch = clean.match(/^L(\d+)_/);
    const level = levelMatch ? Number(levelMatch[1]) : null;

    const underscoreIndex = clean.indexOf('_');
    if (underscoreIndex === -1) return {};

    const afterUnderscore = clean.substring(underscoreIndex + 1);

    // 🔥 keep your correct logic
    const dashIndex = afterUnderscore.lastIndexOf('-');
    if (dashIndex === -1) return {};

    const startStr = afterUnderscore.substring(0, dashIndex);
    const endStr = afterUnderscore.substring(dashIndex + 1);

    return {
      level,
      start: Number(startStr),
      end: Number(endStr),
    };
  } catch {
    return {};
  }
};

const formatEpoch = epoch => {
  if (epoch == null) return '--';

  const d = new Date(epoch * 1000);

  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function BackupExplorerScreen() {
  const [localSections, setLocalSections] = useState([]);
  const [driveSections, setDriveSections] = useState([]);
  const [missingSection, setMissingSection] = useState([]);
  const [viewerData, setViewerData] = useState(null);
  const [viewerTitle, setViewerTitle] = useState(null);
  useEffect(() => {
    load();
  }, []);

  async function load() {
    console.log('[EXPLORER] Loading UI');

    const dbFiles = await getAllDbFiles();

    const dbMap = {};
    dbFiles.forEach(f => {
      dbMap[f.file] = f;
    });

    // =========================
    // LOCAL
    // =========================
    const local = [];

    const exists = await RNFS.exists(BACKUP_DIR);

    if (exists) {
      const folders = await RNFS.readDir(BACKUP_DIR);

      for (const folder of folders) {
        if (!folder.isDirectory()) continue;

        const files = await RNFS.readDir(folder.path);

        local.push({
          title: `📱 ${folder.name.toUpperCase()}`,
          data: files
            .filter(f => f.isFile())
            .map(f => {
              const extracted = extractEpochs(f.name);
              return {
                name: f.name,
                size: f.size,
                date: f.mtime,
                startEpoch: extracted.start,
                endEpoch: extracted.end,
                path: f.path, // ✅ REQUIRED
                source: 'local', // ✅ REQUIRED
                state: dbMap[f.name]?.state || 'unknown',
              };
            }),
        });
      }
    }

    setLocalSections(local);

    // =========================
    // DRIVE
    // =========================
    // const stored = await AsyncStorage.getItem('driveFolderIds');
    // const folderIds = JSON.parse(stored || '{}');
    const appFolderId = await getOrCreateDriveFolder(DRIVE_MAIN_FOLDER_NAME);
    const imageFolderId = await getOrCreateDriveFolder('images', appFolderId);

    const drive = [];

    // ROOT (ignore images folder)
    if (appFolderId) {
      const files = await listDriveFiles(appFolderId);

      drive.push({
        title: '☁️ BACKUPS',
        data: files
          .filter(f => f.mimeType !== 'application/vnd.google-apps.folder') // 🔥 FIX
          .map(f => {
            const extracted = extractEpochs(f.name);
            return {
              name: f.name,
              size: Number(f.size),
              date: f.modifiedTime,
              drive_id: f.id, // ✅ REQUIRED
              source: 'drive', // ✅ REQUIRED
              startEpoch: extracted.start,
              endEpoch: extracted.end,
              state: dbMap[f.name]?.state || 'unknown',
            };
          }),
      });
    }

    // IMAGES
    if (imageFolderId) {
      const files = await listDriveFiles(imageFolderId);

      drive.push({
        title: '☁️ IMAGES',
        data: files.map(f => {
          const extracted = extractEpochs(f.name);
          return {
          name: f.name,
          size: Number(f.size),
          date: f.modifiedTime,
          drive_id: f.id, // 🔥 REQUIRED
          source: 'drive', // 🔥 REQUIRED
          state: dbMap[f.name]?.state || 'unknown',
          startEpoch: extracted.start,
          endEpoch: extracted.end,
        };
        }),
      });
    }

    setDriveSections(drive);

    // =========================
    // MISSING EVERYWHERE (DB only)
    // =========================

    const localNames = new Set(
      local.flatMap(section => section.data.map(f => f.name)),
    );

    const driveNames = new Set(
      drive.flatMap(section => section.data.map(f => f.name)),
    );

    const missing = dbFiles
      .filter(f => !localNames.has(f.file) && !driveNames.has(f.file))
      .map(f => {
        const extracted = extractEpochs(f.file);
        return {
        name: f.file,
        size: null,
        date: null,
        state: f.state,
        startEpoch: extracted.start,
        endEpoch: extracted.end,
      }});

    setMissingSection([
      {
        title: '⚠️ MISSING EVERYWHERE',
        data: missing,
      },
    ]);
  }

  const openFile = async (item, source) => {
    try {
      console.log('[OPEN] Opening file:', item.name, source);

      let content = null;

      if (source === 'local') {
        content = await RNFS.readFile(item.path, 'utf8');
      }

      if (source === 'drive') {
        const accessToken = await getGoogleAccessToken();

        const res = await RNFetchBlob.fetch(
          'GET',
          `https://www.googleapis.com/drive/v3/files/${item.drive_id}?alt=media`,
          {Authorization: `Bearer ${accessToken}`},
        );

        content = res.data;
      }

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = {raw: content};
      }

      setViewerTitle(item.name);
      setViewerData(parsed);
    } catch (e) {
      console.log('[OPEN ERROR]', e);

      setViewerTitle(item.name);
      setViewerData({
        error: 'Failed to open file',
        message: String(e),
      });
    }
  };

  const resetAll = async () => {
    Alert.alert(
      '⚠️ Full Reset',
      'This will delete ALL backups (Local + Drive + DB). Continue?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'RESET',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[RESET] Starting full reset');

              // =========================
              // 1. DELETE LOCAL FILES
              // =========================
              const exists = await RNFS.exists(BACKUP_DIR);
              if (exists) {
                await RNFS.unlink(BACKUP_DIR); // 🔥 deletes entire folder
                await RNFS.mkdir(BACKUP_DIR); // recreate empty folder
              }

              // =========================
              // 2. DELETE DRIVE FILES
              // =========================
              const stored = await AsyncStorage.getItem('driveFolderIds');
              const folderIds = JSON.parse(stored || '{}');

              const accessToken = await getGoogleAccessToken();

              const deleteAllInFolder = async folderId => {
                if (!folderId) return;

                const files = await listDriveFiles(folderId);

                for (const f of files) {
                  try {
                    await RNFetchBlob.fetch(
                      'DELETE',
                      `https://www.googleapis.com/drive/v3/files/${f.id}`,
                      {Authorization: `Bearer ${accessToken}`},
                    );
                  } catch (e) {
                    console.log('[RESET] Drive delete failed:', f.name);
                  }
                }
              };

              await deleteAllInFolder(folderIds.root);
              await deleteAllInFolder(folderIds.images);

              // =========================
              // 3. CLEAR DB
              // =========================
              const db = getDb();
              await new Promise((resolve, reject) => {
                db.transaction(tx => {
                  tx.executeSql(
                    `DELETE FROM backup_files`,
                    [],
                    () => resolve(),
                    (_, err) => reject(err),
                  );
                });
              });

              // =========================
              // 4. CLEAR STORAGE (optional)
              // =========================
              // await AsyncStorage.removeItem('driveFolderIds');

              console.log('[RESET] Done');

              await load();
            } catch (e) {
              console.log('[RESET ERROR]', e);
            }
          },
        },
      ],
    );
  };

  // =========================
  // ITEM UI
  // =========================
  const renderItem = ({item}) => {
    const isMissing = !item.date && !item.size;

    const color = isMissing
      ? '#ff0000'
      : item.state === 'local'
        ? '#ff9500'
        : item.state === 'synced'
          ? '#34c759'
          : item.state === 'ghost'
            ? '#ff3b30'
            : '#999';

    return (
      <TouchableOpacity
        style={styles.file}
        onPress={() => {
          if (!item.source) return;
          openFile(item, item.source);
        }}>
        <View style={{flex: 1}}>
          <Text style={styles.name}>{item.name}</Text>

          <Text style={styles.meta}>
            {item.date
              ? `${formatDate(item.date)} • ${formatSize(item.size)}`
              : 'Not found locally or on Drive'}
          </Text>
          <Text style={styles.meta}>
            {item.startEpoch && item.endEpoch
              ? `${formatEpoch(item.startEpoch)} to ${formatEpoch(item.endEpoch)}`
              : ''}
          </Text>
        </View>

        <View style={styles.right}>
          <Text style={[styles.state, {color}]}>
            {item.state?.toUpperCase()}
          </Text>

          {isMissing && (
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={e => {
                e.stopPropagation(); // 🔥 CRITICAL
                handleDelete(item.name);
              }}>
              <Icon name="delete" size={20} color="#ff3b30" />
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const handleDelete = fileName => {
    Alert.alert('Delete Entry', `Remove "${fileName}" from DB?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFile(fileName);
          await load();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.mainTitle}>Backup Explorer</Text>

        <View style={{flexDirection: 'row', gap: 15}}>
          <TouchableOpacity onPress={load}>
            <Text style={styles.refresh}>Refresh</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={resetAll}>
            <Text style={[styles.refresh, {color: '#ff3b30'}]}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionMain}>DRIVE</Text>
      <SectionList
        sections={driveSections}
        keyExtractor={(item, i) => item.name + i}
        renderItem={renderItem}
        renderSectionHeader={({section}) => (
          <Text style={styles.header}>{section.title}</Text>
        )}
      />

      <Text style={styles.sectionMain}>LOCAL</Text>
      <SectionList
        sections={localSections}
        keyExtractor={(item, i) => item.name + i}
        renderItem={renderItem}
        renderSectionHeader={({section}) => (
          <Text style={styles.header}>{section.title}</Text>
        )}
      />

      {missingSection.length > 0 && (
        <>
          <Text style={styles.sectionMain}>MISSING</Text>

          <SectionList
            sections={missingSection}
            keyExtractor={(item, i) => item.name + i}
            renderItem={renderItem}
            renderSectionHeader={({section}) => (
              <Text style={styles.header}>{section.title}</Text>
            )}
          />
        </>
      )}

      {viewerData && (
        <View style={styles.viewer}>
          <View style={styles.viewerHeader}>
            <Text style={styles.viewerTitle}>{viewerTitle}</Text>

            <TouchableOpacity onPress={() => setViewerData(null)}>
              <Text style={styles.close}>CLOSE</Text>
            </TouchableOpacity>
          </View>

          <ScrollView>
            <JSONTree data={viewerData} theme={theme} hideRoot fontSize={12} />
          </ScrollView>
        </View>
      )}
    </View>
  );
}

// =========================
// STYLES
// =========================
const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },

  refresh: {
    color: '#007aff',
    fontWeight: 'bold',
    fontSize: 14,
  },

  mainTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    // padding: 12,
  },

  sectionMain: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 12,
    marginTop: 10,
  },

  header: {
    fontSize: 14,
    fontWeight: '600',
    padding: 8,
    backgroundColor: '#f4f4f4',
  },

  file: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#eee',
  },

  name: {
    fontSize: 14,
    fontWeight: '500',
  },

  meta: {
    fontSize: 12,
    color: '#777',
  },

  state: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  right: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  iconBtn: {
    // marginTop: 6,
    padding: 8,
  },
  // =========================
  // VIEWER
  // =========================
  viewer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '99%',
    backgroundColor: '#111',
    padding: 12,
    zIndex: 999,
  },

  viewerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  viewerTitle: {
    color: '#fff',
    fontWeight: 'bold',
  },

  close: {
    color: '#ff6666',
    fontWeight: 'bold',
  },
});
