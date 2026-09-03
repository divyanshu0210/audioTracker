// Promoting an item the user only ever *looked* at into one they keep.
//
// This is the other half of LinkOrigin.EXTERNAL: an externally-opened link
// creates its row at out_show 0 and files it nowhere, and this is the single
// place that reverses that — from the Add bar on the player, the playlist view
// or the Drive viewer.
//
// It is deliberately the only writer of out_show outside the in-app paths, so
// "how does something get into my list" has one answer.

import RNFS from 'react-native-fs';

import {addItemToCategory} from '../categories/catDB';
import {updateItemFields} from '../database/U';
import {useMediaStore} from '../stores/useMediaStore';
import {generateUUID, resolveDestPath} from './utils/handleLinkSubmit';

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
 * True when this item is still living on the content:// URI it was shared in
 * on, rather than on bytes of our own.
 */
const needsImport = item =>
  item?.type === 'device_file' && !!item.file_path?.startsWith('content://');

/**
 * Adds `item` to the root list, optionally filing it into a category.
 *
 * The copy for a shared device file happens here rather than at share time —
 * see handleSharedDeviceFile for why. It runs before the visibility change so
 * that a failed copy leaves the row exactly as it was: still playable from the
 * URI for as long as the grant lasts, and still offering the Add bar, rather
 * than sitting in the Device tab pointing at a file that was never written.
 *
 * Throws if the copy or the write fails; callers report it.
 */
export const saveItemToList = async (item, categoryId = null) => {
  if (!item?.id) throw new Error('Nothing to add');

  const updates = {out_show: 1};

  if (needsImport(item)) {
    const destPath = await resolveDestPath(
      item.title || `file_${Date.now()}`,
      generateUUID(),
    );
    await RNFS.copyFile(item.file_path, destPath);
    updates.file_path = destPath;
    console.log(`📁 Imported ${item.title} to ${destPath} on add`);
  }

  const saved = await updateItemFields(item.id, updates);

  if (categoryId != null) {
    await addItemToCategory(categoryId, saved.source_id, saved.type);
  }

  // Prepended, and de-duplicated on source_id: the list may already hold a
  // stale copy of this row from a hidden state it was fetched in.
  listSetterFor(saved.type)(prev => [
    saved,
    ...prev.filter(i => i.source_id !== saved.source_id),
  ]);

  return saved;
};
