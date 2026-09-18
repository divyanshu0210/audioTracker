import axios from 'axios';
import {Alert, Linking, ToastAndroid} from 'react-native';
import {YOUTUBE_API_KEY} from '@env';
import {
  getItemBySourceId,
  upsertItem,
  upsertYoutubeMeta,
} from '../../database/C';
import RNFS from 'react-native-fs';
import {pick, types} from '@react-native-documents/picker';
import {durableUriFor} from '../../utils/mediaFile';
import {
  findDuplicateDeviceFile,
  identifyNow,
} from '../../utils/fileIdentity';
import {NativeModules} from 'react-native';
import {addItemToCategory} from '../../categories/catDB';
import useDbStore from '../../database/dbStore';
import {updateItemFields} from '../../database/U';
import { getGoogleAccessToken } from '../../auth/tokenManager';
import { navigationRef } from '../../handlers/navigationRef';
import {StackActions} from '@react-navigation/native';

const {FileMeta} = NativeModules;
const {setInserting} = useDbStore.getState();

// Who asked for this item, which decides all three of: whether it joins the
// root list, whether it is filed into a category, and where we navigate.
//
// The distinction that matters is not link-vs-share — those are the same act
// arriving through two Android APIs — but whether the app or the outside world
// started it. A link the user pasted into the FAB is a decision to keep
// something; a link fired at us from another app is not, and used to be
// treated as one.
//
// APP is the default so that any caller which doesn't say keeps the behaviour
// it has always had.
export const LinkOrigin = {
  APP: 'app', // in-app paste / FAB — deliberate, so it joins the list
  EXTERNAL: 'external', // link or share intent — opens, saves nothing
  ASSIGNMENT: 'assignment', // mentor-pushed — filed under the mentor, never navigates
};

// Whether an arriving item should appear in the mentee's own tabs.
//
// External and assignment both mean "someone else put this in front of you",
// and neither is a decision to add it to your library. An external link shows
// on the Add bar until accepted; an assignment is filed under the mentor who
// sent it and shows when that mentor is selected. Either way the row exists so
// it can play, be watched into history and carry notes - it just is not in the
// Device/YouTube/Drive lists uninvited. Same reasoning as
// notes/share/noteMedia.js, which hides shared-note media for the same reason.
const isUnsolicited = origin =>
  origin === LinkOrigin.EXTERNAL || origin === LinkOrigin.ASSIGNMENT;

const ALREADY_IN_LIST = {
  youtube_playlist: 'Playlist already in your list',
  youtube_video: 'Video already in your list',
  drive_folder: 'Folder already in your list',
  drive_file: 'File already in your list',
};

// Only for something that is actually in the list. A row at out_show 0 is one
// the user has seen before and didn't keep — saying "already exists" about it
// would contradict the Add bar sitting right there offering to add it.
const announceIfInList = item => {
  if (item?.out_show !== 1) return;
  ToastAndroid.show(
    ALREADY_IN_LIST[item.type] ?? 'Already in your list',
    ToastAndroid.SHORT,
  );
};

