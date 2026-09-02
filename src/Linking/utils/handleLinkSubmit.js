import axios from 'axios';
import {Alert, Linking, ToastAndroid} from 'react-native';
import {YOUTUBE_API_KEY} from '@env';
import {
  getItemBySourceId,
  upsertItem,
  upsertYoutubeMeta,
} from '../../database/C';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {pick, types} from 'react-native-document-picker';
import {NativeModules} from 'react-native';
import {addItemToCategory} from '../../categories/catDB';
import useDbStore from '../../database/dbStore';
import {updateItemFields} from '../../database/U';
import { getGoogleAccessToken } from '../../auth/tokenManager';
import { navigationRef } from '../../handlers/navigationRef';

const {FileMeta, MediaPicker} = NativeModules;
const {setInserting} = useDbStore.getState();
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

export const handleLinkSubmit = async (
  inputLink,
  {
    setDriveLinksList,
    setItems,
    setDeviceFiles,
    selectedCategory = null,
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
      );
      return;
    }

    if (extracted.type === 'google_drive') {
      await handleDriveLink(
        extracted.id,
        setDriveLinksList,
        selectedCategory,
      );
    } else {
      await fetchYTData(extracted, setItems, selectedCategory);
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
) => {
  try {
    const {id, type} = extracted;
    const existingItem = await getItemBySourceId(id, type);
    if (existingItem) {
      const updatedItem = await updateItemFields(existingItem.id, {
        out_show: 1,
      });

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [updatedItem, ...filtered];
      });

      if (selectedCategory != null) {
        addItemToCategory(selectedCategory, updatedItem.source_id, updatedItem.type);
      }

      if (type === 'youtube_video') {
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
        out_show: 1,
      });

      const fullItem = await upsertYoutubeMeta({
        item_id: savedItem.id,
        channel_title: video.channelTitle,
        thumbnail: `https://img.youtube.com/vi/${savedItem.source_id}/mqdefault.jpg`,
      });

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [fullItem, ...filtered];
      });

      if (selectedCategory != null) {
        addItemToCategory(selectedCategory, fullItem.source_id, fullItem.type);
      }

      navigationRef.navigate('BacePlayer', {item: fullItem});
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
        out_show: 1,
      });

      const fullItem = await upsertYoutubeMeta({
        item_id: savedItem.id,
        channel_title: playlist.channelTitle,
        thumbnail: playlist.thumbnails?.medium?.url ?? null,
      });

      setItems(prev => {
        const filtered = prev.filter(item => item.source_id !== id);
        return [fullItem, ...filtered];
      });

      if (selectedCategory != null) {
        addItemToCategory(selectedCategory, fullItem.source_id, fullItem.type);
      }
    }
  } catch (error) {
    console.error('YT Fetch Error:', error);
    Alert.alert('Error', 'Failed to fetch YouTube data.');
  } finally {
    if (extracted.type === 'youtube_playlist') {
      navigationRef.navigate('HomeScreen', {screen: 'YouTube'});
    }
  }
};

export const handleDriveLink = async (
  driveId,
  setDriveLinksList,
  selectedCategory,
) => {
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
      // Just update visibility flag (and optionally touch updated_at if you have it)
      const updatedItem = await updateItemFields(existingItem.id, {
        out_show: 1,
        title: itemName, //sync name if it changed
      });

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
        out_show: 1,
      });

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

    // Navigate (same for both existing & new)
    navigationRef.navigate('HomeScreen', {screen: 'Drive'});
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

