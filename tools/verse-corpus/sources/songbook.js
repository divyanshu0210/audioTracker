// The ISKCON Desire Tree Vaishnava song book.
//
// kksongs has about a thousand songs and is the wrong thousand. Measured
// against this book's own index, half of what devotees actually sing was
// missing from the corpus: Bhaja Bhakata Vatsala, which is sung at every arati,
// Gauranga Bolite Habe, Hari Hari Biphale Janama, Gopinath Mama Nivedana Suno.
//
// That mattered more than it sounds, because a missing song does not fail
// quietly. The matcher finds *something* - four bhajans put through the real
// pipeline produced ten confident matches between them, and the only correct
// one was the single song that happened to be in the corpus. Absence shows up
// as wrong answers, not as silence, which is why this looked like a matching
// problem for so long.
//
// This book is the curated set - compiled by ISKCON Chowpatty, the songs a
// temple programme actually uses - and it is the right hundred and sixty.
//
// Parsed by songbook.py rather than here, because the source is a PDF and a PDF
// reader is a large dependency to add to a builder that otherwise only fetches
// text. Run that once; this reads what it cached.

const fs = require('fs');
const path = require('path');

const {CACHE_DIR} = require('../fetch');

const PARSED = path.join(CACHE_DIR, 'songbook.json');

/** A stable id from the song's name. Same shape as the kksongs ids. */
const slugOf = name =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

module.exports = async ({onProgress} = {}) => {
  if (!fs.existsSync(PARSED)) {
    console.log(
      '    (skipped) run `python tools/verse-corpus/songbook.py` first - it ' +
        'reads the PDF and caches the songs this source needs',
    );
    return [];
  }

  const songs = JSON.parse(fs.readFileSync(PARSED, 'utf8'));
  const records = [];

  songs.forEach((song, i) => {
    const lines = (song.lines || []).map(l => l.trim()).filter(Boolean);
    // Two lines is the shortest thing worth matching; below that a record is
    // all coincidence and no evidence.
    if (!song.ref || lines.length < 2) return;

    records.push({
      id: `songbook-${slugOf(song.ref)}`,
      kind: 'song',
      book: 'songs',
      ref: song.ref,
      title: song.ref,
      lines,
      devanagari: null,
      // Carried, but never indexed. Only `lines` reaches the matcher - English
      // prose in this corpus is what once made the panel name a song every few
      // seconds of ordinary speech - while the panel still has something to
      // show when somebody opens the translation.
      //
      // Leaving it empty was a false economy: these records supersede the
      // kksongs ones wherever both sources have a song, and those did carry
      // translations, so the better lyrics silently cost 104 songs theirs.
      translation: song.translation || '',
      author: song.author || '',
      bookName: song.bookName || '',
      // Left blank rather than guessed. The book does not label language, and
      // the Bengali handling in build.js keys off that label - a wrong label
      // would index a Sanskrit song as though it were sung in Bengali.
      language: '',
      sourceUrl:
        'https://vaishnavsongs.iskcondesiretree.com/wp-content/uploads/2012/12/Vaishnava-song-book.pdf',
    });

    if (onProgress && (i + 1) % 25 === 0) onProgress(i + 1, songs.length, song.ref);
  });

  return records;
};
