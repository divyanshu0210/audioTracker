# verse-corpus

Builds the corpus that verse detection matches against, into `src/verses/corpus/`.

```
node tools/verse-corpus/build.js                  # everything
node tools/verse-corpus/build.js --only=songs     # one source
node tools/verse-corpus/build.js --max-df=40      # tighter common-gram filter
```

The output is committed, so this only needs running when a source changes or a
parser is fixed. Downloads are cached in `.cache/` (gitignored) — a re-run after
a parser change costs nothing and asks the hosts for nothing. Delete that
directory to force a refetch. The first run fetches a 215MB archive and needs
`tar` on PATH.

## What it produces

| file | what it is |
| --- | --- |
| `corpus/index.json` | the searchable index — integers only, no readable text |
| `corpus/text/*.json` | the display text, sharded by book |
| `corpus/text/manifest.json` | shard names and sizes |

The split is what lets a nine-thousand-record corpus run on a phone. The index
is held in memory for as long as the player is open, so it carries no text at
all; the text is loaded a shard at a time and only once something in that shard
has actually matched. `src/verses/corpusText.js` has the require map, and a test
checks it against the manifest — a shard added here without being added there is
silently unreachable.

## Sources

| source | where from | what comes back |
| --- | --- | --- |
| `vedabase` | [vedabase-original](https://github.com/juanmanuelferrera/vedabase-original) | 20,275 records — BG, CC, and SB through 10.13.64. Prabhupāda throughout |
| `sbCompletion` | [vedabase-scraper output](https://github.com/kodymoodley/vedabase-scraper/tree/main/output) | ~4,740 records — SB 10.14 onward plus cantos 11 and 12 |
| `songs` | [kksongs.org](http://kksongs.org) | ~950 bhajans with lyrics and translations |

### Why the Bhagavatam comes from two places

Śrīla Prabhupāda completed the Bhāgavatam through **SB 10.13.64** and passed away
in 1977. The rest of canto 10, and cantos 11 and 12, were completed by his
disciples. The `vedabase` archive is deliberately only his own writing, so it
stops exactly there — which is why the split exists, and why the boundary is one
constant (`PRABHUPADA_THROUGH`) rather than a guess.

The gap is ~4,700 verses and they are not marginal: canto 10 from chapter 14 is
most of Kṛṣṇa's pastimes, and canto 11 holds the Uddhava-gītā. Both get lectured
on constantly.

Every record from `sbCompletion` carries a `translator`, which the panel prints
under the translation. The Sanskrit is identical either way — that is what
detection matches on, and it is nobody's translation — but the English is not
Prabhupāda's and must not read as though it were. Records he wrote have no
`translator` field at all, so the line appears only where it is saying something.

The archive is preferred wherever it reaches, because it carries the Devanāgarī
and the verse line breaks; the CSV has neither, so completed-canto verses display
as one paragraph.

### Why not vedabase.io directly

It is the authentic source and its markup is clean, but its `robots.txt` asks for
ten seconds between requests and chapter pages carry only links — so the text is
one request per verse. Twenty-six thousand verses at that rate is eighty-odd
hours of hammering a free service run by devotees. Both sources above are the
same corpus already extracted: one tarball and one CSV, and nothing in this build
touches vedabase.io at request time.

### Verses that appear twice

The Caitanya-caritamrta quotes the Gita and the Bhagavatam constantly — BG 18.66
appears verbatim at CC Madhya 8.63, 9.265 and 22.94. Those are not competing
answers; they are one recitation. The build folds records with an identical
phonetic stream into one indexed record (the original wins over the work quoting
it) and puts the rest on it as `alsoIn`, which the panel shows. All of them stay
in the text shards, so a lecturer citing CC Madhya 8.63 by name still resolves.

### Combined verses

The edition prints consecutive verses as one unit wherever they were translated
as one, so the id is `bg-1.16-18` and there is no `bg-1.17`. The recitation path
never notices; the citation path does, and `corpusText.lookup` resolves a number
into the range containing it.

### Rights

Both scripture sources are MIT-licensed, but that covers their own scripts and
compilation — the translations and purports are Bhaktivedanta Book Trust
material, and the songs are a scrape of kksongs. Fine for a personal library; worth a second look
before this is handed to anyone else.

## Adding a source

A source module exports `async ({onProgress}) => records`, where a record is:

```js
{
  id: 'bg-2.13',          // unique; corpusText.shardFor must be able to route it
  kind: 'verse' | 'song',
  book: 'bg',             // shard key
  ref: 'BG 2.13',         // what the panel shows
  title: null,            // songs only
  lines: ['...'],         // transliteration — the ONLY thing indexed
  devanagari: ['...'] | null,
  translation: '...',
}
```

Only `lines` is indexed. Translations are deliberately left out: they are English
prose *about* the verse, and indexing them would let an ordinary English sentence
in the lecture match a verse nobody recited.

## Tuning

`--max-df` sets how many records a 5-gram may appear in before it is treated as
too common to be evidence. Grams above the threshold are not dropped — they are
kept in a separate list and treated as *neutral* by the matcher, extending a run
of matches without being evidence on their own. That distinction matters: a gram
missing entirely means "in no verse", which breaks a run, and conflating the two
made nothing ever match. See the comments in `src/verses/matcher.js`.
