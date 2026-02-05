import {StyleSheet, Text, View} from 'react-native';
import React, {useCallback, useEffect, useLayoutEffect} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import CalendarProgress from './CalenderProgress';
import StreakInfo from './StreakInfo';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';

const ReportScreen = () => {
  // const {params} = useRoute();
  // const mentee = params?.mentee;
  const {activeMentee: mentee,activeMentor} = useMentorMenteeStore();
    // If mentor is active, mentees can't see mentor's report
  if (activeMentor) {
    return (
      <View style={styles.centered}>
        <Text style={styles.restrictedText}>
          Mentor report can't be seen by mentee
        </Text>
      </View>
    );
  }

  return (
    <View style={{flex: 1}}>
      {!mentee && <StreakInfo />}
      <CalendarProgress />
    </View>
  );
};

export default ReportScreen;
  
const styles = StyleSheet.create({
  nameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  emailText: {
    fontSize: 12,
    color: 'gray',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  restrictedText: {
    fontSize: 16,
    color: '#777',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});
