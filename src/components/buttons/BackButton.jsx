import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/core';
const BackButton = () => {
    const navigation = useNavigation();   
  return (
    <TouchableOpacity
      onPress={() => {
        navigation.goBack();
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
