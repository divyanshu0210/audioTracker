// noteMedia.js
//
// The media half of a shared note.
//
// A note taken against a lecture is mostly timestamps, and a timestamp is a
// seek into a specific recording — on its own it is a number with nothing to
// point at. Until now a bundle carried only the note, so every one of those
// buttons landed in a "Shared Notes" notebook with no player behind it. This
// module is the two ends of the missing half: what to write into the bundle so
// the recipient can reach the same recording (describeNoteMedia), and what to
// create on the way in so the note re-attaches to it (ensureMediaItem).
//
// Nothing here copies the media itself. Every type the app holds already has
// somewhere the recipient can reach it from — a video id, a Drive id, a site
// path — and a note bundle that inlined a lecture would be a hundred megabytes
// travelling through a chat app. Device files are the one type with no such
// place, and they borrow the one share/shareDeviceFile already builds: a copy
// in the sender's Drive, whose id is what the bundle carries.

import {
  getItemBySourceId,
  upsertItem,
  upsertYoutubeMeta,
} from '../../database/C';
import {getDriveCopyId, saveDriveCopy} from '../../database/sharedDriveCopies';
import {ITEM_TYPES_THAT_USE_ITEMS_TABLE} from '../../contexts/constants';
import {getShareLink} from '../../Linking/utils/shareLink';

// A note's source_type is either 'notebook' or one of the item types, so this
// is also the test for "is this note attached to media at all".
const isMediaSourceType = type => ITEM_TYPES_THAT_USE_ITEMS_TABLE.includes(type);

// Why a note went out without its media. Reported to the sender, who is the
// only one who can do anything about it — the recipient just sees a note.
export const MEDIA_NOT_SHARED = 'device-file-not-shared';
export const MEDIA_MISSING = 'item-missing';

/**
 * Builds the media descriptor for a note, or explains why there isn't one.
 *
 * Returns {media} when the recipient will be able to reach the recording,
 * {reason} when they won't, and null for a note that was never attached to
 * media in the first place (a notebook note has nothing to describe).
 *
 * The descriptor is deliberately everything needed to rebuild the row without
 * a network call: an import that had to ask YouTube for a title would fail
 * offline, and fail differently again for a video that has since gone private.
 */
export const describeNoteMedia = async note => {
  const type = note?.source_type;
  if (!type || !isMediaSourceType(type)) return null;

  const item = await getItemBySourceId(note.source_id, type);
  // The note outlives the item it was taken against — a deleted or
  // never-restored row leaves the note pointing at nothing.
  if (!item) return {reason: MEDIA_MISSING};

  const media = {
    type,
    source_id: item.source_id,
    title: item.title || '',
    mimeType: item.mimeType || null,
    duration: item.duration || null,
  };

  if (type === 'youtube_video' || type === 'youtube_playlist') {
    // Carried rather than derived so the recipient's card looks like the
    // sender's without a Data API call (and without an API key).
    media.channel_title = item.channel_title || null;
    media.thumbnail = item.thumbnail || null;
    return {media};
  }

  if (type === 'iskcon_file') {
    // The exact url when the row still has one, rebuilt from the site path
    // when a download has overwritten file_path — getShareLink knows the
    // difference, and the url is what makes the file streamable on arrival.
    media.url = getShareLink(item);
    return {media};
  }

  if (type === 'device_file') {
    // The file came off the sender's phone. It is reachable only if they have
    // already uploaded a copy — see share/shareDeviceFile.
    const driveFileId = await getDriveCopyId(item.id);
    if (!driveFileId) return {reason: MEDIA_NOT_SHARED, item};
    media.drive_file_id = driveFileId;
    return {media};
  }

  // Drive files and folders: source_id is the Drive id, which is the whole
  // address. Whether the recipient may open it is between them and the file's
  // sharing settings, and the app already has a Request Access flow for when
  // they may not.
  return {media};
};

/**
 * Normalises a descriptor read back out of a file.
 *
 * Same reasoning as parseNoteBundle's per-field normalisation: a bundle is
 * plain JSON that anything could have written, and an unknown `type` would
 * fail the items table's CHECK constraint deep inside an insert. Returns null
 * for anything unusable, which lands the note in the notebook instead.
 */
