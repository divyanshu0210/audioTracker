import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import {HistoryItem} from './HistoryCard';
import { getWatchHistoryByDate } from '../database/R';

const FullHistoryScreen = () => {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setLoading(true);

        // Get history for the last 30 days
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        const startDateStr = startDate.toISOString().split('T')[0];

        // Fetch all history items within this period
        const allHistory = [];
        const date = new Date(endDate);

        while (date >= new Date(startDateStr)) {
          const dateStr = date.toISOString().split('T')[0];
          const dayHistory = await getWatchHistoryByDate(dateStr);
          allHistory.push(
            ...dayHistory.map(item => ({...item, date: dateStr})),
          );
          date.setDate(date.getDate() - 1);
        }

        // Group by date
        const grouped = allHistory.reduce((acc, item) => {
          if (!acc[item.date]) acc[item.date] = [];
          acc[item.date].push(item);
          return acc;
        }, {});

        // Create sections
        const formattedSections = Object.entries(grouped)
          .sort((a, b) => new Date(b[0]) - new Date(a[0])) // Latest to oldest
          .map(([date, data]) => ({title: formatDate(date), data}));

        setSections(formattedSections);
      } catch (error) {
        console.error('Error loading history:', error);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []);

  const renderItem = ({item, index}) => (
    <HistoryItem key={`${item.videoId}-${index}`} item={item} variant="list" />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item, index) => `${item.videoId}-${index}`}
      renderItem={renderItem}
      renderSectionHeader={({section: {title}}) => (
        <Text style={styles.sectionHeader}>{title}</Text>
      )}
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No watch history found</Text>
        </View>
      }
      contentContainerStyle={styles.listContainer}
      stickySectionHeadersEnabled={false}
    />
  );
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
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
};


const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 50,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    backgroundColor: '#eee',
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    borderRadius: 4,
    color: '#555',
  },
});


export default FullHistoryScreen;
