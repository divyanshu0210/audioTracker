import axios from 'axios';
import {Alert, Linking, ToastAndroid} from 'react-native';
import {YOUTUBE_API_KEY} from '@env';
import {
  getItemBySourceId,
  upsertItem,
  upsertYoutubeMeta,
} from '../../database/C';
import RNFS from 'react-native-fs';
import {pick, types} from 'react-native-document-picker';
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
  ASSIGNMENT: 'assignment', // mentor-pushed — joins the list, never navigates
};

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

      const updatedItem = await updateItemFields(existingItem.id, {
        out_show: 1,
      });

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [updatedItem, ...filtered];
      });

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
        // Hidden when it came from outside: the row exists so the video can
        // play, be watched into history and carry notes — it just isn't in
        // the library until the user says so on the Add bar.
        out_show: external ? 0 : 1,
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

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [fullItem, ...filtered];
      });

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
        out_show: external ? 0 : 1,
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

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [fullItem, ...filtered];
      });

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
        external
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

      // Move to top: remove old entry → prepend updated one
      setDriveLinksList(prev => {
        const filtered = prev.filter(i => i.source_id !== driveId);
        return [updatedItem, ...filtered];
      });

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
        out_show: external ? 0 : 1,
      });

      if (external) {
        openExternalItem(savedItem);
        return;
      }

      // Move to top
      setDriveLinksList(prev => {
        const filtered = prev.filter(i => i.source_id !== driveId);
        return [savedItem, ...filtered];
      });

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

// Where a shared file waits while the user decides whether to keep it.
//
// The cache directory, not the app's files directory, and that distinction is
// the whole point: an import goes somewhere permanent and shows up in the
// Device tab, while this is a scratch copy Android may evict on its own and
// nothing lists. Sharing a video from a chat to watch it once no longer costs
// the user a permanent duplicate.
//
// Under ExternalCachesDirectoryPath rather than the internal one so that the
// promotion in saveItemToList is a rename: getExternalCacheDir and
// getExternalFilesDir are the same volume, and moveFile across volumes is not.
const SHARED_CACHE_DIR = `${RNFS.ExternalCachesDirectoryPath}/shared`;

export const isInSharedCache = path => !!path?.startsWith(`${SHARED_CACHE_DIR}/`);

// A file shared in from another app, copied to scratch and played from there.
//
// Playing straight from the content:// URI is what this did first, and VLC
// cannot: the player's JS wrapper does flag a content: scheme as isNetwork and
// hand it to `new Media(libvlc, Uri.parse(...))`, but this libvlc build has no
// ContentResolver behind that path. It prefixes file:// and looks for a
// literal file, so the MRL comes out as `file:////content%3A//...` and the
// open fails with "No such file or directory" while the player sits at 00:00.
//
// Copying here also settles the grant question. An ACTION_SEND URI is not
// persistable — takePersistableUriPermission needs a flag Android only attaches
// to SAF results — so the URI dies with the task. Reading it now, while the
// grant is alive, is the only moment its bytes are reachable at all.
//
// The name is the uuid: this file is addressed by the row, and the title the
// user sees comes from the row too. It gets a real name if it is ever kept.
const handleSharedDeviceFile = async ({uri, name, type}) => {
  const uuid = generateUUID();
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot) : '';

  await RNFS.mkdir(SHARED_CACHE_DIR);
  const cachePath = `${SHARED_CACHE_DIR}/${uuid}${ext}`;
  await RNFS.copyFile(uri, cachePath);

  const fullItem = await upsertItem({
    source_id: uuid,
    type: 'device_file',
    title: name,
    mimeType: type,
    file_path: cachePath,
    out_show: 0,
    in_show: 0,
  });

  navigationRef.navigate('BacePlayer', {item: fullItem});
  console.log(`✅ Opened shared ${name} from scratch copy ${cachePath}`);
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
      true,
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

// Throws if the file can't be copied or recorded. It used to swallow DB errors
// and let copy errors escape to whoever called it, which is how a copy failing
// on its own terms (a cloud provider's file that isn't on the device, a full
// disk) reached the user as "Could not pick files".

export const handleFileProcessing = async (
  file,
  setDeviceFiles,
  selectedCategory,
  navigateToPlayer = false,
) => {
  const fileName = file.name || `file_${Date.now()}`;
  const mimeType = file.type || 'unknown';
  const uuid = generateUUID();

  const destPath = await resolveDestPath(fileName, uuid);
  await RNFS.copyFile(file.uri, destPath);
  console.log(`📁 Copied ${fileName} to ${destPath}`);

  const fullItem = await upsertItem({
    source_id: uuid,
    type: 'device_file',
    title: fileName,
    mimeType: mimeType,
    file_path: destPath,
    out_show: 1,
    in_show: 0,
  });

  if (selectedCategory != null) {
    await addItemToCategory(selectedCategory, fullItem.source_id, fullItem.type);
  }
  setDeviceFiles(prev => [fullItem, ...prev]);

  if (navigateToPlayer) {
    navigationRef.navigate('BacePlayer', {item: fullItem});
  } else {
    navigationRef.navigate('HomeScreen', {screen: 'Device'});
  }
  console.log(`✅ Inserted ${fileName} into device_files table`);
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
    results = await pick({
      allowMultiSelection: true,
      type: [types.audio, types.video],
    });
  } catch (err) {
    // Cancelling isn't a failure, and neither is a second tap while the picker
    // is still opening — that one rejects with ASYNC_OP_IN_PROGRESS, and only
    // the cancel code was let through, so it raised an alert.
    if (
      err?.code === 'DOCUMENT_PICKER_CANCELED' ||
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
  const failed = [];
  setInserting(true);
  try {
    for (const file of results) {
      try {
        // Passed on like the link path does: both callers had the selected
        // category in hand and neither forwarded it, so a file picked from the
        // device while a category was open landed outside it.
        await handleFileProcessing(file, setDeviceFiles, selectedCategory);
      } catch (err) {
        console.error(`❌ Import failed for ${file?.name}:`, err);
        failed.push(file?.name || 'Unnamed file');
      }
    }
  } finally {
    setInserting(false);
  }

  if (failed.length > 0) {
    Alert.alert(
      failed.length === results.length
        ? 'Could not add these files'
        : 'Some files were not added',
      `${failed.join('\n')}\n\nFiles kept in the cloud may need to be downloaded to this device first.`,
    );
  }
};
