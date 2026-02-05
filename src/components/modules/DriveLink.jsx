import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAppState} from '../../contexts/AppStateContext';
import CustomDropdown from '../dropdowns/CustomDropdown';

const DriveLinkModal = ({closeModal, onSubmit}) => {
  const [text, setText] = useState('');

  const {categories, setCategories, selectedCategory, setSelectedCategory} =
    useAppState();

  // useEffect(() => {
  //   setSelectedCategory(null); // Reset selectedCategory on mount
  // }, []);

  const handleSubmit = () => {
    onSubmit(text); // Pass feedback to HomeScreen
    closeModal(); // Close modal after submission
  };

  return (
    <View style={styles.modalContainer}>
      <View style={styles.headerContainer}>
        <View style={styles.spacer} />
        <Text style={styles.title}>Add New Media</Text>
        <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
          <MaterialIcons name="close" size={23} color={'black'} />
        </TouchableOpacity>
      </View>
  <Text style={{color: 'gray'}}>Category</Text>
      <CustomDropdown
        selectedValue={selectedCategory}
        onValueChange={setSelectedCategory}
        categories={categories}
        dropdownButtonStyle={{width: '100%', marginBottom: 15}}
      />
      {/* <Text style={{ color: 'blue', marginBottom: 15 ,fontSize:10}}>
  *Folder and Playlist links are unsupported by Categories
</Text> */}

      <TextInput
        style={styles.input}
        placeholder="GDrive/Youtube Link..."
        placeholderTextColor={'gray'}
        multiline
        value={text}
        onChangeText={setText}
      />
    
      <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitText}>Submit</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  spacer: {
    width: 32,
  },
  closeButton: {
    padding: 4,
  },
  input: {
    width: '100%',
    height: 100,
    borderColor: '#d1d1d1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    textAlignVertical: 'top',
    backgroundColor: '#f9f9f9',
    color: '#222',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#7B42F6',
    paddingVertical: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  submitText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default DriveLinkModal;
