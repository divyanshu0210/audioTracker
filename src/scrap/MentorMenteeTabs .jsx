import React, {useEffect, useState, useCallback} from 'react';
import {ActivityIndicator, View, StyleSheet, SafeAreaView} from 'react-native';
import {createMaterialTopTabNavigator} from '@react-navigation/material-top-tabs';
import MentorList from '../appMentor/MentorList';
import MenteeList from '../appMentor/MenteeList';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import { useFocusEffect } from '@react-navigation/core';
import { useAppState } from '../contexts/AppStateContext';
import { BASE_URL } from '../appMentorBackend/userMgt';

const Tab = createMaterialTopTabNavigator();

const MentorMenteeTabs = () => {
  const [refreshing, setRefreshing] = useState(false);
  const {userInfo} = useAppState();
  const {mentors, setMentors, setMentees, mentees} = useMentorMenteeStore();

  const fetchData = useCallback(() => {
    setRefreshing(true);
    fetch(`${BASE_URL}/mentorships/${userInfo?.id}/`)
      .then(res => res.json())
      .then(data => {
        setMentors(data.mentors || []);
        setMentees(data.mentees || []);
      })
      .catch(err => console.error('Error:', err))
      .finally(() => {
        setRefreshing(false);
      });
  }, [userInfo]);

useFocusEffect(
  useCallback(() => {
    fetchData();

  }, [])
);

  return (
    <SafeAreaView style={styles.container}>
      <Tab.Navigator
        screenOptions={{
            swipeEnabled: true, 
          tabBarActiveTintColor: '#000',
          tabBarIndicatorStyle: {backgroundColor: '#000'},
          tabBarStyle: {
            backgroundColor: '#f0f0f0',
            marginBottom: 5,
            borderRadius: 10,
          },
          tabBarLabelStyle: {
            fontWeight: 'bold',
            fontSize: 15,
            marginHorizontal: -15,
          },
        }}>
        <Tab.Screen
          name="Mentees"
          options={{tabBarLabel: `Mentees (${mentees.length})`}}>
          {() => <MenteeList refreshing={refreshing} onRefresh={fetchData} />}
        </Tab.Screen>
        <Tab.Screen
          name="Mentors"
          options={{tabBarLabel: `Mentors (${mentors.length})`}}>
          {() => <MentorList refreshing={refreshing} onRefresh={fetchData} />}
        </Tab.Screen>
      </Tab.Navigator>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    container: {
    flex: 2,
    // padding:10
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MentorMenteeTabs;
