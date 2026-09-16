import AsyncStorage from '@react-native-async-storage/async-storage';
import {backend} from './logger';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {runNativeMenteeSyncNow} from '../appMentor/menteeNotesSync';

// export const BASE_URL = 'http://10.0.2.2:8000';
export const BASE_URL = 'http://localhost:8000';
// export const BASE_URL = 'https://audiotrackerbackend.onrender.com';
// export const BASE_URL = 'http://10.11.26.220:8000';

// Websocket and notification hosts, from when notifications had their own
// service. Nothing imports them any more; left as a record of the addresses.
// export const NOTIFICATION_BASE_URL = 'https://at-notif-backend0210.onrender.com';
// export const WS_BASE_URL = 'wss://at-notif-backend0210.onrender.com';
// export const NOTIFICATION_BASE_URL = 'http://10.11.26.220:1000';
// export const WS_BASE_URL = 'ws://10.11.26.220:1000';


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
        photo_url: user.photo ?? '',
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

/**
 * `silent` skips the isLoading flag.
 *
 * That flag means "nothing has been fetched yet", and every list watches it to
 * decide between a spinner and "No mentees found." A pull-to-refresh already
 * has the control under the user's finger saying the same thing, so raising it
 * there replaced the list — or, when the list was empty, put a second spinner
 * under the first.
 */
export const fetchNewConnections = async ({silent = false} = {}) => {
  const {setIsLoading} = useMentorMenteeStore.getState();
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) {
      console.error('No userId found in AsyncStorage');
      return;
    }

    // Before the fetch, deliberately. The worker asks the server for the
    // lists itself, so it does not need this call to have worked — and the
    // moment it most needs enqueuing is the one where this call is about to
    // fail. Offline, WorkManager simply holds the job and runs it when there
    // is a network again, with nobody having to open the app.
    //
    // No mentee is named, so this reconciles this user's own sharing and
    // fetches nobody's notes. A refreshed connection list is not a request
    // to read anyone — picking a mentee is.
    runNativeMenteeSyncNow();

    if (!silent) setIsLoading(true);
    const response = await fetch(`${BASE_URL}/mentorships/${userId}/`);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    setMentors(data.mentors || []);
    setMentees(data.mentees || []);
  } catch (err) {
    console.error('Error fetching mentorship data:', err);
  } finally {
    if (!silent) setIsLoading(false);
  }
};