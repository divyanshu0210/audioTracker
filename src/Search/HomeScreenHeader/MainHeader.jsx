import React, {useState} from 'react';
import {View, TouchableOpacity, StyleSheet,Image} from 'react-native';
import SearchResultsList from './SearchResultsList';
import NotificationButton from '../../appNotification/components/NotificationButton';
import MentorMenteeDrawer from '../../appMentor/MentorMenteeDrawer';
import HeaderControls from './HeaderControls';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useNavigation} from '@react-navigation/core';
import CustomDropdown from '../../components/dropdowns/CustomDropdown';
import {useAppState} from '../../contexts/AppStateContext';
import useMentorMenteeStore from '../../appMentor/useMentorMenteeStore';

const MainHeader = ({}) => {
  const navigation = useNavigation();
  const {
    categories,
    userInfo,
    selectedCategory,
    setSelectedCategory,
  } = useAppState();
  const {activeMentee, activeMentor} = useMentorMenteeStore();
  const isActive = activeMentee || activeMentor;

  return (
    <>
      {/* Header */}
      <View style={styles.customHeader}>
        <View style={styles.headerRow}>
          <MentorMenteeDrawer />

          {!isActive && (
            <CustomDropdown
              selectedValue={selectedCategory}
              onValueChange={setSelectedCategory}
              categories={categories}
            />
          )}
          <View style={{flex: 1}}></View>
          <View style={styles.rightButtons}>
            <NotificationButton />
            {!isActive && (
              <>
                <TouchableOpacity
                  onPress={() => {
                    navigation.navigate('SearchWrapper', {
                      initialSearchActive: true,
                    });
                  }}
                  style={styles.iconButton}>
                  <Ionicons name="search" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    navigation.navigate('ProfileTab');
                  }}
                  style={styles.iconButton}>
                  {/* <MaterialCommunityIcons
                    name="account-circle"
                    size={26}
                    color="#fff"
                  /> */}
                  <Image
                    source={{uri: userInfo?.photo}}
                    style={styles.imageStyle}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </View>
    </>
  );
};

export default MainHeader;

const styles = StyleSheet.create({
  customHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#0F56B3',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    zIndex: 2,
  },
  headerRow: {
    flexDirection: 'row',
    // justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: 10,
  },
  rightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconButton: {
    padding: 5,
    borderRadius: 50,
  },
  overlayWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
  },
  imageStyle: {
    width: 30,
    height: 30,
    borderRadius: 25,
    backgroundColor: '#ccc', // fallback if image not loaded
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
});
