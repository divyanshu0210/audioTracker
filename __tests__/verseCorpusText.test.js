// Can every record the matcher can name actually be shown?
//
// These are two different questions and nothing connected them. The index says
// which records exist and the text shards hold what to display, and a record
// present in one and unreachable in the other fails in the worst possible way:
// the matcher names it, the store looks the text up, the lookup quietly returns
// nothing, the commit is skipped, and not one layer reports a problem. The
// panel simply stays empty while the debug view says `matched`.
//
// That is exactly what happened when the song book was added. Its ids begin
// `songbook-`, `shardFor` knew only `song-`, and all 169 of its songs matched
// perfectly and could never be displayed - including the ones most likely to be
// sung, since that is why the book was added.

import {shardFor, lookup} from '../src/verses/corpusText';

const index = require('../src/verses/corpus/index.json');

describe('every record in the index can be looked up', () => {
  it('maps every id to a shard', () => {
    const unmapped = new Set();
    for (const doc of index.docs) {
      if (!shardFor(doc.id)) unmapped.add(doc.id.split('-')[0]);
    }
    // Reported as id prefixes rather than ids: a whole source going missing is
    // the failure worth naming, and 169 individual ids would bury it.
    expect([...unmapped]).toEqual([]);
  });

  it('returns text for a record of every kind', () => {
    // One per shard family, so a broken prefix shows up as a named failure
    // rather than as a count.
    const prefixes = new Map();
    for (const doc of index.docs) {
      const family = doc.id.replace(/[0-9].*$/, '').replace(/-$/, '');
      if (!prefixes.has(family)) prefixes.set(family, doc.id);
    }

    const broken = [];
    for (const [family, id] of prefixes) {
      const record = lookup(id);
      if (!record || !record.lines || !record.lines.length) broken.push(family);
    }
    expect(broken).toEqual([]);
  });

  it('resolves the song book specifically', () => {
    // The case that was broken, kept by name so a future rename cannot quietly
    // reintroduce it.
    const fromBook = index.docs.find(d => d.id.startsWith('songbook-'));
    expect(fromBook).toBeTruthy();
    expect(shardFor(fromBook.id)).toBe('songs');
    expect(lookup(fromBook.id).lines.length).toBeGreaterThan(0);
  });
});
