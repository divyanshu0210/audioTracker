// MediaThumbnail.jsx
//
// Shared thumbnail tile used by both the Downloads cards and the Recently-
// Watched (history) cards — they render the exact same tile, so the logic
// lives here once: pick a thumbnail (real one if present, YouTube's remote
// thumb for YT videos, else a media-kind placeholder). `children` render
// inside the tile so callers can overlay extras (e.g. history's progress bar
// or a superimposed type badge).

import React from 'react';
import {Image, StyleSheet, View} from 'react-native';
import {getFileIcon} from '../contexts/fileIconHelper';

const AUDIO_PLACEHOLDER = require('../assets/audio-placeholder.png');
const VIDEO_PLACEHOLDER = require('../assets/video-placeholder.png');

const SOURCE_LABELS = {
  youtube_video: 'YouTube',
  device_file: 'Device',
  drive_file: 'Drive',
  iskcon_file: 'ISKCON',
};

export const sourceLabelFor = item => SOURCE_LABELS[item.type] || 'File';

// Match what each source's row component passes to getFileIcon: device files
// use mimeType (audio vs video icon), the rest use their type (YT/drive/iskcon
// branding).
export const iconInput = item =>
  item.type === 'device_file' ? item.mimeType : item.type;

// Returns an <Image> source when there's a sensible one to show (a real
// thumbnail, YouTube's remote thumb, an audio/video placeholder, or the
// downloaded image itself), or null when there isn't — MediaThumbnail then
// falls back to a getFileIcon icon instead of guessing with a placeholder.
const thumbnailSourceFor = item => {
  if (item.type === 'youtube_video') {
    return {uri: `https://img.youtube.com/vi/${item.source_id}/mqdefault.jpg`};
  }
  if (item.thumbnail) return {uri: item.thumbnail};
  if (item.mimeType?.startsWith('audio/')) return AUDIO_PLACEHOLDER;
  if (item.mimeType?.startsWith('video/')) return VIDEO_PLACEHOLDER;
  if (item.mimeType?.startsWith('image/') && item.file_path) {
    // Local downloads store a plain filesystem path (e.g. from
    // RNFS.ExternalDirectoryPath) with no scheme — Image needs file:// to
    // load it on Android, otherwise it just fails silently.
    const isRemoteOrAlreadyScheme = /^(file|https?):\/\//.test(item.file_path);
    return {uri: isRemoteOrAlreadyScheme ? item.file_path : `file://${item.file_path}`};
  }
  return null;
};

export const MediaThumbnail = ({item, isList, children}) => {
  const source = thumbnailSourceFor(item);
  return (
    <View style={[styles.container, isList && styles.listContainer]}>
      {source ? (
        <Image source={source} style={styles.image} />
      ) : (
        <View style={styles.iconFallback}>{getFileIcon(item.mimeType, 24, 48)}</View>
      )}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    backgroundColor: '#F0F0F0',
  },
  listContainer: {
    width: 120,
    height: 70,
    marginBottom: 0,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  iconFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MediaThumbnail;
