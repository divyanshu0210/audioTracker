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
import {useSelectionStore} from '../stores/useSelectionStore';
import {getGoogleAccessToken} from '../auth/tokenManager';
import useAssignmentStatusStore from '../appMentor/useAssignmentStatusStore';
import useAssignmentInboxStore from '../appMentor/useAssignmentInboxStore';

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
    // Summarised after the loop rather than toasted inside it: a mentee with
    // three mentors got three toasts queued back to back, and the last one was
    // still showing long after the work finished.
    const addedByMentor = [];

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
          // Per mentor, and by id rather than a tally: the badge counts ids so
          // that replaying an interrupted sync cannot count them twice. It also
          // has to be what actually landed - videos.length included the ones
          // that threw.
          const deliveredForMentor = [];
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
              deliveredForMentor.push(video.id);
            } catch (videoError) {
              console.warn(
                `Could not build assigned ${extracted.type} ${extracted.id}:`,
                videoError?.message ?? videoError,
              );
            }
          }
          if (deliveredForMentor.length > 0) {
            addedByMentor.push({
              mentor: mentorKey,
              ids: deliveredForMentor,
            });
          }
        } catch (error) {
          console.warn(
            `❌ Error processing category for ${mentorKey}:`,
            error.message,
          );
        }
      }

      await acknowledgeAssignments(userInfo?.id, deliveredIds);

      // The badge outlives the toast: it sits on the mentor's row in the
      // drawer until the mentee opens them.
      //
      // Order does not matter against the acknowledge above, which is the
      // point of counting by id. Whether the network died before the server
      // was told, or the process died just after, the next sync passes the
      // same ids and recordDelivered ignores the ones already counted.
      const {recordDelivered} = useAssignmentInboxStore.getState();
      const counted = addedByMentor
        .map(entry => ({
          mentor: entry.mentor,
          count: recordDelivered(mentorEmailFromKey(entry.mentor), entry.ids),
        }))
        .filter(entry => entry.count > 0);

      announceAssignments(counted);
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

// One toast for the whole sync, naming where the work went.
//
// Assigned items no longer join the mentee's own tabs - they are filed under
// the mentor who sent them (see LinkOrigin.ASSIGNMENT in handleLinkSubmit), so
// nothing visible changes on the screen the mentee is standing on. This is the
// only thing telling them where to look, which is why it names the mentor and
// runs LONG.
// The server groups by `f"{full_name} ({email})"` and that same string is the
// category name, so it cannot be changed without moving everyone's categories.
// The email is pulled back out of it here.
const mentorEmailFromKey = mentorKey => {
  const match = /\(([^()]+)\)\s*$/.exec(mentorKey ?? '');
  return match ? match[1].trim() : null;
};

