import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect, useState} from 'react';
import {useIsFocused, useNavigation} from '@react-navigation/native'; // Import the hook
import HistoryComponent from '../history/HistoryComponent';
import CategoriesView from '../categories/CategoriesView';
import ProfileHeader from '../components/headers/ProfileHeader';

const ProfileTab = () => {

  return (
    <>
      <ProfileHeader />
      <View style={styles.container}>
        <HistoryComponent />
        <CategoriesView mode='preview'/>
      </View>
    </>
  );
};

export default ProfileTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor:'#fff',
    gap: 15,
  },
});
