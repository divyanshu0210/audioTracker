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
    const videoId = item.source_id;
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

export const getWatchTimefromBackend = async (userId, startDate, endDate) => {
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
    console.error(
      'Error fetching monthly watch time:',
      error.response?.data || error.message,
    );
    return null;
  }
};

// The report API names the video's fields for itself — the name arrives as
// videoNameInfo and the kind as source_type — while every report component is
// written against a local watch-history row, which carries title/type/source_id
// off the items table. Mapping it here, once, is what makes a mentee's day read
// like the user's own; without it each row fell through to 'Untitled Video' and
// the generic file icon.
// The stored rows were moved onto the app's item types by report migration
// 0003, so a family word now only reaches us from an older build still
// uploading one — its next report would put 'drive' back on a device file.
const LEGACY_TYPE_TO_ITEM_TYPE = {
  youtube: 'youtube_video',
  drive: 'drive_file',
  device: 'device_file',
  iskcon: 'iskcon_file',
};

// An app type always carries its family and its kind ('drive_file'), which is
// what tells it apart from a legacy family word.
const toItemType = sourceType =>
  sourceType?.includes('_') ? sourceType : LEGACY_TYPE_TO_ITEM_TYPE[sourceType];

const toWatchHistoryRow = record => ({
  ...record,
  title: record.videoNameInfo || record.title,
  source_id: record.videoId,
  // Falls back to the mime type so an unrecognised source still gets an
  // audio/video icon rather than a blank sheet of paper.
  type: toItemType(record.source_type) || record.mimetype || record.source_type,
  duration: Number(record.duration || 0),
});

export const fetchWatchHistoryByDatefromBackend = async (date, userId) => {
  if (!date || !userId) {
    console.log('Both date and userId are required.');
  }

  try {
    const response = await axios.get(
      `${BASE_URL}/report/watch-history-by-date`,
      {
        params: {date, userId},
      },
    );
    return (response.data || []).map(toWatchHistoryRow);
  } catch (error) {
    console.error('Error fetching watch history:', error);
    throw error;
  }
};

function prepareVideoReportPayload(videoItem, watchData, userId) {
  const isYouTube = videoItem.type?.startsWith('youtube');

  const videoPayload = {
    videoId: videoItem.source_id || videoItem.id?.toString(),
    name: videoItem.title,
    duration: Number(videoItem.duration || 0),
    // The app's own type, not a family word. Everything that wasn't YouTube
    // used to upload as 'drive', so a mentor watching a mentee's device or
    // ISKCON file saw a Drive icon on it; the backend takes the full set now
    // (see report.models.VIDEO_TYPES) and toItemType below reads it straight
    // back out.
    type: videoItem.type || 'drive_file',
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
