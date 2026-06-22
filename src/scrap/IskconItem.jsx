// IskconItem.jsx
//
// Row for one scraped entry. Folders get a chevron. Files are always
// playable (streamed remotely if not downloaded), so they always show the
// three-dot menu — "Download"/"Remove Download" lives inside it.
// file_path is read from useMediaStore.iskconEntries (not the entry prop) so
// it stays fresh after a download completes or is removed via the menu —
// same pattern StackScreens/DriveItem.jsx uses for driveLinksList/data.

import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';

import {getFileIcon} from '../contexts/fileIconHelper';
import BaseMenu from '../components/menu/BaseMenu';
import {ItemTypes} from '../contexts/constants';
import {useMediaStore} from '../stores/useMediaStore';
import useIskconPinsStore from '../stores/useIskconPinsStore';
import {playFile} from './iskconActions';

// Pinned folders surface on the outermost screen away from where they
// actually live, so show where that is. `entry.path` is the full decoded
// path (e.g. "/01_-_Srila_Prabhupada/Lectures/1990") — drop the trailing
// segment (the folder's own name, already shown as the title) and keep only
// the closest parent or two, so a deeply nested pin doesn't print its whole
// ancestry as one long line.
const MAX_BREADCRUMB_SEGMENTS = 2;

const formatBreadcrumb = path => {
  if (!path) return null;
  const segments = path.split('/').filter(Boolean);
  segments.pop();
  if (!segments.length) return null;
  const shown = segments.slice(-MAX_BREADCRUMB_SEGMENTS).map(s => s.replace(/_/g, ' '));
  const prefix = segments.length > MAX_BREADCRUMB_SEGMENTS ? '… › ' : '';
  return prefix + shown.join(' › ');
};

const IskconItem = ({entry, onFolderPress}) => {
  const isFolder = entry.kind === 'folder';

  const isPinned = useIskconPinsStore(state =>
    isFolder
      ? state.pinnedFolders.some(f => f.encodedPath === entry.encodedPath)
      : false,
  );
  const togglePin = useIskconPinsStore(state => state.togglePin);

  // Re-read from the store (not the entry prop) so id/file_path stay fresh
  // after a download completes or the menu deletes the file — same pattern
  // DriveItem uses for driveLinksList/data.
  const storeEntry = useMediaStore(state =>
    isFolder ? null : state.iskconEntries.find(f => f.source_id === entry.source_id),
  );
  const mergedEntry = storeEntry ? {...entry, ...storeEntry} : entry;
  const filePath = mergedEntry.file_path ?? null;

  const [fileExists, setFileExists] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const exists = filePath ? await RNFS.exists(filePath) : false;
      if (mounted) setFileExists(exists);
    })();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  const handlePress = () =>
    isFolder ? onFolderPress(entry) : playFile(mergedEntry, filePath);

  const breadcrumb = isPinned ? formatBreadcrumb(entry.path) : null;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={handlePress}>
      {getFileIcon(isFolder ? 'application/vnd.google-apps.folder' : 'iskcon_file')}
      <View style={styles.textCol}>
        <Text style={styles.title} numberOfLines={2}>
          {entry.title}
        </Text>
        {breadcrumb && (
          <Text style={styles.breadcrumb} numberOfLines={1}>
            {breadcrumb}
          </Text>
        )}
      </View>
      {isFolder ? (
        <>
          <TouchableOpacity
            onPress={() => togglePin(entry)}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
            <MaterialCommunityIcons
              name={isPinned ? 'pin' : 'pin-outline'}
              size={20}
              color={isPinned ? '#2196F3' : '#ccc'}
            />
          </TouchableOpacity>
          <MaterialIcons name="chevron-right" size={24} color="#bbb" />
        </>
      ) : (
        <BaseMenu
          item={{...mergedEntry, file_path: fileExists ? filePath : null}}
          type={ItemTypes.ISKCON}
        />
      )}
    </TouchableOpacity>
  );
};

export default React.memo(IskconItem);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eee',
  },
  textCol: {flex: 1},
  title: {fontSize: 14, fontWeight: '500', color: '#222'},
  breadcrumb: {fontSize: 11, color: '#999', marginTop: 2},
});
