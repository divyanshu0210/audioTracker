import React from 'react';
import {SafeAreaView, StyleSheet, View} from 'react-native';
import AddNewNoteBtn from '../../components/buttons/AddNewNoteBtn';
import PlusButtonLayout from '../../components/buttons/PlusButtonLayout ';
import {useAppState} from '../../contexts/AppStateContext';
import ItemNotesScreen from '../../notes/ItemNotesList';
import ContextHeader from '../../components/headers/ContextHeader';
import { navigationRef } from '../../handlers/navigationRef';

export default function NotebookNotesScreen() {

  return (
    <SafeAreaView style={styles.safeContainer}>
   
        <ContextHeader />

        <ItemNotesScreen />

        <AddNewNoteBtn
          renderItem={() => <PlusButtonLayout />}
          onNoteAdded={noteId => {
            navigationRef.navigate('NotesSectionWithBack');
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