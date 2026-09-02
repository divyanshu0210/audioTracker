// MediaUnavailable.jsx
//
// What the player shows when it has an item but nothing to play from.
//
// That state has two causes and one appearance: media that arrived attached to
// a shared note and was never downloaded, and a device file whose row survived
// a restore without its bytes. Both leave items.file_path empty, and the player
// used to render nothing at all — a black rectangle with no explanation.
//
// It lives here, in the player surface, rather than as a prompt when the note
// is opened. Reading a note is not asking to hear the recording, and most
// shared notes are read without ever playing anything. Every route that does
// ask — tapping a timestamp, tapping the timestamp on a screenshot, dragging
// the player open — ends with the player visible (seekToTimestamp calls
// showPlayerMinimized unconditionally), so putting the offer here covers all of
// them with one implementation and none of them with a modal.

import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import useDownloadStore from '../stores/useDownloadStore';
import {
  cancelDownload,
  enqueueDownload,
} from '../backgroundService/backgroundDownloadService';
import {getLocalFilePath} from '../components/buttons/Download';
import {downloadSharedCopy} from '../share/shareDeviceFile';

/**
 * Where this item's bytes can be fetched from, or null if nowhere.
 *
 * A Drive file is its own address — source_id is the Drive id. A device file
 * is not: it came off someone's phone, and is reachable only through the copy
 * uploaded to Drive, whose id rides along on the row (see the notes query's
 * shared_drive_copies join).
 */
const getRecovery = item => {
  if (!item || item.file_path) return null;
  if (item.type === 'drive_file') return 'drive';
  if (item.type === 'device_file' && item.drive_file_id) return 'copy';
  return null;
};

const MediaUnavailable = ({item, onDownloaded}) => {
  const recovery = getRecovery(item);

  const download = useDownloadStore(state => state.downloads[item?.source_id]);
  const removeDownload = useDownloadStore(state => state.removeDownload);
  const status = download?.status;
  const progress = download?.progress;
  const isActive = status === 'queued' || status === 'downloading';

  // Starting a transfer with no connection fails somewhere inside RNFS and
  // surfaces as a generic failed download, so the button says so up front
  // instead. Subscribed rather than polled — the answer can change while the
  // panel is on screen, and it should stop being a dead end the moment it does.
  const [isOffline, setIsOffline] = useState(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable is null until the first probe resolves; only a
      // definite false counts, so a slow probe never blocks the button.
      setIsOffline(!state.isConnected || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  // The download service writes file_path into the items row itself, but this
  // player is rendering an item that came from a route param, so it has to be
  // told — otherwise the panel would sit there in front of a file that is now
  // on disk.
  useEffect(() => {
    if (status !== 'done') return;
    onDownloaded?.(item.source_id, download.localPath);
    removeDownload(item.source_id);
  }, [status]);

  const handleDownload = useCallback(async () => {
    try {
      if (recovery === 'copy') {
        await downloadSharedCopy(item);
        return;
      }
      await enqueueDownload({
        id: item.id,
        sourceId: item.source_id,
        title: item.title,
        url: `https://www.googleapis.com/drive/v3/files/${item.source_id}?alt=media`,
        localPath: getLocalFilePath(item.source_id, item.title),
        type: item.type,
        mimeType: item.mimeType,
        googleAuth: true,
      });
    } catch (error) {
      console.error('Could not start the download from the player:', error);
    }
  }, [item, recovery]);

  if (isActive) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.title} numberOfLines={2}>
          {item?.title}
        </Text>
        <Text style={styles.message}>
          {progress == null ? 'Downloading…' : `Downloading… ${progress}%`}
        </Text>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => cancelDownload(item.source_id)}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={recovery ? 'cloud-download-outline' : 'cloud-off-outline'}
        size={34}
        color="#cbd5e1"
      />
      <Text style={styles.title} numberOfLines={2}>
        {item?.title}
      </Text>

      {/* No copy anywhere is a different situation from one not fetched yet,
          and offering a download that cannot happen would be worse than
          saying plainly that there is nothing to fetch. */}
      {!recovery ? (
        <Text style={styles.message}>
          This recording isn't on your device, and there's no copy to download.
        </Text>
      ) : (
        <>
          <Text style={styles.message}>
            {status === 'failed'
              ? "That download didn't finish."
              : "This recording isn't on your device yet."}
          </Text>
          {isOffline ? (
            <Text style={styles.offline}>
              No internet connection — reconnect to download it.
            </Text>
          ) : (
            <TouchableOpacity style={styles.button} onPress={handleDownload}>
              <Text style={styles.buttonText}>
                {status === 'failed' ? 'Try again' : 'Download to play'}
              </Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
};

export default MediaUnavailable;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#000',
  },
  title: {
    marginTop: 10,
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    marginTop: 6,
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  offline: {
    marginTop: 12,
    color: '#fbbf24',
    fontSize: 12,
    textAlign: 'center',
  },
  button: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2563eb',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  secondaryButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
});
