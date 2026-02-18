import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect, useRef} from 'react';
import {useNavigation} from '@react-navigation/native';
import ItemNotesScreen from './ItemNotesList';
import ContextHeader from '../components/headers/ContextHeader';

const NotesListScreen = () => {
  const navigation = useNavigation();

  useEffect(() => {
    navigation.setOptions({
      headerShown: false, // Hide header when search is visible
    });
    // console.log(item);
  }, [navigation]);

  return (
    <View style={{flex: 1}}>
      <ContextHeader />
      <ItemNotesScreen />
    </View>
  );
};

export default NotesListScreen;

const styles = StyleSheet.create({});