const generateUUID = () => {
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

const handleDeviceFileFromUri = async (
  uri,
  setDeviceFiles,
  selectedCategory,
) => {
  try {
    if (!uri || !uri.startsWith('content://')) {
      // setInserting(false);
      Alert.alert('Invalid URL');
      return;
    }

    const {name: fileName, mime: mimeType} = await getFileMeta(uri);

    if (!isAudioOrVideo(mimeType)) {
      // setInserting(false);
      Alert.alert('Invalid URL');
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
  navigate = true,
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

  // A recovered pick (importPendingPickedFiles) imports with navigate off:
  // it runs while the app is still coming up, and throwing the user onto a tab
  // mid-launch isn't ours to do.
  if (navigate) {
    if (navigateToPlayer) {
      navigationRef.navigate('BacePlayer', {item: fullItem});
    } else {
      navigationRef.navigate('HomeScreen', {screen: 'Device'});
    }
  }
  console.log(`✅ Inserted ${fileName} into device_files table`);
};

// Anything the device player can actually open. Used only to sift the results
// of the react-native-document-picker path below, whose listing is unfiltered
// when it has to fall back to "*/*".
const MEDIA_EXT =
  /\.(mp3|m4a|m4b|aac|wav|ogg|oga|opus|flac|wma|amr|aiff?|mid|midi|mp4|m4v|mkv|webm|avi|mov|3gp|3g2|wmv|flv|ts|mpe?g)$/i;

const isMediaFile = file => {
  const type = file?.type || '';
  if (type.startsWith('audio/') || type.startsWith('video/')) {
    return true;
  }
  // Plenty of providers hand back application/octet-stream (or no type at all)
  // for a perfectly ordinary mp3, so the name is the only thing left to go on.
  if (type && type !== 'application/octet-stream') {
    return false;
  }
  return MEDIA_EXT.test(file?.name || '');
};

// react-native-document-picker builds its ACTION_GET_CONTENT intent with
// setType(mimeTypes.join('|')) as soon as more than one type is asked for, so
// this pick goes out with the type "audio/*|video/*" — not a MIME type at all.
// AOSP's DocumentsUI ignores the type when EXTRA_MIME_TYPES is present, which
// is why it works on most phones; an OEM picker that resolves on the type
// instead may match nothing, so retry as "*/*" and filter here on the way back.
//
// Kept only for a JS reload onto a binary built before MediaPickerModule
// existed — that module is the real path now, and it doesn't have this problem.
const pickWithDocumentPicker = async () => {
  try {
    const files = await pick({
      allowMultiSelection: true,
      type: [types.audio, types.video],
    });
    return {files, unsupported: []};
  } catch (err) {
    if (
      err?.code !== 'E_UNABLE_TO_OPEN_FILE_TYPE' &&
      err?.code !== 'E_FAILED_TO_SHOW_PICKER'
    ) {
      throw err;
    }
    console.warn(
      `⚠️ Typed file picker unavailable (${err?.code}: ${err?.message}), retrying with all files`,
    );
    const files = await pick({
      allowMultiSelection: true,
      type: [types.allFiles],
    });
    return {
      files: files.filter(isMediaFile),
      unsupported: files.filter(f => !isMediaFile(f)),
    };
  }
};

// MediaPickerModule opens ACTION_OPEN_DOCUMENT — the system document picker,
// which every device has and which filters on EXTRA_MIME_TYPES properly — and,
// unlike the library, doesn't drop the selection when Android has killed the
// app while the picker was in front. See the module's own comment for why both
// of those matter; between them they are the OnePlus/Oppo failure.
const pickMediaFiles = async () => {
  if (!MediaPicker?.pick) {
    return pickWithDocumentPicker();
  }
  const files = await MediaPicker.pick();
  return {files, unsupported: []};
};

// Cancelling isn't a failure, and neither is a second tap while the picker is
// still opening — that one comes back as ASYNC_OP_IN_PROGRESS, and only the
// cancel code was let through, so it raised an alert.
const isCancelError = err =>
  err?.code === 'PICKER_CANCELED' || err?.code === 'DOCUMENT_PICKER_CANCELED';

// A cancel this fast is not a person changing their mind. A picker that resolves
// into another task hands the caller RESULT_CANCELED at launch, before anything
// has been chosen, and that used to be indistinguishable here from a real
// dismissal — which is to say, silent.
const SPURIOUS_CANCEL_MS = 800;

// Set while the picker is up, cleared however it ends. Surviving across a launch
// means the app died in between, which is the whole failure in one flag.
const PICK_IN_FLIGHT_KEY = 'devicePicker:inFlight';

// Long enough that a phone left overnight still gets its explanation, short
// enough that a flag orphaned by some unrelated crash doesn't haunt the app.
const PICK_IN_FLIGHT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const markPickInFlight = async () => {
  try {
    await AsyncStorage.setItem(PICK_IN_FLIGHT_KEY, String(Date.now()));
  } catch (err) {
    console.warn('⚠️ Could not record the picker as in flight:', err);
  }
};

const clearPickInFlight = async () => {
  try {
    await AsyncStorage.removeItem(PICK_IN_FLIGHT_KEY);
  } catch (err) {
    console.warn('⚠️ Could not clear the in-flight picker flag:', err);
  }
};

// What the copy or the insert actually threw. RNFS puts the useful part in
// message ("ENOENT: ...", "EACCES: ..."); a rejected native promise may carry
// only a code.
const describeImportError = err =>
  err?.message || err?.code || String(err ?? 'Unknown error');

// Names alone say which files failed, never why, and the standing line about
// cloud downloads was a guess that sent the first real report from a failing
// device down the wrong path. The thrown message goes in instead, deduplicated:
// thirteen files that failed for one reason should read as one reason.
const formatImportFailures = failed => {
  const names = failed.map(entry => entry.name).join('\n');
  const reasons = [...new Set(failed.map(entry => entry.error))];
  return `${names}\n\n${reasons.join('\n\n')}`;
};

// The picker and the import that follows it, in one place. Both callers used to
// carry their own copy of this, and both wrapped the whole thing in a single
// try whose catch blamed every failure on the picker.
export const pickAndImportDeviceFiles = async (
  setDeviceFiles,
  selectedCategory = null,
) => {
  const startedAt = Date.now();
  await markPickInFlight();

  let picked;
  try {
    picked = await pickMediaFiles();
  } catch (err) {
    await clearPickInFlight();
    const elapsed = Date.now() - startedAt;

    if (
      err?.code === 'ASYNC_OP_IN_PROGRESS' ||
      (isCancelError(err) && elapsed >= SPURIOUS_CANCEL_MS)
    ) {
      console.log('🚫 File picker dismissed:', err.code);
      return;
    }
    if (isCancelError(err)) {
      // Reported rather than swallowed: nobody picks and dismisses a file
      // browser inside a second, so this is the picker refusing the job.
      console.error(`❌ Picker closed after ${elapsed}ms:`, err);
      Alert.alert(
        'The file picker closed itself',
        `It came back after ${elapsed}ms without opening properly (${err.code}).\n\n` +
          'This is usually a file manager on the phone taking over the picker.' +
          ' Please report this message.',
      );
      return;
    }
    console.error('❌ Document picker failed:', err);
    // The message goes in too: the code alone is the same handful of strings
    // whatever the device did, and it's the message that says which.
    Alert.alert(
      'Error',
      `Could not open the file picker${
        err?.code ? ` (${err.code})` : ''
      }.${err?.message ? `\n\n${err.message}` : ''}`,
    );
    return;
  }

  await clearPickInFlight();

  const {files: results, unsupported} = picked;

  // Silent until now, and one of the ways "I pressed Done and nothing happened"
  // gets here: the picker reported success with neither a ClipData nor a URI on
  // the intent, so there is nothing to import and nothing to report either.
  if (results.length === 0 && unsupported.length === 0) {
    console.error('❌ Picker returned success with no files');
    Alert.alert(
      'No files came back',
      'The file picker closed without handing over what you selected.\n\n' +
        'Please report this message.',
    );
    return;
  }

  // One unreadable file used to abort the loop, dropping every file after it
  // without a word. Import them independently and name the ones that failed.
  const failed = [];
  for (const file of results) {
    try {
      // Passed on like the link path does: both callers had the selected
      // category in hand and neither forwarded it, so a file picked from the
      // device while a category was open landed outside it.
      await handleFileProcessing(file, setDeviceFiles, selectedCategory);
    } catch (err) {
      console.error(`❌ Import failed for ${file?.name}:`, err);
      failed.push({
        name: file?.name || 'Unnamed file',
        error: describeImportError(err),
      });
    }
  }

  // The bytes are ours now, so give the read grants back: Android caps how many
  // an app may hold persisted, and these were taken for every pick.
  if (MediaPicker?.releaseUris) {
    try {
      await MediaPicker.releaseUris(results.map(file => file.uri));
    } catch (err) {
      console.warn('⚠️ Could not release the picked file grants:', err);
    }
  }

  if (failed.length > 0) {
    Alert.alert(
      failed.length === results.length
        ? 'Could not add these files'
        : 'Some files were not added',
      formatImportFailures(failed),
    );
  } else if (unsupported.length > 0) {
    Alert.alert(
      results.length === 0
        ? 'Not an audio or video file'
        : 'Some files were skipped',
      `${unsupported
        .map(f => f?.name || 'Unnamed file')
        .join('\n')}\n\nOnly audio and video files can be added here.`,
    );
  }
};

// Nothing was stashed, yet the picker was still open when the app last stopped
// running: the selection went to a process that no longer existed, and the
// result never reached the activity either, so there is nothing left to import.
// The phone this happens on is not one we can attach a debugger to, so this
// message is the only account of it anyone is going to get.
const reportInterruptedPick = async () => {
  let startedAt;
  try {
    startedAt = await AsyncStorage.getItem(PICK_IN_FLIGHT_KEY);
  } catch (err) {
    console.warn('⚠️ Could not read the in-flight picker flag:', err);
    return;
  }
  if (!startedAt) {
    return;
  }

  await clearPickInFlight();
  if (Date.now() - Number(startedAt) > PICK_IN_FLIGHT_MAX_AGE_MS) {
    return;
  }

  console.error('❌ audioTracker was restarted while the file picker was open');
  Alert.alert(
    'Your file selection was lost',
    'Android closed audioTracker while the file picker was open, so the files you chose never arrived.\n\n' +
      'Please try again. If it keeps happening, allow background activity for audioTracker in the battery settings.',
  );
};

// A selection the app never got to see: Android killed audioTracker while the
// system picker was in front, so the result came back to a process with no JS
// left in it to receive it. MediaPickerModule keeps those files (with a
// persisted read grant) and this puts them through the same import the picker
// would have used. No-ops when there is nothing stashed, which is almost
// always, so it's safe to call on every launch.
export const importPendingPickedFiles = async setDeviceFiles => {
  if (!MediaPicker?.consumePendingPick) {
    return;
  }

  let files;
  try {
    files = await MediaPicker.consumePendingPick();
  } catch (err) {
    console.error('❌ Could not read the interrupted file selection:', err);
    return;
  }
  if (!files?.length) {
    await reportInterruptedPick();
    return;
  }
  // Recovered, so the interrupted-pick flag has served its purpose: the toast
  // below is the report, and the alert above would only contradict it.
  await clearPickInFlight();

  console.log(`📥 Recovering ${files.length} file(s) picked before the restart`);
  const failed = [];
  for (const file of files) {
    try {
      // No category: the one that was open belonged to a session that no longer
      // exists. No navigation either — the app is still launching.
      await handleFileProcessing(file, setDeviceFiles, null, false, false);
    } catch (err) {
      console.error(`❌ Recovered import failed for ${file?.name}:`, err);
      failed.push({
        name: file?.name || 'Unnamed file',
        error: describeImportError(err),
      });
    }
  }

  // The bytes are ours now, so give the grants back: Android caps how many an
  // app may hold persisted.
  try {
    await MediaPicker.releaseUris(files.map(file => file.uri));
  } catch (err) {
    console.warn('⚠️ Could not release the recovered file grants:', err);
  }

  const added = files.length - failed.length;
  if (added > 0) {
    ToastAndroid.show(
      `Added ${added} file${added === 1 ? '' : 's'} from your last selection`,
      ToastAndroid.LONG,
    );
  }
  if (failed.length > 0) {
    Alert.alert(
      'Could not add these files',
      `${formatImportFailures(
        failed,
      )}\n\naudioTracker was closed while the file picker was open, and Android may have withdrawn access to them. Please pick them again.`,
    );
  }
};
