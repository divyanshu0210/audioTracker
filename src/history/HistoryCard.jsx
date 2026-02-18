import {useNavigation} from '@react-navigation/core';
import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

const SegmentedProgressBar = ({intervals, duration}) => {
  if (!duration) return null;

  return (
    <View style={styles.segmentedBar}>
      {intervals.map(([start, end], index) => {
        const leftPercent = (start / duration) * 100;
        const widthPercent = ((end - start) / duration) * 100;

        return (
          <View
            key={index}
            style={[
              styles.segment,
              {
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const formatSeconds = seconds => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

const formatDate = dateString => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
};

export const HistoryItem = ({
  item,
  variant = 'card', // "card" | "list"
}) => {
  const navigation = useNavigation();
  let thumbnailSource = null;

  if (item.type === 'youtube_video') {
    thumbnailSource = {
      uri: `https://img.youtube.com/vi/${item.source_id}/mqdefault.jpg`,
    };
  } else {
    thumbnailSource = require('../assets/video-placeholder.png');
  }

  const totalWatched = item.watchedIntervals.reduce(
    (sum, [start, end]) => sum + (end - start),
    0,
  );

  const isList = variant === 'list';

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('BacePlayer', {item: item})}
      style={[isList ? styles.listContainer : styles.cardContainer]}>
      {/* Thumbnail */}
      <View
        style={[
          styles.thumbnailContainer,
          isList && styles.listThumbnailContainer,
        ]}>
        {thumbnailSource && (
          <Image source={thumbnailSource} style={styles.thumbnail} />
        )}
        <SegmentedProgressBar
          intervals={item.watchedIntervals}
          duration={item.duration}
        />
      </View>

      {/* Details */}
      <View style={[isList && styles.listDetails]}>
        <Text
          style={[styles.videoTitle, isList && styles.listTitle]}
          numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.watchInfo}>
          Watched {formatSeconds(totalWatched)} of{' '}
          {formatSeconds(item.duration)}
        </Text>

        {!isList && <Text style={styles.dateText}>{formatDate(item.date)}</Text>}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  /* ---------- CARD (horizontal scroll small) ---------- */

  cardContainer: {
    width: 160,
    marginRight: 12,
  },

  /* ---------- LIST (full history screen row) ---------- */

  listContainer: {
    flexDirection: 'row',
    marginVertical: 8,
    gap: 10,
  },

  listDetails: {
    flex: 1,
    justifyContent: 'center',
  },

  listThumbnailContainer: {
    width: 120,
    height: 70,
    marginBottom: 0,
  },

  listTitle: {
    fontSize: 14,
    fontWeight: '600',
  },

  /* ---------- Shared ---------- */

  thumbnailContainer: {
    width: 160,
    height: 90,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
    position: 'relative',
  },

  thumbnail: {
    width: '100%',
    height: '100%',
  },

  videoTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
    color: '#333',
  },

  watchInfo: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },

  dateText: {
    fontSize: 12,
    color: '#999',
  },

  segmentedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#ddd',
  },

  segment: {
    position: 'absolute',
    height: '100%',
    backgroundColor: '#FF4C4C',
  },
});
