import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import React from 'react';
import {useAppState} from '../../contexts/AppStateContext';
import {fetchAssignmentsForMentee} from '../../appMentorBackend/assignmentsMgt';
import MaterialIcons from'react-native-vector-icons/MaterialIcons'
import useNotificationStore from '../../appNotification/useNotificationStore';

const NewAssignmentsBtn = () => {
  const {setDriveLinksList, setItems, userInfo, setDeviceFiles,setCategories,setSelectedCategory} = useAppState();
  const {newAssignmentsFlag} = useNotificationStore();

  if (!newAssignmentsFlag) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.button}
        onPress={() =>
          fetchAssignmentsForMentee(setDriveLinksList, setItems,setCategories,setSelectedCategory, userInfo)
        }>
        <Text style={styles.text}>New Assignments Available</Text>
        <MaterialIcons name='refresh' size={20} color={'#0066cc'}/>
      </TouchableOpacity>
    </View>
  );
};

export default NewAssignmentsBtn;

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    zIndex: 1000,
  },
  button: {
    flexDirection:'row',
    backgroundColor: '#e6f0ff',
    borderColor: '#0066cc',
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  text: {
    color: '#0066cc',
    fontWeight: '600',
    fontSize: 14,
  },
});
