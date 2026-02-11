import axios from 'axios';
import {Alert, Linking, ToastAndroid} from 'react-native';
import {YOUTUBE_API_KEY, DRIVE_API_KEY} from '@env';
import {
  saveMainScreenVideoToDB,
  savePlaylistToDB,
  insertFolder,
  insertFile,
  insertDeviceFile,
  insertOrUpdateFolder,
  insertOrUpdateFile,
  upsertItem,
  upsertYoutubeMeta,
} from '../../database/C';
import RNFS from 'react-native-fs';
import {NativeModules} from 'react-native';
import {
  checkAndUpdatePlaylistByYtubeId,
  checkAndUpdateVideoByYtubeId,
} from '../../database/U';
import {addItemToCategory} from '../../categories/catDB';
import useDbStore from '../../database/dbStore';
import {GoogleSignin} from '@react-native-google-signin/google-signin';
const {FileMeta} = NativeModules;
const {setInserting} = useDbStore.getState();
export const extractLinkType = url => {
  const playlistMatch = url.match(/[?&]list=([0-9A-Za-z_-]+)/);
  if (playlistMatch) return {type: 'youtube_playlist', id: playlistMatch[1]};

  const videoMatch = url.match(
    /(?:\?v=|&v=|\/embed\/|\/vi\/|\/watch\?v=|youtu\.be\/)([0-9A-Za-z_-]{11})/,
  );
  if (videoMatch) return {type: 'youtube_video', id: videoMatch[1]};

  const liveMatch = url.match(/youtube\.com\/live\/([0-9A-Za-z_-]{11})/);
  if (liveMatch) return {type: 'youtube_video', id: liveMatch[1]};

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
    navigation,
    selectedCategory = null,
  },
) => {
  setInserting(true);
  const extracted = extractLinkType(inputLink);
  try {
    if (!extracted) {
      handleDeviceFileFromUri(
        inputLink,
        setDeviceFiles,
        navigation,
        selectedCategory,
      );
      return;
    }

    if (extracted.type === 'google_drive') {
      await handleDriveLink(
        extracted.id,
        setDriveLinksList,
        navigation,
        selectedCategory,
      );
    } else {
      await fetchYTData(extracted, setItems, navigation, selectedCategory);
    }
  } finally {
    setInserting(false); // Move to finally block to ensure it always runs
  }
};

