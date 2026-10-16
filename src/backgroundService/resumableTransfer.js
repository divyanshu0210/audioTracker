import RNFS from 'react-native-fs';
import RNFetchBlob from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class TransferPausedError extends Error {
  constructor() {
    super('Transfer paused for a priority share upload');
    this.name = 'TransferPausedError';
  }
}

const CHUNK_SIZE = 4 * 1024 * 1024;
const stripScheme = path => (path?.startsWith('file://') ? path.slice(7) : path);
const header = (headers, name) => {
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
};

const readJson = async key => {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

const writeJson = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const clearTransferCheckpoint = async key => {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
};

export const discardDownloadCheckpoint = async (sourceId, localPath) => {
  await clearTransferCheckpoint(`@transfer_download:${sourceId}`);
  await RNFS.unlink(`${stripScheme(localPath)}.part`).catch(() => {});
};

const responseTotal = response => {
  const info = response.info?.() || {};
  const range = header(info.headers, 'content-range');
  const match = range && /\/([0-9]+)$/.exec(String(range));
  if (match) return Number(match[1]);
  return Number(header(info.headers, 'content-length')) || 0;
};

// Downloads into a .part file, requesting only the next range. A failed
// request leaves the part and its byte offset intact for the next attempt.
export const downloadResumable = async ({
  sourceId,
  url,
  localPath,
  headers = {},
  shouldPause,
  onProgress,
}) => {
  const partPath = `${stripScheme(localPath)}.part`;
  const checkpointKey = `@transfer_download:${sourceId}`;
  let written = 0;
  try {
    if (await RNFS.exists(partPath)) written = Number((await RNFS.stat(partPath)).size) || 0;
  } catch {}

  const checkpoint = await readJson(checkpointKey);
  if (checkpoint?.written === written && checkpoint?.total > 0) {
    onProgress?.({written, total: checkpoint.total});
  }

  let total = Number(checkpoint?.total) || 0;
  while (true) {
    if (await shouldPause?.()) throw new TransferPausedError();
    const end = written + CHUNK_SIZE - 1;
    const response = await RNFetchBlob.config({fileCache: true}).fetch(
      'GET',
      url,
      {...headers, Range: `bytes=${written}-${end}`},
    );
    const info = response.info();
    const status = Number(info.status) || 0;
    const responsePath = response.path?.();
    const range = header(info.headers, 'content-range');
    const rangeMatch = range && /bytes\s+(\d+)-(\d+)\/(\d+|\*)/i.exec(String(range));
    const responseTotalBytes = rangeMatch?.[3] !== '*' ? Number(rangeMatch[3]) : responseTotal(response);
    if (responseTotalBytes > 0) total = responseTotalBytes;

    // Some hosts ignore Range. Restart once rather than appending a complete
    // response to a partial file, which would corrupt the media.
    if (written > 0 && status === 200) {
      await RNFS.unlink(partPath).catch(() => {});
      written = 0;
      await clearTransferCheckpoint(checkpointKey);
      await RNFS.unlink(responsePath).catch(() => {});
      continue;
    }
    if (![200, 206].includes(status)) {
      await RNFS.unlink(responsePath).catch(() => {});
      throw new Error(`Download failed (HTTP ${status})`);
    }
    const body = await RNFS.readFile(responsePath, 'base64');
    const chunkBytes = Number((await RNFS.stat(responsePath)).size) || 0;
    await RNFS.appendFile(partPath, body, 'base64');
    await RNFS.unlink(responsePath).catch(() => {});
    const received = Number((await RNFS.stat(partPath)).size) || written;
    written = received;
    await writeJson(checkpointKey, {written, total});
    onProgress?.({written, total});

    if ((total > 0 && written >= total) || status === 200 || chunkBytes < CHUNK_SIZE) break;
  }

  await RNFS.unlink(stripScheme(localPath)).catch(() => {});
  await RNFS.moveFile(partPath, stripScheme(localPath));
  await clearTransferCheckpoint(checkpointKey);
  return {written, total};
};

// Google Drive resumable upload. The session URL and confirmed byte offset are
// persisted, so a network failure or app restart resumes the same Drive file.
export const uploadResumable = async ({
  sourceId,
  localPath,
  name,
  mimeType,
  accessToken,
  folderId,
  shouldPause,
  onTask,
  onProgress,
}) => {
  const path = stripScheme(localPath);
  const size = Number((await RNFS.stat(path)).size) || 0;
  const checkpointKey = `@transfer_upload:${sourceId}`;
  let state = await readJson(checkpointKey);
  let sessionUrl = state?.sessionUrl;
  let offset = Number(state?.offset) || 0;
  const type = mimeType || 'application/octet-stream';

  if (!sessionUrl) {
    const session = await RNFetchBlob.fetch(
      'POST',
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': type,
        'X-Upload-Content-Length': String(size),
      },
      JSON.stringify({name, parents: [folderId]}),
    );
    const status = session.info().status;
    if (status < 200 || status >= 300) throw new Error(`Could not start the Drive upload (HTTP ${status})`);
    const headers = session.info().headers || {};
    sessionUrl = header(headers, 'location');
    if (!sessionUrl) throw new Error('Drive did not return an upload session url');
    state = {sessionUrl, offset: 0, total: size};
    await writeJson(checkpointKey, state);
  }

  // Publish the total before the first network chunk starts. This is
  // especially important for content:// files: their size may not be
  // available to the queue until withStreamablePath creates the scratch file.
  onProgress?.({
    written: offset,
    total: size,
    percent: size > 0 ? Math.round((offset / size) * 100) : null,
  });

  while (offset < size) {
    if (await shouldPause?.()) throw new TransferPausedError();
    const length = Math.min(CHUNK_SIZE, size - offset);
    const base64 = await RNFS.read(path, length, offset, 'base64');
    const chunkPath = `${RNFS.CachesDirectoryPath}/upload_chunk_${sourceId}_${offset}`;
    await RNFS.writeFile(chunkPath, base64, 'base64');
    const task = RNFetchBlob.fetch(
      'PUT',
      sessionUrl,
      {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': type,
        'Content-Length': String(length),
        'Content-Range': `bytes ${offset}-${offset + length - 1}/${size}`,
      },
      RNFetchBlob.wrap(chunkPath),
    );
    onTask?.(task);
    try {
      const response = await task;
      const status = response.info().status;
      if (status >= 200 && status < 300) {
        const body = response.json();
        await RNFS.unlink(chunkPath).catch(() => {});
        await clearTransferCheckpoint(checkpointKey);
        onProgress?.({written: size, total: size, percent: 100});
        if (!body?.id) throw new Error('Drive upload completed without a file id');
        return body.id;
      }
      if (status === 404 || status === 410) {
        await clearTransferCheckpoint(checkpointKey);
        throw new Error(`Drive upload session expired (HTTP ${status})`);
      }
      if (status !== 308) throw new Error(`Drive upload failed (HTTP ${status})`);
      const range = header(response.info().headers, 'range');
      const match = range && /bytes=0-(\d+)/i.exec(String(range));
      offset = match ? Number(match[1]) + 1 : offset + length;
      await RNFS.unlink(chunkPath).catch(() => {});
      state = {sessionUrl, offset, total: size};
      await writeJson(checkpointKey, state);
      onProgress?.({written: offset, total: size, percent: Math.round((offset / size) * 100)});
    } catch (error) {
      await RNFS.unlink(chunkPath).catch(() => {});
      throw error;
    }
  }
  throw new Error('Drive upload ended before completion');
};
