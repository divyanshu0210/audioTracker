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

// onTask hands the in-flight request back to the caller, which is the only
// way to stop one. RNFetchBlob's task is the handle — there is no job id to
// look up the way RNFS downloads have — so a caller that wants to cancel has
// to be given the object itself while the upload is running.
export const uploadFileToDrive = async ({
  localPath,
  name,
  mimeType,
  onProgress,
  onTask,
}) => {
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

  // Registered before any await on it, so a cancel arriving immediately still
  // finds something to stop.
  if (onTask) onTask(upload);

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

// Lets one named person read the copy, and nobody else.
//
// This replaced a blanket {role: 'reader', type: 'anyone'} on every upload,
// which is a different thing entirely: it made a link that opens for whoever
// holds it, forever, with no record of who that turned out to be. A personal
// recording uploaded so it could be assigned to one mentee was readable by
// anyone the link ever reached. The copy is private now, and access is given
// to the people the owner actually meant.
//
// sendNotificationEmail=false because the app is already telling them — an
// assignment arrives in their inbox in the app, and a second mail from Drive
// naming a file they will never open directly is noise.
export const grantReaderAccess = async (fileId, email) => {
  const accessToken = await getGoogleAccessToken();

  const response = await RNFetchBlob.fetch(
    'POST',
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions` +
      '?sendNotificationEmail=false',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    JSON.stringify({role: 'reader', type: 'user', emailAddress: email}),
  );

  const status = response.info().status;
  if (status < 200 || status >= 300) {
    throw new Error(
      `Could not give ${email} access to the Drive copy (HTTP ${status})`,
    );
  }
};

// Trashed rather than permanently deleted. Both revoke the link immediately —
// a trashed file is not readable by the people it was shared with — but trash
// is recoverable from the user's own Drive for 30 days, and this runs as a side
// effect of deleting something in the app rather than as a deliberate "destroy
// this file" action. DELETE on the files endpoint would bypass the bin.
// Drive answers a failed call with {error: {message, errors: [{reason}]}}.
// Both halves matter — the reason is what distinguishes one 403 from another,
// the message is what a human reads — and neither is worth an exception of its
// own if the body turns out not to be JSON.
const describeDriveError = response => {
  try {
    const body = JSON.parse(response.text());
    const reason = body?.error?.errors?.[0]?.reason;
    const message = body?.error?.message;
    if (!reason && !message) return '';
    return `: ${[reason, message].filter(Boolean).join(' — ')}`;
  } catch {
    return '';
  }
};

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
    // The status on its own cannot tell the two 403s apart, and they need
    // opposite responses:
    //
    //   insufficientFilePermissions — the file is not ours. A copy that
    //     arrived with someone else's shared note belongs to the sender and is
    //     granted read-only, so it can never be trashed from here. Expected.
    //
    //   insufficientPermissions — the signed-in session predates the current
    //     scope list, so the token carries no Drive write scope. GoogleSignin
    //     hands back whatever was consented to at sign-in, so adding a scope in
    //     code does nothing for an existing session; it takes a re-consent.
    //
    // Drive names which in the body, so carry it rather than throwing it away.
    throw new Error(
      `Could not trash the Drive copy (HTTP ${status}${describeDriveError(response)})`,
    );
  }
};