// Where an externally-opened item goes: the thing itself, never a tab.
//
// A container opens in its viewer rather than being dropped into a list the
// user then has to find it in — which is what the Drive and YouTube tab
// navigations below do for the in-app paths, and which would say nothing at
// all now that external items no longer appear in those lists.
//
// GoogleDriveViewer is pushed rather than navigated to: it builds folderStack
// from driveInfo once, at mount, so navigating to an instance already on the
// stack would show the previous folder's contents under the new folder's
// params. BaseItem pushes for the same reason.
const openExternalItem = item => {
  if (item.type === 'youtube_playlist') {
    navigationRef.navigate('PlaylistView', {
      playListId: item.source_id,
      playListInfo: item,
    });
    return;
  }
  if (item.type === 'drive_folder') {
    navigationRef.dispatch(
      StackActions.push('GoogleDriveViewer', {driveInfo: item}),
    );
    return;
  }
  // Videos and single files play. A drive_file has no file_path until it is
  // downloaded, which lands on MediaUnavailable — that screen recognises
  // drive_file and offers the download, so this is a working destination.
  navigationRef.navigate('BacePlayer', {item});
};
// YouTube hangs the playlist context off `list=` even when the user shared a
// single video, so a shared watch URL carries both ids. `list=` used to be
// matched first and win outright, which threw the video away: sharing from
// Watch Later hands over `watch?v=<id>&list=WL`, WL is a per-account list the
// Data API never resolves, and the paste then saved nothing at all without
// saying so. Mixes (`list=RD…`) failed the same way.
//
// The video wins whenever the URL names one — a `watch?v=` link is a video link
// and the list is only the context it happened to be playing in. Sharing from a
// playlist *page* gives `playlist?list=…` with no `v=`, and that still adds the
// playlist; that's the way to add one.
export const extractLinkType = url => {
  const videoMatch = url.match(
    /(?:\?v=|&v=|\/embed\/|\/vi\/|\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{11})/,
  );
  const liveMatch = url.match(/youtube\.com\/live\/([0-9A-Za-z_-]{11})/);
  const videoId = videoMatch?.[1] ?? liveMatch?.[1] ?? null;
  if (videoId) return {type: 'youtube_video', id: videoId};

  const playlistMatch = url.match(/[?&]list=([0-9A-Za-z_-]+)/);
  if (playlistMatch) return {type: 'youtube_playlist', id: playlistMatch[1]};

  const driveMatch = url.match(
    /(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=|drive\/folders\/))([-_0-9A-Za-z]{20,})(?:[/?]|$)/,
  );
  if (driveMatch) return {type: 'google_drive', id: driveMatch[1]};

  return null;
};

// Awaited, and with its own catch.
//
// The YouTube paths used to fire this and walk away. A rejection then became an
// unhandled promise that nothing reported, so the item was added, prepended to
// the list by setItems — which is why it looked like it worked — and had no
// row in category_items at all. The next refresh reads the list back through
// getCategoryData and the item is simply gone.
//
// Logged rather than rethrown: the item itself was added successfully, and
// turning a category miss into "Failed to fetch YouTube data" would report the
// wrong failure.
const addToSelectedCategory = async (selectedCategory, item) => {
  if (selectedCategory == null || !item) return;
  try {
    await addItemToCategory(selectedCategory, item.source_id, item.type);
  } catch (error) {
    console.error(
      `Could not add ${item.type} ${item.source_id} to category ${selectedCategory}:`,
      error,
    );
  }
};

export const handleLinkSubmit = async (
  inputLink,
  {
    setDriveLinksList,
    setItems,
    setDeviceFiles,
    selectedCategory = null,
    origin = LinkOrigin.APP,
  },
) => {
  setInserting(true);
  const extracted = extractLinkType(inputLink);
  try {
    if (!extracted) {
      await handleDeviceFileFromUri(
        inputLink,
        setDeviceFiles,
        selectedCategory,
        origin,
      );
      return;
    }

    if (extracted.type === 'google_drive') {
      await handleDriveLink(
        extracted.id,
        setDriveLinksList,
        selectedCategory,
        origin,
      );
    } else {
      await fetchYTData(extracted, setItems, selectedCategory, origin);
    }
  } finally {
    console.log('Stopping loader...');
    setInserting(false); // Move to finally block to ensure it always runs
  }
};

