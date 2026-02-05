import AsyncStorage from '@react-native-async-storage/async-storage';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {fetchLatestWatchDataAllFields} from '../database/R';
import axios from 'axios';

export async function uploadVideoReport(data) {
  try {
    const response = await fetch(`${BASE_URL}/report/upload-video-report/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to upload video report');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Upload Video Report Error:', error);
    throw error;
  }
}

export const saveDatatoBackend = async item => {
  try {
    const videoId = item.driveId || item?.ytube_id;
    const userId = await AsyncStorage.getItem('userId');
    if (!userId || !videoId) {
      console.warn('Missing userId or videoId');
      return;
    }

    const data = await fetchLatestWatchDataAllFields(videoId);
    if (!data) {
      console.warn('No watch data found for videoId:', videoId);
      return;
    }

    const payload = prepareVideoReportPayload(item, data, userId);
    console.log('Payload to send to backend:', payload);

    await uploadVideoReport(payload);
    console.log('Report successfully uploaded');
  } catch (err) {
    console.error('Error saving data to backend:', err);
  }
};



export const getWatchTimefromBackend= async (userId, startDate, endDate) => {
  try {
    const response = await axios.get(`${BASE_URL}/report/monthly-watch-time/`, {
      params: {
        userId,
        startDate,
        endDate,
      },
    });

    return response.data; 

  } catch (error) {
    console.error('Error fetching monthly watch time:', error.response?.data || error.message);
    return null;
  }
};


export const fetchWatchHistoryByDatefromBackend = async (date, userId) => {
  if (!date || !userId) {
    console.log('Both date and userId are required.');
  }

  try {
    const response = await axios.get(`${BASE_URL}/report/watch-history-by-date`, {
      params: { date, userId },
    });
    return response.data; // this will be an array of flat records
  } catch (error) {
    console.error('Error fetching watch history:', error);
    throw error;
  }
};



function prepareVideoReportPayload(videoItem, watchData, userId) {
  const isYouTube = !!videoItem.ytube_id;

  const videoPayload = {
    videoId: isYouTube
      ? videoItem.ytube_id
      : videoItem.driveId || videoItem.id?.toString(),
    name: isYouTube ? videoItem.title : videoItem.name,
    duration: Number(videoItem.duration || 0),
    type: isYouTube ? 'youtube' : 'drive',
    mimetype: isYouTube
      ? 'video/mp4'
      : videoItem.mimeType || 'application/octet-stream',
  };

  const parseJsonArray = str => {
    try {
      return typeof str === 'string' ? JSON.parse(str) : str || [];
    } catch {
      return [];
    }
  };

  const reportPayload = {
    user: userId,
    watchedIntervals: parseJsonArray(watchData.watchedIntervals),
    todayIntervals: parseJsonArray(watchData.todayIntervals),
    date: watchData.date,
    lastWatchedAt: new Date(watchData.lastWatchedAt).toISOString(),
    lastWatchTime: parseFloat(watchData.lastWatchTime || 0),
    watchTimePerDay: parseFloat(watchData.watchTimePerDay || 0),
    newWatchTimePerDay: parseFloat(watchData.newWatchTimePerDay || 0),
    unfltrdWatchTimePerDay: parseFloat(watchData.unfltrdWatchTimePerDay || 0),
  };

  return {
    video: videoPayload,
    report: reportPayload,
  };
}
