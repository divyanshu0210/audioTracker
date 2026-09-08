// IskconItem.jsx
//
// Row visual for one scraped entry, handed to BaseMediaListComponent as its
// `itemComponent` — so BaseItem wraps it with the press dispatch, long-press
// selection and selection highlight every other row in the app gets, and a
// file can be assigned or added to a category from here like anything else.
// Folders get a pin toggle and a chevron; a tap on one walks deeper (BaseItem
// routes it to onFolderPress off `kind`), and it can't be selected.
//
// Files are always playable (streamed remotely if not downloaded), so they
// normally show the three-dot menu — "Download"/"Remove Download" lives inside
// it — except while a download for that file is active, when it's swapped for
// a progress indicator. That swap is why this row renders BaseMenu itself
// rather than letting BaseItem do it (BaseItem defers for ItemTypes.ISKCON +
// itemComponent): the menu is unmounted for the duration of a download, and
// only this row is guaranteed to stay mounted throughout.
//
// file_path is read from the store (not the item prop) so it stays fresh after
// a download completes or is removed via the menu — same pattern
// StackScreens/DriveItem.jsx uses for driveLinksList/data. Which store list
// holds the row depends on the screen: iskconFiles for the IDT tab,
// iskconFolderEntries for an open folder.

import React, {useEffect, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';

import {DownloadedBadge, getFileIcon} from '../contexts/fileIconHelper';
import BaseMenu from '../components/menu/BaseMenu';
import {DownloadProgressIndicator} from '../components/buttons/DownloadProgressIndicator';
import {ItemTypes} from '../contexts/constants';
import {useMediaStore} from '../stores/useMediaStore';
import useDownloadStore from '../stores/useDownloadStore';
import {cancelDownload} from '../backgroundService/backgroundDownloadService';
import useIskconPinsStore from '../stores/useIskconPinsStore';

// Pinned folders surface on the outermost screen away from where they
// actually live, so show where that is. `item.path` is the full decoded
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

// `screen` is handed down by BaseItem and forwarded to BaseMenu below —
// CommonMenuItems uses it to decide whether "Remove from category" applies
// here, so dropping it would take that entry off the IDT tab.
const IskconItem = ({item: entry, screen}) => {
  // Only the browser's scraped listing carries `kind`. Rows coming from the
  // DB — the category-filtered listing, the pinned files strip — are always
  // files, and fall through to the file branches below.
  const isFolder = entry.kind === 'folder';

  const isPinned = useIskconPinsStore(state =>
    isFolder
      ? state.pinnedFolders.some(f => f.encodedPath === entry.encodedPath)
      : false,
  );
  const togglePin = useIskconPinsStore(state => state.togglePin);

  // Re-read from the store (not the item prop) so id/file_path stay fresh
  // after a download completes or the menu deletes the file — same pattern
  // DriveItem uses for driveLinksList/data. Either list can be the one this
  // row came from, depending on which screen is rendering it.
  const storeEntry = useMediaStore(state =>
    isFolder
      ? null
      : state.iskconFiles.find(f => f.source_id === entry.source_id) ??
        state.iskconFolderEntries.find(f => f.source_id === entry.source_id),
  );
  const mergedEntry = storeEntry ? {...entry, ...storeEntry} : entry;
  const filePath = mergedEntry.file_path ?? null;

  const [fileExists, setFileExists] = useState(false);

  const download = useDownloadStore(state =>
    isFolder ? null : state.downloads[entry.source_id],
  );
  const removeDownload = useDownloadStore(state => state.removeDownload);
  const patchIskconFile = useMediaStore(state => state.patchIskconFile);
  const isDownloading =
    download?.status === 'queued' || download?.status === 'downloading';

  useEffect(() => {
    let mounted = true;
    (async () => {
      // A file that was only ever played keeps the remote url in file_path,
      // so an http path is not a local copy and must not earn the badge.
      const local = filePath && !filePath.startsWith('http') ? filePath : null;
      const exists = local ? await RNFS.exists(local).catch(() => false) : false;
      if (mounted) setFileExists(exists);
    })();
    return () => {
      mounted = false;
    };
  }, [filePath]);

  // BaseMenu (and the "Remove Download" logic inside it) is swapped out for
  // a progress indicator while downloading — see below — so this row is the
  // only thing guaranteed to stay mounted for the whole download. Sync the
  // finished file into the store and clear the download entry here rather
  // than relying on a menu item that isn't mounted yet at that moment.
  useEffect(() => {
    if (isFolder || download?.status !== 'done') return;
    patchIskconFile(entry.source_id, {file_path: download.localPath});
    removeDownload(entry.source_id);
  }, [isFolder, download?.status, download?.localPath, entry.source_id, patchIskconFile, removeDownload]);

  const breadcrumb = isPinned ? formatBreadcrumb(entry.path) : null;

  return (
    <View style={styles.row}>
      <View style={styles.iconWrapper}>
        {getFileIcon(isFolder ? 'application/vnd.google-apps.folder' : 'iskcon_file')}
        {!isFolder && fileExists && <DownloadedBadge />}
      </View>
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
      ) : isDownloading ? (
        <DownloadProgressIndicator
          progress={download.progress}
          onCancel={() => cancelDownload(entry.source_id)}
        />
      ) : (
        <BaseMenu
          item={{...mergedEntry, file_path: fileExists ? filePath : null}}
          type={ItemTypes.ISKCON}
          screen={screen}
        />
      )}
    </View>
  );
};

export default React.memo(IskconItem);

const styles = StyleSheet.create({
  // No padding or divider of its own — BaseItem's wrapper supplies both, the
  // same way it does for every other row visual.
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingRight: 4,
  },
  iconWrapper: {position: 'relative'},
  textCol: {flex: 1},
  title: {fontSize: 14, fontWeight: '500', color: '#222'},
  breadcrumb: {fontSize: 11, color: '#999', marginTop: 2},
});
