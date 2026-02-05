import React, {forwardRef, useEffect, useState} from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import ColorPallete from '../ColorPallete';
import {addNotebook} from '../../database/C';
import {fetchNotebooks} from '../../database/R';
import {updateNotebook} from '../../database/U';
import {useAppState} from '../../contexts/AppStateContext';
import {useNavigation} from '@react-navigation/core';
import useDbStore from '../../database/dbStore';

const AddNotebookBottomSheet = forwardRef(({}, ref) => {
  const [notebookName, setNotebookName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#0000FF');
  const {notebooks, setNotebooks, editingNotebook, setEditingNotebook} =
    useAppState();
  const {inserting, setInserting} = useDbStore();
  const navigation = useNavigation();

  const snapPoints = ['30%'];

  useEffect(() => {
    if (editingNotebook) {
      setNotebookName(editingNotebook.name);
      setSelectedColor(editingNotebook.color);
      // Open the bottom sheet
      ref?.current?.expand();
    }
  }, [editingNotebook]);

  const handleSubmit = () => {
    if (!notebookName.trim()) {
      Alert.alert('Error', 'Notebook name cannot be empty.');
      return;
    }
    setInserting(true);
    if (editingNotebook) {
      handleEditNotebook(editingNotebook.id, notebookName, selectedColor);
    } else {
      handleAddNotebook(notebookName, selectedColor);
    }

    // Reset and close
    setNotebookName('');
    setSelectedColor('#0000FF');

    ref?.current?.close();
  };

  const handleAddNotebook = (notebookName, selectedColor) => {
    if (!notebookName.trim()) {
      console.log('interrupted due to empty notebook name');
      return;
    }
    const finalColor = selectedColor
      ? selectedColor
      : colors[Math.floor(Math.random() * colors.length)];

    addNotebook(notebookName, finalColor, () => {
      fetchNotebooks(setNotebooks);
      setInserting(false);
    });
   navigation.navigate('MainApp', {
        screen: 'Home',
        params: {
          screen: 'HomeScreen',
          params: {
            screen: 'Notebooks', // Target the Notebooks tab in HomeTabs
          },
        },
      });
  };

  const handleEditNotebook = async (id, name, color) => {
    updateNotebook(id, name, color, () => {
      fetchNotebooks(setNotebooks);
      setInserting(false);
    });
    setEditingNotebook(null);
    setNotebookName('');
    setSelectedColor('#0000FF');
  };

  const renderBackdrop = props => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
      opacity={0.4}
    />
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handleIndicator}
      style={styles.sheetContainer}
      onChange={index => {
        if (index === -1) {
          setEditingNotebook(null);
          setNotebookName('');
          setSelectedColor('#0000FF');
          Keyboard.dismiss();
        }
      }}>
      <BottomSheetView style={styles.container}>
        <Text style={styles.menuTitle}>
          {editingNotebook ? 'Edit Notebook' : 'New Notebook'}
        </Text>

        <TextInput
          placeholder="Enter Notebook Name"
          placeholderTextColor={'gray'}
          value={notebookName}
          onChangeText={setNotebookName}
          style={[
            styles.input,
            editingNotebook?.name === 'Default Notebook' && {
              color: '#555',
            },
          ]}
          editable={editingNotebook?.name !== 'Default Notebook'}
        />

        <Text style={styles.colorTitle}>Select Color:</Text>
        <ColorPallete color={selectedColor} onColorChange={setSelectedColor} />

        <TouchableOpacity style={styles.okButton} onPress={handleSubmit}>
          <Text style={styles.okButtonText}>OK</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheet>
  );
});

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetContainer: {
    zIndex: 9999, // iOS
    elevation: 10, // Android
    position: 'absolute',
  },
  handleIndicator: {
    backgroundColor: '#999',
    width: 40,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#000',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 15,
    backgroundColor: '#f9f9f9',
    color: '#000',
  },
  colorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#000',
  },
  okButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  okButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default AddNotebookBottomSheet;