export const fetchYTData = async (
  extracted,
  setItems,
  navigation,
  selectedCategory,
) => {
  try {
    if (extracted.type === 'youtube_video') {
      const result = await checkAndUpdateVideoByYtubeId(extracted.id, video => {
        setItems(prevItems => {
          const filtered = prevItems.filter(
            item => item.ytube_id !== video.ytube_id,
          );
          return [video, ...filtered];
        });

        navigation?.navigate('BacePlayer', {item: video});
        if (selectedCategory != null) {
          addItemToCategory(selectedCategory, extracted.id, 'youtube');
        }
        console.log('✅ Video found and updated in DB');
        console.log('UI updated');
      });

      if (result) return;

      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${extracted.id}&key=${YOUTUBE_API_KEY}`,
      );
      console.log('ytube api response', response);
      const video = response.data.items[0]?.snippet;
      if (video) {
        const newItem = {
          ytube_id: extracted.id,
          title: video.title,
          channelTitle: video.channelTitle,
          type: 'video',
          parent_id: null,
          out_show: 1,
          in_show: 0,
        };
        // await saveMainScreenVideoToDB(
        //   newItem.ytube_id,
        //   newItem.title,
        //   newItem.channelTitle,
        //   () => {
        //     setItems(prevItems => {
        //       const filtered = prevItems.filter(
        //         item => item.ytube_id !== newItem.ytube_id,
        //       );
        //       return [newItem, ...filtered];
        //     });
        //     if (selectedCategory != null) {
        //       addItemToCategory(selectedCategory, newItem.ytube_id, 'youtube');
        //     }
        //   },
        // );

        const savedItem = await upsertItem({
          source_id: newItem.ytube_id,
          type: 'youtube_video',
          title: newItem.title,
          parent_id: null, // main screen = no parent
          out_show: 1,
        });
        await upsertYoutubeMeta({
          item_id: savedItem.id,
          channel_title: newItem.channelTitle,
          thumbnail: newItem.thumbnail ?? null,
        });

        // Update UI state
        setItems(prevItems => {
          const filtered = prevItems.filter(
            item => item.source_id !== newItem.ytube_id,
          );
          return [savedItem, ...filtered];
        });

        // Category mapping
        if (selectedCategory != null) {
          addItemToCategory(selectedCategory, savedItem.id, 'youtube');
        }

        navigation?.navigate('BacePlayer', {item: newItem});
        return;
      }
    } else if (extracted.type === 'youtube_playlist') {
      const result = await checkAndUpdatePlaylistByYtubeId(
        extracted.id,
        playlist => {
          setItems(prevItems => {
            const filtered = prevItems.filter(
              item => item.ytube_id !== playlist.ytube_id,
            );
            return [playlist, ...filtered];
          });
          if (selectedCategory != null) {
            addItemToCategory(selectedCategory, extracted.id, 'youtube');
          }
          console.log('✅ Playlist found and updated in DB');
          console.log('UI updated');
        },
      );
      if (result) return;

      const response = await axios.get(
        `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${extracted.id}&key=${YOUTUBE_API_KEY}`,
      );
      console.log(response);
      const playlist = response.data.items[0]?.snippet;
      if (playlist) {
        const newItem = {
          ytube_id: extracted.id,
          title: playlist.title,
          thumbnail: playlist.thumbnails?.medium?.url || null,
          channelTitle: playlist.channelTitle,
          type: 'playlist',
          parent_id: null,
        };
        // await savePlaylistToDB(
        //   newItem.ytube_id,
        //   newItem.title,
        //   newItem.thumbnail,
        //   newItem.channelTitle,
        //   () => {
        //     setItems(prevItems => {
        //       const filtered = prevItems.filter(
        //         item => item.ytube_id !== newItem.ytube_id,
        //       );
        //       return [newItem, ...filtered];
        //     });
        //     if (selectedCategory != null) {
        //       addItemToCategory(selectedCategory, newItem.ytube_id, 'youtube');
        //     }
        //   },
        // );

        const savedItem = await upsertItem({
          source_id: newItem.ytube_id,
          type: 'youtube_playlist',
          title: newItem.title,
          out_show: 1,
        });

        // Upsert youtube_meta
        await upsertYoutubeMeta({
          item_id: savedItem.id,
          channel_title: newItem.channelTitle,
          thumbnail: newItem.thumbnail,
        });

        // Update UI state
        setItems(prevItems => {
          const filtered = prevItems.filter(
            item => item.source_id !== newItem.ytube_id,
          );
          return [savedItem, ...filtered];
        });

        // Category mapping (updated type name!)
        if (selectedCategory != null) {
          addItemToCategory(
            selectedCategory,
            savedItem.id, // now use internal ID
            'youtube', // hardcoded type for category mapping
          );
        }
      }
    }
  } catch (error) {
    console.error('YT Fetch Error:', error);
    Alert.alert('Error', 'Failed to fetch YouTube data.');
  } finally {
    if (extracted.type === 'youtube_playlist') {
      navigation?.navigate('HomeScreen', {screen: 'YouTube'});
    }
    // if (selectedCategory != null) {
    //   ToastAndroid.show(
    //     'Playlists Not Supported by Categories',
    //     ToastAndroid.SHORT,
    //   );
    // }
  }
};

export const handleDriveLink = async (
  driveId,
  setDriveLinksList,
  navigation,
  selectedCategory,
) => {
  try {
    const {accessToken} = await GoogleSignin.getTokens();
    // const response = await axios.get(
    //   `https://www.googleapis.com/drive/v3/files/${driveId}?fields=name,mimeType&key=${DRIVE_API_KEY}`,
    // );
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

    if (isFolder) {
      // const {item} = await insertOrUpdateFolder(driveId, itemName, null, 1, 0);
      const {item} = await upsertItem({
        source_id: driveId,
        type: 'drive_folder',
        title: itemName,
        parent_id: null,
        mimeType: 'application/vnd.google-apps.folder',
        out_show: 1,
        in_show: 0,
      });

      // Always update UI by removing existing and adding to top
      console.log(item);
      setDriveLinksList(prev => [
        item,
        ...prev.filter(i => i.source_id !== driveId),
      ]);

      if (selectedCategory != null) {
        await addItemToCategory(selectedCategory, item.id, 'drive');
      }
      // if (selectedCategory != null) {
      //   ToastAndroid.show(
      //     'Folder Not Supported by Categories',
      //     ToastAndroid.SHORT,
      //   );
      // }
    } else {
      // const {item} = await insertOrUpdateFile(
      //   driveId,
      //   itemName,
      //   null,
      //   mimeType,
      //   null,
      //   1,
      //   0,
      // );
      const {item} = await upsertItem({
        source_id: driveId,
        type: 'drive_file',
        title: itemName,
        parent_id: null,
        mimeType: mimeType,
        file_path: null,
        out_show: 1,
        in_show: 0,
      });

      if (selectedCategory != null) {
        await addItemToCategory(selectedCategory, item.id, 'drive');
      }
      console.log(item);
      // Always update UI by removing existing and adding to top
      setDriveLinksList(prev => [
        item,
        ...prev.filter(i => i.source_id !== driveId),
      ]);
    }

    navigation?.navigate('HomeScreen', {screen: 'Drive'});
  } catch (error) {
    console.log(error);
    // console.error('Drive fetch error:', error);
    if (error.response?.status === 403 || error.response?.status === 404) {
      Alert.alert(
        'Access Denied',
        'You need permission to access this file. Request access or try with a different account.',
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
  navigation,
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
      navigation,
      selectedCategory,
      true,
    );
  } catch (err) {
    console.error('❌ Failed to handle file from URI:', err);
    Alert.alert('Error', 'Could not import file from URI');
  }
};

export const handleFileProcessing = async (
  file,
  setDeviceFiles,
  navigation,
  selectedCategory,
  navigateToPlayer = false,
) => {
  const fileName = file.name || `file_${Date.now()}`;
  const destPath = `${RNFS.ExternalDirectoryPath}/${fileName}`;
  const fileExists = await RNFS.exists(destPath);
  const mimeType = file.type || 'unknown';

  if (!fileExists) {
    await RNFS.copyFile(file.uri, destPath);
    console.log(`📁 Copied ${fileName} to local path`);
  } else {
    console.log(`⚠️ ${fileName} already exists locally`);
  }

  const uuid = generateUUID();

  try {
    // await insertDeviceFile(uuid, fileName, destPath, mimeType);
    await upsertItem({
      source_id: uuid,
      type: 'device_file',
      title: fileName,
      mimeType: mimeType,
      file_path: destPath,
    });

    console.log(`✅ Inserted ${fileName} into device_files table`);
  } catch (dbError) {
    console.error(`❌ DB insert failed for ${fileName}:`, dbError);
  }

  const newFile = {
    driveId: uuid,
    name: fileName,
    file_path: destPath,
    source_type: 'device',
    mimeType,
  };
  if (selectedCategory != null) {
    await addItemToCategory(selectedCategory, uuid, 'device');
  }
  setDeviceFiles(prev => [newFile, ...prev]);

  if (navigateToPlayer) {
    navigation.navigate('BacePlayer', {item: newFile});
  } else {
    navigation.navigate('HomeScreen', {screen: 'Device'});
  }
};
