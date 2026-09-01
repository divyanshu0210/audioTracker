// driveUpload.js
//
// Uploading a local file to the user's own Google Drive and making the result
// openable by whoever receives the link.
//
// Uses react-native-blob-util rather than fetch/axios so the file streams from
// disk instead of being read into JS memory first — the same reason
// restoreManager uses it for backups. A media file can be hundreds of megabytes.

import RNFetchBlob from 'react-native-blob-util';
import {getGoogleAccessToken} from '../auth/tokenManager';
import {getOrCreateDriveFolder} from '../backupRestore/restoreManager';

// Shared files go in their own folder rather than loose in My Drive, so a user
// can see what the app has put there and delete it in one place.
export const SHARED_FOLDER_NAME = 'audioTracker Shared';

// Resumable upload, in two requests: one to open a session with the metadata,
// one to send the bytes.
//
// The multipart form this used first does not work here. Drive's
// uploadType=multipart wants a multipart/related body whose first part is raw
// JSON, while react-native-blob-util's array form builds multipart/form-data
// and base64s the text fields — Drive received the base64 where it expected
// JSON and answered "Invalid JSON payload received. Unexpected token. eyJ...".
//
// Resumable avoids the problem instead of fighting it: the metadata goes as an
// ordinary JSON body, and the bytes go as their own request that streams
// straight off disk. It is also what Drive recommends for large files, so a
// long upload is no longer a single all-or-nothing request.
const stripScheme = path =>
  path.startsWith('file://') ? path.replace('file://', '') : path;

export const uploadFileToDrive = async ({localPath, name, mimeType, onProgress}) => {
  const accessToken = await getGoogleAccessToken();
  const folderId = await getOrCreateDriveFolder(SHARED_FOLDER_NAME);
  const type = mimeType || 'application/octet-stream';

  const session = await RNFetchBlob.fetch(
    'POST',
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
    },
    JSON.stringify({name, parents: [folderId]}),
  );

  const sessionStatus = session.info().status;
  if (sessionStatus < 200 || sessionStatus >= 300) {
    throw new Error(
      `Could not start the Drive upload (HTTP ${sessionStatus}): ${session.text()}`,
    );
  }

  // Header casing is not guaranteed across platforms, so both are checked.
  const headers = session.info().headers || {};
  const sessionUrl = headers.Location || headers.location;
  if (!sessionUrl) {
    throw new Error('Drive did not return an upload session url');
  }

  const upload = RNFetchBlob.fetch(
    'PUT',
    sessionUrl,
    {'Content-Type': type},
    // wrap() makes this stream from the file rather than being read into JS
    // memory first, which is the whole point for a media file.
    RNFetchBlob.wrap(stripScheme(localPath)),
  );

  if (onProgress) {
    // Byte counts as well as the percentage: the transfer notification shows
    // "12.4 MB / 30.1 MB" alongside the bar, and deriving that back from a
    // percentage is not possible — it was showing bytes made up from one.
    upload.uploadProgress((written, total) => {
      const sent = Number(written) || 0;
      const size = Number(total) || 0;
      onProgress({
        written: sent,
        total: size,
        percent: size > 0 ? Math.min(100, Math.round((sent / size) * 100)) : null,
      });
    });
  }

  const response = await upload;
  const status = response.info().status;
  const body = response.json();

  if (status < 200 || status >= 300 || !body?.id) {
    throw new Error(
      `Drive upload failed (HTTP ${status}): ${body?.error?.message || 'no file id returned'}`,
    );
  }

  return body.id;
};

// Without this the recipient lands on Google's request-access page: the file
// is in the user's Drive and private to them until told otherwise. Called only
// after the confirmation dialog has said in words that the link will be
// openable by anyone who has it.
export const makeLinkReadable = async fileId => {
  const accessToken = await getGoogleAccessToken();

  const response = await RNFetchBlob.fetch(
    'POST',
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    JSON.stringify({role: 'reader', type: 'anyone'}),
  );

  const status = response.info().status;
  if (status < 200 || status >= 300) {
    throw new Error(
      `Could not make the Drive file link-readable (HTTP ${status})`,
    );
  }
};

// Trashed rather than permanently deleted. Both revoke the link immediately —
// a trashed file is not readable by the people it was shared with — but trash
// is recoverable from the user's own Drive for 30 days, and this runs as a side
// effect of deleting something in the app rather than as a deliberate "destroy
// this file" action. DELETE on the files endpoint would bypass the bin.
export const trashDriveFile = async fileId => {
  const accessToken = await getGoogleAccessToken();

  const response = await RNFetchBlob.fetch(
    'PATCH',
    `https://www.googleapis.com/drive/v3/files/${fileId}`,
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    JSON.stringify({trashed: true}),
  );

  const status = response.info().status;
  // Already gone is the outcome we wanted, not a failure.
  if (status === 404) return;
  if (status < 200 || status >= 300) {
    throw new Error(`Could not trash the Drive copy (HTTP ${status})`);
  }
};
