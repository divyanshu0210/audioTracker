import React, {useEffect, useRef, useState, useCallback} from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import {Provider} from 'react-native-paper';
import HomeFABBtn from '../components/buttons/HomeFABBtn';
import {useAppState} from '../contexts/AppStateContext';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {getAllCategories} from '../categories/catDB';
import {
  fetchNotification,
  updateNotificationCount,
} from '../appNotification/notificationsMgt';
import {isAssignmentPending} from '../appMentorBackend/assignmentsMgt';
import {BASE_URL} from '../appMentorBackend/userMgt';
import HomeTabs from './HomeTabs';

const HomeScreen = () => {
  const {setCategories, selectedCategory, setSelectedCategory, userInfo} =
    useAppState();

  const {setMentors, setMentees, activeMentee, activeMentor} =
    useMentorMenteeStore();
  const isActive = activeMentee || activeMentor;

  // Initial load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const cats = await getAllCategories();
        setCategories(cats);
        setSelectedCategory(null);
      } catch (err) {
        console.error('Failed to load categories', err);
      }
    };

    const loadInitialNotifications = async () => {
      try {
        await fetchNotification();
        await isAssignmentPending();
        await updateNotificationCount();
      } catch (err) {
        console.error('Failed to load notifications', err);
      }
    };

    loadInitialData();
    loadInitialNotifications();
    fetchMentorMenteeData();
  }, []);

  const fetchMentorMenteeData = useCallback(async () => {
    try {
      const response = await fetch(`${BASE_URL}/mentorships/${userInfo?.id}/`);
      const data = await response.json();
      setMentors(data.mentors || []);
      setMentees(data.mentees || []);
    } catch (err) {
      console.error('Error:', err);
    }
  }, [userInfo?.id]);

  return (
    <Provider>
      <SafeAreaView style={styles.container}>
        <View style={{flex: 1, padding: 10}}>
          <HomeTabs categoryId={selectedCategory} />
        </View>
        {!isActive && <HomeFABBtn />}
      </SafeAreaView>
    </Provider>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
