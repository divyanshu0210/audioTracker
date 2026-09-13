import AsyncStorage from '@react-native-async-storage/async-storage';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {fetchLatestWatchDataAllFields} from '../database/R';
import axios from 'axios';
import {buildHourlyMap, lastNDays} from '../report/utils/hourlyMap';

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
    clockIntervals: parseJsonArray(watchData.clockIntervals),
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

/**
 * A mentee's hourly watch map, for the mentor's copy of the heat grid.
 *
 * The server returns the raw intervals rather than hour buckets: they are
 * absolute instants, and turning them into hours of the day needs a timezone
 * the server does not have. buildHourlyMap - the same function the local map
 * uses - does that against this device's clock.
 */
export const fetchHourlyWatchMapFromBackend = async (
  mentorId,
  menteeId,
  dates = lastNDays(7),
) => {
  if (!mentorId || !menteeId || !dates?.length) return [];
  const sorted = [...dates].sort();
  try {
    const response = await axios.get(`${BASE_URL}/report/hourly-watch-map/`, {
      params: {
        mentor_id: mentorId,
        userId: menteeId,
        from: sorted[0],
        to: sorted[sorted.length - 1],
      },
    });
    return buildHourlyMap(response.data?.records ?? [], dates);
  } catch (error) {
    // A mentee the server has no sessions for comes back as a 500 rather than
    // an empty list, and that is not a failure to show the mentor - it is the
    // answer. An empty week, built the same way the local path builds one for
    // a device with nothing recorded, so the grid says "nothing here" instead
    // of vanishing.
    //
    // The cost of reading it that way is that a real server fault in this
    // range looks identical, which is why it still says so in the log.
    if (error.response?.status === 500) {
      console.log('No hourly watch data for this mentee yet - empty grid');
      return buildHourlyMap([], dates);
    }

    // Anything else - offline, a bad range, auth - is genuinely not knowing.
    // No rows means no grid, which is the honest thing to draw.
    console.error(
      'Error fetching the hourly watch map:',
      error.response?.data || error.message,
    );
    return [];
  }
};
