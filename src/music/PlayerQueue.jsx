// PlayerQueue.jsx
//
// The "up next" strip docked at the bottom of BacePlayer, plus the full queue
// sheet it opens. Owns its own open/closed state so toggling the queue doesn't
// re-render the player (and the video/note tree underneath it) — the parent
// only supplies the playlist and the navigation callbacks.

import React, {useCallback, useRef, useState} from 'react';
import {
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

// The queue list uses a plain ScrollView, not a FlatList: a playlist is small
// enough that virtualization buys nothing, and virtualization is precisely
// what broke opening at the current item — VirtualizedList only measures the
// handful of rows it has rendered, so any scroll past that window got clamped
// (a 28-item queue would refuse to scroll past ~20). A ScrollView measures its
// full content, so scrolling to an exact offset always lands.
// Rows are a fixed height so that offset is just index * height.
const QUEUE_ROW_HEIGHT = 48;
const QUEUE_HEADER_HEIGHT = 46;
const QUEUE_MAX_HEIGHT_RATIO = 0.55;

const {height: SCREEN_HEIGHT} = Dimensions.get('window');

const PlayerQueue = ({
  playlist,
  currentIndex,
  currentTitle,
  onNext,
  onPrevious,
  onJumpToIndex,
}) => {
  const [showQueue, setShowQueue] = useState(false);
  const scrollRef = useRef(null);
  // Guards the one-time scroll-to-current-item per queue open, so later
  // content-size changes don't yank the list back while the user is scrolling.
  const scrolledRef = useRef(false);

  const openQueue = useCallback(() => {
    scrolledRef.current = false;
    setShowQueue(true);
  }, []);

  const closeQueue = useCallback(() => setShowQueue(false), []);

  // Scrolls to the playing item once the ScrollView reports its real content
  // height. onContentSizeChange is the reliable moment for this: the content
  // is fully measured by then, so the offset can't be clamped away (which is
  // what happened with FlatList, where content height only covered the few
  // virtualized rows rendered so far).
  const handleContentSizeChange = useCallback(() => {
    if (scrolledRef.current) return;
    scrolledRef.current = true;
    scrollRef.current?.scrollTo({
      y: currentIndex * QUEUE_ROW_HEIGHT,
      animated: false,
    });
  }, [currentIndex]);

  const handleRowPress = useCallback(
    index => {
      setShowQueue(false);
      onJumpToIndex(index);
    },
    [onJumpToIndex],
  );

  if (playlist.length <= 1) return null;

  const isFirst = currentIndex === 0;
  const isLast = currentIndex === playlist.length - 1;

  // Definite height (not just maxHeight) so the ScrollView inside has a
  // bounded viewport to scroll within, while still hugging content for
  // short playlists instead of leaving a half-empty sheet.
  const sheetHeight = Math.min(
    SCREEN_HEIGHT * QUEUE_MAX_HEIGHT_RATIO,
    QUEUE_HEADER_HEIGHT + playlist.length * QUEUE_ROW_HEIGHT + 8,
  );

  return (
    <>
      {/* Docked at the very bottom of the screen (YouTube-style "up next"
          strip) rather than sitting inline under the shrinking/growing
          player, so it stays put regardless of the player's height. */}
      <View style={styles.queueBar}>
        <TouchableOpacity
          onPress={onPrevious}
          disabled={isFirst}
          style={styles.queueBarSideBtn}>
          <Icon name="skip-previous" size={26} color={isFirst ? '#777' : '#fff'} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.queueBarCenter} onPress={openQueue}>
          <Text style={styles.queueBarText} numberOfLines={1}>
            {currentIndex + 1} / {playlist.length} · {currentTitle || 'Playing'}
          </Text>
          <Icon name="playlist-play" size={22} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onNext}
          disabled={isLast}
          style={styles.queueBarSideBtn}>
          <Icon name="skip-next" size={26} color={isLast ? '#777' : '#fff'} />
        </TouchableOpacity>
      </View>

      {/* Mounted only while open — the rows are built eagerly, and a Modal
          renders nothing while hidden anyway, so keeping it mounted would
          rebuild the whole list on every render for no reason. */}
      {showQueue && (
        <Modal visible transparent animationType="slide" onRequestClose={closeQueue}>
          <View style={styles.queueOverlay}>
            {/* Backdrop as an absolute sibling rather than a wrapper —
                wrapping the sheet meant it had to claim the touch responder
                to stay open, which also swallowed the list's scroll gestures. */}
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={closeQueue}
            />
            <View style={[styles.queueSheet, {height: sheetHeight}]}>
              <Text style={styles.queueSheetTitle}>Up Next ({playlist.length})</Text>
              <ScrollView
                ref={scrollRef}
                style={styles.queueList}
                onContentSizeChange={handleContentSizeChange}>
                {playlist.map((qItem, index) => (
                  <TouchableOpacity
                    key={`${qItem.source_id ?? qItem.id ?? index}-${index}`}
                    style={[
                      styles.queueRow,
                      index === currentIndex && styles.queueRowActive,
                    ]}
                    onPress={() => handleRowPress(index)}>
                    <Text style={styles.queueRowIndex}>{index + 1}</Text>
                    <Text
                      style={[
                        styles.queueRowTitle,
                        index === currentIndex && styles.queueRowTitleActive,
                      ]}
                      numberOfLines={1}>
                      {qItem.title}
                    </Text>
                    {index === currentIndex && (
                      <Icon name="volume-up" size={18} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

export default React.memo(PlayerQueue);

const styles = StyleSheet.create({
  queueBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    paddingVertical: 8,
    paddingHorizontal: 6,
    zIndex: 15,
  },
  queueBarSideBtn: {
    padding: 8,
  },
  queueBarCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  queueBarText: {
    flexShrink: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  queueOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  queueSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  queueSheetTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#222',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  queueList: {
    flex: 1,
  },
  queueRow: {
    // Fixed height (not padding-derived) so scrolling to
    // index * QUEUE_ROW_HEIGHT lands exactly on the row.
    height: QUEUE_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  queueRowActive: {
    backgroundColor: '#f0f7ff',
  },
  queueRowIndex: {
    width: 24,
    textAlign: 'center',
    color: '#888',
    fontSize: 13,
  },
  queueRowTitle: {
    flex: 1,
    color: '#333',
    fontSize: 14,
  },
  queueRowTitleActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
