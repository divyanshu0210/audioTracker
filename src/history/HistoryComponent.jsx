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
import {useFocusEffect, useNavigation} from '@react-navigation/core';
import ShimmerPlaceholder from 'react-native-shimmer-placeholder';
import {HistoryItem} from './HistoryCard';
import { getRecentlyWatchedVideos } from '../database/R';

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
          console.log(videos);
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
            />
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    // paddingHorizontal: 16,
    // marginBottom: 12,
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
  historyScroll: {
    // paddingHorizontal: 8,
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

  // ── Shimmer-related ───────────────────────────────────────────────
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
  shimmerViewAll: {
    width: 60,
    height: 20,
    borderRadius: 6,
  },
});

export default HistoryComponent;
