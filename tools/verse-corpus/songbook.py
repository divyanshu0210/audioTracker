"""The ISKCON Desire Tree Vaishnava song book, as parsed records.

kksongs has about a thousand songs and is the wrong thousand. Measured against
this book's index, half of what devotees actually sing was missing from the
corpus - Bhaja Bhakata Vatsala, which is sung at every arati; Gauranga Bolite
Habe; Hari Hari Biphale Janama; Gopinath Mama Nivedana Suno. A missing song does
not fail quietly either: the matcher finds something, so absence shows up as
confident wrong answers rather than as silence.

This book is the curated set - compiled by ISKCON Chowpatty, 168 songs, the ones
a temple programme actually uses. Its layout is the same shape as kksongs, which
is presumably where it came from:

    Song Name: Thakura Vaisnava Gana
    Author: Narottama Das Thakura
    Book Name: Prarthana (Section: ...)
    (1)
    thakura vaisnava gana, kori ei nivedana,
    ...
    TRANSLATION
    1) O saintly Vaisnavas...

Written in Python rather than beside the other sources in Node because the input
is a PDF, and a PDF reader is a large dependency to add to a builder that
otherwise only needs to fetch text. The result is cached as JSON and read by
sources/songbook.js.

    python tools/verse-corpus/songbook.py
"""

import io
import json
import os
import re
import sys
import urllib.request

URL = (
    'https://vaishnavsongs.iskcondesiretree.com/wp-content/uploads/2012/12/'
    'Vaishnava-song-book.pdf'
)

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache')
PDF = os.path.join(CACHE, 'vaishnava-song-book.pdf')
OUT = os.path.join(CACHE, 'songbook.json')

# Running headers and page furniture, which appear mid-song and would otherwise
# be indexed as lyrics.
NOISE = re.compile(
    r'^\s*(ISKCON desire tree|\(\d{1,3}\)|\d{1,3})\s*$',
    re.IGNORECASE,
)

# Where the lyrics stop. Everything after is English about the song rather than
# the sounds of it, and indexing English is what made the panel name a verse
# every few seconds the first time this corpus was built.
#
# Matched as "a line that is nothing but capitals" rather than as a list of
# words, because the book contains a typo: one song ends its lyrics with
# TRASNLATION, and a named list silently let the whole English translation of
# the Dasavatara stotra into the corpus as though it were sung.
#
# Safe here because it was checked rather than assumed. Across the whole book
# there are exactly five distinct standalone all-capitals lines: TRANSLATION
# (185), TRASNLATION (1), and VAISHNAVA / SONGS / ISKCON, which are the cover.
# No lyric line is set in capitals.
END = re.compile(
    r'^\s*(TRANSLATION|PURPORT|WORD FOR WORD|SYNONYMS|COMMENTARY)'
    r'|^\s*[A-Z][A-Z]{5,30}\s*$',
    # Case-sensitive on purpose: only the shouted form is a marker.
)

FIELD = re.compile(r'^\s*(Song Name|Author|Book Name)\s*:\s*(.*)$', re.IGNORECASE)

# A stanza number on a line of its own - "(1)", "(2)". Kept out of the lyrics
# but used as evidence that what follows really is a verse.
STANZA = re.compile(r'^\s*\(\d{1,2}\)\s*$')

# Headings that the book sets with a Song Name: header but which are not songs.
#
# Named rather than detected. Both are sections holding other material, and no
# rule that removes them leaves the real songs alone: "The Ten Offenses to the
# Holy Name" is English prose, but so are several translations that legitimately
# sit beside lyrics; "Miscellaneous Bhajans and Chants" is 217 lines of genuine
# Sanskrit, but it is a dozen untitled chants run together under one name, and
# matching it would put that whole blob under the player.
#
# Two entries checked by hand is better than a heuristic that might quietly take
# a real bhajan with them.
NOT_SONGS = {
    'the ten offenses to the holy name',
    'the ten offenses to the holy',
    'miscellaneous bhajans and chants',
    'miscellaneous bhajans and',
}

# English, for the songs that have no stanza marker to anchor on.
#
# Those are the short chants - Maha Prasade Govinde, Ugra Viram Mahavisnu - four
# lines printed straight after the header with no "(1)" anywhere. Requiring a
# marker dropped every one of them, and they are among the most chanted things
# in the book.
#
# Without the marker there is nothing structural separating the lyrics from the
# English preamble some songs carry, so the lines are told apart by what they
# are made of. Only common English function words, which no transliteration
# contains: anything matching is prose about the song rather than the song.
ENGLISH = re.compile(
    r'(the|and|of|to|is|in|for|with|that|this|who|from|his|her|are|was|'
    r'have|been|were|they|their|there|when|which|would|should|song|sung|'
    r'prayer|verse|chanted|offenses|official|i|my|me|you|your|we|us|our|'
    r'unto|upon|at|by|on|as|it|not|no|all|one|whom|offer|obeisances|'
    r'respectful|lotus|feet|lord|who)',
    re.IGNORECASE,
)

