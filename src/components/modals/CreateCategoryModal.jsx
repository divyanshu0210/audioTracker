// CreateCategoryModal.js
import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import ColorPallete from '../ColorPallete';
import { addCategory } from '../../categories/catDB';
import { useAppState } from '../../contexts/AppStateContext';

const CreateCategoryModal = ({ visible, onClose, onCategoryCreated }) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#007AFF');
  const [addingCategory, setAddingCategory] = useState(false);
  const {setSelectedCategory} = useAppState();

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    setAddingCategory(true);
    try {
      const newCategoryId = await addCategory(newCategoryName, selectedColor);
      onCategoryCreated?.({ id: newCategoryId, name: newCategoryName, color: selectedColor });
          // setSelectedCategory(newCategoryId);
      setNewCategoryName('');
      setSelectedColor('#007AFF');
      onClose();
    } catch (error) {
      console.error('Failed to create category:', error);
      Alert.alert('Error', 'Failed to create category. Please try again.');
    } finally {
      setAddingCategory(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeIcon} onPress={onClose} disabled={addingCategory}>
            <Ionicons name="close" size={24} color="black" />
          </TouchableOpacity>

          <Text style={styles.modalTitle}>Create New Category</Text>
          <TextInput
            style={styles.input}
            placeholder="Category Name"
            placeholderTextColor={'#888'}
            value={newCategoryName}
            onChangeText={setNewCategoryName}
            autoFocus
          />
          <View style={{marginBottom:30}}>

          <ColorPallete color={selectedColor} onColorChange={setSelectedColor} />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={addingCategory}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <View style={{flex:1}}></View>
            <TouchableOpacity
              style={[styles.button, styles.createButton]}
              onPress={handleCreateCategory}
              disabled={addingCategory || !newCategoryName.trim()}
            >
              {addingCategory ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Create</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: '#000000aa',
    justifyContent: 'center',
    padding: 20,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  closeIcon: {
    alignSelf: 'flex-end',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 30,
    color:'#333'
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    marginBottom: 10,
    color:'#000'
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
  },
  button: {
    padding: 10,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
    marginLeft: 10,
  },
  cancelButton: {
    backgroundColor: '#777',
  },
  createButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default CreateCategoryModal;
