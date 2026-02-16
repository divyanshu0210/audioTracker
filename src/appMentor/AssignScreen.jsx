import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import React, {useCallback} from 'react';
import MenteeList from './MenteeList';
import {useAppState} from '../contexts/AppStateContext';
import Ionicons from 'react-native-vector-icons/Ionicons';
import {useFocusEffect, useNavigation} from '@react-navigation/core';
import useMentorMenteeStore from './useMentorMenteeStore';
import {addCategory, addItemToCategory} from '../categories/catDB';
import { BASE_URL } from '../appMentorBackend/userMgt';

const AssignScreen = () => {
  const {selectedItems, setSelectedItems, userInfo, setSelectionMode} =
    useAppState();
  const {selectedUsers, setSelectedUsers, setUserSelectionMode} =
    useMentorMenteeStore();
  const navigation = useNavigation();

  useFocusEffect(
    useCallback(() => {
      return () => {
        setSelectedUsers([]);
      };
    }, []),
  );

  const addItemstomenteeCategory = async () => {
    for (const mentee of selectedUsers) {
      const menteeKey = `[MENTEE_CAT_Filter] ${mentee.user.full_name} (${mentee.user.email}) [MENTEE_CAT_Filter]`;

      try {
        // Create category for this mentee
        const defaultColor = '#007AFF';
        const categoryId = await addCategory(menteeKey, defaultColor);

        // Add each video to this mentee's category
        for (const video of selectedItems) {
          await addItemToCategory(categoryId, video.id, video.subtype || video.type);
        }
      } catch (catErr) {
        console.error(
          `Error creating category or adding items for ${menteeKey}`,
          catErr,
        );
      }
    }
  };

  const shareWithMentees = async () => {
    if (
      !userInfo?.id ||
      selectedUsers.length === 0 ||
      selectedItems.length === 0
    ) {
      console.warn('Missing mentor ID, selected mentees, or videos.');
      return;
    }
    navigation.goBack();
    setSelectionMode(false);
    setUserSelectionMode(false);

    const payload = {
      mentor_id: userInfo.id,
      mentee_gmails: selectedUsers.map(u => u.user.email),
      videos: selectedItems.map(i => ({
        video_id: i.id,
        video_type: i.type,
      })),
    };

    try {
      const response = await fetch(
        `${BASE_URL}/assign/assign_videos_to_mentees/`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (response.ok) {
        await addItemstomenteeCategory();
        alert(
          `Videos assigned to ${selectedUsers.length} mentees successfully.`,
        );
      } else {
        alert(`Error: ${data.error || 'Failed to assign videos.'}`);
      }
    } catch (error) {
      alert('Network error while assigning videos.');
    } finally {
      setSelectedUsers([]);
      setSelectedItems([]);
    }
  };

  return (
    <View style={styles.container}>
      {/* Dynamic Header */}
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {selectedUsers.length > 0
            ? `${selectedUsers.length} selected`
            : 'Assign To'}
        </Text>
      </View>

      <MenteeList />

      {selectedUsers.length > 0 && (
        <View style={styles.bottomBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipList}>
            {selectedUsers.map((item, index) => (
              <View style={styles.chip} key={index}>
                <Text style={styles.chipText}>
                  {item?.user?.full_name || item?.user?.email || 'Unnamed'}
                </Text>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.fab} onPress={shareWithMentees}>
            <Ionicons name="arrow-forward" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

export default AssignScreen;

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#fff'},

  header: {
    padding: 18,
    backgroundColor: '#fff  ',
    borderBottomColor: '#ddd',
    borderBottomWidth: 1,
    elevation: 1,
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },

  bottomBar: {
    backgroundColor: '#ddd',
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    bottom: 0,
    padding: 10,
  },
  chipList: {
    flexDirection: 'row',
    flexGrow: 1,
    paddingRight: 10,
  },
  chip: {
    backgroundColor: 'transparent',
    borderRadius: 20,
    paddingVertical: 6,
    // paddingHorizontal: 12,
    marginRight: 8,
  },
  chipText: {
    color: '#333',
    fontSize: 14,
  },
  fab: {
    backgroundColor: '#007AFF',
    borderRadius: 30,
    padding: 15,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: {width: 0, height: 2},
    shadowRadius: 4,
  },
});
