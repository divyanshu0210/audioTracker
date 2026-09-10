import {getYouTubeIdType} from '../contexts/utils';
import {
  fetchYTData,
  handleDriveLink,
  LinkOrigin,
} from '../Linking/utils/handleLinkSubmit';
import useMentorMenteeStore from '../appMentor/useMentorMenteeStore';
import {ToastAndroid} from 'react-native';
import useDbStore from '../database/dbStore';
import {BASE_URL} from './userMgt';
import {addCategory} from '../categories/catDB';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useNotificationStore from '../appNotification/useNotificationStore';
import {ensureDbItem} from '../iskcon/iskconActions';
import {iskconUrlFromSourceId} from '../iskcon/iskconAudioApi';
import {addItemToCategory} from '../categories/catDB';
import {upsertItem} from '../database/C';
import {saveDriveCopy} from '../database/sharedDriveCopies';
import {useMediaStore} from '../stores/useMediaStore';
import {getGoogleAccessToken} from '../auth/tokenManager';
import useAssignmentStatusStore from '../appMentor/useAssignmentStatusStore';

const {setNewAssignmentsFlag} = useNotificationStore.getState();

export const fetchAssignmentsForMentee = async (
  setDriveLinksList,
  setItems,
  setCategories,
  setSelectedCategory,
  userInfo,
) => {
  const {setInserting} = useDbStore.getState();
  try {
    setNewAssignmentsFlag(false);

    // Ids of assignments whose items actually got built, collected across
    // every mentor so one acknowledgement covers the whole run.
    const deliveredIds = [];

    const response = await fetch(
      `${BASE_URL}/assign/assignments-for-mentee/?mentee_id=${userInfo?.id}`,
    );
    const data = await response.json();
    console.log(data);
    if (response.ok) {
      // loader bar ON
      setInserting(true);
      const assignmentsByMentor = data?.assignments_by_mentor || {};

      for (const mentorKey of Object.keys(assignmentsByMentor)) {
        try {
          const defaultColor = '#007AFF';
          const categoryId = await addCategory(mentorKey, defaultColor);
          // setCategories(prev => {
          //   const exists = prev.some(category => category.id === categoryId);
          //   if (exists) return prev;
          //   return [{id: categoryId, name: mentorKey}, ...prev];
          // });
          // setSelectedCategory(categoryId);

          console.log(
            `✅ Category created for ${mentorKey}, ID: ${categoryId}`,
          );

          // Process all videos for this mentor
          const videos = assignmentsByMentor[mentorKey];
          for (const video of videos) {
            const extracted = {
              id: video.video_id,
              type: video.video_type,
            };

            try {
              if (extracted.type === 'youtube') {
                extracted.type = getYouTubeIdType(extracted.id);
                await fetchYTData(
                  extracted,
                  setItems,
                  categoryId,
                  LinkOrigin.ASSIGNMENT,
                );
              } else if (extracted.type === 'drive') {
                await handleDriveLink(
                  extracted.id,
                  setDriveLinksList,
                  categoryId,
                  LinkOrigin.ASSIGNMENT,
                );
              } else if (extracted.type === 'iskcon') {
                await ingestIskconAssignment(extracted.id, categoryId);
              } else if (extracted.type === 'device') {
                await ingestDeviceAssignment(
                  extracted.id,
                  video.origin_video_id,
                  categoryId,
                );
              } else {
                // Nothing else is addressable on another device. A device file
                // is assigned as its Drive copy (see AssignScreen), so it
                // arrives as 'drive' and never reaches this branch.
                console.warn(
                  'Unknown assignment type, leaving it pending:',
                  extracted.type,
                );
                continue;
              }
              // Only an id that got this far is acknowledged. Anything that
              // threw stays pending on the server and comes back next time,
              // rather than being silently lost.
              deliveredIds.push(video.id);
            } catch (videoError) {
              console.warn(
                `Could not build assigned ${extracted.type} ${extracted.id}:`,
                videoError?.message ?? videoError,
              );
            }
          }
          //Create toast here . ..
          videos.length > 0 &&
            ToastAndroid.show(
              `${videos.length} New Assignments Added`,
              ToastAndroid.SHORT,
            );
        } catch (error) {
          console.warn(
            `❌ Error processing category for ${mentorKey}:`,
            error.message,
          );
        }
      }

      await acknowledgeAssignments(userInfo?.id, deliveredIds);
      console.log('✅ All assignments fetched and categorized');
    } else {
      console.log(
        '❌ Error fetching assignments:',
        data?.error || 'Unknown error occurred.',
      );
    }
  } catch (error) {
    console.error(
      '❌ Fetch error:',
      error.message || 'Failed to fetch assignments.',
    );
  } finally {
    //loader off
    setInserting(false);
  }
};

