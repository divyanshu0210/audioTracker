// fileIdentity.js
//
// Finding a device file again after its address stops working.
//
// A device file is referenced, not copied: items.file_path holds a content://
// uri into the user's own storage. That uri is where the file is, which is a
// different thing from what the file is, and only the second one survives the
// user reorganising their phone. Rename it, move it between folders, or let a
// file manager "move" it by copying and deleting — as many do — and the row is
// left pointing at nothing, with every note and every minute of watch history
// still attached to it.
//
// So identity is recorded separately (see src/database/deviceFileMeta.js) and
// used to repair the address when it breaks. Three things can do the finding,
// cheapest first:
//
//   media_store_id   free, but only survives a rename that went through
//                    MediaStore — a copy-and-delete produces a new row
//   size             free to match, never enough on its own to be sure
//   content_hash     costs a full read, and is the only thing trusted to say
//                    two files are the same file
//
// Nothing here ever binds a file to a row on a guess. Attaching the wrong
// recording to someone's notes is worse than leaving the row broken, because
// the row being broken is at least visible.

import {NativeModules} from 'react-native';

import {
  findIdentityCandidates,
  getDeviceFileMeta,
  getUnhashedDeviceFiles,
  saveDeviceFileHash,
  saveDeviceFileIdentity,
} from '../database/deviceFileMeta';
import {updateItemFields} from '../database/U';
import {ensureMediaReadPermission, isContentUri, mediaExists} from './mediaFile';

const {FileMeta} = NativeModules;

// Items already searched for and not found, this run only.
//
// A file that is genuinely deleted stays missing, and the Device list is
// rebuilt often — every tab switch, every category change. Without this, each
// rebuild would run a MediaStore query and potentially read several candidate
// files to the end for every permanently gone item, forever.
//
// Held in memory rather than written down, so that relaunching the app is all
// it takes to try again after the user has plugged a card back in or restored
// something from a bin.
const searchedFor = new Set();

/**
 * Records what can be learned about a file without reading it.
 *
 * Called on the import path, so it must stay cheap — the hash comes later, in
 * hashPendingIdentities. Never throws: an import that worked must not fail
 * because the extra bookkeeping did.
 */
export const captureIdentity = async (itemId, uri) => {
  if (itemId == null || !isContentUri(uri)) return;

  try {
    const identity = await FileMeta.readIdentity(uri);
    await saveDeviceFileIdentity(itemId, {
      mediaStoreId: identity?.mediaStoreId ?? null,
      displayName: identity?.displayName ?? null,
      size: identity?.size ?? null,
      durationMs: identity?.durationMs ?? null,
      modifiedAt: identity?.modifiedAt ?? null,
    });
  } catch (error) {
    console.warn('Could not record file identity:', error?.message);
  }
};

/**
 * Takes a file's whole identity straight away, hash included.
 *
 * For a uri whose grant dies with the task — a share, an "open with" from a
 * file manager that offered nothing lasting. The background pass would be too
 * late for these: it runs when the Device list is next built, and a user who
 * shares a lecture in, listens, and closes the app never reaches that point.
 * By then the bytes are unreachable and the file can never be recognised
 * again.
 *
 * Cheap enough to do inline now that the fingerprint samples rather than reads
 * everything — well under a megabyte, whatever the file's size.
 *
 * Fire and forget. Nothing about playing a file should wait on bookkeeping.
 */
export const identifyNow = async (itemId, uri) => {
  try {
    await captureIdentity(itemId, uri);
    const hash = await FileMeta.hashFile(uri);
    if (hash) await saveDeviceFileHash(itemId, hash);
  } catch (error) {
    console.warn('Could not identify now:', error?.message);
  }
};

/**
 * Moves a few files closer to being identifiable, and resolves to how many were
 * finished.
 *
 * Deliberately a trickle rather than a sweep. Each of these reads a whole file,
 * and a library of lectures is many gigabytes; hashing all of it the first time
 * the app opens would cost the user a hot phone and a flat battery to prepare
 * for something that may never happen.
 *
 * The order is oldest first, so a file that has been in the library longest —
 * and has had the most time to accumulate notes worth not losing — is protected
 * first.
 *
 * Only files still readable are attempted. The identity has to be taken while
 * the file is still there; that is the entire point of taking it in advance.
 */
export const hashPendingIdentities = async (limit = 3) => {
  let pending;
  try {
    pending = await getUnhashedDeviceFiles(limit);
  } catch (error) {
    return 0;
  }
  if (!pending.length) return 0;

  let hashed = 0;
  for (const row of pending) {
    try {
      if (!(await mediaExists(row.filePath))) continue;

      // Imported before any of this existed, so there is nothing recorded at
      // all. The cheap half has to be taken before the expensive one, because
      // a hash with no size beside it cannot be searched by.
      if (!row.hasMeta) {
        await captureIdentity(row.itemId, row.filePath);
      }

      const hash = await FileMeta.hashFile(row.filePath);
      if (!hash) continue;

      await saveDeviceFileHash(row.itemId, hash);
      hashed++;
      console.log(`🔑 Identified ${row.title}`);
    } catch (error) {
      console.warn(`Could not hash ${row.title}:`, error?.message);
    }
  }

  return hashed;
};