export const parseMediaDescriptor = media => {
  if (!media || typeof media !== 'object') return null;
  if (!isMediaSourceType(media.type)) return null;
  if (typeof media.source_id !== 'string' || !media.source_id) return null;

  return {
    type: media.type,
    source_id: media.source_id,
    title: typeof media.title === 'string' ? media.title : '',
    mimeType: typeof media.mimeType === 'string' ? media.mimeType : null,
    duration: typeof media.duration === 'number' ? media.duration : null,
    url: typeof media.url === 'string' ? media.url : null,
    channel_title:
      typeof media.channel_title === 'string' ? media.channel_title : null,
    thumbnail: typeof media.thumbnail === 'string' ? media.thumbnail : null,
    drive_file_id:
      typeof media.drive_file_id === 'string' ? media.drive_file_id : null,
  };
};

/**
 * Creates the item a bundled note was taken against, and returns the row to
 * anchor the note to.
 *
 * Created hidden — out_show and in_show both 0 — which is the whole point.
 * Someone who opens a shared note is accepting a note, not adding a lecture to
 * their library, and a file appearing uninvited in their Device or YouTube tab
 * is not something they asked for. The row exists so the note has something to
 * point at: it joins for the note's relatedItem, it opens in the player when
 * the note is tapped, and its timestamps seek. It simply never appears in a
 * list. The root list query is `items.out_show = 1`, and a folder listing goes
 * by parent_id, which is null here — so nothing lists it either way.
 *
 * An existing row is left exactly as it is. The recipient may already have
 * this video with their own notes and watch history on it, and an arriving
 * note is not a reason to change anything about how they hold it — least of
 * all to unhide something they had removed from a tab.
 */
export const ensureMediaItem = async media => {
  const existing = await getItemBySourceId(media.source_id, media.type);

  let item =
    existing ??
    (await upsertItem({
      source_id: media.source_id,
      type: media.type,
      title: media.title,
      mimeType: media.mimeType,
      duration: media.duration,
      // An iskcon file is streamable from its url the moment the row exists,
      // which is exactly what ensureDbItem stores for a file that has never
      // been downloaded. Drive and device files have no url the player can
      // take, so they stay pathless until a download lands.
      file_path: media.type === 'iskcon_file' ? media.url : null,
      out_show: 0,
      in_show: 0,
    }));

  if (!item) throw new Error('Could not save the media this note belongs to');

  if (
    (media.type === 'youtube_video' || media.type === 'youtube_playlist') &&
    !item.thumbnail
  ) {
    // Only when there isn't one already: overwriting the recipient's own meta
    // with a copy of ours would be a change they never asked for, and for a
    // video the thumbnail url is derivable from the id anyway.
    const thumbnail =
      media.thumbnail ||
      (media.type === 'youtube_video'
        ? `https://img.youtube.com/vi/${media.source_id}/mqdefault.jpg`
        : null);
    try {
      item = await upsertYoutubeMeta({
        item_id: item.id,
        channel_title: media.channel_title,
        thumbnail,
      });
    } catch (error) {
      // A card without a thumbnail still plays. Losing the whole import over
      // one would not be a trade worth making.
      console.error('Could not save youtube meta for imported media:', error);
    }
  }

  if (media.type === 'device_file' && media.drive_file_id) {
    // The recipient has the row but not the bytes — exactly the state a
    // restore leaves behind, which is why offerSharedCopyDownload already
    // knows how to get them. It reads the copy id from here.
    //
    // The copy belongs to the sender, not to whoever is importing. That only
    // matters on delete, where removeSharedCopy tries to trash it: the copy is
    // shared as `reader`, so the request fails, is caught and logged, and the
    // local mapping is dropped — a recipient cannot destroy the sender's file
    // by deleting their own row.
    try {
      await saveDriveCopy(item.id, media.drive_file_id);
      item = {...item, drive_file_id: media.drive_file_id};
    } catch (error) {
      console.error('Could not record the shared Drive copy:', error);
    }
  }

  return item;
};
