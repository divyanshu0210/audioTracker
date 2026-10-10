// The part of the Bhagavatam Srila Prabhupada did not live to finish.
//
// He completed through SB 10.13.64 and passed away in 1977. Everything after
// that - the rest of canto ten, and cantos eleven and twelve - was completed by
// his disciples, Hridayananda dasa Goswami and Gopiparanadhana dasa. The
// Vedabase Original Edition archive that supplies the rest of this corpus is
// deliberately only Prabhupada's own writing, so it stops exactly there, and
// this source fills what is left.
//
// That is about 4,700 verses, and they are not marginal ones: canto ten from
// chapter fourteen onward is most of Krsna's pastimes, and canto eleven holds
// the Uddhava-gita. Both get lectured on constantly, so leaving them out meant
// the panel going quiet through some of the most-quoted material there is.
//
// Every record from here carries a `translator`, and the panel shows it. The
// Sanskrit is the same either way - that is what detection matches on, and it
// is not anybody's translation - but the English underneath is not
// Prabhupada's, and a panel that let it read as though it were would be quietly
// misattributing his disciples' work to him.
//
// The intermediate CSV has no Devanagari. The source pages it was made from
// do, however, so the optional recovery pass below can put it back. The
// transliteration remains the fallback when a page cannot be fetched.

const {fetchText, mapLimit} = require('../fetch');

const CSV =
  'https://raw.githubusercontent.com/kodymoodley/vedabase-scraper/main/output/output-sb.csv';

// Shown under the translation on every record from this source.
const TRANSLATOR = 'Completed by Prabhupāda’s disciples after 1977';

// Where Prabhupada's own writing ends. A verse at or before this comes from the
// archive; anything after it comes from here. Kept as one constant because it
// is the single fact this whole file exists to express.
const PRABHUPADA_THROUGH = {canto: 10, chapter: 13};

const PAGE = (canto, chapter, verse) =>
  `https://vedabase.io/en/library/sb/${canto}/${chapter}/${verse}/`;

const MANUAL_DEVANAGARI = {
  'SB 10.42.22': 'तयोस्तदद्भुतं वीर्यं\nनिशाम्य पुरवासिनः ।\nतेजः प्रागल्भ्यं रूपं च\nमेनिरे विबुधोत्तमौ ॥२२॥',
  'SB 11.7.1': 'श्रीभगवानुवाच ।\nयदात्थ मां महाभाग तच्चिकीर्षितमेव मे ।\nब्रह्मा भवो लोकपालाः स्वर्वासं मेऽभिकाङ्क्षिणः ॥१॥',
};

const DEVANAGARI = /[\u0900-\u097f]/g;

// The page is server-rendered, so a small text extraction is enough and keeps
// the corpus builder dependency-free. The first contiguous run of lines that
// contains Devanagari is the verse; later runs belong to synonyms/commentary.
function devanagariFromPage(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

  const lines = text
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const first = lines.findIndex(line => (line.match(DEVANAGARI) || []).length >= 2);
  if (first < 0) return null;

  const verse = [];
  for (let i = first; i < lines.length; i++) {
    if (!(lines[i].match(DEVANAGARI) || []).length) break;
    verse.push(lines[i]);
  }
  return verse.length ? verse.join(' ') : null;
}

/**
 * RFC 4180, enough of it.
 *
 * Written out rather than pulled in as a dependency because the build has none
 * and this is twenty lines. It has to handle the two things that break a
 * split(',') - quoted fields containing commas, and quoted fields containing
 * newlines, both of which this file is full of, since the purports run to
 * paragraphs.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

module.exports = async function loadBhagavatamCompletion({onProgress, recoverDevanagari = false} = {}) {
  const text = await fetchText(CSV);
  const rows = parseCsv(text);

  const header = rows.shift() || [];
  const col = name => header.indexOf(name);
  const idAt = col('id');
  const sanskritAt = col('sanskrit');
  const englishAt = col('english');

  if (idAt === -1 || sanskritAt === -1) {
    throw new Error(`unexpected columns in output-sb.csv: ${header.join(', ')}`);
  }

  const records = [];
  let done = 0;

  for (const row of rows) {
    const raw = row[idAt];
    if (!raw) continue;

    // "10/14/5/" and "10/14/5-6/" alike.
    const m = raw.match(/^(\d+)\/(\d+)\/([\d-]+)\/?$/);
    if (!m) continue;

    const canto = Number(m[1]);
    const chapter = Number(m[2]);
    const verse = m[3];

    // Only the gap. Everything the archive reaches is taken from the archive,
    // which has the Devanagari and the verse line breaks this does not.
    const isPrabhupada =
      canto < PRABHUPADA_THROUGH.canto ||
      (canto === PRABHUPADA_THROUGH.canto && chapter <= PRABHUPADA_THROUGH.chapter);
    if (isPrabhupada) continue;

    const sanskrit = String(row[sanskritAt] || '').replace(/\s+/g, ' ').trim();
    if (!sanskrit) continue;

    records.push({
      id: `sb-${canto}.${chapter}.${verse}`,
      kind: 'verse',
      book: 'sb',
      ref: `SB ${canto}.${chapter}.${verse}`,
      title: null,
      lines: [sanskrit],
      devanagari: null,
      translation: String(row[englishAt] || '').replace(/\s+/g, ' ').trim(),
      translator: TRANSLATOR,
    });

    if (onProgress && ++done % 500 === 0) {
      onProgress(done, rows.length, `SB ${canto}.${chapter}.${verse}`);
    }
  }

  for (const record of records) {
    if (MANUAL_DEVANAGARI[record.ref]) record.devanagari = MANUAL_DEVANAGARI[record.ref];
  }
  if (!recoverDevanagari || !records.length) return records;

  // Keep this opt-in: a complete recovery is several thousand polite page
  // requests. The disk cache makes retries cheap and failed pages simply keep
  // their transliteration fallback.
  let recovered = 0;
  let failed = 0;
  if (onProgress) onProgress(0, records.length, 'recovering Devanagari');
  const {results, failures} = await mapLimit(records, 3, async record => {
    try {
      const match = record.id.match(/^sb-(\d+)\.(\d+)\.([\d-]+)$/);
      if (!match) return record;
      const html = await fetchText(PAGE(match[1], match[2], match[3]));
      const devanagari = devanagariFromPage(html);
      if (devanagari) record.devanagari = devanagari;
      return record;
    } catch (error) {
      failed++;
      throw error;
    } finally {
      recovered++;
      if (onProgress && (recovered % 25 === 0 || recovered === records.length)) {
        onProgress(recovered, records.length, `Devanagari (${failed} failed)`);
      }
    }
  });
  if (onProgress) onProgress(records.length, records.length, `Devanagari (${failures.length} failed)`);
  // mapLimit returns successful results in completion order; preserve the CSV
  // order because corpus rebuilds should remain stable.
  const byId = new Map(results.map(record => [record.id, record]));
  return records.map(record => {
    const result = byId.get(record.id) || record;
    return MANUAL_DEVANAGARI[result.ref]
      ? {...result, devanagari: MANUAL_DEVANAGARI[result.ref]}
      : result;
  });
};

module.exports.TRANSLATOR = TRANSLATOR;