/**
 * The item this file already is, or null if it is new.
 *
 * Importing the same recording twice used to make a second row with its own
 * source_id, and everything that hangs off a row hangs off that: the notes
 * written against it, the minutes watched, the category it was filed in. A
 * lecture shared in again a month later came back as a stranger.
 *
 * Size and duration do the looking, so the ordinary case — a genuinely new
 * file — costs one indexed query and reads nothing. Only when something of the
 * same length already exists is anything hashed, and then it is decisive: two
 * files are the same file when their fingerprints agree, and never otherwise.
 *
 * A candidate with no fingerprint yet gets one taken now. It may be unreadable
 * — the point of all this is that addresses go stale — and an unreadable
 * candidate is simply skipped, because a missed match costs a duplicate row
 * while a wrong match costs somebody's notes.
 */
export const findDuplicateDeviceFile = async uri => {
  if (!isContentUri(uri)) return null;

  let identity;
  try {
    identity = await FileMeta.readIdentity(uri);
  } catch (error) {
    return null;
  }
  if (!identity?.size) return null;

  let candidates;
  try {
    candidates = await findIdentityCandidates({
      size: identity.size,
      durationMs: identity.durationMs || 0,
    });
  } catch (error) {
    return null;
  }
  if (!candidates.length) return null;

  let incomingHash;
  try {
    incomingHash = await FileMeta.hashFile(uri);
  } catch (error) {
    return null;
  }
  if (!incomingHash) return null;

  for (const candidate of candidates) {
    let hash = candidate.contentHash;

    if (!hash && candidate.filePath) {
      try {
        hash = await FileMeta.hashFile(candidate.filePath);
        if (hash) await saveDeviceFileHash(candidate.itemId, hash);
      } catch (error) {
        hash = null;
      }
    }

    if (hash && hash === incomingHash) {
      return {itemId: candidate.itemId, sourceId: candidate.sourceId};
    }
  }

  return null;
};

/**
 * Tries to find one item's file again and re-point the row at it.
 *
 * Resolves to the new uri, or null when the file could not be found — which is
 * the common case and not an error: the file may genuinely be deleted, or sit
 * somewhere MediaStore does not index, or have been imported before identities
 * were recorded at all.
 *
 * Needs the media permission, because the search is a MediaStore query. Asked
 * for rather than assumed, and a refusal simply means no repair.
 */
export const repairDeviceFile = async (item, {retry = false} = {}) => {
  if (item?.id == null || item?.type !== 'device_file') return null;
  if (!retry && searchedFor.has(item.id)) return null;
  searchedFor.add(item.id);

  let meta;
  try {
    meta = await getDeviceFileMeta(item.id);
  } catch (error) {
    return null;
  }
  // Nothing recorded, or recorded before the file could be read. There is
  // nothing to search by, and searching by title alone is exactly the guess
  // this module exists to avoid.
  if (!meta?.contentHash || !meta.size) return null;

  if (!(await ensureMediaReadPermission())) return null;

  let found;
  try {
    found = await FileMeta.findByContentHash(
      meta.contentHash,
      meta.size,
      // Falls back to the duration the player measured, in seconds, when
      // MediaStore never gave us one — a file picked through a document
      // provider has no duration column to read at import, but anything that
      // has been played once has been timed.
      meta.durationMs || (item.duration ? item.duration * 1000 : 0),
      item.mimeType || '',
    );
  } catch (error) {
    return null;
  }
  if (!found || found === item.file_path) return null;

  try {
    await updateItemFields(item.id, {file_path: found});
    // Found, so it is no longer a lost cause: if this one goes missing again
    // it deserves a fresh search rather than the memory of an old failure.
    searchedFor.delete(item.id);
    // The uri changed, so the id that goes with it did too. Written back so the
    // next repair can take the cheap path before the expensive one.
    const identity = await FileMeta.readIdentity(found).catch(() => null);
    await saveDeviceFileIdentity(item.id, {
      mediaStoreId: identity?.mediaStoreId ?? null,
      displayName: identity?.displayName ?? null,
      size: identity?.size ?? meta.size,
      durationMs: identity?.durationMs ?? meta.durationMs ?? null,
      modifiedAt: identity?.modifiedAt ?? null,
    });
    console.log(`🔗 Repaired ${item.title} → ${found}`);
    return found;
  } catch (error) {
    console.warn('Could not re-point the row:', error?.message);
    return null;
  }
};

/**
 * Repairs whichever of these files can be repaired, and resolves to the ones
 * that were.
 *
 * Sequential on purpose. Each repair may read several candidate files to the
 * end, and running that in parallel across a list would turn a quiet background
 * fix into the app apparently locking up.
 */
export const repairMissingDeviceFiles = async missing => {
  const repaired = [];

  for (const item of missing) {
    const path = await repairDeviceFile(item);
    if (path) repaired.push({sourceId: item.source_id, filePath: path});
  }

  return repaired;
};
