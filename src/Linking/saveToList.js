// Promoting an item the user only ever *looked* at into one they keep.
//
// This is the other half of LinkOrigin.EXTERNAL: an externally-opened link
// creates its row at out_show 0, and this is the single place that reverses
// that — from the Add bar on the player, the playlist view or the Drive
// viewer.
//
// It is deliberately the only writer of out_show outside the in-app paths, so
// "how does something get into my list" has one answer.

import RNFS from 'react-native-fs';

import {updateItemFields} from '../database/U';
import {useMediaStore} from '../stores/useMediaStore';
import {
  generateUUID,
  isInSharedCache,
  resolveDestPath,
} from './utils/handleLinkSubmit';
import {isContentUri, takePersistableAccess} from '../utils/mediaFile';

// Which tab's list this item belongs to. The store keeps one array per source,
// and the newly-saved row has to land in the right one or the tab shows
// nothing until the next refresh reads it back from the DB.
const listSetterFor = type => {
  const {setItems, setDriveLinksList, setDeviceFiles} = useMediaStore.getState();
  if (type === 'drive_file' || type === 'drive_folder') return setDriveLinksList;
  if (type === 'device_file') return setDeviceFiles;
  return setItems;
};

/**
 * True when this item's bytes are not yet anywhere the app can keep them.
 *
 * Two shapes, one meaning. A file shared in now arrives as the uri it was sent
 * on, which the app has no lasting right to read; an older one arrived as a
 * scratch copy in the cache, which Android may evict. Either way, keeping the
 * item means putting the bytes somewhere of our own first.
 */
const needsImport = item =>
  item?.type === 'device_file' &&
  (isContentUri(item.file_path) || isInSharedCache(item.file_path));

/**
 * Adds `item` to the root list.
 *
 * Visibility only. Filing it into a category stays where it already is for
 * every other item — the item's own menu, through CategorySelectionModal — so
 * this remains the single writer of out_show and that screen remains the
 * single writer of category_items.
 *
 * A shared device file is still on the scratch copy it arrived as, so keeping
 * it means moving that into the app's own directory first. That runs before
 * the visibility change, so a failure leaves the row exactly as it was: still
 * playable, still offering the Add bar, rather than sitting in the Device tab
 * pointing at a file that was never written.
 *
 * Throws if the copy or the write fails; callers report it.
 */
export const saveItemToList = async item => {
  if (!item?.id) throw new Error('Nothing to add');

  const updates = {out_show: 1};

  if (needsImport(item)) {
    // Ask for a lasting grant before spending the whole size of the file on a
    // copy. Senders that offer one are the minority, but when one does, the
    // file can simply be kept where it is and this costs a single call to find
    // out. Only a uri can be kept this way — an older scratch copy is already
    // the app's own bytes, sitting somewhere Android may evict.
    const keptInPlace =
      isContentUri(item.file_path) &&
      (await takePersistableAccess(item.file_path));

    if (keptInPlace) {
      console.log(`🔗 Kept ${item.title} in place at ${item.file_path}`);
    } else {
      const destPath = await resolveDestPath(
        item.title || `file_${Date.now()}`,
        generateUUID(),
      );

      if (isContentUri(item.file_path)) {
        // The one moment these bytes are reachable. An ACTION_SEND grant lives
        // only as long as the task that received it, so this reads them now,
        // while the user is still in the session the file was shared into. If
        // it has lapsed the copy throws, the row is left exactly as it was,
        // and the Add bar says so — see SaveToListBar, which names this case.
        await RNFS.copyFile(item.file_path, destPath);
      } else {
        // An older scratch copy. Moved, not copied: it has no reason to
        // outlive the real one, and both directories are on the same volume so
        // this is a rename.
        await RNFS.moveFile(item.file_path, destPath);
      }

      updates.file_path = destPath;
      console.log(`📁 Imported ${item.title} to ${destPath} on add`);
    }
  }

  const saved = await updateItemFields(item.id, updates);

  // Prepended, and de-duplicated on source_id: the list may already hold a
  // stale copy of this row from a hidden state it was fetched in.
  listSetterFor(saved.type)(prev => [
    saved,
    ...prev.filter(i => i.source_id !== saved.source_id),
  ]);

  return saved;
};
