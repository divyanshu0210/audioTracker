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
// Device files return null: nothing is hosted anywhere a recipient could reach
// until they're uploaded to Drive first, which is its own flow.

import Clipboard from '@react-native-clipboard/clipboard';
import {ToastAndroid} from 'react-native';
import {ISKCON_BASE} from '../../scrap/iskconAudioApi';

// encodeURI is the right tool here — it leaves the path separators alone and
// escapes spaces and the like — but it deliberately passes '#' and '?'
// through, and either one would truncate the url at that point.
const encodeIskconPath = path =>
  encodeURI(path).replace(/#/g, '%23').replace(/[?]/g, '%3F');

// source_id for an iskcon file is f.path, i.e. decodeURIComponent(href) — the
// site path is therefore already in the database and the url can be rebuilt
// from it instead of stored a second time.
//
// This is a reconstruction, not the original string: a name carrying something
// encodeURI treats differently from however the site wrote it can come out
// slightly different (paths here do contain apostrophes, for one). So it's
// only ever the fallback — getShareLink prefers the exact url whenever the
// item still carries one, and only lands here for a downloaded file, whose
// file_path the download service has overwritten with the local path.
const iskconUrlFromSourceId = sourceId => {
  if (!sourceId) return null;
  if (sourceId.startsWith('http')) return encodeIskconPath(sourceId);
  return `${ISKCON_BASE}${encodeIskconPath(sourceId)}`;
};

export const getShareLink = item => {
  if (!item?.source_id) return null;

  switch (item.type) {
    case 'youtube_video':
      return `https://youtu.be/${item.source_id}`;
    case 'youtube_playlist':
      return `https://www.youtube.com/playlist?list=${item.source_id}`;
    case 'drive_file':
      return `https://drive.google.com/file/d/${item.source_id}/view`;
    case 'drive_folder':
      return `https://drive.google.com/drive/folders/${item.source_id}`;
    case 'iskcon_file': {
      // Exact url first: list rows carry it, and file_path holds it until a
      // download overwrites that with the local path. Rebuild only after that.
      const url = item.url ?? item.file_path;
      if (url?.startsWith('http')) return url;
      return iskconUrlFromSourceId(item.source_id);
    }
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
