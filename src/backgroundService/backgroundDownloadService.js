import BackgroundService from 'react-native-background-actions';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {updateItemFields} from '../database/U';
import useDownloadStore from '../stores/useDownloadStore';
import {requestPermissions} from './newBackgroundService';
import {onDisplayNotification} from '../notification/notificationService';

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
const fileProgress = new Map(); // sourceId → { total, written }
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

  const title =
    count === 1 ? 'Downloading 1 file' : `Downloading ${count} files`;

  let taskDesc;
  let progressBar;

  if (hasKnownSize && totalBytes > 0) {
    const pct = Math.min(100, Math.round((writtenBytes / totalBytes) * 100));
    taskDesc = `${formatBytes(writtenBytes)} / ${formatBytes(totalBytes)} (${pct}%)`;
    progressBar = {max: 100, value: pct, indeterminate: false};
  } else {
    taskDesc =
      writtenBytes > 0 ? `${formatBytes(writtenBytes)} downloaded` : 'Starting…';
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
    const {promise} = RNFS.downloadFile({
      fromUrl: file.url,
      toFile: file.localPath,
      progressDivider: 2,
      begin: res => {
        activeJobIds.set(file.sourceId, res.jobId);
        const total = Number(res.contentLength) || 0;
        fileProgress.set(file.sourceId, {total, written: 0});
        updateServiceNotification();
      },
      progress: res => {
        const total = Number(res.contentLength) || 0;
        const written = Number(res.bytesWritten) || 0;
        fileProgress.set(file.sourceId, {total, written});

        if (!total || total <= 0) {
          setDownload(file.sourceId, {status: 'downloading', progress: null});
        } else {
          const pct = Math.min(100, Math.round((written / total) * 100));
          setDownload(file.sourceId, {status: 'downloading', progress: pct});
        }

        updateServiceNotification();
      },
    });

    const result = await promise;
    activeJobIds.delete(file.sourceId);
    fileProgress.delete(file.sourceId);

    if (result.statusCode === 200) {
      await updateItemFields(file.id, {file_path: file.localPath});
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

  queue.forEach(file => downloadSingleFile(file));

  // Keep the service alive; stopped only via BackgroundService.stop() in downloadSingleFile.
  await new Promise(() => {});
};

// ── Public API ────────────────────────────────────────────────────────────────

export const enqueueDownload = async ({id, sourceId, title, url, localPath}) => {
  const {setDownload} = useDownloadStore.getState();

  const queue = await getQueue();
  if (queue.some(f => f.sourceId === sourceId)) return;

  const file = {id, sourceId, title, url, localPath};
  await saveQueue([...queue, file]);
  setDownload(sourceId, {status: 'queued', progress: 0});

  if (BackgroundService.isRunning()) {
    // Service already alive — start this download alongside existing ones.
    downloadSingleFile(file);
  } else {
    pendingCount = 0; // reset in case of stale state
    await requestPermissions().catch(() => {});
    await BackgroundService.start(downloadTask, {
      taskName: 'File Download',
      taskTitle: `Downloading ${title}`,
      taskDesc: 'Starting…',
      taskIcon: {name: 'ic_launcher', type: 'mipmap'},
      color: '#2196F3',
      progressBar: {max: 100, value: 0, indeterminate: true},
      // ACTION_VIEW deep link that only this app registers (manifest: scheme
      // "audiotracker") → opens the app directly, no app-chooser dialog.
      // LinkHandler ignores any audiotracker:// URL, so no navigation/rerenders.
      linkingURI: 'audiotracker://open',
      parameters: {},
    });
  }
};

export const cancelDownload = async sourceId => {
  const {removeDownload} = useDownloadStore.getState();

  // Remove from queue and UI immediately so the catch block in
  // downloadSingleFile sees the entry is gone and skips setting 'failed'.
  await removeFromQueue(sourceId);
  removeDownload(sourceId);
  fileProgress.delete(sourceId);

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
  const {setDownload} = useDownloadStore.getState();
  queue.forEach(f => {
    setDownload(f.sourceId, {status: 'queued', progress: 0});
  });
};

const safeUpdateNotification = async opts => {
  try {
    await BackgroundService.updateNotification(opts);
  } catch {}
};
