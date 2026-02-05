import React, {useState, useEffect, useCallback, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {Calendar} from 'react-native-calendars';
import {generateWatchData} from './utils/ProgressDataCollector';
import {getSumOfWatchTimesByDate} from '../database/R';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import {SafeAreaView} from 'react-native-safe-area-context';
import WatchTimeChart from './WatchTimeChart';
import {ScrollView} from 'react-native-gesture-handler';
import StreakInfo from './StreakInfo';
import useSettingsStore from '../Settings/settingsStore';
import WatchTimePieChart from './WatchTimePieChart';
import WeekReport from './WeekReport';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import WeeklyReportCard from './WeeklyReportCard';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {getMonthlyWatchTimefromBackend, getWatchTimefromBackend} from '../appMentorBackend/reportMgt';

const getAchievementColor = (time, target) => {
  if (!target || target === 0) return null;

  const percentage = (time / target) * 100;

  if (percentage >= 100) return '#2E7D32'; // Dark Green
  if (percentage >= 90) return '#47c04dff'; // Light Green
  if (percentage >= 50) return '#A5D6A7'; // Amber
  if (percentage >= 15) return '#FFbbbb'; // Orange
  return '#FF6666'; // Red
};

const getLegendWithTime = target => {
  const getMinutes = percent => Math.floor((percent / 100) * target);

  return [
    {
      color: '#2E7D32',
      label: `${getMinutes(100)}+ min`,
      // label: `100%+ (${getMinutes(100)}+ min)`,
    },
    {
      color: '#47c04dff',
      label: `${getMinutes(91)}–${getMinutes(99)} min`,
      // label: `75–99% (${getMinutes(75)}–${getMinutes(99)} min)`,
    },
    {
      color: '#A5D6A7',
      label: `${getMinutes(50)}–${getMinutes(90)} min`,
      // label: `50–74% (${getMinutes(50)}–${getMinutes(74)} min)`,
    },  
    {
      color: '#FFbbbb',
      label: `${getMinutes(15)}–${getMinutes(49)} min`,
      // label: `15–49% (${getMinutes(15)}–${getMinutes(49)} min)`,
    },
    {
      color: '#FF6666',
      label: `0-${getMinutes(14)} min`,
      // label: `0–14% (0–${getMinutes(14)} min)`,
    },
    // {
    //   color: 'rgba(100,100,255,0.3)',
    //   label: 'Today',
    // },
    // {
    //   color: 'rgba(135, 135, 255, 0.1)',
    //   label: 'Current Week',
    // },
    // {
    //   color: 'transparent',
    //   borderColor: '#1E90FF',
    //   borderWidth: 1,
    //   label: 'Selected',
    // },
  ];
};

const CalendarProgress = () => {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const navigation = useNavigation();
  const [data, setData] = useState({});
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [currentWeek, setCurrentWeek] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(
    new Date().toISOString().slice(0, 7),
  ); // YYYY-MM
  const [loading, setLoading] = useState(false);
  const cache = useRef({}); // Cache for storing month data
  const {settings} = useSettingsStore();
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings; // Keep the ref in sync
  }, [settings]);

  const prevTargetNewWatchTime = useRef(settings.TARGET_NEW_WATCH_TIME);
  const legendItems = useMemo(() => {
    return getLegendWithTime(settings.TARGET_NEW_WATCH_TIME);
  }, [settings.TARGET_NEW_WATCH_TIME]);
  const {activeMentee: mentee} = useMentorMenteeStore();


  useEffect(() => {
    if (
      prevTargetNewWatchTime.current !==
      settingsRef.current.TARGET_NEW_WATCH_TIME
    ) {
   
      cache.current = {};
      // Refetch current month data
      fetchWatchData(currentMonth, true, true);
      // Update the ref
      prevTargetNewWatchTime.current =
        settingsRef.current.TARGET_NEW_WATCH_TIME;
    }
  }, [
    settingsRef.current.TARGET_NEW_WATCH_TIME,
    settings.TARGET_NEW_WATCH_TIME,
    currentMonth,
  ]);

  useEffect(() => {

    fetchWatchData(currentMonth, true,true);
    const previousMonth = getPreviousMonth(currentMonth);
    fetchWatchData(previousMonth, false);
  }, [mentee]);

  useFocusEffect(
    useCallback(() => {
      const currentMonthNow = new Date().toISOString().slice(0, 7);
      if (currentMonth === currentMonthNow) {
        // console.log('Focus effect running', {currentMonth});
        fetchWatchDataForToday();
      }
    }, [currentMonth]),
  );

 const fetchWatchData = async (
  month,
  updateUI = true,
  forceRefresh = false,
) => {
  // Force refresh if mentee exists
  const isMentorView = !!mentee;
  const shouldForceFetch = isMentorView || forceRefresh;

  if (!shouldForceFetch && cache.current[month]) {
    if (updateUI) setData(cache.current[month]);
    return;
  }

  const currentMonthNow = new Date().toISOString().slice(0, 7);
  if (month > currentMonthNow) {
    setData({});
    return;
  }

  if (updateUI) setLoading(true);

  try {
    const watchData = await generateWatchData(
      month,
      settingsRef.current.TARGET_NEW_WATCH_TIME,
      mentee?.id, // Pass mentee ID if exists
    );
    if (!isMentorView) {
      cache.current[month] = watchData; // Only cache for self
    }
    if (updateUI) setData(watchData);
  } catch (error) {
    console.error('Error fetching watch data:', error);
  }

  if (updateUI) setLoading(false);
};


  const  getTodayDatafromBackend= async()=> {
    const data = await getWatchTimefromBackend(mentee.id, today, today)
  if (!data || Object.keys(data).length === 0) {
    return {
      totalWatchTime: 0,
      totalNewWatchTime: 0,
      totalUnfltrdWatchTime: 0
    };
  }

  const firstKey = Object.keys(data)[0];
  const {
    totalWatchTime = 0,
    totalNewWatchTime = 0,
    totalUnfltrdWatchTime = 0
  } = data[firstKey] || {};

  return { totalWatchTime, totalNewWatchTime, totalUnfltrdWatchTime };
}



  const fetchWatchDataForToday = async () => {
    try {
      const {totalWatchTime, totalNewWatchTime, totalUnfltrdWatchTime} =
        mentee
          ? await getTodayDatafromBackend(today)
          : await getSumOfWatchTimesByDate(today);
      const totalWatchTimeInMinutes = totalWatchTime / 60;
      const totalNewWatchTimeInMinutes = totalNewWatchTime / 60;
      const totalUnfltrdWatchTimeInMinutes = totalUnfltrdWatchTime / 60;

      const updatedDayData = {
        totalWatchTime: totalWatchTimeInMinutes,
        totalNewWatchTime: totalNewWatchTimeInMinutes,
        totalUnfltrdWatchTime: totalUnfltrdWatchTimeInMinutes,
      };

      const month = today.slice(0, 7);
      if (!cache.current[month]) {
        cache.current[month] = {};
      }
      cache.current[month][today] = updatedDayData;
      // console.log(updatedDayData);

      setData(prevData => ({
        ...prevData,
        [today]: updatedDayData,
      }));
    } catch (error) {
      console.error("Error fetching today's watch data:", error);
    }
  };

  const getPreviousMonth = month => {
    const [year, monthNum] = month.split('-').map(Number);
    const prevMonth =
      monthNum === 1
        ? `${year - 1}-12`
        : `${year}-${String(monthNum - 1).padStart(2, '0')}`;
    return prevMonth;
  };

  const handleMonthChange = month => {
    const newMonth = month.dateString.slice(0, 7);
    const currentMonthNow = new Date().toISOString().slice(0, 7);

    // Don't allow navigation to future months
    // if (newMonth > currentMonthNow) return;

    if (newMonth === currentMonth) return;

    cache.current[currentMonth] = data;
    setCurrentMonth(newMonth);
    fetchWatchData(newMonth, true);
    const previousMonth = getPreviousMonth(newMonth);
    fetchWatchData(previousMonth, false);
  };

  const handleDayPress = day => {
    // Don't allow clicking on dates after today
    if (day.dateString > today) return;

    setSelectedDate(day.dateString);
    const dayData = data[day.dateString] || {
      totalWatchTime: 0,
      totalNewWatchTime: 0,
      totalUnfltrdWatchTime: 0,
    };
    navigation.navigate('DayReport', {
      date: day.dateString,
      watchData: dayData,
      mentee : mentee
    });
  };

  const onWeekChange = useCallback(({weekIndex, weekDates}) => {
    setCurrentWeek(weekDates);
  }, []);

  const getColorIntensity = noteLength => {
    const scale = Math.min(noteLength / 1000, 1);
    return `rgba(0, 0, 128, ${scale})`;
  };

  const generateMarkedDates = () => {
    const markedDates = {};
    // console.log('from calender', data);
    Object.keys(data).forEach(date => {
      markedDates[date] = {
        customStyles: {
          container: {
            backgroundColor: 'transparent',
          },
        },
      };
    });

    // // Highlight current week if available
    if (currentWeek) {
      // console.log('currentWeek', currentWeek);
      currentWeek.forEach(date => {
        markedDates[date] = {
          ...markedDates[selectedDate],
          customStyles: {
            container: {
              ...(markedDates[date]?.customStyles?.container || {}),
              backgroundColor: 'rgba(135, 135, 255, 0.1)', // Week highlight
              borderRadius: 0,
            },
          },
        };
      });
    }

    if (selectedDate) {
      // console.log(typeof selectedDate, selectedDate);
      markedDates[selectedDate] = {
        ...markedDates[selectedDate],
        customStyles: {
          container: {
            ...(markedDates[selectedDate]?.customStyles?.container || {}),
            borderWidth: 1,
            borderColor: '#1E90FF',
            borderRadius: 5,
          },
        },
      };
    }

    if (today) {
      markedDates[today] = {
        ...markedDates[today],
        selected: true,
        selectedColor: 'rgba(100, 100, 255, 0.3)',
        customStyles: {
          container: {
            ...(markedDates[today]?.customStyles?.container || {}),
            borderRadius: 5,
          },
        },
      };
    }
    // console.log(markedDates);
    return markedDates;
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator
          size="large"
          color="#0000ff"
          style={{marginTop: 20}}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <ScrollView>
        <Calendar
          key={settings.TARGET_NEW_WATCH_TIME}
          firstDay={1}
          markingType={'custom'}
          hideExtraDays={true}
          enableSwipeMonths={true}
          onDayPress={handleDayPress}
          onMonthChange={handleMonthChange}
          markedDates={generateMarkedDates()}
          style={{margin: -5}}
          theme={{
            'stylesheet.day.basic': {
              base: {
                // width: 20,
                // height: 20,
                alignItems: 'center',
                justifyContent: 'center',
              },
            },
          }}
          dayComponent={({date, state, marking}) => {
            // if (!date || state === 'disabled') return null;
            if (!date) return null;
            const isDisabled = state === 'disabled';
            const dateKey = date.dateString;
            const isFutureDate = dateKey > today;
            const dayData = data[dateKey] || {
              totalWatchTime: 0,
              totalNewWatchTime: 0,
              totalUnfltrdWatchTime: 0,
            };
            const isToday = dateKey === today;
            const isSelected = dateKey === selectedDate;
            // Get the color based on achievement percentage
            const achievementColor = getAchievementColor(
              dayData.totalUnfltrdWatchTime,
              // dayData.totalNewWatchTime,
              settingsRef.current.TARGET_NEW_WATCH_TIME,
            );
            return (
              <TouchableOpacity
                style={[
                  styles.dayContainer,
                  marking?.customStyles?.container,
                  isToday && !isSelected && styles.selectedDateContainer,
                  isSelected && styles.todayContainer,
                  marking?.selected && {backgroundColor: marking.selectedColor},
                  isFutureDate && styles.disabledDate,
                ]}
                onPress={() =>
                  !isFutureDate && handleDayPress({dateString: dateKey})
                }
                disabled={isFutureDate}>
                <View style={styles.dateContent}>
                  <View
                    style={[
                      styles.dateWrapper,
                      achievementColor && {
                        backgroundColor: achievementColor,
                        borderRadius: 12,
                      },
                      isDisabled && {opacity: 0.7},
                      isFutureDate && styles.disabledDateWrapper,
                    ]}>
                    <Text
                      style={[
                        styles.dayText,
                        achievementColor && styles.achievedDayText,
                        isFutureDate && styles.disabledDayText,
                      ]}>
                      {date.day}
                    </Text>
                  </View>

                  <View style={styles.spacer} />

                  <Text
                    style={[
                      styles.totalWatchTime,
                      isFutureDate && styles.disabledDayText,
                    ]}>
                    {isFutureDate
                      ? ''
                      // : `${Math.round(dayData.totalNewWatchTime)} min`}
                      : `${Math.round(dayData.totalUnfltrdWatchTime)} min`}
                  </Text>
                </View>

                {/* {!isFutureDate && (
              <View
                style={[
                  styles.intensityBar,
                  { backgroundColor: getColorIntensity(dayData.noteLength) },
                ]}
              />
            )} */}
              </TouchableOpacity>
            );
          }}
        />
        <View style={styles.legendContainer}>
          {legendItems.map((item, index) => (
            <View key={index} style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  {backgroundColor: item.color || 'transparent'},
                  item.borderColor && {
                    borderColor: item.borderColor,
                    borderWidth: item.borderWidth || 1,
                  },
                ]}
              />
              <Text style={styles.legendText}>{item.label}</Text>
            </View>
          ))}
        </View>

        {Object.keys(data).length === 0 ? (
          <View style={styles.container}>
            <Text
              style={{
                color: 'gray',
                fontSize: 12,
                textAlign: 'center',
                padding: 20,
              }}>
              No Watch Data available
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <WatchTimeChart
              watchData={data}
              newTarget={settings.TARGET_NEW_WATCH_TIME}
              onWeekChange={onWeekChange}
            />

            {currentWeek && !mentee && (
              <WeeklyReportCard currentWeek={currentWeek} />
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayContainer: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    // minHeight: 30,
    width: '100%',
    paddingVertical: 5,
    marginVertical: -5,
    borderRadius: 5,
    color: '#000',
  },
  dateContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    width: '100%',
  },
  dateWrapper: {
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  achievedDayText: {
    color: 'white',
  },
  totalWatchTime: {
    fontSize: 10,
    color: 'black',
    // marginVertical: 2,
  },
  intensityBar: {
    height: 4,
    width: '80%',
    borderRadius: 2,
    // marginTop: 4,
  },
  spacer: {
    height: 2,
  },
  todayContainer: {
    borderWidth: 1,
    borderColor: 'rgb(100, 100, 255)',
    borderRadius: 5,
  },
  selectedDateContainer: {
    backgroundColor: 'rgba(100, 100, 255, 0.2)',
    borderRadius: 5,
  },
  disabledDate: {
    opacity: 0.9,
  },
  disabledDateWrapper: {
    backgroundColor: 'transparent',
  },
  disabledDayText: {
    color: '#aaa',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 10,
    padding: 10,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    // paddingTop: 5,
    // marginHorizontal: 10,
    backgroundColor: '#fff',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 15,
    marginBottom: 8,
  },
  legendColor: {
    width: 10,
    height: 10,
    marginRight: 3,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#333',
  },
});

export default CalendarProgress;
