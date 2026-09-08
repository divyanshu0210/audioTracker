// iskconAudioApi.js
//
// Runtime scraper for https://audio.iskcondesiretree.com (no backend, no
// pre-scraping). Fetches a folder's HTML and parses out its child folders and
// audio files.
//
// URL scheme of the site:
//   Root folder    → /index.php
//   Sub-folder     → /index.php?q=f&f=<url-encoded path>   e.g. f=%2F01_-_Srila_Prabhupada
//   Audio file     → /<path>/<name>.mp3                    (direct, streamable)
//
// Listing rows all share the markup:
//   <a href=HREF><font size="2">TITLE</font> ...
//     • folder → HREF is  index.php?q=f&f=<encoded path>
//     • file   → HREF is  "/<path>/<name>.mp3"
// Breadcrumb / header / play-all links do NOT use <font size="2"> right after
// the anchor, so this pattern captures listing rows only.

export const ISKCON_BASE = 'https://audio.iskcondesiretree.com';

// encodeURI is the right tool here — it leaves the path separators alone and
// escapes spaces and the like — but it deliberately passes '#' and '?'
// through, and either one would truncate the url at that point.
const encodeIskconPath = path =>
  encodeURI(path).replace(/#/g, '%23').replace(/[?]/g, '%3F');

// source_id for an iskcon file is f.path, i.e. decodeURIComponent(href) — the
// site path is therefore already in the database and the url can be rebuilt
// from it instead of being stored a second time.
//
// This is a reconstruction, not the original string: a name carrying something
// encodeURI treats differently from however the site wrote it can come out
// slightly different (paths here do contain apostrophes, for one). So it is
// only ever the fallback — a caller that still has the exact url should prefer
// it. Two callers need this: getShareLink, for a downloaded file whose
// file_path the download service replaced with the local path; and the two
// remove-download paths, which put it back into file_path so the file stays
// streamable once the local copy is gone.
export const iskconUrlFromSourceId = sourceId => {
  if (!sourceId) return null;
  if (sourceId.startsWith('http')) return encodeIskconPath(sourceId);
  return `${ISKCON_BASE}${encodeIskconPath(sourceId)}`;
};

const AUDIO_EXT = /\.(mp3|m4a|m4b|wav|ogg|oga|flac|aac|opus|mp4)$/i;

// Build the page URL for a folder given its already-url-encoded `f` value.
// encodedPath === '' means the site root (index.php).
const folderPageUrl = encodedPath =>
  encodedPath
    ? `${ISKCON_BASE}/index.php?q=f&f=${encodedPath}`
    : `${ISKCON_BASE}/index.php`;

// Minimal HTML-entity decode for the handful that show up in titles.
const decodeEntities = str =>
  str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();

// Matches one listing anchor: optional-quoted href followed by <font size="2">TITLE</font>.
const ROW_RE =
  /<a\s+href=("?)([^">]+)\1\s*>\s*<font size="2">([^<]*)<\/font>/gi;

/**
 * Parse the HTML of one folder page into { folders, files }.
 *   folder: { kind:'folder', title, encodedPath, path }
 *   file:   { kind:'file',   title, url, path }
 * `path` is the decoded, human-readable path (used as a stable source_id).
 */
export const parseFolderHtml = html => {
  const folders = [];
  const files = [];
  const seen = new Set();

  let m;
  ROW_RE.lastIndex = 0;
  while ((m = ROW_RE.exec(html)) !== null) {
    const href = m[2].trim();
    const title = decodeEntities(m[3]);
    if (!title) continue;

    if (href.includes('q=f&f=')) {
      // Folder — pull the raw (still-encoded) `f` value straight from the href
      // so we never have to re-encode and risk a mismatch.
      const fMatch = href.match(/[?&]f=([^&>"']*)/);
      if (!fMatch) continue;
      const encodedPath = fMatch[1];
      if (!encodedPath) continue; // skip the empty "back to root" link
      if (seen.has('f:' + encodedPath)) continue;
      seen.add('f:' + encodedPath);

      let path = encodedPath;
      try {
        path = decodeURIComponent(encodedPath);
      } catch {}
      folders.push({kind: 'folder', title, encodedPath, path});
    } else if (AUDIO_EXT.test(href)) {
      // Audio file — href is a direct site-absolute path.
      const url = href.startsWith('http') ? href : `${ISKCON_BASE}${href}`;
      let path = href;
      try {
        path = decodeURIComponent(href);
      } catch {}
      if (seen.has('a:' + path)) continue;
      seen.add('a:' + path);
      files.push({kind: 'file', title, url, path});
    }
  }

  return {folders, files};
};

// fetch has no timeout of its own, and a request that is never answered — a
// captive portal, dead DNS, a host that completes the connection and then goes
// quiet — leaves the promise pending for as long as the app is open. Being
// offline usually fails fast; this is for the case that doesn't. It matters
// because HomeTabs awaits the root listing alongside every other tab's load,
// and that whole group only settles once the slowest member does.
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Fetch + parse one folder. `encodedPath` is the url-encoded `f` value
 * ('' for the site root). Rejects on a non-2xx response, and on a request that
 * outlasts REQUEST_TIMEOUT_MS — both reach the caller as a plain Error, so the
 * screens' existing error + Retry handling covers a hang the same way it
 * covers being offline.
 */
export const fetchFolder = async (encodedPath = '') => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  // The budget covers reading the body too, not just getting the headers: a
  // response that starts and then stalls mid-transfer hangs exactly as badly
  // as one that never arrives, and the signal aborts both.
  try {
    const res = await fetch(folderPageUrl(encodedPath), {
      headers: {'User-Agent': 'Mozilla/5.0'},
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Server responded ${res.status}`);
    }
    return parseFolderHtml(await res.text());
  } catch (e) {
    // An abort surfaces as an AbortError whose own message ("Aborted") would
    // go straight to the user as the reason the list is empty.
    if (e?.name === 'AbortError') {
      throw new Error('Took too long to respond. Check your connection.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
};
