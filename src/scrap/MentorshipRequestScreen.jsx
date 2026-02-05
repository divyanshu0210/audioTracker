import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Keyboard,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import AntDesign from 'react-native-vector-icons/AntDesign';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import {useAppState} from '../contexts/AppStateContext';
import SearchBarToggle from '../appMentor/SearchBarToggle';
import {BASE_URL} from '../appMentorBackend/userMgt';
import NotificationList from '../appNotification/screens/NotificationList';
import {useNavigation} from '@react-navigation/core';
import BackButton from '../components/buttons/BackButton';

const MentorshipRequestScreen = () => {
  const searchBarRef = useRef();
  const navigation = useNavigation();

  const [email, setEmail] = useState('');
  const [userExists, setUserExists] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchActive, setSearchActive] = useState(false);

  const {userInfo} = useAppState();

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
        closeSearchBar();
        navigation.navigate('Home', {
          screen: 'Notifications',
        });
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

  const closeSearchBar = () => {
    if (searchActive && searchBarRef.current) {
      Keyboard.dismiss();
      setEmail('');
      setUserExists(false);
      setUserFullName('');
      searchBarRef.current.close();
    }
  };

  return (
    <>
      <TouchableWithoutFeedback onPress={closeSearchBar}>
        <View style={[styles.container, searchActive && {flex: 1}]}>
          {/* Header */}
          <View style={styles.header}>
            {!searchActive && (
              <>
                <BackButton />
              </>
            )}
            {/* <Text>Connections</Text> */}
            <SearchBarToggle
              ref={searchBarRef}
              value={email}
              onChangeText={setEmail}
              placeholder="Search email..."
              icon={
                searchActive ? (
                  <AntDesign name="search1" size={22} color="#333" />
                ) : (
                  <FontAwesome5 name="user-plus" size={23} color="#333" />
                )
              }
              autoFocus={true}
              onToggle={active => {
                setSearchActive(active);
                if (!active) {
                  setEmail('');
                  setUserExists(false);
                  setUserFullName('');
                }
              }}
            />
          </View>

          {/* Overlay when searching */}
          {searchActive && (
            <View style={styles.overlay}>
              {checking && <ActivityIndicator size="small" color="#888" />}
              {userExists && (
                <View style={styles.notificationCard}>
                  <View style={styles.notificationRow}>
                    <View style={styles.messageContainer}>
                      <Text style={styles.messageText}>
                        <Text style={styles.nameText}>{userFullName}</Text> is a
                        registered user.
                      </Text>
                      <Text style={styles.emailText}>{email}</Text>
                    </View>
                  </View>

                  <View style={{flexDirection: 'row', marginTop: 10, gap: 10}}>
                    <TouchableOpacity
                      style={styles.sendButton}
                      onPress={() => sendRequest('mentor')}
                      disabled={loading}>
                      <Text style={styles.sendButtonText}>
                        Request as Mentor
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.sendButton}
                      onPress={() => sendRequest('mentee')}
                      disabled={loading}>
                      <Text style={styles.sendButtonText}>
                        Request as Mentee
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>

      {/* Main content */}
      {/* {!searchActive && (
        <>
          <MentorMenteeTabs />
        </>
      )} */}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    // flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomColor: '#e0e0e0',
    borderBottomWidth: 1,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 10,
  },
  animatedSearchBar: {
    height: 40,
    backgroundColor: '#f1f1f1',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  inlineInput: {
    paddingHorizontal: 6,
    fontSize: 16,
    flex: 1,
    color: '#333',
  },
  iconButton: {
    padding: 8,
  },
  overlay: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffffcc',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  notificationCard: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderBottomWidth: 0.5,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageContainer: {
    flex: 1,
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
  sendButton: {
    backgroundColor: '#007bff',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});

export default MentorshipRequestScreen;