# IAST diacritics - the marks a transliterated line has and English prose does
# not.
#
# The stronger of the two signals by far, and the one that actually separates
# the front matter. A list of function words was tried first and let "I offer my
# respectful obeisances unto my" through as a lyric, because it happens to
# contain none of them; every transliterated line in this book, by contrast,
# carries at least one of these marks.
DIACRITIC = re.compile(r'[āīūṛṝḷṅñṭḍṇśṣṁḥ]', re.IGNORECASE)


def looks_transliterated(line):
    return bool(DIACRITIC.search(line)) and not looks_english(line)


def looks_english(line):
    words = [w for w in re.split(r'\s+', line) if w]
    if not words:
        return True
    return len(ENGLISH.findall(line)) / len(words) > 0.2


def fetch():
    """The book, downloaded once."""
    os.makedirs(CACHE, exist_ok=True)
    if os.path.exists(PDF) and os.path.getsize(PDF) > 100000:
        return PDF

    print('fetching the song book ...', flush=True)
    request = urllib.request.Request(
        URL,
        # The server answers a bare urllib with 403. It is not protecting
        # anything - the same URL in a browser is public - so a plain
        # user agent is enough.
        headers={'User-Agent': 'Mozilla/5.0'},
    )
    with urllib.request.urlopen(request) as response:
        data = response.read()
    if not data.startswith(b'%PDF'):
        sys.exit('that URL did not return a PDF')
    with open(PDF, 'wb') as fh:
        fh.write(data)
    return PDF


def pages(path):
    try:
        from pypdf import PdfReader
    except ImportError:
        sys.exit('pip install pypdf')

    reader = PdfReader(path)
    for page in reader.pages:
        yield page.extract_text() or ''


def clean(line):
    """A lyric line, or None."""
    line = line.replace('\xa0', ' ').strip()
    if not line or NOISE.match(line) or STANZA.match(line):
        return None
    return re.sub(r'\s+', ' ', line)


def parse(text):
    """Every song in the book.

    Split on `Song Name:` rather than by page, because songs run across page
    breaks and a page is not a unit of anything here.
    """
    songs = []
    current = None
    # The header field still waiting for the rest of its value, if any.
    continuing = None

    for raw in text.split('\n'):
        # A header value that wrapped onto the next line.
        #
        # "Book Name: Gitavali (Section: Sri Krsnaer" continues with
        # "Vimsottara Sata Nama Song 4)" below it, and that line then fell
        # through as though it were the song's first lyric. Eighty of the
        # book's records have a wrapped Book Name; two leaked it into the
        # lyrics, and both were short chants - the rest were saved only by
        # having a stanza marker that discarded everything before it.
        #
        # The unclosed bracket marks the wrap, so it also ends it: absorb lines
        # into the field until the brackets balance.
        if continuing and current is not None:
            more = clean(raw)
            if more:
                current[continuing] = f"{current[continuing]} {more}".strip()
                if current[continuing].count('(') <= current[continuing].count(')'):
                    continuing = None
                continue

        field = FIELD.match(raw)
        if field:
            name, value = field.group(1).lower(), field.group(2).strip()
            if name == 'song name':
                if current:
                    songs.append(current)
                continuing = None
                current = {
                    'ref': value, 'author': '', 'bookName': '', 'lines': [],
                    'translation': [],
                    # Nothing is a lyric until the first stanza marker...
                    'started': False,
                    # ...unless the song never has one, in which case these
                    # are what it gets.
                    'unmarked': [],
                }
            elif current and name == 'author':
                current['author'] = value
            elif current and name == 'book name':
                current['bookName'] = value
                if value.count('(') > value.count(')'):
                    continuing = 'bookName'
            continue

        if not current:
            continue

        if END.match(raw):
            # Everything from here to the next song is prose about it.
            current['done'] = True
            continue

        if current.get('done'):
            # ...and that prose is the translation, which is worth keeping even
            # though it is deliberately never indexed.
            #
            # Skipping it was a false economy. These records supersede the
            # kksongs ones where both sources carry a song - a hundred and four
            # of them - and those did have translations, so adding the better
            # lyrics quietly took the translation away from every one.
            line = clean(raw)
            if line and not NOISE.match(line):
                current['translation'].append(line)
            continue

        # Several songs carry an English preamble between the header and the
        # lyrics - an "Official Name", and a paragraph about when the song is
        # sung. It reads as ordinary English prose, which is precisely what
        # must never enter this corpus: English lyrics are English sentences,
        # and a lecturer speaking English then matches them constantly.
        #
        # The book marks every stanza, so the first marker is where the song
        # starts. A song with no marker at all is dropped rather than guessed
        # at.
        if STANZA.match(raw):
            # A marker settles it: everything before was preamble.
            current['started'] = True
            current['unmarked'] = []
            continue

        line = clean(raw)
        if not line:
            continue

        if current['started']:
            current['lines'].append(line)
        elif not looks_english(line):
            current['unmarked'].append(line)

    if current:
        songs.append(current)
    return songs


