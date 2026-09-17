import AsyncStorage from '@react-native-async-storage/async-storage';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {fetchLatestWatchDataAllFields} from '../database/R';
import axios from 'axios';
import {buildHourlyMap, lastNDays} from '../report/utils/hourlyMap';
import {getDriveCopyId} from '../database/sharedDriveCopies';
import {iskconUrlFromSourceId} from '../iskcon/iskconAudioApi';

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

    // Looked up here because prepareVideoReportPayload is synchronous, and
    // preferred off the item when it is already there — the player resolves it
    // to stream from, so a device file being watched usually carries it.
    let driveCopyId = item.drive_file_id ?? null;
    if (!driveCopyId && item.type === 'device_file' && item.id != null) {
      try {
        driveCopyId = await getDriveCopyId(item.id);
      } catch (error) {
        // A report without it is the report we have always sent. Losing the
        // whole upload over a missing playback hint would be the wrong trade.
        console.warn('Could not read the shared copy id:', error?.message);
      }
    }

    const payload = prepareVideoReportPayload(item, data, userId, driveCopyId);
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

// Everything the player needs, so a mentee's row plays the moment the report
// loads rather than waiting on any other sync. Three of the four types are
// reachable from the id alone; a device file needs the id of its uploaded
// copy, which is why the report carries one.
const toWatchHistoryRow = record => {
  const type =
    toItemType(record.source_type) || record.mimetype || record.source_type;

  return {
    ...record,
    title: record.videoNameInfo || record.title,
    source_id: record.videoId,
    // Falls back to the mime type so an unrecognised source still gets an
    // audio/video icon rather than a blank sheet of paper.
    type,
    duration: Number(record.duration || 0),
    // Rebuilt here rather than carried: an iskcon source_id is the site path,
    // so the url is derivable and a stored copy could only drift from it.
    // file_path is the field the player reads for a streamable url.
    file_path:
      type === 'iskcon_file' ? iskconUrlFromSourceId(record.videoId) : null,
    // Empty string for every type but a shared device file. Normalised to null
    // so `!!item.drive_file_id` in the player's streamable check reads right.
    drive_file_id: record.drive_file_id || null,
    // The API spells it mimetype; everything player-side reads mimeType off an
    // items row - the audio-versus-video layout, the thumbnail placeholder.
    // Mapped here so a mentee's row answers the same questions the user's own
    // rows do, rather than arriving with no mime at all: the player called
    // .startsWith on it before it could draw, and an audio lecture that got
    // past that would have opened in the video layout.
    mimeType: record.mimetype || record.mimeType || null,
  };
};

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

function prepareVideoReportPayload(videoItem, watchData, userId, driveCopyId) {
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
    // Device files only, and only once a copy exists. Sent as '' rather than
    // omitted-when-absent would be: the server keeps whatever it has unless
    // this is truthy, so a file shared later fills it in and one that never is
    // simply never sets it.
    drive_file_id: driveCopyId || '',
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
