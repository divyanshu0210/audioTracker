import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
} from 'react-native';
import {
  getRecentlyWatchedVideos,
} from '../database/R';
import {useFocusEffect, useNavigation} from '@react-navigation/core';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';

const VIDEO_COLORS = ['#FF4C4C', '#FF9900', '#4CAF50', '#2196F3', '#9C27B0'];

const SegmentedProgressBar = ({intervals, duration}) => {
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
                backgroundColor: '#FF4C4C',
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const ShimmerHistoryItem = () => {
  return (
    <View style={styles.shimmerItem}>
      <ShimmerPlaceholder style={styles.shimmerThumbnail} autoRun={true} />
      <ShimmerPlaceholder style={styles.shimmerTextLine} autoRun={true} />
      <ShimmerPlaceholder style={styles.shimmerTextLine} autoRun={true} />
      <ShimmerPlaceholder
        style={[styles.shimmerTextLine, {width: '70%'}]}
        autoRun={true}
      />
      <ShimmerPlaceholder
        style={[styles.shimmerTextLine, {width: '50%'}]}
        autoRun={true}
      />
    </View>
  );
};

const HistoryItem = ({item, onPress}) => {
  let thumbnailSource = null;
  if (item.source_type === 'youtube') {
    thumbnailSource = {
      uri: `https://img.youtube.com/vi/${item.resolved_videoId}/mqdefault.jpg`,
    };
  } else if (item.source_type === 'drive' || item.source_type === 'device') {
    thumbnailSource = require('../assets/video-placeholder.png');
  }

  const totalWatched = item.watchedIntervals.reduce(
    (sum, [start, end]) => sum + (end - start),
    0,
  );

  return (
    <TouchableOpacity style={styles.historyItem} onPress={onPress}>
      <View style={styles.thumbnailContainer}>
        {thumbnailSource && (
          <Image source={thumbnailSource} style={styles.thumbnail} />
        )}
        <SegmentedProgressBar
          intervals={item.watchedIntervals}
          duration={item.duration}
        />
      </View>
      <Text style={styles.videoTitle} numberOfLines={2}>
        {item.videoNameInfo}
      </Text>
      <Text style={styles.watchInfo}>
        Watched {formatSeconds(totalWatched)} of {formatSeconds(item.duration)}
      </Text>
      <Text style={styles.dateText}>{formatDate(item.date)}</Text>
    </TouchableOpacity>
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

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  }
};

const HistoryComponent = () => {
  const [recentVideos, setRecentVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      const loadRecentVideos = async () => {
        try {
          setLoading(true);
          const videos = await getRecentlyWatchedVideos();
          setRecentVideos(videos);
        } catch (error) {
          console.error('Error loading recently watched videos:', error);
        } finally {
          setLoading(false);
          // setTimeout(() => setLoading(false), 0);
        }
      };

      loadRecentVideos();
    }, []),
  );
  const handleItemPress = item => {
    // Navigate to video player with the item's details
    navigation.navigate('BacePlayer', {item: item.sourceDetails});
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Recently Watched</Text>
          <ShimmerPlaceholder style={styles.shimmerViewAll} autoRun={true} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.historyScroll}>
          {[...Array(3)].map((_, index) => (
            <ShimmerHistoryItem key={`shimmer-${index}`} />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Recently Watched</Text>
        {recentVideos.length > 0 && (
          <TouchableOpacity
            onPress={() => {
              navigation.navigate('FullHistoryScreen', {
                fullHistory: recentVideos,
              });
            }}>
            <Text style={styles.viewAllButton}>View All</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.historyScroll}>
        {recentVideos.length > 0 ? (
          recentVideos.map((item, index) => (
            <HistoryItem
              key={`${item.videoId}-${index}`}
              item={item}
              onPress={() => handleItemPress(item)}
            />

            //             <FlatList
            //   horizontal
            //   data={recentVideos}
            //   keyExtractor={(item, index) => `${item.videoId}-${index}`}
            //   renderItem={({item}) => (
            //     <HistoryItem item={item} onPress={() => handleItemPress(item)} />
            //   )}
            //   showsHorizontalScrollIndicator={false}
            //   contentContainerStyle={styles.historyScroll}
            // />
          ))
        ) : (
          <View style={styles.emptyTextContainer}>
            <Text style={styles.emptyText}>No recently watched videos</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    // paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    // paddingHorizontal: 16,
    // marginBottom: 12,
  },
  loadingContainer: {
    // flex: 1,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateSelector: {
    // paddingHorizontal: 8,
    marginBottom: 12,
  },
  dateButton: {
    // paddingHorizontal: 12,
    paddingVertical: 8,
    // marginHorizontal: 4,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  historyScroll: {
    // paddingHorizontal: 8,
  },
  historyItem: {
    width: 160,
    marginRight: 12,
  },
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
  watchedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  watchedProgress: {
    height: '100%',
    backgroundColor: 'red',
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
    flexDirection: 'row',
    overflow: 'hidden',
  },

  segment: {
    position: 'absolute',
    height: '100%',
    borderRadius: 2,
  },
  viewAllButton: {
    color: '#2196F3',
    fontWeight: '500',
    fontSize: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // paddingHorizontal: 16,
    marginBottom: 12,
  },
  shimmerItem: {
    width: 160,
    marginRight: 12,
  },
  shimmerThumbnail: {
    width: 160,
    height: 90,
    borderRadius: 8,
    marginBottom: 8,
  },
  shimmerTextLine: {
    height: 12,
    borderRadius: 4,
    marginBottom: 6,
    width: '90%',
  },
  shimmerTitle: {
    width: 150,
    height: 24,
    borderRadius: 4,
  },
  shimmerViewAll: {
    width: 60,
    height: 20,
    borderRadius: 6,
  },
  emptyTextContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 75,
    minWidth: Dimensions.get('window').width,
    alignSelf: 'center',
  },

  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});

export default HistoryComponent;
