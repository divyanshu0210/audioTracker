// components/StreakInfo.js
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {getDb} from '../database/database';
import useSettingsStore from '../Settings/settingsStore';
import {useFocusEffect} from '@react-navigation/core';

const calculateStreaks = (dailyWatchTimes, dailyTarget) => {
  let currentStreak = 0;
  let maxStreak = 0;

  if (!dailyWatchTimes || dailyWatchTimes.length === 0) {
    console.log('No watch time data available.');
    return { current: 0, max: 0 };
  }

  const formatDate = (date) => date.toISOString().split('T')[0];

  const dailyMap = new Map();
  for (let item of dailyWatchTimes) {
    dailyMap.set(item.date, item.dailyTotal);
  }

  console.log('Daily Watch Times:', dailyMap);
  console.log('Target:', dailyTarget);

  // ====== Calculate current streak ======
  let streak = 0;
  let checkDate = new Date();
  checkDate.setDate(checkDate.getDate() - 1); // Start from yesterday

  while (true) {
    const dateStr = formatDate(checkDate);

    if (!dailyMap.has(dateStr)) {
      console.log(`Streak break: no data for ${dateStr}`);
      break;
    }

    const total = dailyMap.get(dateStr);
    if (total >= dailyTarget) {
      streak++;
      console.log(`✅ ${dateStr} met the target (${total})`);
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      console.log(`❌ ${dateStr} did not meet the target (${total})`);
      break;
    }
  }

  const todayStr = formatDate(new Date());
  const todayTotal = dailyMap.get(todayStr);
  if (todayTotal >= dailyTarget) {
    console.log(`✅ Today (${todayStr}) met the target (${todayTotal})`);
    currentStreak = streak + 1;
  } else {
    console.log(`❌ Today (${todayStr}) did not meet the target (${todayTotal ?? 'no data'})`);
    currentStreak = streak;
  }

  // ====== Calculate max streak ======
  const metDates = [...dailyMap.entries()]
    .filter(([_, total]) => total >= dailyTarget)
    .map(([date]) => date)
    .sort();

  let prevDate = null;
  let tempStreak = 0;

  console.log('✅ Dates where target was met:', metDates);

  for (let dateStr of metDates) {
    const currentDate = new Date(dateStr);
    if (prevDate) {
      const diff = (currentDate - prevDate) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    } else {
      tempStreak = 1;
    }

    maxStreak = Math.max(maxStreak, tempStreak);
    prevDate = currentDate;

    console.log(`Streak on ${dateStr}: temp = ${tempStreak}, max = ${maxStreak}`);
  }

  console.log(`👉 Final Current Streak: ${currentStreak}`);
  console.log(`🏆 Final Max Streak: ${maxStreak}`);

  return { current: currentStreak, max: maxStreak };
};


const StreakInfo = () => {
  const [dailyWatchTimes, setDailyWatchTimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const {settings} = useSettingsStore();

  useFocusEffect(
    useCallback(() => {
      const fetchDailyTotals = async () => {
        try {
          const fastdb = getDb();
          const results = await new Promise((resolve, reject) => {
            fastdb.transaction(tx => {
              tx.executeSql(
                `SELECT 
                  date, 
                  SUM(newWatchTimePerDay) as dailyTotal
                 FROM video_watch_history
                 GROUP BY date
                 ORDER BY date ASC;`,
                [],
                (_, result) => {
                  const rows = [];
                  for (let i = 0; i < result.rows.length; i++) {
                    rows.push(result.rows.item(i));
                  }

                  setDailyWatchTimes(rows);

                  resolve(rows);
                },
                (_, error) => {
                  console.error('Error fetching watch history:', error);
                  reject(error);
                },
              );
            });
          });
        } catch (error) {
          console.error('Error:', error);
        } finally {
          setLoading(false);
        }
      };

      fetchDailyTotals();
    }, []),
  );

  const {current, max} = useMemo(() => {
    if (loading || dailyWatchTimes.length === 0) return {current: 0, max: 0};
    return calculateStreaks(
      dailyWatchTimes,
      settings.TARGET_NEW_WATCH_TIME * 60,
    );
  }, [dailyWatchTimes, loading,settings.TARGET_NEW_WATCH_TIME ]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.item}>Loading streak data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.item}>Continous streak</Text>
      <View style={{flex: 1}} />
      <Text style={styles.item}>🔥Current: {current} </Text>
      <Text style={styles.separator}>|</Text>
      <Text style={styles.item}>🏆 Max: {max}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f7f9fc',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  item: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  separator: {
    marginHorizontal: 10,
    fontSize: 14,
    color: '#aaa',
  },
});

export default React.memo(StreakInfo);
