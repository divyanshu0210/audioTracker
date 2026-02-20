import React, {useState} from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import WatchTimePieChart from './WatchTimePieChart';
import WeekReport from './WeekReport';

const WeeklyReportCard = ({currentWeek}) => {
  const [weeklyExpanded, setWeeklyExpanded] = useState(false);

  if (!currentWeek) return null;

  return (
    <View
      style={{
        // flex:1,
        padding: 5,
        // margin:10,
        marginTop: 10,
        backgroundColor: '#fff',
        borderRadius: 12,
        // marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}>
      <TouchableOpacity
        onPress={() => setWeeklyExpanded(prev => !prev)}
        style={{
          padding: 10,
          //   borderBottomWidth: 1,
          //   borderBottomColor: '#f0f0f0',
          flexDirection: 'row',
          alignItems: 'center',
        }}>
        <Text style={{fontSize: 14, fontWeight: 'bold', color: '#333'}}>
          Weekly Report
        </Text>
        <MaterialIcons
          name={!weeklyExpanded ? 'arrow-drop-down' : 'arrow-right'}
          size={30}
          color="#000"
          style={{marginTop: 1}}
        />
      </TouchableOpacity>

      {weeklyExpanded && (
        <>
          <WatchTimePieChart
            startDate={currentWeek[0]}
            endDate={currentWeek[currentWeek.length - 1]}
          />
          <WeekReport
            startDate={currentWeek[0]}
            endDate={currentWeek[currentWeek.length - 1]}
          />
        </>
      )}
    </View>
  );
};

export default WeeklyReportCard;
