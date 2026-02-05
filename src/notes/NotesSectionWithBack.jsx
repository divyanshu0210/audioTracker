import { useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Fontisto from 'react-native-vector-icons/Fontisto';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { handleExport } from '../components/menu/NoteMenuItems';
import RichTextEditor from './richEditor/RichTextEditor';
import { useAppState } from '../contexts/AppStateContext';

const NotesSectionWithBack = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {activeNoteId} = useAppState();

  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}>
      <View style={{flexDirection: 'row', justifyContent: 'space-around'}}>
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
        <View style={{flex: 1}} />
        <TouchableOpacity
          onPress={() => {
            handleExport(activeNoteId, 'pdf');
          }}
          style={{marginHorizontal: 10, marginTop: 10}}>
          <Fontisto
            name="share-a"
            size={18}
            color="black"
            style={styles.backButton}
          />
        </TouchableOpacity>
      </View>

      <RichTextEditor noteId={activeNoteId} />
    </View>
  );
};

export default NotesSectionWithBack;

const styles = StyleSheet.create({
  backButton: {
    paddingVertical: 3,
  },
});
