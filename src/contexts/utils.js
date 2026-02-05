
import AsyncStorage from '@react-native-async-storage/async-storage';

export function getYouTubeIdType(youtubeId) {
  if (!youtubeId || typeof youtubeId !== 'string') {
    return null;
  }
  const trimmedId = youtubeId.trim();
  const isPlaylist =
    trimmedId.length > 11 &&
    (trimmedId.startsWith('PL') ||
      trimmedId.startsWith('UU') ||
      trimmedId.startsWith('LL') ||
      trimmedId.startsWith('FL') ||
      trimmedId.startsWith('RD'));
  if (isPlaylist) {
    return 'youtube_playlist';
  }
  const isVideo = /^[a-zA-Z0-9_-]{11}$/.test(trimmedId);
  if (isVideo) {
    return 'youtube_video';
  }
  return null;
}


export const debugAsyncStorage = async () => {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const allItems = await AsyncStorage.multiGet(allKeys);

    console.log('🔍 AsyncStorage Contents:');
    allItems.forEach(([key, value]) => {
      console.log(`🗝️ ${key}:`, value);
    });
  } catch (error) {
    console.error('❌ Error reading AsyncStorage:', error);
  }
};
