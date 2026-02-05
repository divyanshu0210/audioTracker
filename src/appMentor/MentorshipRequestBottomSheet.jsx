import React, {forwardRef, useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import AntDesign from 'react-native-vector-icons/AntDesign';
import {useAppState} from '../contexts/AppStateContext';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {useNavigation} from '@react-navigation/core';

const MentorshipRequestBottomSheet = forwardRef(({}, ref) => {
  const [email, setEmail] = useState('');
  const [userExists, setUserExists] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const {userInfo} = useAppState();
  const navigation = useNavigation();

  const snapPoints = ['40%'];

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (email.trim()) {
        checkUser(email.trim());
      } else {
        setUserExists(false);
        setUserFullName('');
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [email]);

  const checkUser = async emailToCheck => {
    setChecking(true);
    try {
      const res = await fetch(`${BASE_URL}/user/check-email/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({email: emailToCheck}),
      });
      const data = await res.json();
      if (res.ok) {
        setUserExists(true);
        setUserFullName(data.full_name);
      } else {
        setUserExists(false);
        setUserFullName('');
      }
    } catch (err) {
      console.error(err);
      setUserExists(false);
      setUserFullName('');
    }
    setChecking(false);
  };

  const sendRequest = async type => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/request/send/`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          sender_id: userInfo?.id,
          receiver_email: email,
          request_type: type,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setEmail('');
        setUserExists(false);
        setUserFullName('');
        ref?.current?.close();
        navigation.navigate('Notifications');
        Alert.alert('Success', data.message);
      } else {
        Alert.alert('Error', data.error || 'Failed to send request');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Network error');
    }
    setLoading(false);
  };

  const renderBackdrop = useCallback(
  props => (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
      opacity={0.4}
    />
  ),
  []
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
          setEmail('');
          setUserExists(false);
          setUserFullName('');
          Keyboard.dismiss();
        }
      }}>
      <BottomSheetView style={styles.container}>
        <Text style={styles.menuTitle}>Add Connection</Text>

        <View style={styles.searchContainer}>
          <AntDesign
            name="search1"
            size={22}
            color="#333"
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Enter email..."
            placeholderTextColor={'gray'}
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            // autoFocus={true}
          />
        </View>

        {/* {checking && <ActivityIndicator size="small" color="#888" style={styles.activityIndicator} />} */}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.sendButton, !userExists && styles.disabledButton]}
            onPress={() => sendRequest('mentor')}
            disabled={!userExists || loading}>
            <Text style={styles.sendButtonText}>Add as Mentor</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendButton, !userExists && styles.disabledButton]}
            onPress={() => sendRequest('mentee')}
            disabled={!userExists || loading}>
            <Text style={styles.sendButtonText}>Add as Mentee</Text>
          </TouchableOpacity>
        </View>

        {userExists && (
          <View style={styles.resultContainer}>
            <Text style={styles.messageText}>
              <Text style={styles.nameText}>{userFullName}</Text> is a
              registered user.
            </Text>
            <Text style={styles.emailText}>{email}</Text>
          </View>
        )}
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
    zIndex: 99999,
    elevation: 10,
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
    marginBottom: 15,
    color: '#000',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    backgroundColor: '#f9f9f9',
    marginBottom: 15,
  },
  searchIcon: {
    padding: 10,
  },
  input: {
    flex: 1,
    padding: 10,
    fontSize: 16,
    color: '#000',
  },
  activityIndicator: {
    marginBottom: 15,
  },
  resultContainer: {
    marginVertical: 15,
  },
  messageText: {
    fontSize: 15,
    color: '#000',
  },
  nameText: {
    fontWeight: '600',
  },
  emailText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#007bff',
    paddingVertical: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default MentorshipRequestBottomSheet;