export const fetchYTData = async (
  extracted,
  setItems,
  selectedCategory,
  origin = LinkOrigin.APP,
) => {
  const external = origin === LinkOrigin.EXTERNAL;
  try {
    const {id, type} = extracted;
    const existingItem = await getItemBySourceId(id, type);
    if (existingItem) {
      // Nothing is written here on the external path. A link arriving from
      // outside is not a statement about how the user holds this item: if they
      // already keep it, re-sharing must not reorder or re-file it, and if they
      // once dismissed it, re-sharing must not bring it back on its own. It
      // opens, and the Add bar on the destination is what changes anything.
      if (external) {
        announceIfInList(existingItem);
        openExternalItem(existingItem);
        return;
      }

      // out_show is left alone for an assignment: the mentee may already keep
      // this video, and being assigned it is no reason to change that - in
      // either direction. Only the category link below is added.
      //
      // The existing row is reused rather than asking for an empty update:
      // updateItemFields resolves to null when handed no fields, which left
      // updatedItem null and silently skipped the category link below - the
      // one thing an assignment for an already-held video has to do.
      const updatedItem =
        origin === LinkOrigin.ASSIGNMENT
          ? existingItem
          : await updateItemFields(existingItem.id, {out_show: 1});

      // An assignment does not reorder a list the mentee curated.
      if (origin !== LinkOrigin.ASSIGNMENT) {
        setItems(prev => {
          const filtered = prev.filter(item => item.source_id !== id);
          return [updatedItem, ...filtered];
        });
      }

      await addToSelectedCategory(selectedCategory, updatedItem);

      if (type === 'youtube_video' && origin === LinkOrigin.APP) {
        navigationRef.navigate('BacePlayer', {item: updatedItem});
      }

      console.log('✅ Item existed → updated out_show only');
      return;
    }

    // 🔹 2. Not existing properly → fetch from API
    if (type === 'youtube_video') {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${id}&key=${YOUTUBE_API_KEY}`,
      );

      const video = response.data.items[0]?.snippet;
      if (!video) {
        Alert.alert(
          'Nothing to add',
          'This video is private or unavailable, so it could not be added.',
        );
        return;
      }

      const savedItem = await upsertItem({
        source_id: id,
        type: 'youtube_video',
        title: video.title,
        parent_id: null,
        out_show: isUnsolicited(origin) ? 0 : 1,
      });

      const fullItem = await upsertYoutubeMeta({
        item_id: savedItem.id,
        channel_title: video.channelTitle,
        thumbnail: `https://img.youtube.com/vi/${savedItem.source_id}/mqdefault.jpg`,
      });

      if (external) {
        openExternalItem(fullItem);
        return;
      }

      // out_show alone is not enough: these store lists *are* the tabs until
      // the next reload, so prepending here would show the item anyway and it
      // would silently vanish on the next refresh.
      if (!isUnsolicited(origin)) {
        setItems(prev => {
          const filtered = prev.filter(item => item.source_id !== id);
          return [fullItem, ...filtered];
        });
      }

      await addToSelectedCategory(selectedCategory, fullItem);

      if (origin === LinkOrigin.APP) {
        navigationRef.navigate('BacePlayer', {item: fullItem});
      }
    } else if (type === 'youtube_playlist') {
      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${id}&key=${YOUTUBE_API_KEY}`,
      );

      const playlist = response.data.items[0]?.snippet;
      if (!playlist) {
        // A deleted playlist, or one that isn't public. Used to return in
        // silence while the finally block still bounced to the YouTube tab,
        // so a failed paste looked exactly like a successful one.
        Alert.alert(
          'Nothing to add',
          'This playlist is private or unavailable, so it could not be added.',
        );
        return;
      }

      const savedItem = await upsertItem({
        source_id: id,
        type: 'youtube_playlist',
        title: playlist.title,
        parent_id: null,
        out_show: isUnsolicited(origin) ? 0 : 1,
      });

      const fullItem = await upsertYoutubeMeta({
        item_id: savedItem.id,
        channel_title: playlist.channelTitle,
        thumbnail: playlist.thumbnails?.medium?.url ?? null,
      });

      if (external) {
        openExternalItem(fullItem);
        return;
      }

      // out_show alone is not enough: these store lists *are* the tabs until
      // the next reload, so prepending here would show the item anyway and it
      // would silently vanish on the next refresh.
      if (!isUnsolicited(origin)) {
        setItems(prev => {
          const filtered = prev.filter(item => item.source_id !== id);
          return [fullItem, ...filtered];
        });
      }

      await addToSelectedCategory(selectedCategory, fullItem);
    }
  } catch (error) {
    console.error('YT Fetch Error:', error);
    Alert.alert('Error', 'Failed to fetch YouTube data.');
  } finally {
    // Only the in-app paste lands on the tab. External opens have already
    // navigated to the playlist itself, and an assignment sync runs this in a
    // loop — it used to fire one navigation per assignment.
    if (extracted.type === 'youtube_playlist' && origin === LinkOrigin.APP) {
      navigationRef.navigate('HomeScreen', {screen: 'YouTube'});
    }
  }
};

export const handleDriveLink = async (
  driveId,
  setDriveLinksList,
  selectedCategory,
  origin = LinkOrigin.APP,
) => {
  const external = origin === LinkOrigin.EXTERNAL;
  try {
    const accessToken = await getGoogleAccessToken();

    // Fetch basic metadata from Drive API
    const response = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${driveId}?fields=name,mimeType`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const itemName = response.data.name || 'Unknown';
    const mimeType = response.data.mimeType;
    const isFolder = mimeType === 'application/vnd.google-apps.folder';
    const itemType = isFolder ? 'drive_folder' : 'drive_file';

    // ────────────────────────────────────────────────
    // 1. Check if item already exists in local DB
    // ────────────────────────────────────────────────
    const existingItem = await getItemBySourceId(driveId, itemType);

    if (existingItem) {
      // The name is synced either way — a folder renamed on Drive is a fact
      // about the folder, not a change to how the user holds it. Visibility is
      // the part an external link may not touch.
      const updatedItem = await updateItemFields(
        existingItem.id,
        isUnsolicited(origin)
          ? {title: itemName}
          : {
              out_show: 1,
              title: itemName, //sync name if it changed
            },
      );

      if (external) {
        announceIfInList(updatedItem);
        openExternalItem(updatedItem);
        return;
      }

      // Move to top: remove old entry → prepend updated one. An assignment
      // does not reorder a list the mentee curated.
      if (origin !== LinkOrigin.ASSIGNMENT) {
        setDriveLinksList(prev => {
          const filtered = prev.filter(i => i.source_id !== driveId);
          return [updatedItem, ...filtered];
        });
      }

      if (selectedCategory != null) {
        await addItemToCategory(selectedCategory, updatedItem.source_id, updatedItem.type);
      }

      console.log('✅ Drive item existed → updated out_show only');
    } else {
      // ────────────────────────────────────────────────
      // 2. New item → create in DB
      // ────────────────────────────────────────────────
      const savedItem = await upsertItem({
        source_id: driveId,
        type: itemType,
        title: itemName,
        parent_id: null,
        mimeType: mimeType,
        file_path: null, // only relevant for files maybe
        out_show: isUnsolicited(origin) ? 0 : 1,
      });

      if (external) {
        openExternalItem(savedItem);
        return;
      }

      // Move to top - but not for something the user did not ask for; see
      // the note on the youtube path above.
      if (!isUnsolicited(origin)) {
        setDriveLinksList(prev => {
          const filtered = prev.filter(i => i.source_id !== driveId);
          return [savedItem, ...filtered];
        });
      }

      if (selectedCategory != null) {
        await addItemToCategory(selectedCategory, savedItem.source_id, savedItem.type);
      }

      console.log('✅ Created new drive', isFolder ? 'folder' : 'file');
    }

    // Navigate (existing & new alike). External opens returned above, and an
    // assignment sync must not throw the user onto a tab mid-loop.
    if (origin === LinkOrigin.APP) {
      navigationRef.navigate('HomeScreen', {screen: 'Drive'});
    }
  } catch (error) {
    console.error('Drive handle error:', error);

    if (error.response?.status === 403 || error.response?.status === 404) {
      Alert.alert(
        'Access Denied',
        'You need permission to access this file/folder. Request access or try with a different account.',
        [
          {
            text: 'Request Access',
            onPress: () => requestDriveAccess(driveId),
          },
          {text: 'OK'},
        ],
      );
    } else {
      Alert.alert('Error', 'Failed to fetch Google Drive data.');
    }
  }
};

