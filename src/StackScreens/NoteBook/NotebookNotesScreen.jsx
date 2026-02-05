import {useNavigation, useRoute} from '@react-navigation/core';
import React from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import AddNewNoteBtn from '../../components/buttons/AddNewNoteBtn';
import PlusButtonLayout from '../../components/buttons/PlusButtonLayout ';
import {useAppState} from '../../contexts/AppStateContext';
import ItemNotesScreen from '../../notes/ItemNotesList';
import ContextHeader from '../../notes/components/ContextHeader';

export default function NotebookNotesScreen() {
  const navigation= useNavigation();

  return (
    <SafeAreaView style={styles.safeContainer}>
   
        <ContextHeader />

        <ItemNotesScreen />

        <AddNewNoteBtn
          renderItem={() => <PlusButtonLayout />}
          onNoteAdded={noteId => {
            navigation.navigate('NotesSectionWithBack');
          }}
        />
 
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
  },

})