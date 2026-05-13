import {StyleSheet, Text, View} from 'react-native';
import React, {useEffect, useRef} from 'react';
import ItemNotesScreen from './ItemNotesList';
import ContextHeader from '../components/headers/ContextHeader';

const NotesListScreen = () => {
  return (
    <View style={{flex: 1}}>
      <ContextHeader />
      <ItemNotesScreen />
    </View>
  );
};

export default NotesListScreen;

const styles = StyleSheet.create({});
