// components/VideoReportItem.js
import React, {useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {getFileIcon} from '../contexts/fileIconHelper';
import { useNavigation } from '@react-navigation/core';

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

const VideoReportItem = ({
  item,
  newSeconds,
  unfilteredSeconds,
  revisedSeconds,
  repeatedSeconds,
  progressBarScale,
  intervals
}) => {
  const [expandedVideoId, setExpandedVideoId] = useState(null);
  const navigation = useNavigation();

  const isExpanded = expandedVideoId === item.id;
  return (
    <View style={styles.videoContainer}>
      <TouchableOpacity
        onPress={() => navigation.navigate('BacePlayer', {item: item})}>
        <View style={{padding: 12}}>
          <View style={styles.videoHeader}>
            {/* Video Icon and Title (smaller) */}
            <View style={styles.videoInfo}>
              <View>{getFileIcon(item.type, 15, 25)}</View>

              <Text style={styles.videoTitle} numberOfLines={1}>
                {item.title || 'Untitled Video'}
              </Text>
            </View>
          </View>

          <View style={styles.timeRowContainer}>
            {/* Time Distribution Bar */}
            <View style={styles.timeDistributionBar}>
              {newSeconds > 0 && (
                <View
                  style={[
                    styles.timeSegment,
                    {
                      width: `${(newSeconds / progressBarScale) * 100}%`,
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
                      width: `${(revisedSeconds / progressBarScale) * 100}%`,
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
                      width: `${(repeatedSeconds / progressBarScale) * 100}%`,
                      backgroundColor: '#F44336',
                    },
                  ]}
                />
              )}
              <View
                style={[
                  styles.timeSegment,
                  {
                    width: `${((progressBarScale - unfilteredSeconds) / progressBarScale) * 100}%`,
                    backgroundColor: '#e0e0e0',
                  },
                ]}
              />
            </View>

            <Text style={styles.totalTimeText}>
              {formatTime(unfilteredSeconds)}
            </Text>

            <View style={{flex: 1}} />

            <View style={styles.badgesContainer}>
              {/* Badges */}
              {newSeconds > 0 && (
                <View style={[styles.badge, {backgroundColor: '#4CAF50'}]}>
                  <Text style={styles.badgeText}>{formatTime(newSeconds)}</Text>
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
        {/* Details Button*/}
        <TouchableOpacity
          style={styles.badge}
          onPress={() => setExpandedVideoId(isExpanded ? null : item.id)}>
          <Text style={styles.detailsButtonText}>
            {isExpanded ? 'Hide' : 'More Details'}
          </Text>
        </TouchableOpacity>
        <Text style={styles.totalDurationText}>
          {formatDuration(item.duration)}
        </Text>
      </View>

      {/* Expanded Segments */}
      {isExpanded && (
        <View style={styles.expandedDetails}>
          {intervals?.map((interval, idx) => (
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
      {/* Always-visible Progress Bar showing watched intervals */}

      <View style={styles.progressBar}>
        {intervals?.map((interval, idx) => {
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

const styles = StyleSheet.create({
  // Video Section Styles
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

  // Time distribution bar (new/revised/repeated)
  timeRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  badgesContainer: {
    width: 110, // 👈 reserve space
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexShrink: 0, // 👈 prevent shrinking
    gap: 4,
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

  // Expanded Segments Styles
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

  // Progress bar showing watched intervals
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
});

export default VideoReportItem;
