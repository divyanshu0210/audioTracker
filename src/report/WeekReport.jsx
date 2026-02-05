import React, {useCallback, useEffect, useState} from 'react';
import {SafeAreaView, Text} from 'react-native';

import WeeklyWatchReport from './WeeklyWatchReport';
import { getAggregatedWatchHistory } from '../database/R';
import { useFocusEffect } from '@react-navigation/core';

const WeekReport = ({startDate, endDate}) => {
  const [weeklyData, setWeeklyData] = useState([]);

useFocusEffect(
  useCallback(() => {
    const fetchData = async () => {
      const data = await getAggregatedWatchHistory(startDate, endDate);
      console.log('weekly data',data)
      setWeeklyData(data);
    };
    fetchData();
  }, [startDate, endDate])
);

  return (
    <SafeAreaView style={{flex: 1,paddingVertical:12}}>
    
      <WeeklyWatchReport watchData={weeklyData} />
    </SafeAreaView>
  );
};

   

export default WeekReport;
