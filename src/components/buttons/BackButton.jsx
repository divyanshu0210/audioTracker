import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { navigationRef } from '../../handlers/navigationRef';
const BackButton = () => {
  return (
    <TouchableOpacity
      onPress={() => {
        navigationRef.goBack();
      }}
      style={{marginHorizontal: 10, marginTop: 10}}>
      <MaterialIcons
        name="arrow-back"
        size={24}
        color="#000"
        style={styles.backButton}
      />
    </TouchableOpacity>
  );
};

export default BackButton;

const styles = StyleSheet.create({
      backButton: {
    paddingVertical: 3,
  },
});