const announceAssignments = added => {
  if (added.length === 0) return;

  const total = added.reduce((sum, entry) => sum + entry.count, 0);
  const noun = total === 1 ? 'assignment' : 'assignments';

  // The mentor key is "Full Name (email)"; the name alone is enough here.
  const where =
    added.length === 1
      ? `from ${added[0].mentor.replace(/\s*\(.*\)\s*$/, '')}`
      : `from ${added.length} mentors`;

  ToastAndroid.show(
    `${total} new ${noun} ${where} — open them from the mentor list`,
    ToastAndroid.LONG,
  );
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

// The last container a mentor opened with a mentee selected, so a refresh can
// ask about its children again. Without it a poll would answer for the
// assigned rows and quietly strip the folder or playlist the mentor is
// actually looking at: setForMentee replaces the map wholesale, and the
// children only ever existed as entries merged in on top of it.
let lastChildQuery = null;

// True while `menteeId` is still the mentee on screen. Every load here is an
// answer about one particular person, and switching mentee mid-flight used to
// let the outgoing one's reply land on the incoming one's rows.
const isStillSelected = menteeId =>
  String(useMentorMenteeStore.getState().activeMentee?.id) === String(menteeId);

const fetchMenteeAssignments = async (mentorId, menteeId) => {
  const response = await fetch(
    `${BASE_URL}/assign/mentee-assignments/?mentor_id=${encodeURIComponent(
      mentorId,
    )}&mentee_id=${encodeURIComponent(menteeId)}`,
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data.assignments ?? [];
};

// What a mentor assigned to one mentee, with delivery state and watch
// progress. Fills the store the item rows read from; a mentee with nothing
// assigned still writes an empty map, so the rows explicitly show nothing
// rather than keeping the previous mentee's ticks.
//
// `silent` is for the repeat visits: no loading flag, and a failure leaves the
// rows showing the last answer instead of blanking them. A mentor watching a
// list should not see every tick on it vanish because one poll went out while
// the train was in a tunnel.
export const loadMenteeAssignmentStatus = async (
  mentorId,
  menteeId,
  {silent = false} = {},
) => {
  const {setLoading, setForMentee, clear} = useAssignmentStatusStore.getState();

  if (!mentorId || !menteeId) {
    clear();
    return;
  }

  if (!silent) setLoading(true);
  try {
    const assignments = await fetchMenteeAssignments(mentorId, menteeId);
    if (!isStillSelected(menteeId)) return;
    setForMentee(menteeId, assignments);
  } catch (error) {
    console.warn(
      'Could not load assignment status:',
      error?.message ?? error,
    );
    if (!silent) clear();
  }
};

/**
 * Ask again for everything on screen about this mentee.
 *
 * Delivery, seen and watch progress are all things that happen on the mentee's
 * phone. The mentor's copy of them was fetched once, when the mentee was
 * picked in the drawer, and nothing since then could move it - a mentee could
 * receive an assignment and watch half of it while the mentor sat looking at a
 * single tick.
 *
 * Silent by design: it runs on a timer behind whatever the mentor is reading,
 * so a failed attempt leaves the last good answer on the rows rather than
 * emptying them.
 */
export const refreshMenteeStatus = async (mentorId, menteeId) => {
  if (!mentorId || !menteeId) return;

  const query =
    lastChildQuery && String(lastChildQuery.menteeId) === String(menteeId)
      ? lastChildQuery
      : null;

  try {
    // Both in flight at once, and both written after they have landed. Asking
    // in sequence would leave a gap where the assignment list had replaced the
    // map but the children were still coming: every row inside an open folder
    // would drop its subtitle and pick it up again, once every poll.
    const [assignments, progress] = await Promise.all([
      fetchMenteeAssignments(mentorId, menteeId),
      query
        ? fetchChildProgress(mentorId, menteeId, query.childIds)
        : Promise.resolve(null),
    ]);

    if (!isStillSelected(menteeId)) return;

    const {setForMentee, mergeChildProgress} =
      useAssignmentStatusStore.getState();
    setForMentee(menteeId, assignments);

    if (progress) {
      // The container's own status comes from the list that just landed - it
      // is what the children inherit, and it may be what changed.
      const container = assignments.find(
        assignment =>
          String(assignment.video_id) === String(query.containerId) ||
          String(assignment.origin_video_id) === String(query.containerId),
      );
      if (container) mergeChildProgress(progress, container.status);
    }
  } catch (error) {
    console.warn('Could not refresh mentee status:', error?.message ?? error);
  }
};

const fetchChildProgress = async (mentorId, menteeId, ids) => {
  const response = await fetch(
    `${BASE_URL}/assign/mentee-progress/?mentor_id=${encodeURIComponent(
      mentorId,
    )}&mentee_id=${encodeURIComponent(menteeId)}&video_ids=${encodeURIComponent(
      ids.join(','),
    )}`,
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error ?? `HTTP ${response.status}`);
  }

  return data.progress ?? [];
};

/**
 * Watch progress for the videos inside an assigned playlist or Drive folder.
 *
 * Called when a mentor opens one with a mentee selected. The assignment row
 * holds the container's id, so the children carry nothing until this asks
 * about them by id - the server has never seen what is inside.
 *
 * Silent when there is no mentee selected, no container assignment, or nothing
 * to ask about: this runs off screen navigation, and a mentor browsing their
 * own folders should pay nothing for it.
 */
export const loadChildProgress = async (mentorId, menteeId, containerId, childIds) => {
  const ids = (childIds ?? []).filter(Boolean).map(String);
  if (!mentorId || !menteeId || ids.length === 0) return;

  const {byVideoId, mergeChildProgress} = useAssignmentStatusStore.getState();
  const container = byVideoId[String(containerId)];
  if (!container) return;

  // Remembered before the request rather than after it, so a refresh replays
  // the container even if this attempt is the one that failed.
  lastChildQuery = {mentorId, menteeId, containerId, childIds: ids};

  try {
    const progress = await fetchChildProgress(mentorId, menteeId, ids);
    if (!isStillSelected(menteeId)) return;
    mergeChildProgress(progress, container.status);
  } catch (error) {
    console.warn('Could not load child progress:', error?.message ?? error);
  }
};

/**
 * The mentee opened this mentor, so everything that mentor sent has now
 * actually been looked at.
 *
 * Separate from acknowledgeAssignments, which is this device reporting that it
 * built the rows during a background sync the mentee may never have noticed.
 * Only a person choosing to look earns the blue tick, which is the distinction
 * the mentor's row is there to show.
 *
 * Fire-and-forget: it runs while the drawer is closing and the category is
 * loading, and a failure costs a tick that the next open will set anyway.
 */
export const markAssignmentsSeen = async (menteeId, mentorId) => {
  if (!menteeId || !mentorId) return;
  try {
    const response = await fetch(`${BASE_URL}/assign/mark-seen/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({mentee_id: menteeId, mentor_id: mentorId}),
    });
    if (!response.ok) {
      console.warn('Could not mark assignments seen:', response.status);
    }
  } catch (error) {
    console.warn('Could not mark assignments seen:', error?.message ?? error);
  }
};

/**
 * The startup sync.
 *
 * Runs on its own when the app opens rather than waiting for a tap, because
 * the tap now only opens the drawer - by the time someone looks, the counts
 * have to already be right. Reads its store setters here instead of taking
 * them as arguments, so a caller does not need to be a component.
 *
 * Hydrates the badge counts first: they are persisted, so a mentee who was
 * shown "3 waiting" and then killed the app must still see 3 on the next
 * launch, whether or not this sync finds anything new.
 */
export const syncAssignmentsOnStartup = async userInfo => {
  const inbox = useAssignmentInboxStore.getState();
  await inbox.hydrate();

  if (!userInfo?.id) return;

  const {setDriveLinksList, setItems} = useMediaStore.getState();
  const {setCategories, setSelectedCategory} = useSelectionStore.getState();

  inbox.setSyncing(true);
  try {
    await fetchAssignmentsForMentee(
      setDriveLinksList,
      setItems,
      setCategories,
      setSelectedCategory,
      userInfo,
    );
  } finally {
    useAssignmentInboxStore.getState().setSyncing(false);
  }
};
