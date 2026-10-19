import AsyncStorage from '@react-native-async-storage/async-storage';
import {addCategory, addItemToCategory} from '../categories/catDB';
import {grantReaderAccess} from '../share/driveUpload';
import {getDriveCopyId} from '../database/sharedDriveCopies';
import {enqueueUpload} from '../backgroundService/backgroundDownloadService';
import {onDisplayNotification} from '../notification/notificationService';
import {BASE_URL} from '../appMentorBackend/userMgt';
import {ItemTypes} from '../contexts/constants';

const PENDING_ASSIGNMENT_KEY = '@pending_assignment_job';
let assignmentRunnerRunning = false;
let lastPauseNotificationAt = 0;

export const savePendingAssignment = async job => {
  await AsyncStorage.setItem(PENDING_ASSIGNMENT_KEY, JSON.stringify(job));
};

export const clearPendingAssignment = async () => {
  await AsyncStorage.removeItem(PENDING_ASSIGNMENT_KEY);
};

export const hasPendingAssignment = async () =>
  Boolean(await getPendingAssignment());

export const markAssignmentRunnerRunning = () => {
  assignmentRunnerRunning = true;
};

export const releaseAssignmentRunner = () => {
  assignmentRunnerRunning = false;
};

const getPendingAssignment = async () => {
  try {
    const raw = await AsyncStorage.getItem(PENDING_ASSIGNMENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Cancelling a transfer must cancel only that item in an assignment. Keep the
// decision in the same persisted job so the foreground runner does not enqueue
// the upload again after the app is restarted.
export const markAssignmentUploadCancelled = async sourceId => {
  const job = await getPendingAssignment();
  if (!job) return false;

  const cancelledEntryKeys = new Set(job.cancelledEntryKeys || []);
  let changed = false;
  for (const entry of job.entries || []) {
    if (
      entry.requiresUpload &&
      String(entry.sourceId || entry.id) === String(sourceId)
    ) {
      cancelledEntryKeys.add(entry.key);
      changed = true;
    }
  }
  if (!changed) return false;

  await savePendingAssignment({
    ...job,
    cancelledEntryKeys: [...cancelledEntryKeys],
  });
  return true;
};

const waitForDriveCopy = async (entry, isCancelled) => {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (await isCancelled?.()) return null;
    const driveCopyId = await getDriveCopyId(entry.databaseId);
    if (driveCopyId) return driveCopyId;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Could not create a Drive copy for ${entry.title}`);
};

// A Drive permission call can fail because the mentee already has access (a
// harmless, idempotent 4xx) or because the connection disappeared. Keep the
// former behaviour for permanent API errors, but let connectivity/server
// failures escape so the persisted assignment is retried by the foreground
// service instead of being posted without usable Drive access.
const isRetryableConnectivityError = error => {
  const message = String(error?.message || error || '');
  const status = message.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  if (status) {
    const code = Number(status);
    return code === 408 || code === 429 || code >= 500;
  }
  return (
    /network|offline|timeout|timed out|connection|fetch failed|unreachable/i.test(message)
  );
};

const postAssignment = async (mentorId, emails, videos) => {
  const response = await fetch(`${BASE_URL}/assign/assign_videos_to_mentees/`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({mentor_id: mentorId, mentee_gmails: emails, videos}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
};

const addToMenteeCategory = async (mentee, entries) => {
  const key = `[MENTEE_CAT_Filter] ${mentee.full_name} (${mentee.email}) [MENTEE_CAT_Filter]`;
  const categoryId = await addCategory(key, '#007AFF');
  for (const entry of entries) {
    await addItemToCategory(categoryId, entry.id, entry.subtype || entry.type);
  }
};

/**
 * Continues the assignment after a process restart. Uploads are already in
 * the persisted transfer queue; this waits for their saved Drive-copy rows,
 * then grants access and posts each group exactly once.
 */
export const resumePendingAssignments = async () => {
  if (assignmentRunnerRunning) return false;
  const job = await getPendingAssignment();
  if (!job) return false;

  assignmentRunnerRunning = true;
  try {
    const entries = (job.entries || []).map(entry => ({...entry}));
    const byKey = new Map(entries.map(entry => [entry.key, entry]));
    const cancelledEntryKeys = new Set(job.cancelledEntryKeys || []);
    const refreshCancelledEntries = async () => {
      const latest = await getPendingAssignment();
      for (const key of latest?.cancelledEntryKeys || []) {
        cancelledEntryKeys.add(key);
        const entry = byKey.get(key);
        if (entry) entry.cancelled = true;
      }
    };

    await refreshCancelledEntries();

    for (const entry of entries.filter(item => item.requiresUpload)) {
      if (cancelledEntryKeys.has(entry.key)) {
        entry.cancelled = true;
        continue;
      }
      entry.driveCopyId = await getDriveCopyId(entry.databaseId);
      if (!entry.driveCopyId) {
        await enqueueUpload({
          id: entry.databaseId,
          sourceId: entry.sourceId || String(entry.id),
          title: entry.title,
          localPath: entry.localPath,
          mimeType: entry.mimeType,
          priority: 'share',
          showReady: false,
        });
        entry.driveCopyId = await waitForDriveCopy(entry, async () => {
          const latest = await getPendingAssignment();
          return latest?.cancelledEntryKeys?.includes(entry.key);
        });
        if (!entry.driveCopyId) {
          cancelledEntryKeys.add(entry.key);
          entry.cancelled = true;
          continue;
        }
      }
      entry.requiresUpload = false;
      entry.payload = {
        video_id: entry.driveCopyId,
        video_type: ItemTypes.DEVICE,
        origin_video_id: entry.id,
      };
    }

    await refreshCancelledEntries();
    const completed = new Set(job.completedGroups || []);
    for (let index = 0; index < (job.groups || []).length; index += 1) {
      if (completed.has(index)) continue;
      await refreshCancelledEntries();
      const group = job.groups[index];
      const groupEntries = (group.entryKeys || [])
        .map(key => byKey.get(key))
        .filter(entry => entry && !entry.cancelled);
      const mentees = group.mentees || [];

      // If every item in this group was cancelled, there is nothing to post,
      // but mark the group complete so the remaining groups can continue.
      if (groupEntries.length === 0) {
        completed.add(index);
        await savePendingAssignment({
          ...job,
          completedGroups: [...completed],
          cancelledEntryKeys: [...cancelledEntryKeys],
        });
        continue;
      }

      const emails = mentees.map(mentee => mentee.email).filter(Boolean);
      const driveCopyIds = groupEntries.map(entry => entry.driveCopyId).filter(Boolean);

      await Promise.all(
        driveCopyIds.flatMap(fileId =>
          emails.map(async email => {
            try {
              await grantReaderAccess(fileId, email);
            } catch (error) {
              if (isRetryableConnectivityError(error)) throw error;
              // A permanent permission response (for example, an existing
              // permission) should not prevent the assignment API call.
            }
          }),
        ),
      );
      await postAssignment(
        job.mentorId,
        emails,
        groupEntries.map(entry => entry.payload),
      );
      for (const mentee of mentees) {
        await addToMenteeCategory(mentee, groupEntries).catch(() => {});
      }

      completed.add(index);
      await savePendingAssignment({
        ...job,
        completedGroups: [...completed],
        cancelledEntryKeys: [...cancelledEntryKeys],
      });
    }

    await clearPendingAssignment();
    const cancelledKeys = new Set(cancelledEntryKeys);
    const assignedMentees = (job.groups || []).reduce(
      (total, group) =>
        total +
        ((group.entryKeys || []).some(key => !cancelledKeys.has(key))
          ? (group.mentees || []).length
          : 0),
      0,
    );
    const assignedPairs = (job.groups || []).reduce(
      (total, group) =>
        total +
        (group.entryKeys || []).filter(key => !cancelledKeys.has(key)).length *
          (group.mentees || []).length,
      0,
    );
    const skippedText = cancelledKeys.size
      ? ` Skipped ${cancelledKeys.size} cancelled item(s).`
      : '';
    await onDisplayNotification(
      'Assignment completed',
      `Assigned ${assignedPairs} item(s) to ${assignedMentees} mentee(s).${skippedText}`,
    );
    return true;
  } catch (error) {
    console.warn('Pending assignment will resume later:', error?.message || error);
    if (Date.now() - lastPauseNotificationAt > 60000) {
      lastPauseNotificationAt = Date.now();
      await onDisplayNotification(
        'Assignment paused',
        'The assignment will continue automatically when the connection is available.',
      );
    }
    return false;
  } finally {
    assignmentRunnerRunning = false;
  }
};
