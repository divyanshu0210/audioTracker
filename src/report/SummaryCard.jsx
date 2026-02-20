import React from 'react';
import {View, Text, StyleSheet} from 'react-native';

const SummaryCard = ({
  totalUnfiltered = 0,
  totalNew = 0,
  totalWatch = 0,
}) => {
  const totalRevised = totalWatch - totalNew;
  const totalRepeated = totalUnfiltered - totalWatch;

  const formatTime = seconds => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total: </Text>
          <Text style={styles.summaryValue}>
            {formatTime(totalUnfiltered)}
          </Text>
        </View>

        <View style={styles.timeBadgeContainer}>
          <View style={[styles.timeBadge, {backgroundColor: '#E8F5E9'}]}>
            <Text style={[styles.timeBadgeText, {color: '#4CAF50'}]}>
              New: {formatTime(totalNew)}
            </Text>
          </View>

          <View style={[styles.timeBadge, {backgroundColor: '#E3F2FD'}]}>
            <Text style={[styles.timeBadgeText, {color: '#2196F3'}]}>
              Revised: {formatTime(totalRevised)}
            </Text>
          </View>

          <View style={[styles.timeBadge, {backgroundColor: '#FFEBEE'}]}>
            <Text style={[styles.timeBadgeText, {color: '#F44336'}]}>
              Repeated: {formatTime(totalRepeated)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  summaryLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  timeBadgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  timeBadge: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  timeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default SummaryCard;
