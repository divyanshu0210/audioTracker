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

/**
 * Fetch + parse one folder. `encodedPath` is the url-encoded `f` value
 * ('' for the site root).
 */
export const fetchFolder = async (encodedPath = '') => {
  const res = await fetch(folderPageUrl(encodedPath), {
    headers: {'User-Agent': 'Mozilla/5.0'},
  });
  if (!res.ok) {
    throw new Error(`Server responded ${res.status}`);
  }
  const html = await res.text();
  return parseFolderHtml(html);
};