// A device file the mentor assigned. It exists on their phone, so what
// travels is the Drive copy they shared — but the mentee should hold the same
// file the mentor sees, not a Drive entry named after the uploaded copy.
//
// So the row is built as a device_file with no bytes, carrying the copy's id.
// That is a state the app already understands: it is exactly what a restore
// leaves behind and what a shared note's media creates, so the missing-file
// chip, the tap-to-download prompt and offerSharedCopyDownload all work on it
// without knowing assignments exist.
//
// source_id is the mentor's, deliberately — it is what makes the same file the
// same row on both sides, and what lets the mentor's delivery tick find it.
const ingestDeviceAssignment = async (driveFileId, originSourceId, categoryId) => {
  if (!originSourceId) {
    throw new Error('Device assignment arrived without an origin id');
  }

  const {setDeviceFiles} = useMediaStore.getState();

  // The title and mime type come from the Drive copy rather than travelling
  // with the assignment: the upload is named after the file it was made from
  // (see uploadFileToDrive), so this is the mentor's own name for it, and it
  // keeps the assignment payload to ids.
  const accessToken = await getGoogleAccessToken();
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=name,mimeType`,
    {headers: {Authorization: `Bearer ${accessToken}`}},
  );

  if (!response.ok) {
    // Drive's own reason is the whole diagnosis here and the status alone
    // hides it: 'appNotAuthorizedToFile' means this token's scope is
    // drive.file, which only ever reaches files this app created for *this*
    // user — a file shared by someone else stays 403 however public it is.
    // 'insufficientPermissions' means the scope is missing outright.
    const body = await response.text().catch(() => '');
    throw new Error(
      `Could not read the shared copy's details (HTTP ${response.status}): ${body}`,
    );
  }

  const meta = await response.json();

  const item = await upsertItem({
    source_id: originSourceId,
    type: 'device_file',
    title: meta.name || 'Shared file',
    mimeType: meta.mimeType || 'application/octet-stream',
    // No bytes yet, and no url a player could take. The copy id below is the
    // whole route to them.
    file_path: null,
    out_show: 1,
    in_show: 0,
  });

  // Read by offerSharedCopyDownload and by MediaUnavailable's recovery check.
  // Without it the row is a dead end: a file with no bytes and nowhere to get
  // them.
  await saveDriveCopy(item.id, driveFileId);

  await addItemToCategory(categoryId, originSourceId, 'device_file');

  const withCopy = {...item, drive_file_id: driveFileId};
  setDeviceFiles(prev => [
    withCopy,
    ...prev.filter(f => f.source_id !== originSourceId),
  ]);
};

// An Iskcon file is identified by its path on the site, which is all the
// assignment carries — the title is the filename and the stream url is built
// from the same path, so nothing else has to travel with it. ensureDbItem
// parks that url in file_path, which is what makes the file playable before
// any download.
const ingestIskconAssignment = async (sourceId, categoryId) => {
  const url = iskconUrlFromSourceId(sourceId);
  const title = decodeURIComponent(sourceId.split('/').pop() ?? sourceId)
    .replace(/\.[^.]+$/, '');

  await ensureDbItem({source_id: sourceId, title, url});
  await addItemToCategory(categoryId, sourceId, 'iskcon_file');
};

// Tell the server which assignments actually landed. Anything missing from
// this list stays pending and is handed out again on the next fetch, so a
// failure here costs a repeat rather than a lost assignment.
const acknowledgeAssignments = async (menteeId, assignmentIds) => {
  if (!menteeId || assignmentIds.length === 0) return;
  try {
    const response = await fetch(`${BASE_URL}/assign/acknowledge/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mentee_id: menteeId, assignment_ids: assignmentIds}),
    });
    if (!response.ok) {
      console.warn('Acknowledge failed:', response.status, await response.text());
    }
  } catch (error) {
    console.warn('Could not acknowledge assignments:', error?.message ?? error);
  }
};

// to display the assignment btn on app start
export const isAssignmentPending = async () => {
  const count = await pendingAssignmentCount();
  setNewAssignmentsFlag(count > 0);
};

export const pendingAssignmentCount = async () => {
  const userId = await AsyncStorage.getItem('userId');

  const response = await fetch(
    `${BASE_URL}/assign/assignments-count-for-mentee/?mentee_id=${userId}`,
  );
  const data = await response.json();
  // console.log(data);
  if (response.ok) {
    return data.pending_assignments_count;
  }
  return 0;
};

// What a mentor assigned to one mentee, with delivery state and watch
// progress. Fills the store the item rows read from; a mentee with nothing
// assigned still writes an empty map, so the rows explicitly show nothing
// rather than keeping the previous mentee's ticks.
export const loadMenteeAssignmentStatus = async (mentorId, menteeId) => {
  const {setLoading, setForMentee, clear} = useAssignmentStatusStore.getState();

  if (!mentorId || !menteeId) {
    clear();
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(
      `${BASE_URL}/assign/mentee-assignments/?mentor_id=${encodeURIComponent(
        mentorId,
      )}&mentee_id=${encodeURIComponent(menteeId)}`,
    );
    const data = await response.json();

    if (!response.ok) {
      console.warn('Could not load assignment status:', data?.error);
      clear();
      return;
    }

    setForMentee(menteeId, data.assignments);
  } catch (error) {
    console.warn(
      'Could not load assignment status:',
      error?.message ?? error,
    );
    clear();
  }
};
