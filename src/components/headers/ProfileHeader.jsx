import {Image, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import {useNavigation} from '@react-navigation/core';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useAppState } from '../../contexts/AppStateContext';

const ProfileHeader = () => {
  const {userInfo} = useAppState();
  const navigation = useNavigation();

  return (
    <View style={styles.headerContainer}>
      <View style={styles.profileRow}>
        <Image source={{uri: userInfo?.photo}} style={styles.imageStyle} />
        <View style={styles.textContainer}>
          <Text style={styles.nameText}>{userInfo?.name ?? ''}</Text>
          <Text style={styles.emailText}>{userInfo?.email ?? ''}</Text>
        </View>
        <View style={{flexDirection:'row',gap:15}}>

        {/* <TouchableOpacity
          onPress={() => {
            navigation.navigate('MyReportScreen');
          }}>
           <Ionicons name="stats-chart" size={20} color="#000" />
        </TouchableOpacity>  */}
        <TouchableOpacity
          onPress={() => {
            navigation.navigate('Settings');
          }}>
          <Ionicons name="settings-sharp" size={22} color="#333" />
        </TouchableOpacity>
            </View>
      </View>
    </View>
  );
};

export default ProfileHeader;
const styles = StyleSheet.create({
  headerContainer: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageStyle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#ccc', // fallback if image not loaded
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  nameText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  emailText: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 2,
  },
});
