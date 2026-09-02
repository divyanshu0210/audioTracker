import BackgroundService from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {updateItemFields} from '../database/U';
import useDownloadStore from '../stores/useDownloadStore';
import {requestPermissions} from './newBackgroundService';
import {onDisplayNotification} from '../notification/notificationService';
import {getGoogleAccessToken} from '../auth/tokenManager';
import {performUpload} from '../share/uploadTask';
import useShareStore from '../stores/useShareStore';
import {useMediaStore} from '../stores/useMediaStore';

const QUEUE_KEY = '@download_queue';

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

// ── Active job / progress tracking ───────────────────────────────────────────

const activeJobIds = new Map(); // sourceId → RNFS jobId
const kindsInFlight = new Map(); // sourceId → 'download' | 'upload'
const fileProgress = new Map(); // sourceId → { total, written }
const lastReportedPct = new Map(); // sourceId → last progress % pushed to the store
let pendingCount = 0; // files currently in-flight (including queued but not yet begun)
let completedCount = 0; // files finished successfully in the current batch
let completedBytes = 0; // bytes downloaded successfully in the current batch

const formatBytes = bytes => {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const updateServiceNotification = async () => {
  const count = activeJobIds.size;
  const activeKinds = new Set(kindsInFlight.values());
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
  let verb = activeKinds.has('upload') ? 'Uploading' : 'Downloading';
  if (activeKinds.has('upload') && activeKinds.has('download')) {
    verb = 'Transferring';
  }
  const title =
    count === 1 ? `${verb} 1 file` : `${verb} ${count} files`;

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
        : 'Starting…';
    progressBar = {max: 100, value: 0, indeterminate: true};
  }

  await safeUpdateNotification({taskTitle: title, taskDesc, progressBar});
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
    const headers = file.googleAuth
      ? {Authorization: `Bearer ${await getGoogleAccessToken()}`}
      : {};

    const {promise} = RNFS.downloadFile({
      fromUrl: file.url,
      toFile: file.localPath,
      headers,
      progressDivider: 2,
      begin: res => {
        activeJobIds.set(file.sourceId, res.jobId);
        kindsInFlight.set(file.sourceId, 'download');
        const total = Number(res.contentLength) || 0;
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
      // the file_path that wasn't there — so it stayed out of validDeviceFiles
      // and a tap kept raising "File not on this device" over a file that had
      // just finished downloading. A drive_file gets this from the Download
      // button's own effect, but a device file's download is started from an
      // alert or the player, with no row component mounted to react to it, so
      // it has to happen here. setDeviceFiles re-runs the existence check and
      // rebuilds validDeviceFiles, which is what makes the row playable again.
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
      await BackgroundService.stop();
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
  pendingCount++;
  setUploading(file.id, 0);
  // A placeholder jobId: uploads have no RNFS job to cancel, but the shared
  // notification counts what is in flight by this map.
  activeJobIds.set(file.sourceId, null);
  kindsInFlight.set(file.sourceId, 'upload');
  fileProgress.set(file.sourceId, {total: 0, written: 0});

  try {
    await performUpload({
      itemId: file.id,
      title: file.title,
      localPath: file.localPath,
      mimeType: file.mimeType,
      onProgress: ({percent, written, total}) => {
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

    await onDisplayNotification(
      'Link ready',
      `${file.title} can now be shared. Use Copy Link on it.`,
    );
  } catch (error) {
    console.error('Upload failed:', error);
    await onDisplayNotification(
      'Could not create link',
      `${file.title} was not shared. ${error?.message || ''}`.trim(),
    );
  } finally {
    activeJobIds.delete(file.sourceId);
    kindsInFlight.delete(file.sourceId);
    fileProgress.delete(file.sourceId);
    lastReportedPct.delete(file.sourceId);
    setUploading(file.id, null);
    await removeFromQueue(file.sourceId);
    pendingCount--;

    if (pendingCount === 0) {
      await BackgroundService.stop();
    } else {
      updateServiceNotification();
    }
  }
};

// Both directions come off one persisted queue, so a job that was mid-flight
// when the app died is picked up the same way whichever way it was going.
// Entries written before uploads existed have no kind and are downloads.
const runQueuedItem = file =>
  file.kind === 'upload' ? uploadSingleFile(file) : downloadSingleFile(file);

// ── Background task entry point ───────────────────────────────────────────────
//
// Never returns on its own. downloadSingleFile's finally block calls
// BackgroundService.stop() when pendingCount reaches zero, which is the only
// way this promise gets torn down. This keeps the service alive even when
// files added after start() run outside this Promise.all.

const downloadTask = async () => {
  const queue = await getQueue();
  if (!queue.length) {
    await BackgroundService.stop();
    return;
  }

  queue.forEach(runQueuedItem);

  // Keep the service alive; stopped only via BackgroundService.stop() in downloadSingleFile.
  await new Promise(() => {});
};

// Starts (or restarts, e.g. after the app/service was killed mid-transfer)
// the foreground service that drives downloadTask. Shared by enqueueDownload,
// enqueueUpload and restoreDownloadState.
const startDownloadService = async taskTitle => {
  pendingCount = 0; // reset in case of stale state
  await requestPermissions().catch(() => {});
  await BackgroundService.start(downloadTask, {
    taskName: 'File Transfer',
    taskTitle,
    taskDesc: 'Starting…',
    taskIcon: {name: 'ic_launcher', type: 'mipmap'},
    color: '#2196F3',
    progressBar: {max: 100, value: 0, indeterminate: true},
    // ACTION_VIEW deep link that only this app registers (manifest: scheme
    // "audiotracker") → opens the app directly, no app-chooser dialog.
    // LinkHandler routes this one to the Downloads screen.
    linkingURI: 'audiotracker://downloads',
    parameters: {},
  });
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
  if (queue.some(f => f.sourceId === sourceId)) return;

  const file = {kind: 'download', id, sourceId, title, url, localPath, type, mimeType, googleAuth};
  await saveQueue([...queue, file]);
  // Stash title/type/mimeType in the store too so the Downloads screen can
  // render an in-progress card (status updates merge over this).
  setDownload(sourceId, {status: 'queued', progress: 0, title, type, mimeType});

  if (BackgroundService.isRunning()) {
    // Service already alive — start this download alongside existing ones.
    downloadSingleFile(file);
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
export const enqueueUpload = async ({id, sourceId, title, localPath, mimeType}) => {
  const queue = await getQueue();
  if (queue.some(f => f.sourceId === sourceId)) return;

  const file = {kind: 'upload', id, sourceId, title, localPath, mimeType};
  await saveQueue([...queue, file]);
  useShareStore.getState().setUploading(id, 0);

  if (BackgroundService.isRunning()) {
    uploadSingleFile(file);
  } else {
    await startDownloadService(`Uploading ${title}`);
  }
};

export const cancelDownload = async sourceId => {
  const {removeDownload} = useDownloadStore.getState();

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
  if (jobId !== undefined) {
    RNFS.stopDownload(jobId);
    activeJobIds.delete(sourceId);
  }

  // Update notification immediately to reflect the correct remaining count.
  if (pendingCount > 1) {
    updateServiceNotification();
  }
  // If pendingCount === 1, the finally block will call BackgroundService.stop().
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
  if (!BackgroundService.isRunning()) {
    const onlyUploads = queue.every(f => f.kind === 'upload');
    const verb = onlyUploads ? 'Uploading' : 'Downloading';
    const title =
      queue.length === 1
        ? `${verb} ${queue[0].title}`
        : `${verb} ${queue.length} files`;
    await startDownloadService(title);
  }
};

const safeUpdateNotification = async opts => {
  try {
    await BackgroundService.updateNotification(opts);
  } catch {}
};
