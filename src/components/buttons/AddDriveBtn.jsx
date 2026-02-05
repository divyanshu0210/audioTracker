import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View
} from 'react-native';
import DriveLinkModal from '../modules/DriveLink';
import MyModal from '../MyModal';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { pick, types } from 'react-native-document-picker';
import { useAppState } from '../../contexts/AppStateContext';
import {
  handleFileProcessing,
  handleLinkSubmit,
} from '../../Linking/utils/handleLinkSubmit';
import PlusButton from './PlusButton';

const AddDriveBtn = () => {
  const {setDriveLinksList, setItems, setDeviceFiles,selectedCategory, userInfo} = useAppState();
  const navigation = useNavigation();

  const [modalVisible, setModalVisible] = useState(false);

  // --------------------------------------------------------------
  // Control model visibility to avoid rerenders
  useFocusEffect(
    useCallback(() => {
      return () => {
        setModalVisible(false);
      };
    }, []),
  );

  useEffect(() => {
    const keyboardHideListener = Keyboard.addListener('keyboardDidHide', () => {
      setModalVisible(false);
    });

    return () => {
      keyboardHideListener.remove();
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState !== 'active') {
        setModalVisible(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
  // -----------------------------------------------------------------------------------

  // Handle link submission
  const onLinkSubmit = async inputLink => {
    console.log('Processing link:', inputLink);

    await handleLinkSubmit(inputLink, {
      setDriveLinksList,
      setItems,
      setDeviceFiles,
      navigation,
      selectedCategory
    });

    setModalVisible(false);
  };

  const handleDeviceFilePick = async () => {
    try {
      const results = await pick({
        allowMultiSelection: true,
        type: [types.audio, types.video],
      });

      for (const file of results) {
        console.log(file);
        await handleFileProcessing(file, setDeviceFiles, navigation);
      }
    } catch (err) {
      if (err?.code === 'DOCUMENT_PICKER_CANCELED') {
        console.log('🚫 User cancelled file picker');
      } else {
        console.error('❌ DocumentPicker error:', err);
        Alert.alert('Error', 'Could not pick files');
      }
    }
  };

  return (
    <View style={styles.container}>
      <PlusButton handlePress={() => setModalVisible(true)} />

      <MyModal withInput isOpen={modalVisible}>
        <View style={styles.modalContent}>
          <DriveLinkModal
            closeModal={() => {
              setModalVisible(false);
            }}
            onSubmit={onLinkSubmit}
          />

          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.filePickerContainer}>
            <Pressable
              style={styles.filePickerButton}
              onPress={() => {
                handleDeviceFilePick();
                setModalVisible(false);
              }}>
              <Text style={styles.filePickerText}>Pick from Device</Text>
            </Pressable>
          </View>
        </View>
      </MyModal>
    </View>
  );
};

export default AddDriveBtn;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    width: '80%',
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
  },

  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ccc',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#666',
    fontWeight: '500',
  },
  filePickerContainer: {
    // marginTop: 10,
    alignItems: 'center',
  },
  filePickerButton: {
    width: '90%',
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filePickerText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
});