const requestDriveAccess = async driveId => {
  try {
    // This will open the permission request page in browser
    Linking.openURL(
      `https://drive.google.com/file/d/${driveId}/view?usp=sharing`,
    );
  } catch (error) {
    console.error('Error opening permission request:', error);
  }
};

export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
export const getFileMeta = async uri => {
  try {
    const meta = await FileMeta.getMeta(uri);
    return meta;
  } catch (error) {
    console.error('Failed to get file metadata:', error);
    return {name: `file_${Date.now()}`, mime: 'application/octet-stream'};
  }
};
export const isAudioOrVideo = mimeType => {
  return (
    typeof mimeType === 'string' &&
    (mimeType.startsWith('audio/') || mimeType.startsWith('video/'))
  );
};

export const isAudioFile = fileName => {
  const audioExtensions = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma'];
  const ext = fileName.split('.').pop().toLowerCase();
  return audioExtensions.includes(ext);
};

export const extractFileId = url => {
  const match = url.match(/[-\w]{25,}/);
  return match ? match[0] : null;
};

// Where shared files used to wait while the user decided whether to keep one.
//
// Nothing is written here any more — see handleSharedDeviceFile — but rows
// created by earlier versions still point into it, and saveItemToList still
// knows how to promote one of those, so the path has to stay recognisable.
const SHARED_CACHE_DIR = `${RNFS.ExternalCachesDirectoryPath}/shared`;