def parse_prayers(text):
    """The front matter, which is laid out differently and matters most.

    Everything before the first `Song Name:` - the pranama mantras and the
    mangalacarana. They carry no header of any kind:

        Sri Guru Pranama
        om ajnana-timirandhasya jnananjana-salakaya
        caksur unmilitam yena tasmai sri-gurave namah
        TRANSLATION
        I offer my respectful obeisances...

    Requiring `Song Name:` skipped every one of them, which left the corpus
    without the most reliably recited Sanskrit in the library: this is what
    opens virtually every lecture and bhajan session, sung the same way by
    everyone, and so the one thing almost guaranteed to be on a recording.

    Read by structure, not by content. Two content signals were tried and both
    failed: English function words let "I offer my respectful obeisances unto
    my" through, because it happens to contain none of them, and IAST
    diacritics let half the translations through, because they are full of
    names like Bhaktisiddhanta Sarasvati.

    What is reliable is position. The lyrics are always the lines immediately
    above a TRANSLATION, and an English paragraph always ends in a full stop
    where a sung line never does. So each block is read backwards from its
    marker, taking lines until one ends like a sentence; the first line taken
    is the prayer's name.
    """
    prayers = []

    for chunk in re.split(r'^\s*TRANSLATION.*$', text, flags=re.MULTILINE):
        block = []
        for raw in reversed(chunk.split(chr(10))):
            line = clean(raw)
            if not line:
                continue
            # The tail of the previous translation. Nothing above it belongs
            # to this prayer.
            if re.search(r'[.?!"”]\s*$', line):
                break
            block.append(line)
            # Nothing in this book runs to twelve lines without a marker; past
            # that, something has gone wrong and a guess is not worth making.
            if len(block) > 12:
                block = []
                break

        block.reverse()
        if len(block) < 3:
            continue

        title, lines = block[0], block[1:]
        if len(title) > 44 or not lines:
            continue

        prayers.append({
            'ref': title,
            'author': '',
            'bookName': 'Pranama Mantras',
            'lines': lines,
        })

    return prayers


def main():
    text = '\n'.join(pages(fetch()))
    # The front matter and the songs are two different layouts in one file:
    # everything before the first `Song Name:` is prayers without headers.
    split_at = text.find('Song Name:')
    prayers = parse_prayers(text[:split_at]) if split_at > 0 else []
    if split_at > 0:
        text = text[split_at:]

    parsed = parse(text)

    # Promote before filtering, not after. A song with no stanza marker has
    # nothing in `lines` until this runs, so filtering first threw away exactly
    # the songs this was written to rescue.
    for song in parsed:
        if not song['lines'] and song['unmarked']:
            song['lines'] = song['unmarked']
        # Numbered per stanza in the book; joined into one passage, as the panel
        # shows it.
        song['translation'] = ' '.join(song.get('translation') or []).strip()
        song.pop('done', None)
        song.pop('started', None)
        song.pop('unmarked', None)

    songs = prayers + [
        s for s in parsed
        if s['ref']
        and len(s['lines']) >= 2
        and s['ref'].strip().lower() not in NOT_SONGS
    ]

    io.open(OUT, 'w', encoding='utf-8').write(
        json.dumps(songs, ensure_ascii=False, indent=1)
    )
    print(f'{len(songs)} songs -> {os.path.relpath(OUT, HERE)}')

    lines = sum(len(s['lines']) for s in songs)
    print(f'  {lines} lyric lines, {lines // max(1, len(songs))} per song')
    for song in songs[:3]:
        print(f"  - {song['ref']} ({len(song['lines'])} lines) by {song['author']}")


if __name__ == '__main__':
    main()
