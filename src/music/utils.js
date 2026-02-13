import { isAudioFile } from '../Linking/utils/handleLinkSubmit';

 export const getPlaceholderForMimeType = mimeType => {
  if (!mimeType) return require('../assets/video-placeholder.png');

  if (mimeType.startsWith('audio/')) {
    return require('../assets/audio-placeholder.png');
  } else if (mimeType.startsWith('video/')) {
    return require('../assets/video-placeholder.png');
  }

  // Default fallback
  return require('../assets/video-placeholder.png');
};