export const isInSharedCache = path => !!path?.startsWith(`${SHARED_CACHE_DIR}/`);

// A file shared in from another app, played straight from the uri it arrived
// on. Nothing is copied.
//
// It used to be copied to a scratch file first, for a reason that no longer
// holds: the player could not open a content: uri at all. Its JS wrapper flags
// the scheme as a network source and hands it to
// `new Media(libvlc, Uri.parse(...))`, which prefixes file:// and looks for a
// literal path, so the MRL came out as `file:////content%3A//...` and the open
// failed while the player sat at 00:00. The loopback proxy resolves the uri
// now (see src/music/driveStream.js), so there is nothing left for the copy to
// solve at this point.
//
// What it buys is the whole cost of the file. Sharing a 2GB video in from a
// chat to watch once wrote 2GB to the cache before playback could even begin;
// now it starts immediately and writes nothing.
//
// The grant question is deferred rather than answered. An ACTION_SEND uri is
// not persistable — takePersistableUriPermission needs a flag Android only
// attaches to SAF results — so it dies with the task, and this row is
// out_show 0 precisely because it is not something the user has decided to
// keep. Deciding to keep it is what reads the bytes, in saveItemToList, while
// the grant is still alive.
const handleSharedDeviceFile = async ({uri, name, type}) => {
  // Without prompting. A file shared in to be watched once should not put a
  // permission dialog in front of someone who only tapped play — but if the
  // permission is already held, the MediaStore uri costs one query and is worth
  // having, because it is the difference between this row working tomorrow and
  // dying with the task.
  // A share is the one arrival with no durable answer of its own when the
  // sender attached no grant, so the MediaStore address matters most here —
  // it is what keeps the recording playable after a reinstall.
  const durable = await durableUriFor(uri);

  // The same lecture shared in a second time is the same lecture. Reusing the
  // row is what keeps the notes taken on it and the progress through it, rather
  // than starting the user over on a file they are halfway through.
  const existing = await findDuplicateDeviceFile(durable || uri);
  if (existing) {
    // Only the address. A share is not a decision to keep anything, so a row
    // the user had deleted stays deleted and out of the list — it simply plays,
    // exactly as an external YouTube or Drive link does.
    const revived = await updateItemFields(existing.itemId, {
      file_path: durable || uri,
    });
    navigationRef.navigate('BacePlayer', {item: revived});
    console.log(`♻️ Reopened ${name} as the copy already in the library`);
    return;
  }

  const fullItem = await upsertItem({
    source_id: generateUUID(),
    type: 'device_file',
    title: name,
    mimeType: type,
    file_path: durable || uri,
    out_show: 0,
    in_show: 0,
  });

  // Identified in full, hash and all, rather than left for the background pass.
  // A shared uri that could not be made durable is readable only while this
  // task lives, so this is the single moment its fingerprint can be taken —
  // and that fingerprint is the only thing that will find the file again once
  // the grant lapses. Not awaited: playing must not wait on it.
  identifyNow(fullItem.id, durable || uri);

  navigationRef.navigate('BacePlayer', {item: fullItem});
  console.log(
    durable
      ? `✅ Opened shared ${name}, kept durable at ${durable}`
      : `✅ Opened shared ${name} in place from ${uri}`,
  );
};

