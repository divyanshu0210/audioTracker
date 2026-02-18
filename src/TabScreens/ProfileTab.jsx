import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect, useState} from 'react';
import {useIsFocused, useNavigation} from '@react-navigation/native'; // Import the hook
import Profile from '../categories/Profile';
import HistoryComponent from '../history/HistoryComponent';
import CategoryPreview from '../categories/CategoryPreview';

const ProfileTab = () => {

  return (
    <>
      <Profile />
      <View style={styles.container}>
        <HistoryComponent />
        <CategoryPreview />
      </View>
    </>
  );
};

export default ProfileTab;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    gap: 15,
  },
});
