import RNFS from 'react-native-fs';

// Derived, regenerable cache of note images as on-disk files. The DB (images
// table, base64) stays the source of truth and is what gets backed up; these
// files exist only so the editor WebView can reference tiny file:// URIs instead
// of inlining megabytes of base64 into the editable DOM (which the pell editor
// would otherwise serialize across the JS↔native bridge on every keystroke).
//
// If the OS reclaims this cache or the user clears storage, the next note open
// simply rewrites the files from the DB — nothing is lost.
const CACHE_DIR = `${RNFS.CachesDirectoryPath}/note_images`;

const extFromMime = mime => {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
};

let dirEnsured = false;
const ensureDir = async () => {
  if (dirEnsured) return;
  if (!(await RNFS.exists(CACHE_DIR))) {
    await RNFS.mkdir(CACHE_DIR);
  }
  dirEnsured = true;
};

// Write a base64 data URI to a per-id cache file and return its file:// URI.
// Cached by id: an id's bytes never change, so an existing file is reused as-is.
export const cacheImageFile = async (id, base64DataUri) => {
  if (!id || !base64DataUri) return null;
  try {
    const commaIdx = base64DataUri.indexOf(',');
    if (commaIdx === -1) return null;
    const header = base64DataUri.slice(0, commaIdx); // e.g. data:image/jpeg;base64
    const raw = base64DataUri.slice(commaIdx + 1);
    const semi = header.indexOf(';');
    const mime = semi > 5 ? header.slice(5, semi) : 'image/jpeg';
    const ext = extFromMime(mime);
    const path = `${CACHE_DIR}/${id}.${ext}`;

    await ensureDir();
    if (!(await RNFS.exists(path))) {
      await RNFS.writeFile(path, raw, 'base64');
    }
    return `file://${path}`;
  } catch (err) {
    console.log('🟠 cacheImageFile failed:', err);
    return null;
  }
};

// Optional housekeeping: wipe the whole cache (e.g. on logout / storage reset).
export const clearImageCache = async () => {
  try {
    if (await RNFS.exists(CACHE_DIR)) {
      await RNFS.unlink(CACHE_DIR);
    }
    dirEnsured = false;
  } catch (err) {
    console.log('🟠 clearImageCache failed:', err);
  }
};