const handleDeviceFileFromUri = async (
  uri,
  setDeviceFiles,
  selectedCategory,
  origin = LinkOrigin.APP,
) => {
  try {
    if (!uri || !uri.startsWith('content://')) {
      // setInserting(false);
      Alert.alert('Invalid URL');
      return;
    }

    const {name: fileName, mime: mimeType} = await getFileMeta(uri);

    if (!isAudioOrVideo(mimeType)) {
      // Reached more often since audioTracker started appearing in "Open with"
      // for files of unknown type — the only way Android will offer it for a
      // .atnote bundle out of Downloads (see the manifest). So this says what
      // the app does take, instead of blaming the URL for being invalid.
      //
      // The settings button is for the one way that filter can really bite: a
      // user who picked "Always" in the chooser now has every unknown file
      // opening audioTracker, and there is no API to undo that from here —
      // only the app's own details page can clear a default. Whoever is stuck
      // in that loop is looking at this alert every time, so the way out
      // belongs on it rather than in a support answer they never read.
      Alert.alert(
        'Unsupported file',
        'audioTracker opens audio and video files, and .atnote note files.\n\n' +
          'If Android keeps opening files like this one with audioTracker, ' +
          'clear its default under "Open by default" in app settings.',
        [
          {text: 'OK', style: 'cancel'},
          {text: 'App settings', onPress: () => Linking.openSettings()},
        ],
      );
      return;
    }

    if (origin === LinkOrigin.EXTERNAL) {
      await handleSharedDeviceFile({uri, name: fileName, type: mimeType});
      return;
    }

    await handleFileProcessing(
      {uri, name: fileName, type: mimeType},
      setDeviceFiles,
      selectedCategory,
      'player',
    );
  } catch (err) {
    console.error('❌ Failed to handle file from URI:', err);
    Alert.alert('Error', 'Could not import file from URI');
  }
};

