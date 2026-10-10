// Fetching, with a disk cache.
//
// A full build pulls one JSON file for the Gita, a few hundred chapter pages
// for the Bhagavatam and several hundred song pages from kksongs - well over a
// thousand requests against three servers that are hosting this for free. The
// cache means a re-run after a parser change costs nothing and asks them for
// nothing, which matters more than the speed does.
//
// Delete tools/verse-corpus/.cache to force a refetch.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CACHE_DIR = path.join(__dirname, '.cache');

const cachePathFor = url =>
  path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex'));

/**
 * GET a url as text, from disk if it has been seen before.
 *
 * `encoding` is not cosmetic: kksongs serves windows-1252 without saying so,
 * and reading those pages as utf-8 turns every diacritic into a replacement
 * character - which then survives into the phonetic stream as a letter that
 * does not exist. Pages are cached as raw bytes and decoded on the way out, so
 * a wrong guess is fixable without refetching.
 */
async function fetchText(url, encoding = 'utf-8') {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, {recursive: true});

  const cached = cachePathFor(url);
  if (fs.existsSync(cached)) {
    return new TextDecoder(encoding).decode(fs.readFileSync(cached));
  }

  const res = await fetch(url, {
    headers: {'User-Agent': 'audiotracker-verse-corpus/1.0'},
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }

  const bytes = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cached, bytes);
  return new TextDecoder(encoding).decode(bytes);
}

/**
 * Run `worker` over `items`, `limit` at a time.
 *
 * A plain Promise.all over a few hundred chapter pages opens a few hundred
 * sockets at once, which these hosts answer with resets rather than pages.
 * Failures are collected rather than thrown: one dead url out of eight hundred
 * should cost that one verse, not the whole corpus.
 */
async function mapLimit(items, limit, worker) {
  const results = [];
  const failures = [];
  let cursor = 0;

  const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results.push(await worker(items[index], index));
      } catch (err) {
        failures.push({item: items[index], error: err.message});
      }
    }
  });

  await Promise.all(runners);
  return {results, failures};
}

module.exports = {fetchText, mapLimit, CACHE_DIR};
