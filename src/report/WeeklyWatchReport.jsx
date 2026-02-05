import React, {useState, useMemo} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Entypo from 'react-native-vector-icons/Entypo';
import WeeklyCardSummary from './WeeklyCardSummary';

const WeeklyWatchReport = ({watchData, navigation}) => {
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const {
    aggregated,
    totalWatchTime: totalWatchAll,
    totalNewWatchTime: totalNewAll,
    totalUnfltrdWatchTime: totalUnfltrdAll,
  } = watchData;

  const sortedVideos = useMemo(() => {
    if (!aggregated || !Array.isArray(aggregated)) return [];
    return [...aggregated].sort(
      (a, b) => (b.totalNewWatchTime || 0) - (a.totalNewWatchTime || 0),
    );
  }, [aggregated]);

  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatDuration = seconds => {
    if (!seconds || isNaN(seconds)) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const pad = n => n.toString().padStart(2, '0');
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  };

  const renderVideoItem = ({item}) => {
    const totalSeconds = item.totalWatchTime || 0;
    const newSeconds = item.totalNewWatchTime || 0;
    const unfilteredSeconds = item.totalUnfltrdWatchTime || 0;
    const revisedSeconds = totalSeconds - newSeconds;
    const repeatedSeconds = unfilteredSeconds - totalSeconds;

    const isExpanded = expandedVideoId === item.videoId;

    return (
      <View style={styles.videoContainer}>
        <TouchableOpacity
          onPress={() =>
            navigation?.navigate('BacePlayer', {item: item.sourceDetails})
          }>
          <View style={{padding: 12}}>
            <View style={styles.videoHeader}>
              <View style={styles.videoInfo}>
                {item.source_type === 'drive' ? (
                  <Entypo name="google-drive" size={14} color="orange" />
                ) : item.source_type === 'youtube' ? (
                  <FontAwesome name="youtube-play" size={14} color="red" />
                ) : item.source_type === 'device' ? (
                  <FontAwesome name="mobile" size={14} color="green" />
                ) : (
                  <FontAwesome name="file" size={14} color="blue" />
                )}
                <Text style={styles.videoTitle} numberOfLines={1}>
                  {item.videoNameInfo || 'Untitled Video'}
                </Text>
              </View>
            </View>

            <View style={styles.timeRowContainer}>
              <View style={styles.timeDistributionBar}>
                {newSeconds > 0 && (
                  <View
                    style={[
                      styles.timeSegment,
                      {
                        width: `${(newSeconds / totalUnfltrdAll) * 100}%`,
                        backgroundColor: '#4CAF50',
                      },
                    ]}
                  />
                )}
                {revisedSeconds > 0 && (
                  <View
                    style={[
                      styles.timeSegment,
                      {
                        width: `${(revisedSeconds / totalUnfltrdAll) * 100}%`,
                        backgroundColor: '#2196F3',
                      },
                    ]}
                  />
                )}
                {repeatedSeconds > 0 && (
                  <View
                    style={[
                      styles.timeSegment,
                      {
                        width: `${(repeatedSeconds / totalUnfltrdAll) * 100}%`,
                        backgroundColor: '#F44336',
                      },
                    ]}
                  />
                )}
                <View
                  style={[
                    styles.timeSegment,
                    {
                      width: `${((totalUnfltrdAll - unfilteredSeconds) / totalUnfltrdAll) * 100}%`,
                      backgroundColor: '#e0e0e0',
                    },
                  ]}
                />
              </View>

              <Text style={styles.totalTimeText}>
                {formatTime(unfilteredSeconds)}
              </Text>

              <View style={{flex: 1}} />

              <View style={styles.badgerow}>
                {newSeconds > 0 && (
                  <View style={[styles.badge, {backgroundColor: '#4CAF50'}]}>
                    <Text style={styles.badgeText}>
                      {formatTime(newSeconds)}
                    </Text>
                  </View>
                )}
                {revisedSeconds > 0 && (
                  <View style={[styles.badge, {backgroundColor: '#2196F3'}]}>
                    <Text style={styles.badgeText}>
                      {formatTime(revisedSeconds)}
                    </Text>
                  </View>
                )}
                {repeatedSeconds > 0 && (
                  <View style={[styles.badge, {backgroundColor: '#F44336'}]}>
                    <Text style={styles.badgeText}>
                      {formatTime(repeatedSeconds)}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.videoProgress}>
          <Text style={styles.totalDurationText}>{formatDuration(0)}</Text>
          <TouchableOpacity
            style={styles.badge}
            onPress={() =>
              setExpandedVideoId(isExpanded ? null : item.videoId)
            }>
            <Text style={styles.detailsButtonText}>
              {isExpanded ? 'Hide' : 'More Details'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.totalDurationText}>
            {formatDuration(item.duration)}
          </Text>
        </View>

        {isExpanded && (
          <View style={styles.expandedDetails}>
            {item.mergedIntervals?.map((interval, idx) => (
              <View key={idx} style={styles.segmentItem}>
                <Text style={styles.intervalText}>
                  {formatTime(interval[0])} - {formatTime(interval[1])}
                </Text>
                <Text style={styles.intervalDuration}>
                  {formatTime(interval[1] - interval[0])}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.progressBar}>
          {item.mergedIntervals?.map((interval, idx) => {
            const startPercentage = (interval[0] / item.duration) * 100;
            const widthPercentage =
              ((interval[1] - interval[0]) / item.duration) * 100;

            return (
              <View
                key={idx}
                style={{
                  position: 'absolute',
                  left: `${startPercentage}%`,
                  width: `${widthPercentage}%`,
                  height: '100%',
                  backgroundColor: '#4CAF50',
                }}
              />
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <>
      <WeeklyCardSummary
        totalUnfltrdAll={totalUnfltrdAll}
        totalNewAll={totalNewAll}
        totalWatchAll={totalWatchAll}
      />
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>Total Videos: </Text>
    <Text style={styles.summaryValue}>{aggregated?.length || 0}</Text>
  </View>

      <FlatList
        data={sortedVideos}
        scrollEnabled={false}
        keyExtractor={item => item.videoId}
        renderItem={renderVideoItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No videos watched this week</Text>
        }
      />
    </>
  );
};

const styles = StyleSheet.create({
  videoContainer: {
    backgroundColor: '#fafafa',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  videoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  videoTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#000',
    marginLeft: 6,
  },
  timeRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  timeDistributionBar: {
    flex: 1,
    height: 12,
    flexDirection: 'row',
    borderRadius: 4,
    overflow: 'hidden',
    marginRight: 8,
  },
  timeSegment: {
    height: '100%',
  },
  badgerow: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  totalTimeText: {
    fontSize: 10,
    color: '#555',
    fontWeight: 'bold',
  },
  expandedDetails: {
    paddingTop: 10,
  },
  segmentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
    paddingHorizontal: 5,
  },
  intervalText: {
    fontSize: 11,
    color: '#555',
  },
  intervalDuration: {
    fontSize: 11,
    color: '#777',
    fontWeight: '500',
  },
  videoProgress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  progressBar: {
    height: 4,
    width: '100%',
    backgroundColor: '#ddd',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
  },
  totalDurationText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#444',
  },
  detailsButtonText: {
    fontSize: 10,
    color: '#333',
  },
  emptyText: {
    padding: 15,
    color: '#888',
    textAlign: 'center',
  },
    summaryRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginLeft:10,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
});

export default WeeklyWatchReport;
