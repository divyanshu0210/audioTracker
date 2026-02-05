import AsyncStorage from '@react-native-async-storage/async-storage';
import {backend} from './logger';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';

export const BASE_URL = 'https://audiotrackerbackend.onrender.com';
// export const BASE_URL = 'http://10.11.26.220:8000';
// export const NOTIFICATION_BASE_URL = 'https://at-notif-backend0210.onrender.com';
// export const WS_BASE_URL = 'wss://at-notif-backend0210.onrender.com';
// export const NOTIFICATION_BASE_URL = 'http://10.11.26.220:1000';
export const WS_BASE_URL = 'ws://10.11.26.220:1000';


const {mentors, setMentors, setMentees, mentees} = useMentorMenteeStore.getState();
export const syncUserToBackend = async user => {
  try {
    const res = await fetch(`${BASE_URL}/user/create/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        id: user.id,
        email: user.email,
        full_name: user.name,
      }),
    });

    const data = await res.json();

    res.ok || res.status === 400
      ? backend.log('User synced successfully or already exists.', data)
      : backend.warn('Failed to sync user:', data);
  } catch (err) {
    backend.error('Error syncing user:', err);
  }
};

export const fetchNewConnections = async () => {
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      console.error('No userId found in AsyncStorage');
      return;
    }

    const response = await fetch(`${BASE_URL}/mentorships/${userId}/`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    setMentors(data.mentors || []);
    setMentees(data.mentees || []);
  } catch (err) {
    console.error('Error fetching mentorship data:', err);
  }
};