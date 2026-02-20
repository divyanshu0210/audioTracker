import React, {useState, useMemo} from 'react';
import {View, Text, FlatList, StyleSheet, TouchableOpacity} from 'react-native';
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import Entypo from 'react-native-vector-icons/Entypo';
import {getFileIcon} from '../contexts/fileIconHelper';
import VideoReportItem from './VideoReportItem';
import SummaryCard from './SummaryCard';

const WeeklyWatchReport = ({watchData}) => {
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

  const renderVideoItem = ({item}) => {
    const totalSeconds = item.totalWatchTime || 0;
    const newSeconds = item.totalNewWatchTime || 0;
    const unfilteredSeconds = item.totalUnfltrdWatchTime || 0;
    const revisedSeconds = totalSeconds - newSeconds;
    const repeatedSeconds = unfilteredSeconds - totalSeconds;

    return (
      <VideoReportItem
        item={item}
        newSeconds={newSeconds}
        unfilteredSeconds={unfilteredSeconds}
        revisedSeconds={revisedSeconds}
        repeatedSeconds={repeatedSeconds}
        progressBarScale={totalUnfltrdAll}
        intervals={item.mergedIntervals}
      />
    );
  };

  return (
    <>
      <SummaryCard
        totalUnfiltered={totalUnfltrdAll}
        totalNew={totalNewAll}
        totalWatch={totalWatchAll}
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
    marginLeft: 10,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
});

export default WeeklyWatchReport;
