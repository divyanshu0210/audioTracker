import notifee, {AndroidImportance, AndroidStyle} from '@notifee/react-native';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {updateItemFields} from '../database/U';
import useDownloadStore from '../stores/useDownloadStore';
import {requestPermissions} from './newBackgroundService';
import {
  dismissNotification,
  onDisplayNotification,
  showUploadReadyNotification,
} from '../notification/notificationService';
import {getGoogleAccessToken} from '../auth/tokenManager';
import {performUpload} from '../share/uploadTask';
import useShareStore from '../stores/useShareStore';
import {useMediaStore} from '../stores/useMediaStore';
import {getMediaFileSize} from '../utils/mediaFile';
import {
  downloadResumable,
  discardDownloadCheckpoint,
  clearTransferCheckpoint,
  TransferPausedError,
} from './resumableTransfer';

const QUEUE_KEY = '@download_queue';
const TRANSFER_NOTIFICATION_ID = 'transfer-service';
const TRANSFER_CHANNEL_ID = 'transfer-service';
const SHARE_CHANNEL_ID = 'share-transfer';
let transferServiceRunning = false;
let transferRunnerResolve = null;
let transferStartPromise = null;
let foregroundServiceRegistered = false;
let schedulerRunning = false;
let activeTransferSource = null;
const cancelledSources = new Set();

const hasPriorityShare = async () => {
  const queue = await getQueue();
  return queue.some(file => file.kind === 'upload' && file.priority !== 'normal');
};

const pauseForPriorityShare = async file =>
  file.kind !== 'upload' && file.priority !== 'share' && (await hasPriorityShare());

// ── Queue (AsyncStorage) ──────────────────────────────────────────────────────

