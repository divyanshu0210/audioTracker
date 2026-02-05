import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import {BarChart} from 'react-native-gifted-charts';

const WatchTimeChart = ({watchData, newTarget, onWeekChange}) => {
  const [barChartData, setBarChartData] = useState([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(0);
  const [weeksData, setWeeksData] = useState([]);
  const [weekTotalTime, setWeekTotalTime] = useState(0);


  const [loading, setLoading] = useState(false);
  // Use ref to track the latest state
  const stateRef = useRef();
  stateRef.current = {
    currentWeekStart,
    weeksData,
  };

  useEffect(() => {
    if (watchData) {
      prepareAllWeeksData();
    }
  }, [watchData]);

  useEffect(() => {
    if (weeksData.length > 0) {
      updateCurrentWeekData();
    }
  }, [currentWeekStart, weeksData]);

  const prepareAllWeeksData = useCallback(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const allDates = Object.keys(watchData).sort();
    const weeks = [];
    let currentWeek = [];

    for (let i = 0; i < allDates.length; i++) {
      const date = allDates[i];
      const day = new Date(date);
      const dayOfWeek = day.getDay(); // Sunday=0, Monday=1, ..., Saturday=6

      currentWeek.push(date);

      const isSunday = dayOfWeek === 0;
      const isLastDate = i === allDates.length - 1;
      const isTodayOrBefore = date <= todayStr;

      if (isSunday || isLastDate) {
        if (currentWeek.includes(todayStr)) {
          const lastDate = new Date(currentWeek[currentWeek.length - 1]);
          const missingDays = 6 - ((lastDate.getDay() + 6) % 7); // Adjust for Mon-starting week

          for (let j = 1; j <= missingDays; j++) {
            const nextDate = new Date(lastDate);
            nextDate.setDate(lastDate.getDate() + j);
            const nextDateStr = nextDate.toISOString().split('T')[0];
            currentWeek.push(nextDateStr);
          }

          weeks.push([...currentWeek]);
          break;
        } else if (isTodayOrBefore) {
          weeks.push([...currentWeek]);
          currentWeek = [];
        } else {
          break;
        }
      }
    }

    setWeeksData(weeks);
    setCurrentWeekStart(Math.max(0, weeks.length - 1));
    // console.log(weeks)
  }, [watchData]);

  const updateCurrentWeekData = useCallback(() => {
    const currentWeekDates = weeksData[currentWeekStart];
    // console.log(currentWeekDates, currentWeekStart);

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const getMondayBasedDayIndex = day => (day + 6) % 7;

    const bars = currentWeekDates.map(date => {
      const dayData = watchData[date] || {
        totalWatchTime: 0,
        totalNewWatchTime: 0,
        totalUnfltrdWatchTime: 0,
      };
      const dayNumber = new Date(date).getDate();
      const dayOfWeek = new Date(date).getDay();
      const labelIndex = getMondayBasedDayIndex(dayOfWeek);

      const revisedWatchTime = Math.max(
        0,
        dayData.totalWatchTime - dayData.totalNewWatchTime,
      );
      const residualUnfiltered = Math.max(
        0,
        dayData.totalUnfltrdWatchTime - dayData.totalWatchTime,
      );

      return {
        value: dayData.totalUnfltrdWatchTime,
        stacks: [
          {
            value: dayData.totalNewWatchTime,
            color: '#10b981',
          },
          {
            value: revisedWatchTime,
            color: '#3b82f6',
          },
          {
            value: residualUnfiltered,
            color: '#FF9999',
          },
        ],
        label: dayNames[labelIndex],
        labelTextStyle: {color: 'gray', fontSize: 10},
        topLabelComponent: () => (
          <Text style={{color: 'gray', fontSize: 10}}>{dayNumber}</Text>
        ),
      };
    });

    setBarChartData(bars);
    const totalTime = parseFloat(
      bars
        .reduce((sum, bar) => sum + (bar.stacks[0]?.value || 0), 0)
        .toFixed(2),
    );

    setWeekTotalTime(totalTime);
    if (onWeekChange) {
      onWeekChange({
        weekIndex: currentWeekStart,
        weekDates: currentWeekDates,
        totalWatchTime: bars.reduce(
          (sum, bar) => sum + bar.stacks.reduce((s, b) => s + b.value, 0),
          0,
        ),
      });
    }

    setLoading(false);
  }, [weeksData, currentWeekStart, watchData, onWeekChange]);

  const maxWatchTime =
    barChartData.length > 0
      ? Math.max(
          ...barChartData.map(b =>
            b.stacks.reduce((sum, stack) => sum + stack.value, 0),
          ),
        )
      : newTarget;

  const handlePrevWeek = useCallback(() => {
    const {currentWeekStart, weeksData} = stateRef.current;
    if (weeksData.length > 0) {
       setLoading(true);
      setCurrentWeekStart(Math.max(0, currentWeekStart - 1));
    }
  }, []);

  const handleNextWeek = useCallback(() => {
    const {currentWeekStart, weeksData} = stateRef.current;
    if (weeksData.length > 0) {
       setLoading(true);
      setCurrentWeekStart(Math.min(weeksData.length - 1, currentWeekStart + 1));
    }
  }, []);
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (evt, gestureState) => {
        const {currentWeekStart, weeksData} = stateRef.current;
        const isFirstWeek = currentWeekStart === 0;
        const isLastWeek =
          currentWeekStart === Math.max(0, weeksData.length - 1);

        // Check for swipe left (next week)
        if (gestureState.dx < -50 && !isLastWeek) {
          handleNextWeek();
        }
        // Check for swipe right (previous week)
        else if (gestureState.dx > 50 && !isFirstWeek) {
          handlePrevWeek();
        }
      },
    }),
  ).current;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Week {currentWeekStart + 1} Progress</Text>

        <View style={styles.legendContainer}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, {backgroundColor: '#3b82f6'}]} />
            <Text style={styles.legendText}>Revised</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, {backgroundColor: '#FF9999'}]} />
            <Text style={styles.legendText}>Repeated</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, {backgroundColor: '#10b981'}]} />
            <Text style={styles.legendText}>New</Text>
          </View>
        </View>
      </View>
      <View style={styles.header}>
        <View style={{marginVertical: 6}}>
          <Text style={{fontSize: 12, color: '#1f2937', fontWeight: '500'}}>
            Completed: {weekTotalTime} / {newTarget * 7} mins
          </Text>
        </View>
      </View>
      <View
        {...panResponder.panHandlers} // Add gesture handlers here
      >
        <View style={{paddingRight: 40}} pointerEvents="none">
          <BarChart
            stackData={barChartData}
            height={140}
            width={320}
            noOfSections={4}
            maxValue={Math.max(maxWatchTime, newTarget) * 1.2}
            yAxisTextStyle={{fontSize: 10, color: 'gray'}}
            showReferenceLine1
            referenceLine1Position={newTarget}
            referenceLine1Config={{
              color: 'black',
              dashWidth: 2,
              dashGap: 1,
            }}
            barWidth={22}
            spacing={20}
            barBorderRadius={5}
            disablePress={true}
          />
        </View>
        {loading && (
    <View style={styles.loaderOverlay}>
      <ActivityIndicator size="large" color="#3b82f6" />
    </View>
  )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 5,
    elevation: 2,
    alignItems: 'center',
  },
  header: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    // marginBottom: 16,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 3,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#666',
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  navButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 4,
  },
  disabledButton: {
    backgroundColor: '#f1f5f9',
    opacity: 0.5,
  },
  navButtonText: {
    fontSize: 12,
    color: '#334155',
  },
  weekIndicator: {
    fontSize: 12,
    color: '#777',
  },
  loaderOverlay: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(255,255,255,0.7)',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10,
},
});

export default WatchTimeChart;
