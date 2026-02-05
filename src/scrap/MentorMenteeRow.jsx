import React from 'react';
import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';
import {useNavigation} from '@react-navigation/core';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';

const MentorMenteeRow = () => {
  const navigation = useNavigation();
  const {mentors, mentees} = useMentorMenteeStore(); // assuming arrays

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.connectionBox, styles.leftButton]}
        onPress={() => navigation.navigate('MentorshipRequestScreen')}>
        <Text style={styles.connectionNumber}>{mentors?.length ?? 0}</Text>
        <Text style={styles.connectionLabel}>Mentors</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.connectionBox, styles.rightButton]}
        onPress={() => navigation.navigate('MentorshipRequestScreen')}>
        <Text style={styles.connectionNumber}>{mentees?.length ?? 0}</Text>
        <Text style={styles.connectionLabel}>Mentees</Text>
      </TouchableOpacity>
    </View>
  );
};

export default MentorMenteeRow;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  connectionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fff', // black border
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
  },
  leftButton: {
    marginRight: 5,
  },
  rightButton: {
    marginLeft: 5,
  },
  connectionNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000', // black text
  },
  connectionLabel: {
    fontSize: 13,
    color: '#000', // black text
  },
});