// Names come straight from the picker's DISPLAY_NAME and end up in a path that
// RNFS hands to Uri.parse('file://' + path), where '#', '?' and '%' are read as
// URI syntax rather than as part of the name.
const sanitizeFileName = name => name.replace(/[\\/:*?"<>|#%\r\n]/g, '_');

// Exported because a Drive copy pulled back down after a restore has to land
// where an import would have put it, sanitised and de-duplicated the same way.
export const resolveDestPath = async (fileName, uuid) => {
  if (!RNFS.ExternalDirectoryPath) {
    throw new Error('External storage is unavailable');
  }

  const safeName = sanitizeFileName(fileName);
  const dot = safeName.lastIndexOf('.');
  const base = dot > 0 ? safeName.slice(0, dot) : safeName;
  const ext = dot > 0 ? safeName.slice(dot) : '';
  const destPath = `${RNFS.ExternalDirectoryPath}/${base}${ext}`;

  // A taken name used to mean "already imported, skip the copy". Display names
  // collide constantly on a real device (recording.mp3, VID_20240101.mp4), so
  // the second file got a row pointing at the first one's bytes and played the
  // wrong thing, with no error anywhere. Give it a path of its own instead.
  if (await RNFS.exists(destPath)) {
    return `${RNFS.ExternalDirectoryPath}/${base}_${uuid}${ext}`;
  }
  return destPath;
};

// Where an imported file's bytes will be read from, and the single decision
// that makes an import cost storage or not.
//
// A uri whose grant was persisted is kept exactly as it is: the file stays
// where the user keeps it, and plays through the loopback proxy because the
// player cannot open a content: uri itself (see src/music/driveStream.js).
// Every import used to be copied into the app's own storage instead, so a 2GB
// video already on the phone cost 4GB once it was in the app.
//
// bookmarkStatus is the picker's own report of whether
// takePersistableUriPermission went through, which is a different thing from
// having asked for it: a provider can refuse.
//
// A uri that arrived on an intent instead — an "open with" — carries no such
// report, and some senders do attach the persistable flag even though most do
// not. The only way to find out is to try, so it is tried: winning means one
// more file the app never has to copy.
//
// Copying remains the answer when neither works, since the row being written
// here is one the user is keeping, and a uri with a session-long grant would
// be dead in it by the next launch.
const resolveImportPath = async (file, fileName, uuid) => {
  // The picker's own grant used to win here without anything else being
  // tried, which made a picked file the one kind whose address does not
  // survive a reinstall — grants are per-install and a restored row keeps
  // pointing through a door that has been locked. durableUriFor takes the
  // MediaStore address first now and falls back to that grant, so this is no
  // longer an early exit.
  const durable = await durableUriFor(file.uri);
  if (durable) {
    console.log(`🔗 Referencing ${fileName} in place at ${durable}`);
    return durable;
  }

  // Refused the permission and MediaStore could not name it, but the picker
  // did take a lasting grant — worth more than a copy, and it still plays for
  // as long as this install lives.
  if (file.bookmarkStatus === 'success') {
    console.log(`🔗 Referencing ${fileName} in place at ${file.uri}`);
    return file.uri;
  }

  const destPath = await resolveDestPath(fileName, uuid);
  await RNFS.copyFile(file.uri, destPath);
  console.log(`📁 Copied ${fileName} to ${destPath}`);
  return destPath;
};

// Throws if the file can't be copied or recorded. It used to swallow DB errors
// and let copy errors escape to whoever called it, which is how a copy failing
// on its own terms (a cloud provider's file that isn't on the device, a full
// disk) reached the user as "Could not pick files".

// `navigate` is where to go once the row exists: 'player' to open it, 'list'
// to land on the Device tab, or 'none' to go nowhere — which is what a batch
// import wants, so it can navigate once at the end rather than once per file.
// Returns the row, so that caller has something to build a queue out of.
export const handleFileProcessing = async (
  file,
  setDeviceFiles,
  selectedCategory,
  navigate = 'list',
) => {
  const fileName = file.name || `file_${Date.now()}`;
  const mimeType = file.type || 'unknown';

  // Checked before anything is copied, because the answer may be that there is
  // nothing to import. The same file arriving twice used to become a second row
  // with its own source_id, and everything hangs off that: the notes written
  // against it, the minutes watched, the category it was filed under. A lecture
  // shared in again a month later came back as a stranger.
  const existing = await findDuplicateDeviceFile(file.uri);

  let fullItem;

  if (existing) {
    // The row is kept and only its address refreshed. The incoming uri is
    // certainly alive and the stored one may not be, so re-importing a file is
    // also how someone repairs one by hand without knowing that is what they
    // are doing.
    const durable = (await durableUriFor(file.uri)) || file.uri;
    // deleted_at cleared as well as out_show, so a file that had been removed
    // comes all the way back. Setting only out_show — which is what the
    // YouTube and Drive paths do — returns it to the list while leaving it
    // filtered out of categories and downloads, which is a half-revived row
    // nobody asked for.
    fullItem = await updateItemFields(existing.itemId, {
      file_path: durable,
      out_show: 1,
      deleted_at: null,
    });
    console.log(`♻️ ${fileName} was already in the library — reused its entry`);
  } else {
    const uuid = generateUUID();
    const filePath = await resolveImportPath(file, fileName, uuid);

    fullItem = await upsertItem({
      source_id: uuid,
      type: 'device_file',
      title: fileName,
      mimeType: mimeType,
      file_path: filePath,
      out_show: 1,
      in_show: 0,
    });

    // Identified in full, now, while the file is definitely readable — which is
    // the only moment it can be. Leaving the fingerprint to the background pass
    // left a window where a file imported and then immediately moved had
    // nothing recorded to find it by, and that pass takes the oldest first, so
    // a fresh import was last in the queue precisely when its owner was most
    // likely to be reorganising it. Under a megabyte, and not awaited.
    identifyNow(fullItem.id, filePath);
    console.log(`✅ Inserted ${fileName} into device_files table`);
  }

  // Everything below happens either way. A file the user just picked belongs in
  // the category they had open and on the screen they expect, whether or not
  // the library turned out to have seen it before — and an early return for the
  // reused case is how an "open with" on a known file quietly stopped opening
  // the player.
  if (selectedCategory != null) {
    await addItemToCategory(selectedCategory, fullItem.source_id, fullItem.type);
  }

  // Filtered as well as prepended, so a reused row moves to the top instead of
  // appearing twice in a list that already held it.
  setDeviceFiles(prev => [
    fullItem,
    ...prev.filter(f => f.source_id !== fullItem.source_id),
  ]);

  if (navigate === 'player') {
    navigationRef.navigate('BacePlayer', {item: fullItem});
  } else if (navigate === 'list') {
    navigationRef.navigate('HomeScreen', {screen: 'Device'});
  }

  return fullItem;
};

// The picker and the import that follows it, in one place. Both callers used to
// carry their own copy of this, and both wrapped the whole thing in a single
// try whose catch blamed every failure on the picker.
export const pickAndImportDeviceFiles = async (
  setDeviceFiles,
  selectedCategory = null,
) => {
  let results;
  try {
    // 'open' rather than the default 'import', and that is the whole point:
    // import mode runs ACTION_GET_CONTENT, whose uri Android refuses to make
    // persistable — it never attaches the flag takePersistableUriPermission
    // needs — so the picker copies the bytes into a cache dir and hands back a
    // uri that dies with the task. Open mode runs ACTION_OPEN_DOCUMENT, and
    // requestLongTermAccess takes the persistable grant, which is what lets
    // the row point at the user's own file for good instead of at a copy.
    results = await pick({
      allowMultiSelection: true,
      type: [types.audio, types.video],
      mode: 'open',
      requestLongTermAccess: true,
      // Hides the cloud sources — Drive, Dropbox, anything whose bytes are not
      // on this phone. It becomes EXTRA_LOCAL_ONLY on the intent, which the
      // system picker honours by dropping every root that does not declare
      // Root.FLAG_LOCAL_ONLY; Downloads, internal storage and the SD card all
      // declare it and stay.
      //
      // It matters more than it used to. A picked file is now referenced in
      // place rather than copied, so a cloud-backed one would have played only
      // while online, and would have failed at the worst possible moment
      // instead of at import. Keeping those out of the picker means what the
      // user picks is what plays, offline included.
      //
      // Not in the library's TypeScript types, but real: parsePickOptions
      // reads it off the options map and pick() spreads the whole object
      // through untouched. Not a stray key — don't tidy it away.
      localOnly: true,
    });
  } catch (err) {
    // Cancelling isn't a failure, and neither is a second tap while the picker
    // is still opening — that one rejects with ASYNC_OP_IN_PROGRESS, and only
    // the cancel code was let through, so it raised an alert.
    if (
      err?.code === 'OPERATION_CANCELED' ||
      err?.code === 'ASYNC_OP_IN_PROGRESS'
    ) {
      console.log('🚫 File picker dismissed:', err.code);
      return;
    }
    console.error('❌ Document picker failed:', err);
    Alert.alert(
      'Error',
      `Could not open the file picker${err?.code ? ` (${err.code})` : ''}.`,
    );
    return;
  }

  // One unreadable file used to abort the loop, dropping every file after it
  // without a word. Import them independently and name the ones that failed.
  const imported = [];
  const failed = [];
  const notMedia = [];
  setInserting(true);
  try {
    for (const file of results) {
      // The picker is asked for audio and video only — EXTRA_MIME_TYPES, see
      // the pick() call above — but that filter is advisory, which is why the
      // library bothers to report hasRequestedType at all. Some providers
      // ignore it, and taking whatever came back would put a row in the Device
      // tab that the player cannot open.
      //
      // Only a type that is present and not media is refused. A provider that
      // returns none has told us nothing, and turning away a real recording
      // because its provider was vague is the worse of the two mistakes — the
      // player already says plainly when it cannot open something.
      if (typeof file?.type === 'string' && !isAudioOrVideo(file.type)) {
        console.warn(`🚫 Ignoring non-media pick: ${file?.name} (${file?.type})`);
        notMedia.push(file?.name || 'Unnamed file');
        continue;
      }

      try {
        // Passed on like the link path does: both callers had the selected
        // category in hand and neither forwarded it, so a file picked from the
        // device while a category was open landed outside it.
        //
        // 'none' because the navigation happens once, below — this used to
        // bounce to the Device tab once per file in a multi-select.
        imported.push(
          await handleFileProcessing(file, setDeviceFiles, selectedCategory, 'none'),
        );
      } catch (err) {
        console.error(`❌ Import failed for ${file?.name}:`, err);
        failed.push(file?.name || 'Unnamed file');
      }
    }
  } finally {
    setInserting(false);
  }

  // Straight into the player: picking a file is already the decision to hear
  // it, and landing on the Device tab made the user find it in a list and tap
  // it again. Several at once become the queue in the order they were picked,
  // rather than one playing and the rest sitting there.
  if (imported.length > 0) {
    navigationRef.navigate(
      'BacePlayer',
      imported.length === 1
        ? {item: imported[0]}
        : {items: imported, currentIndex: 0},
    );
  }

  if (notMedia.length > 0) {
    Alert.alert(
      'Not an audio or video file',
      `${notMedia.join('\n')}\n\naudioTracker plays audio and video files.`,
    );
  }

  if (failed.length > 0) {
    Alert.alert(
      imported.length === 0
        ? 'Could not add these files'
        : 'Some files were not added',
      `${failed.join('\n')}\n\nThe file may have been moved, or the app providing it may no longer be granting access.`,
    );
  }
};
