import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import {PieChart} from 'react-native-gifted-charts';
import PropTypes from 'prop-types';
import {fetchWatchTimeData} from '../database/pie';
import {useFocusEffect} from '@react-navigation/core';

const WatchTimePieChart = ({startDate, endDate}) => {
  const [pieData, setPieData] = useState([]);
  const [baseData, setBaseData] = useState([]);
  const [detailedData, setDetailedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDrilledDown, setIsDrilledDown] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchWatchTimeData(startDate, endDate);

      let youtubeTotal = 0;
      const youtubeChannels = [];

      data.forEach(item => {
        if (item.name === 'Device' || item.name === 'Drive') return;
        youtubeTotal += item.time;
        youtubeChannels.push({
          value: item.time,
          label: item.name,
          color: item.color,
          text: `${(item.time / 60).toFixed(1)}`,
          textSize: 11,
          fontWeight: '600',
        });
      });

      const base = [
        ...(youtubeTotal > 0
          ? [
              {
                value: youtubeTotal,
                label: 'Youtube',
                color: '#FF4C4C',
                text: `${(youtubeTotal / 60).toFixed(1)}`,
                textSize: 11,
                fontWeight: '600',
              },
            ]
          : []),
        ...data
          .filter(d => d.name === 'Device' || d.name === 'Drive')
          .map(d => ({
            value: d.time,
            label: d.name,
            color: d.color,
            text: `${(d.time / 60).toFixed(1)}`,
            textSize: 11,
            fontWeight: '600',
          })),
      ];

      setBaseData(base);
      setDetailedData(youtubeChannels);
      setPieData(base);
      setIsDrilledDown(false);
    } catch (err) {
      console.error('Failed to fetch watch time data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

const handleSliceClick = index => {
  if (!detailedData.length) return; // No YouTube data? Do nothing.

  if (!isDrilledDown) {
    setPieData(detailedData);
    setIsDrilledDown(true);
  } else {
    setPieData(baseData);
    setIsDrilledDown(false);
  }
};


  if (loading) {
    return (
      <ActivityIndicator size="large" color="#000" style={{marginTop: 20}} />
    );
  }

  if (error) {
    return (
      <Text style={{textAlign: 'center', marginTop: 20, color: 'red'}}>
        {error}
      </Text>
    );
  }

  if (pieData.length < 1) {
    return (
      <Text style={{textAlign: 'center', marginTop: 20}}>
        No watch data available
      </Text>
    );
  }

  const totalMinutes = Math.round(
    pieData.reduce((sum, item) => sum + item.value, 0) / 60,
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weekly Sources</Text>
      <Text style={styles.subheading}>
        {isDrilledDown
          ? 'Watch Time per YouTube Channel'
          : 'Watch Time Breakdown per Sources'}
      </Text>
      {!isDrilledDown && baseData.some(item => item.label === 'Youtube') && (
        <Text style={[styles.subheading, {fontSize: 10}]}>
          (Click for More Details)
        </Text>
      )}

      <PieChart
        data={pieData}
        donut
        showText
        // showValuesAsLabelsOutside
        // showTextBackground={false}
        textColor="white"
        radius={80}
        innerRadius={35}
        centerLabelComponent={() => (
          <View style={styles.centerLabel}>
            <Text style={styles.totalLabel}>
              {isDrilledDown ? 'YT Total' : 'Total'}
            </Text>
            <Text style={styles.totalTime}>{totalMinutes} min</Text>
          </View>
        )}
        onPress={(item, index) => handleSliceClick(index)}
      />
      <View style={styles.legendContainer}>
        {pieData.map((item, index) => (
          <View key={index} style={styles.legendItem}>
            <View style={[styles.legendColor, {backgroundColor: item.color}]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

// Example YouTube color palette
const getYtColor = i =>
  ['#9b59b6', '#e67e22', '#3498db', '#e74c3c', '#2ecc71', '#8e44ad', '#1abc9c'][
    i % 7
  ];

const styles = StyleSheet.create({
  container: {
    padding: 12,
    borderRadius: 12,
    // marginHorizontal: 10,
    // marginBottom: 10,
    backgroundColor: '#fff',
    elevation: 2,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 10,
    alignSelf: 'flex-start',
    color: '#333',
  },
  subheading: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 6,
    color: 'gray',
    alignSelf: 'center',
  },
  centerLabel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalLabel: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  totalTime: {
    color: '#000',
    fontSize: 14,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 5,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 5,
  },
  legendText: {
    fontSize: 12,
    color:'#000',
  },
});

export default WatchTimePieChart;
