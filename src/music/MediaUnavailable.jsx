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

import React, {useEffect, useRef, useState} from 'react';
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
import {cancelDownload} from '../backgroundService/backgroundDownloadService';

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

const MediaUnavailable = ({item, onRetry, onDownloaded}) => {
  const recovery = getRecovery(item);

  const download = useDownloadStore(state => state.downloads[item?.source_id]);
  const removeDownload = useDownloadStore(state => state.removeDownload);
  const status = download?.status;
  const progress = download?.progress;
  const isActive = status === 'queued' || status === 'downloading';

  // Subscribed rather than polled, because the answer changes while the panel
  // is on screen and the panel exists precisely because of that answer.
  const [isOffline, setIsOffline] = useState(false);
  const wasOffline = useRef(false);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      // isInternetReachable is null until the first probe resolves; only a
      // definite false counts, so a slow probe never counts as offline.
      const offline = !state.isConnected || state.isInternetReachable === false;
      setIsOffline(offline);

      // The connection coming back resolves the source again without being
      // asked. This panel is on screen because there was no connection, and a
      // Drive file needs nothing else to play — so the moment there is one it
      // should simply start, rather than sitting behind a button asking the
      // user to act on something the app already knows.
      //
      // On the transition, not the state: firing while merely online would
      // re-resolve on every unrelated NetInfo event, and resolving is what
      // rebuilds the stream url.
      if (wasOffline.current && !offline) onRetry?.();
      wasOffline.current = offline;
    });
    return unsubscribe;
  }, [onRetry]);

  // The download service writes file_path into the items row itself, but this
  // player is rendering an item that came from a route param, so it has to be
  // told — otherwise the panel would sit there in front of a file that is now
  // on disk.
  useEffect(() => {
    if (status !== 'done') return;
    onDownloaded?.(item.source_id, download.localPath);
    removeDownload(item.source_id);
  }, [status]);

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
        size={26}
        color="#cbd5e1"
      />
      {/* One line, not two. This panel lives inside the player, which for audio
          is about 18% of the screen — a second line of a long lecture title was
          enough to push the button off the bottom of it. */}
      <Text style={styles.title} numberOfLines={1}>
        {item?.title}
      </Text>

{/* No copy anywhere is a different situation from one not fetched yet,
          and offering a download that cannot happen would be worse than
          saying plainly that there is nothing to fetch. */}
      {!recovery ? (
        <Text style={styles.message}>
          This recording isn't on your device, and there's no copy to download.
        </Text>
      ) : isOffline ? (
        // Nothing to press. Waiting for the connection is the only thing to do
        // and the listener above is already doing it, so a button here would
        // be a second way to perform an action that happens by itself.
        <Text style={styles.offline}>
          Waiting for a connection.
        </Text>
      ) : (
        <>
          <Text style={styles.message}>
            {status === 'failed'
              ? "That download didn't finish."
              : "Couldn't reach this recording."}
          </Text>

          {/* One action, and it is not downloading. This panel was written when
              a Drive file had to be on the phone before it would play, and said
              "Download to play" — which in front of something that streams asks
              the user to spend storage and a wait on a file they only wanted to
              hear. Keeping a copy offline is a real thing to want, but it lives
              on the row's own menu, where it already is.
              Reached only when online and the resolve still failed, which is
              rare enough to deserve a plain retry and nothing more. */}
          <TouchableOpacity style={styles.button} onPress={onRetry}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
};

export default MediaUnavailable;

const styles = StyleSheet.create({
  // Every measurement here is set against the height this has to live in: the
  // player container, which for audio is roughly 145dp. The old spacing came
  // to about 180dp of content and simply overflowed it, taking the buttons
  // with it.
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#000',
  },
  title: {
    marginTop: 6,
    color: '#f1f5f9',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  message: {
    marginTop: 4,
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
  },
  offline: {
    marginTop: 8,
    color: '#fbbf24',
    fontSize: 12,
    textAlign: 'center',
  },
  button: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#2563eb',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 10,
    marginLeft: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  secondaryButtonText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
});