const getQueue = async () => {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveQueue = async queue => {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
};

const removeFromQueue = async sourceId => {
  const queue = await getQueue();
  await saveQueue(queue.filter(f => f.sourceId !== sourceId));
};

const deferRetry = async sourceId => {
  const queue = await getQueue();
  await saveQueue(queue.map(file => {
    if (file.sourceId !== sourceId) return file;
    const retryCount = Math.min(6, Number(file.retryCount) || 0) + 1;
    return {...file, retryCount, nextAttemptAt: Date.now() + Math.min(30000, 1000 * 2 ** (retryCount - 1))};
  }));
};

// ── Active job / progress tracking ───────────────────────────────────────────

const activeJobIds = new Map(); // sourceId → RNFS jobId
// sourceId → the in-flight RNFetchBlob upload, which is what cancelling one
// needs. Kept apart from activeJobIds because that map's values are RNFS job
// ids and an upload has none; it holds a null for an upload purely so the
// shared notification can count what is in flight.
const activeUploadTasks = new Map();
const kindsInFlight = new Map(); // sourceId → 'download' | 'upload'
const fileProgress = new Map(); // sourceId → { total, written }
const lastReportedPct = new Map(); // sourceId → last progress % pushed to the store
const queueSizeCache = new Map();
const queueSizeRequests = new Map();
let pendingCount = 0; // files currently in-flight (including queued but not yet begun)
let completedCount = 0; // files finished successfully in the current batch
let completedBytes = 0; // bytes downloaded successfully in the current batch

const formatBytes = bytes => {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const notificationName = value => {
  const name = String(value || 'Untitled').replace(/\s+/g, ' ').trim();
  return name.length > 28 ? `${name.slice(0, 27)}…` : name;
};

const resolveQueueSize = async file => {
  const known = fileProgress.get(file.sourceId)?.total || Number(file.size) || 0;
  if (known > 0) return known;
  if (queueSizeCache.has(file.sourceId)) return queueSizeCache.get(file.sourceId);
  if (queueSizeRequests.has(file.sourceId)) return queueSizeRequests.get(file.sourceId);
  const request = (async () => {
    try {
      if (file.kind === 'upload' && file.localPath) {
        return await getMediaFileSize(file.localPath);
      }
      if (!file.url) return null;
      const headers = file.googleAuth
        ? {Authorization: `Bearer ${await getGoogleAccessToken()}`}
        : {};
      const response = await fetch(file.url, {method: 'HEAD', headers});
      return Number(response.headers.get('content-length')) || null;
    } catch {
      return null;
    }
  })();
  queueSizeRequests.set(file.sourceId, request);
  const value = await request;
  queueSizeRequests.delete(file.sourceId);
  // Do not permanently cache an unanswered query. A provider can be busy or
  // temporarily unavailable while the upload is starting; a later progress
  // refresh should be allowed to resolve the same URI again.
  if (value > 0) queueSizeCache.set(file.sourceId, value);
  return value;
};

const updateServiceNotification = async () => {
  const queue = await getQueue();
  const count = Math.max(activeJobIds.size, queue.length);
  if (count === 0) return;

  let totalBytes = 0;
  let writtenBytes = 0;
  let hasKnownSize = false;

  for (const p of fileProgress.values()) {
    writtenBytes += p.written;
    if (p.total > 0) {
      hasKnownSize = true;
      totalBytes += p.total;
    }
  }

  // The queue carries both directions now, so the wording follows what is
  // actually running rather than assuming downloads.
  const activeSource = activeTransferSource || activeJobIds.keys().next().value;
  const activeFile = queue.find(file => file.sourceId === activeSource) || queue[0];
  const activeKind = kindsInFlight.get(activeSource) || activeFile?.kind || 'download';
  // Assignment uploads are share-priority uploads too. They deliberately do
  // not show the reusable-link completion notification (`showReady: false`),
  // but the active transfer must still be presented as Sharing so the mentor
  // knows why this upload is running and why it has priority.
  const shareActive = activeKind === 'upload' && activeFile?.priority === 'share';
  const verb = shareActive ? 'Sharing' : activeKind === 'upload' ? 'Uploading' : 'Downloading';
  const title = verb;

  // Resolve the active upload too. Previously only waiting rows were checked,
  // so the foreground notification could remain "unknown" until the first
  // upload callback even when the content URI already exposed its size.
  if (activeFile && activeKind === 'upload' && !fileProgress.get(activeSource)?.total) {
    const activeSize = await resolveQueueSize(activeFile);
    if (activeSize > 0) {
      const current = fileProgress.get(activeSource) || {written: 0};
      fileProgress.set(activeSource, {written: current.written || 0, total: activeSize});
    }
  }

  let taskDesc;
  let progressBar;

  if (hasKnownSize && totalBytes > 0) {
    const pct = Math.min(100, Math.round((writtenBytes / totalBytes) * 100));
    taskDesc = `${formatBytes(writtenBytes)} / ${formatBytes(totalBytes)} (${pct}%)`;
    progressBar = {max: 100, value: pct, indeterminate: false};
  } else {
    taskDesc =
      writtenBytes > 0
        ? `${formatBytes(writtenBytes)} transferred`
        : queue.length > 1
          ? `${queue.length} files queued`
          : 'Starting…';
    progressBar = {max: 100, value: 0, indeterminate: true};
  }

  const waiting = queue.filter(file => file.sourceId !== activeSource);
  const rows = await Promise.all(waiting.slice(0, 8).map(async file => {
    const size = fileProgress.get(file.sourceId)?.total || await resolveQueueSize(file);
    const sizeText = size > 0 ? formatBytes(size) : 'unknown';
    return `${notificationName(file.title).padEnd(30, ' ')}${sizeText}`;
  }));
  if (waiting.length > rows.length) rows.push(`…and ${waiting.length - rows.length} more`);
  const activeLabel = activeFile?.title ? notificationName(activeFile.title) : 'Active transfer';
  const displayDesc = `${activeLabel}  ${taskDesc}`;
  const notificationLines = [displayDesc, ...rows];

  await safeUpdateNotification({
    taskTitle: title,
    taskDesc: displayDesc,
    progressBar,
    notificationLines,
    shareActive,
    activeSource,
    activeItemId: activeFile?.id,
    activeKind,
  });
};

// ── Single-file download ──────────────────────────────────────────────────────

const downloadSingleFile = async file => {
  const {setDownload, downloads} = useDownloadStore.getState();
  pendingCount++;
  setDownload(file.sourceId, {status: 'downloading', progress: 0});
  fileProgress.set(file.sourceId, {total: 0, written: 0});

  try {
    // Drive downloads have to go out as the signed-in user: an API key is an
    // anonymous caller and can only fetch "anyone with the link" files, so
    // anything private 403'd. The token is resolved here rather than baked
    // into the queued item because the queue is persisted and survives an app
    // kill, while an access token expires in about an hour — a restored
    // download would carry a dead one. Gated on an explicit flag rather than
    // sniffing the URL so third-party downloads (iskcon_file) never get the
    // user's Google token attached.
    const headers = {
      // Android's HTTP stack offers gzip by default, and audio.iskcondesiretree
      // .com takes it up even for an mp3 — which compresses to nothing and
      // costs the Content-Length, because a gzipped response is sent chunked.
      // RNFS then reports contentLength -1, the progress callback has no
      // denominator, and every download of theirs showed a bare spinner
      // instead of a filling ring. Asking for identity gets the plain file
      // back, with its length and byte ranges intact.
      'Accept-Encoding': 'identity',
      ...(file.googleAuth
        ? {Authorization: `Bearer ${await getGoogleAccessToken()}`}
        : {}),
    };

    const {promise} = RNFS.downloadFile({
      fromUrl: file.url,
      toFile: file.localPath,
      headers,
      progressDivider: 2,
      begin: res => {
        activeJobIds.set(file.sourceId, res.jobId);
        kindsInFlight.set(file.sourceId, 'download');
        const total = Number(res.contentLength) || 0;
        // A zero here is the whole reason a download shows a bare spinner
        // instead of a filling ring: no Content-Length, no denominator. Left
        // in because there is no other way to tell that apart from a stuck
        // download from the outside — drop it once the question is settled.
        console.log(
          `⬇️ download begin ${file.type} ${file.title} contentLength=${total} status=${res.statusCode}`,
        );
        fileProgress.set(file.sourceId, {total, written: 0});
        updateServiceNotification();
      },
      progress: res => {
        const total = Number(res.contentLength) || 0;
        const written = Number(res.bytesWritten) || 0;
        fileProgress.set(file.sourceId, {total, written});

        const pct =
          !total || total <= 0
            ? null
            : Math.min(100, Math.round((written / total) * 100));

        // RNFS's native progress callback fires many times per file; only
        // push a store update (and re-render every subscriber) when the
        // rounded percentage actually moved, instead of on every tick.
        if (lastReportedPct.get(file.sourceId) === pct) return;
        lastReportedPct.set(file.sourceId, pct);

        setDownload(file.sourceId, {status: 'downloading', progress: pct});
        updateServiceNotification();
      },
    });

    const result = await promise;
    activeJobIds.delete(file.sourceId);
    fileProgress.delete(file.sourceId);
    lastReportedPct.delete(file.sourceId);

    if (result.statusCode === 200) {
      await updateItemFields(file.id, {file_path: file.localPath});
      useDownloadStore.getState().notifyDownloadsChanged();
      // The row on the Device tab is still the one loaded at startup, carrying
      // the file_path that wasn't there — so it stayed out of validDeviceIds
      // and a tap kept raising "File not on this device" over a file that had
      // just finished downloading. A drive_file gets this from the Download
      // button's own effect, but a device file's download is started from an
      // alert or the player, with no row component mounted to react to it, so
      // it has to happen here. setDeviceFiles re-runs the existence check and
      // rebuilds validDeviceIds, which is what makes the row playable again.
      if (file.type === 'device_file') {
        useMediaStore
          .getState()
          .setDeviceFiles(prev =>
            prev.map(f =>
              f.id === file.id ? {...f, file_path: file.localPath} : f,
            ),
          );
      }
      setDownload(file.sourceId, {
        status: 'done',
        progress: 100,
        localPath: file.localPath,
      });
      completedCount++;
      completedBytes += Number(result.bytesWritten) || 0;
    } else {
      throw new Error(`HTTP ${result.statusCode}`);
    }
  } catch {
    activeJobIds.delete(file.sourceId);
    fileProgress.delete(file.sourceId);
    lastReportedPct.delete(file.sourceId);
    if (await RNFS.exists(file.localPath)) {
      await RNFS.unlink(file.localPath);
    }
    // Only mark failed if not already removed by cancelDownload
    if (useDownloadStore.getState().downloads[file.sourceId]) {
      setDownload(file.sourceId, {status: 'failed', progress: 0});
    }
  } finally {
    await removeFromQueue(file.sourceId);
    pendingCount--;

    if (pendingCount === 0) {
      // Last download finished (or was cancelled) — leave a normal
      // notification behind (the foreground-service one disappears on stop).
      if (completedCount > 0) {
        await onDisplayNotification(
          completedCount === 1 ? '1 file downloaded' : `${completedCount} files downloaded`,
          formatBytes(completedBytes),
        );
      }
      completedCount = 0;
      completedBytes = 0;
      await stopTransferService();
    } else {
      // Other downloads still running — update notification count/progress.
      updateServiceNotification();
    }
  }
};

// ── Single-file upload ────────────────────────────────────────────────────────
//
// Deliberately shares this service with downloads rather than running on its
// own. react-native-background-actions runs one task at a time, so a second
// service is not available — and without one, backgrounding the app suspends
// the JS thread and a half-finished upload stalls with its notification frozen.
//
// Progress goes to useShareStore rather than useDownloadStore: an upload is not
// a download and must not appear in the Downloads list, which reads that store.
const uploadSingleFile = async file => {
  const {setUploading} = useShareStore.getState();
  let paused = false;
  let keepQueued = false;
  pendingCount++;
  setUploading(file.id, 0);
  // A placeholder jobId: uploads have no RNFS job to cancel, but the shared
  // notification counts what is in flight by this map.
  activeJobIds.set(file.sourceId, null);
  kindsInFlight.set(file.sourceId, 'upload');
  fileProgress.set(file.sourceId, {total: 0, written: 0});

  try {
    const driveFileId = await performUpload({
      itemId: file.id,
      sourceId: file.sourceId,
      title: file.title,
      localPath: file.localPath,
      mimeType: file.mimeType,
      onTask: task => activeUploadTasks.set(file.sourceId, task),
      shouldPause: () => cancelledSources.has(file.sourceId) || pauseForPriorityShare(file),
      onProgress: ({percent, written, total}) => {
        if (cancelledSources.has(file.sourceId)) return;
        // Real byte counts, so an upload contributes to the shared
        // "x MB / y MB" line on the same terms as a download. Recorded every
        // tick, since it costs a Map write; only the notification redraw is
        // throttled to when the rounded percentage actually moves.
        fileProgress.set(file.sourceId, {total, written});

        // A null percent means the request never reported a size. Passing it
        // to setUploading would delete the entry and the menu would stop
        // saying "Uploading…" mid-upload.
        if (percent != null) setUploading(file.id, percent);

        if (lastReportedPct.get(file.sourceId) === percent) return;
        lastReportedPct.set(file.sourceId, percent);
        updateServiceNotification();
      },
    });

    if (file.showReady !== false) {
      await showUploadReadyNotification({
        itemId: file.id,
        sourceId: file.sourceId,
        title: file.title,
        driveFileId,
      });
    }
  } catch (error) {
    paused = cancelledSources.has(file.sourceId) || error instanceof TransferPausedError;
    // A cancelled upload rejects here like any other failure. cancelUpload has
    // already cleared the store entry by then, and its absence is what tells
    // the two apart — the same test downloadSingleFile uses. Without it,
    // stopping an upload on purpose ended in "Could not create link".
    if (!paused && useShareStore.getState().uploading[file.id] != null) {
      keepQueued = true;
      await deferRetry(file.sourceId);
      console.error('Upload failed:', error);
      await onDisplayNotification(
        'Upload interrupted',
        `${file.title} will resume automatically when the connection is available.`,
      );
    }
    if (!paused) await dismissNotification(`device-upload-${file.id}`);
  } finally {
    activeUploadTasks.delete(file.sourceId);
    activeJobIds.delete(file.sourceId);
    cancelledSources.delete(file.sourceId);
    kindsInFlight.delete(file.sourceId);
    fileProgress.delete(file.sourceId);
    lastReportedPct.delete(file.sourceId);
    setUploading(file.id, null);
    if (!paused && !keepQueued) await removeFromQueue(file.sourceId);
    pendingCount--;

    updateServiceNotification();
  }
};

// Chunked download worker. A .part file and checkpoint survive process death;
// normal work yields between chunks when a priority Share upload is queued.
const resumableDownloadSingleFile = async file => {
  const {setDownload} = useDownloadStore.getState();
  let paused = false;
  let keepQueued = false;
  pendingCount++;
  activeJobIds.set(file.sourceId, null);
  kindsInFlight.set(file.sourceId, 'download');
  setDownload(file.sourceId, {status: 'downloading', progress: 0});
  try {
    const headers = {
      'Accept-Encoding': 'identity',
      ...(file.googleAuth ? {Authorization: `Bearer ${await getGoogleAccessToken()}`} : {}),
    };
    const result = await downloadResumable({
      sourceId: file.sourceId,
      url: file.url,
      localPath: file.localPath,
      headers,
      shouldPause: () => cancelledSources.has(file.sourceId) || pauseForPriorityShare(file),
      onProgress: ({written, total}) => {
        if (cancelledSources.has(file.sourceId)) return;
        fileProgress.set(file.sourceId, {written, total});
        const progress = total > 0 ? Math.min(100, Math.round((written / total) * 100)) : 0;
        if (lastReportedPct.get(file.sourceId) === progress) return;
        lastReportedPct.set(file.sourceId, progress);
        setDownload(file.sourceId, {status: 'downloading', progress});
        updateServiceNotification();
      },
    });
    await updateItemFields(file.id, {file_path: file.localPath});
    useDownloadStore.getState().notifyDownloadsChanged();
    if (file.type === 'device_file') {
      useMediaStore.getState().setDeviceFiles(prev =>
        prev.map(f => f.id === file.id ? {...f, file_path: file.localPath} : f),
      );
    }
    setDownload(file.sourceId, {status: 'done', progress: 100, localPath: file.localPath});
    completedCount++;
    completedBytes += Number(result.written) || 0;
  } catch (error) {
    if (cancelledSources.has(file.sourceId)) {
      paused = true;
      await discardDownloadCheckpoint(file.sourceId, file.localPath);
    } else if (error instanceof TransferPausedError) {
      paused = true;
      setDownload(file.sourceId, {status: 'queued'});
    } else if (useDownloadStore.getState().downloads[file.sourceId]) {
      keepQueued = true;
      await deferRetry(file.sourceId);
      setDownload(file.sourceId, {status: 'queued'});
    }
  } finally {
    if (!paused && !keepQueued) await removeFromQueue(file.sourceId);
    fileProgress.delete(file.sourceId);
    lastReportedPct.delete(file.sourceId);
    kindsInFlight.delete(file.sourceId);
    activeJobIds.delete(file.sourceId);
    cancelledSources.delete(file.sourceId);
    pendingCount--;
    updateServiceNotification();
  }
};

// Both directions come off one persisted queue, so a job that was mid-flight
// when the app died is picked up the same way whichever way it was going.
// Entries written before uploads existed have no kind and are downloads.
const runQueuedItem = file =>
  file.kind === 'upload' ? uploadSingleFile(file) : resumableDownloadSingleFile(file);

// ── Background task entry point ───────────────────────────────────────────────
//
// The Notifee foreground runner stays alive while the scheduler drains the
// persisted queue. New entries call pumpTransferQueue directly if the runner
// is already active.

const pumpTransferQueue = async () => {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    while (transferServiceRunning) {
      const queue = await getQueue();
      if (!queue.length) break;
      // Share-link uploads always win. Transfers are processed one at a time,
      // so the queue order is deterministic and a Share upload cannot be
      // starved by a large download.
      const priority = queue.find(item =>
        (item.kind === 'upload' && item.priority !== 'normal') || item.priority === 'share',
      );
      if (priority) {
        const waitMs = Math.max(0, Number(priority.nextAttemptAt) - Date.now());
        if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
        activeTransferSource = priority.sourceId;
        await runQueuedItem(priority);
        activeTransferSource = null;
      } else {
        const file = queue[0];
        const waitMs = Math.max(0, Number(file.nextAttemptAt) - Date.now());
        if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
        activeTransferSource = file.sourceId;
        await runQueuedItem(file);
        activeTransferSource = null;
      }
    }
  } finally {
    activeTransferSource = null;
    schedulerRunning = false;
  }
};

const downloadTask = async () => {
  const assignmentQueue = await import('../appMentor/assignmentQueue');
  while (transferServiceRunning) {
    // Rehydrate assignment uploads before draining ordinary transfers. This
    // lets the scheduler see their share priority and pause a normal download
    // at its next resumable chunk instead of making the assignment wait for a
    // potentially very large queue to finish.
    await assignmentQueue.resumePendingAssignments();

    if ((await getQueue()).length) await pumpTransferQueue();

    // A persisted assignment may still be waiting for its post-upload API
    // work. Keep the foreground service alive and retry after a network
    // interruption instead of waiting for the next app launch.
    if ((await getQueue()).length) continue;
    if (await assignmentQueue.hasPendingAssignment()) {
      await new Promise(resolve => setTimeout(resolve, 30000));
      continue;
    }
    await stopTransferService();
    break;
  }
};

// Starts (or restarts, e.g. after the app/service was killed mid-transfer)
// the foreground service that drives downloadTask. Shared by enqueueDownload,
// enqueueUpload and restoreDownloadState.
export const registerTransferForegroundService = () => {
  if (foregroundServiceRegistered) return;
  foregroundServiceRegistered = true;
  notifee.registerForegroundService(async () => {
    await downloadTask();
    return new Promise(resolve => {
      transferRunnerResolve = resolve;
    });
  });
};

const startDownloadService = async taskTitle => {
  if (transferServiceRunning) return;
  if (transferStartPromise) return transferStartPromise;
  transferStartPromise = (async () => {
    registerTransferForegroundService();
    transferServiceRunning = true;
    pendingCount = 0;
    await requestPermissions().catch(() => {});
    const channelId = await notifee.createChannel({
      id: TRANSFER_CHANNEL_ID,
      name: 'File transfers',
      importance: AndroidImportance.LOW,
    });
    await notifee.displayNotification({
      id: TRANSFER_NOTIFICATION_ID,
      title: taskTitle,
      body: 'Starting…',
      data: {kind: 'transfer-service'},
      android: {
        channelId,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        progress: {max: 100, current: 0, indeterminate: true},
        actions: [{title: 'Cancel all', pressAction: {id: 'cancel-all-transfers'}}],
        pressAction: {id: 'open-notifications', launchActivity: 'default'},
      },
    });
  })().finally(() => {
    transferStartPromise = null;
  });
  return transferStartPromise;
};

// Assignments without a device upload still need a foreground task: their
// access grants and API calls must survive leaving the Assign screen too.
export const startAssignmentService = async () => {
  await startDownloadService('Assigning items');
};

export const stopTransferService = async () => {
  transferServiceRunning = false;
  transferRunnerResolve?.();
  transferRunnerResolve = null;
  await notifee.stopForegroundService().catch(() => {});
  await notifee.cancelNotification(TRANSFER_NOTIFICATION_ID).catch(() => {});
};

// ── Public API ────────────────────────────────────────────────────────────────

export const enqueueDownload = async ({
  id,
  sourceId,
  title,
  url,
  localPath,
  type,
  mimeType,
  googleAuth = false,
}) => {
  const {setDownload} = useDownloadStore.getState();

  const queue = await getQueue();
  if (queue.some(f => f.sourceId === sourceId)) {
    // The service may already be draining this item.
    if (transferServiceRunning) pumpTransferQueue();
    return;
  }

  const file = {kind: 'download', priority: 'normal', id, sourceId, title, url, localPath, type, mimeType, googleAuth};
  await saveQueue([...queue, file]);
  // Stash title/type/mimeType in the store too so the Downloads screen can
  // render an in-progress card (status updates merge over this).
  setDownload(sourceId, {status: 'queued', progress: 0, title, type, mimeType});

  if (transferServiceRunning) {
    // Service already alive — the scheduler will pick it after the active file.
    pumpTransferQueue();
    updateServiceNotification();
  } else {
    await startDownloadService(`Downloading ${title}`);
  }
};

// Queues a device file for upload to Drive. Runs on the same foreground
// service as downloads, so backgrounding the app does not suspend it — which
// is the whole reason it lives here rather than being awaited in a menu
// handler.
//
// sourceId keys the queue and the in-flight maps; id is the db row the Drive
// copy gets recorded against. They are different values for a device file, and
// both are needed.
export const enqueueUpload = async ({
  id,
  sourceId,
  title,
  localPath,
  mimeType,
  priority = 'share',
  showReady = priority === 'share',
}) => {
  const queue = await getQueue();
  if (queue.some(f => f.sourceId === sourceId)) {
    // A persisted assignment may discover its upload already in the queue
    // while the foreground runner is starting. Kick the scheduler here so a
    // caller waiting for the Drive-copy row cannot wait before the queue has
    // had a chance to run.
    if (transferServiceRunning) pumpTransferQueue();
    return;
  }

  const size = await getMediaFileSize(localPath);
  const file = {
    kind: 'upload',
    priority,
    showReady,
    id,
    sourceId,
    title,
    localPath,
    mimeType,
    size: size || null,
  };
  await saveQueue([...queue, file]);
  useShareStore.getState().setUploading(id, 0);

  if (transferServiceRunning) {
    pumpTransferQueue();
    updateServiceNotification();
  } else {
    await startDownloadService(`Uploading ${title}`);
  }
};

export const cancelDownload = async sourceId => {
  const {removeDownload} = useDownloadStore.getState();
  cancelledSources.add(sourceId);
  const queuedFile = (await getQueue()).find(file => file.sourceId === sourceId);
  if (queuedFile?.localPath) {
    await discardDownloadCheckpoint(sourceId, queuedFile.localPath);
  }
  // Remove from queue and UI immediately so the catch block in
  // downloadSingleFile sees the entry is gone and skips setting 'failed'.
  await removeFromQueue(sourceId);
  removeDownload(sourceId);
  fileProgress.delete(sourceId);
  lastReportedPct.delete(sourceId);

  // Stop the RNFS job — causes downloadSingleFile's await promise to
  // reject/resolve, which runs its catch + finally (decrements pendingCount,
  // updates notification or stops service).
  const jobId = activeJobIds.get(sourceId);
  if (jobId != null) {
    RNFS.stopDownload(jobId);
    activeJobIds.delete(sourceId);
  }

  // pendingCount only counts active workers. There may still be queued
  // downloads, so never stop the foreground service merely because the
  // cancelled item was the only active one.
  const assignmentQueue = await import('../appMentor/assignmentQueue').catch(() => null);
  const hasPendingAssignment = await assignmentQueue?.hasPendingAssignment?.();
  if ((await getQueue()).length) {
    pumpTransferQueue();
    updateServiceNotification();
  } else if (hasPendingAssignment) {
    await startDownloadService('Assigning items');
  } else if (pendingCount <= 1) {
    await stopTransferService();
  } else {
    updateServiceNotification();
  }
};

// Stops an upload in flight. Takes both ids because the two halves of an
// upload are keyed differently: the queue and the in-flight maps go by
// sourceId, while the share store — and so every bit of upload UI — goes by
// the items-table id.
//
// The store entry is cleared first, so that the rejection this causes is read
// as a cancel rather than as a failure.
//
// Nothing is left behind in Drive. The bytes go to a resumable session url
// rather than to a file, and an abandoned session expires on Google's side
// without ever becoming one.
export const cancelUpload = async ({sourceId, itemId}) => {
  cancelledSources.add(sourceId);
  // If this upload belongs to an assignment, persist the cancellation before
  // stopping the transfer. The assignment runner will then skip only this
  // item and continue with the remaining groups.
  let assignmentQueue = null;
  try {
    assignmentQueue = await import('../appMentor/assignmentQueue');
    await assignmentQueue.markAssignmentUploadCancelled(sourceId);
  } catch (error) {
    console.warn('Could not record assignment upload cancellation:', error?.message);
  }
  await clearTransferCheckpoint(`@transfer_upload:${sourceId}`);
  await clearTransferCheckpoint(`@transfer_upload:${itemId}`);
  useShareStore.getState().setUploading(itemId, null);
  await removeFromQueue(sourceId);
  fileProgress.delete(sourceId);
  lastReportedPct.delete(sourceId);

  const task = activeUploadTasks.get(sourceId);
  if (task) {
    try {
      task.cancel();
    } catch (error) {
      console.warn('Could not cancel the upload:', error?.message);
    }
    activeUploadTasks.delete(sourceId);
  }

  const hasPendingAssignment = await assignmentQueue?.hasPendingAssignment?.();
  if ((await getQueue()).length) {
    pumpTransferQueue();
    updateServiceNotification();
  } else if (hasPendingAssignment) {
    // The cancelled upload may have been the only transfer keeping the
    // foreground service alive. Keep/restart it so the runner can deliver the
    // remaining non-cancelled assignment items.
    await startDownloadService('Assigning items');
  } else if (pendingCount <= 1) {
    await stopTransferService();
  } else {
    updateServiceNotification();
  }
};

// Cancels only the active item represented by the notification. The remaining
// queue stays intact and the scheduler moves on to the next transfer.
export const cancelTransferItem = async sourceId => {
  if (!sourceId) return false;
  const queue = await getQueue();
  const file = queue.find(item => String(item.sourceId) === String(sourceId));
  if (!file) return false;

  if (file.kind === 'upload') {
    await cancelUpload({sourceId: file.sourceId, itemId: file.id});
  } else {
    await cancelDownload(file.sourceId);
  }
  return true;
};

export const cancelPriorityShareTransfer = async () => {
  const queue = await getQueue();
  const share = queue.find(file => file.kind === 'upload' && file.priority !== 'normal');
  if (!share) return false;
  await cancelUpload({sourceId: share.sourceId, itemId: share.id});
  return true;
};

export const cancelAllTransfers = async () => {
  const queue = await getQueue();
  await saveQueue([]);
  const assignmentQueue = await import('../appMentor/assignmentQueue').catch(() => null);
  const {removeDownload} = useDownloadStore.getState();
  const {setUploading} = useShareStore.getState();
  for (const file of queue) {
    cancelledSources.add(file.sourceId);
    if (file.kind === 'upload') {
      await assignmentQueue?.markAssignmentUploadCancelled(file.sourceId);
      setUploading(file.id, null);
      await clearTransferCheckpoint(`@transfer_upload:${file.sourceId}`);
    } else {
      removeDownload(file.sourceId);
      if (file.localPath) await discardDownloadCheckpoint(file.sourceId, file.localPath);
    }
  }
  for (const [sourceId, jobId] of activeJobIds.entries()) {
    if (jobId != null) {
      try { RNFS.stopDownload(jobId); } catch {}
    }
    activeJobIds.delete(sourceId);
  }
  for (const [sourceId, task] of activeUploadTasks.entries()) {
    try { task?.cancel?.(); } catch {}
    activeUploadTasks.delete(sourceId);
  }
  fileProgress.clear();
  lastReportedPct.clear();
  kindsInFlight.clear();
  // Active workers will unwind their own finally blocks. Do not reset this
  // counter here or their completions can drive it negative and corrupt the
  // next notification batch.
  await stopTransferService();
  if (await assignmentQueue?.hasPendingAssignment?.()) {
    await startDownloadService('Assigning items');
  }
};

export const restoreDownloadState = async () => {
  const queue = await getQueue();
  if (!queue.length) return;

  const {setDownload} = useDownloadStore.getState();
  const {setUploading} = useShareStore.getState();
  queue.forEach(f => {
    // Uploads are rehydrated into the share store instead — putting one in
    // useDownloadStore would make it appear in the Downloads list as a file
    // being downloaded, which it is not.
    if (f.kind === 'upload') {
      setUploading(f.id, 0);
      return;
    }
    setDownload(f.sourceId, {
      status: 'queued',
      progress: 0,
      title: f.title,
      type: f.type,
      mimeType: f.mimeType,
    });
  });

  // The queue survives an app kill (persisted in AsyncStorage) but the
  // foreground service driving it does not — without restarting it here,
  // these files would sit at "Queued…" forever with nothing downloading.
  if (!transferServiceRunning) {
    const onlyUploads = queue.every(f => f.kind === 'upload');
    const verb = onlyUploads ? 'Uploading' : 'Downloading';
    const title =
      queue.length === 1
        ? `${verb} ${queue[0].title}`
        : `${verb} ${queue.length} files`;
    await startDownloadService(title);
  }
};

const safeUpdateNotification = async ({
  taskTitle,
  taskDesc,
  progressBar,
  notificationLines = [taskDesc],
  shareActive = false,
  activeSource,
  activeItemId,
  activeKind,
}) => {
  try {
    if (!transferServiceRunning) return;
    const transferChannelId = await notifee.createChannel({
      id: TRANSFER_CHANNEL_ID,
      name: 'File transfers',
      importance: AndroidImportance.LOW,
    });
    const shareChannelId = await notifee.createChannel({
      id: SHARE_CHANNEL_ID,
      name: 'Share uploads',
      importance: AndroidImportance.LOW,
    });
    const progress = progressBar.indeterminate
      ? {indeterminate: true}
      : {max: progressBar.max, current: progressBar.value};
    const actions = [
      ...(activeSource
        ? [{title: 'Cancel', pressAction: {id: 'cancel-transfer-item'}}]
        : []),
      {title: 'Cancel all', pressAction: {id: 'cancel-all-transfers'}},
    ];
    await notifee.displayNotification({
      id: TRANSFER_NOTIFICATION_ID,
      title: taskTitle,
      body: taskDesc,
      data: {
        kind: shareActive ? 'share-transfer' : 'transfer-service',
        sourceId: String(activeSource || ''),
        itemId: String(activeItemId || ''),
        transferKind: activeKind || '',
      },
      android: {
        channelId: shareActive ? shareChannelId : transferChannelId,
        asForegroundService: true,
        ongoing: true,
        onlyAlertOnce: true,
        style: {type: AndroidStyle.INBOX, lines: notificationLines},
        progress,
        actions,
      },
    });
  } catch {}
};
