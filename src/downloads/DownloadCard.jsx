// DownloadCard.jsx
//
// Card for one download. Shares its thumbnail tile with the Recently-Watched
// cards via MediaThumbnail. For a completed download, tapping opens it —
// in-app for audio/video/YouTube, via the OS "open with" dialog for anything
// else. For an in-progress one (`download` prop set), the thumbnail shows a
// loading overlay and a ✕ button cancels that specific download (which also
// updates the service notification).

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import RNFS from 'react-native-fs';
import FileViewer from 'react-native-file-viewer';

import {getFileIcon} from '../contexts/fileIconHelper';
import {navigationRef} from '../handlers/navigationRef';
import {cancelDownload} from '../backgroundService/backgroundDownloadService';
import {isAudioOrVideo} from '../Linking/utils/handleLinkSubmit';
import MediaThumbnail, {
  iconInput,
  sourceLabelFor,
} from '../components/MediaThumbnail';

export const DownloadCard = ({item, variant = 'card', style, download}) => {
  const isList = variant === 'list';
  const isActive = !!download;

  const progress = download?.progress;
  const statusText =
    download?.status === 'queued'
      ? 'Queued…'
      : progress == null
      ? 'Downloading…'
      : `Downloading ${progress}%`;

  // Audio/video (and YouTube) play in-app; everything else — PDFs, images,
  // docs, zips — opens via the OS "open with" dialog in its own app, same
  // as BaseItem's handleDriveFilePress does for the un-downloaded browse view.
  const onPress = async () => {
    if (isActive) return;
    if (item.type === 'youtube_video' || isAudioOrVideo(item.mimeType)) {
      navigationRef.navigate('BacePlayer', {item});
      return;
    }
    if (!item.file_path) return;
    const exists = await RNFS.exists(item.file_path);
    if (!exists) return;
    FileViewer.open(item.file_path, {showOpenWithDialog: true}).catch(() => {
      Alert.alert(
        'Could not open file.',
        'You do not have a proper app to view this file',
      );
    });
  };

  const cancel = () => cancelDownload(item.source_id);

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isActive}
      style={[isList ? styles.listContainer : styles.cardContainer, style]}>
      <MediaThumbnail item={item} isList={isList}>
        {isActive && (
          <View style={styles.progressOverlay}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}
      </MediaThumbnail>

      <View style={isList ? styles.listDetails : styles.cardDetails}>
        <Text
          style={[styles.title, isList && styles.listTitle]}
          numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.sourceRow}>
          {getFileIcon(iconInput(item), 11, 20)}
          <Text style={styles.sourceText}>
            {isActive ? statusText : sourceLabelFor(item)}
          </Text>
        </View>
      </View>

      {isActive && (
        <TouchableOpacity
          onPress={cancel}
          hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
          style={isList ? styles.cancelList : styles.cancelCard}>
          <MaterialIcons name="close" size={18} color="#fff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    width: 150,
    marginRight: 12,
  },
  cardDetails: {
    paddingHorizontal: 2,
  },

  listContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    gap: 12,
  },
  listDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
  },

  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    fontSize: 12,
    color: '#999',
  },

  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  cancelCard: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelList: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default DownloadCard;
