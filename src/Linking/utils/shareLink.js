// shareLink.js
//
// The inverse of extractLinkType: given a stored item, rebuild the public URL
// it came from, so it can be handed to someone else or kept for reference.
//
// YouTube and Drive links are *derived*, never stored. source_id already holds
// the canonical id for both, and a second copy of a url sitting next to the id
// it was built from can only drift away from it. Live links need no special
// case either: youtube.com/live/<id> carries the same 11-character video id as
// a watch url, so it round-trips through youtu.be/<id> like any other video.
//
// Iskcon files sit in between. Their source_id is the *decoded* site path, so
// the url is derivable — but only by re-encoding, which is the round trip
// parseFolderHtml deliberately avoids for folders. Here it's acceptable
// because it's never the first choice: the exact url is used whenever the item
// still has one, and the rebuild only covers a downloaded file, whose
// file_path the download service replaced with the local path.
//
// Device files are the one type with no id of their own to build from — the
// file came off the phone and exists nowhere a recipient could reach. They
// resolve only once a copy has been uploaded (see share/shareDeviceFile), and
// then through that copy's Drive id, which the caller passes in because it
// lives in a table rather than on the item.

import Clipboard from '@react-native-clipboard/clipboard';
import Share from 'react-native-share';
import {Alert, ToastAndroid} from 'react-native';
import {iskconUrlFromSourceId} from '../../iskcon/iskconAudioApi';
import {mediaExists} from '../../utils/mediaFile';

export const driveFileLink = fileId =>
  `https://drive.google.com/file/d/${fileId}/view`;

// driveCopyId is the Drive id of an uploaded copy, for device files. Every
// other type ignores it.
export const getShareLink = (item, driveCopyId) => {
  if (!item?.source_id) return null;

  switch (item.type) {
    case 'youtube_video':
      return `https://youtu.be/${item.source_id}`;
    case 'youtube_playlist':
      return `https://www.youtube.com/playlist?list=${item.source_id}`;
    case 'drive_file':
      return driveFileLink(item.source_id);
    case 'drive_folder':
      return `https://drive.google.com/drive/folders/${item.source_id}`;
    case 'iskcon_file': {
      // Exact url first: list rows carry it, and file_path holds it until a
      // download overwrites that with the local path. Rebuild only after that.
      const url = item.url ?? item.file_path;
      if (url?.startsWith('http')) return url;
      return iskconUrlFromSourceId(item.source_id);
    }
    case 'device_file':
      return driveCopyId ? driveFileLink(driveCopyId) : null;
    default:
      return null;
  }
};

// react-native's own Clipboard still exists on 0.77 but is deprecated and warns
// on first use, so the community module is used instead. Same setString call,
// and it needs a native rebuild to link.
export const copyLink = link => {
  if (!link) return;
  Clipboard.setString(link);
  ToastAndroid.show('Link copied', ToastAndroid.SHORT);
};

const localShareUri = filePath => {
  if (!filePath) return null;
  if (/^(content|file|https?):\/\//i.test(filePath)) return filePath;
  return `file://${filePath}`;
};

export const shareItem = async (item, driveCopyId) => {
  const link = getShareLink(item, driveCopyId);
  const isLocalDeviceFile = item?.type === 'device_file' && !link;

  if (isLocalDeviceFile) {
    const filePath = item?.file_path;
    if (!filePath) {
      Alert.alert('File unavailable', 'This device file is no longer on this phone.');
      return false;
    }
    if (!(await mediaExists(filePath))) {
      Alert.alert('File unavailable', 'This device file is no longer on this phone.');
      return false;
    }
    await Share.open({
      url: localShareUri(filePath),
      type: item?.mimeType || item?.mime_type || 'application/octet-stream',
      title: `Share ${item?.title || 'file'}`,
    });
    return true;
  }

  if (!link) return false;
  await Share.open({
    message: link,
    title: `Share ${item?.title || 'link'}`,
  });
  return true;
};
