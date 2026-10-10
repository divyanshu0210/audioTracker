#!/usr/bin/env python3
"""
Transliterate IAST romanized song lines into Devanagari script.

Pre-cleans known non-standard romanizations used by kksongs.org:
  - 'w'  -> 'v'   (older convention for 'v')
  - 'ń'  -> 'ṅ'   (Bengali velar nasal written with acute)
  - 'ḿ'  -> 'ṃ'   (anusvāra written as 'm' + combining acute)
  - Windows-1252 control chars     -> straight quotes
  - " ̣ " (dot separated from consonant by spaces) -> attach to consonant,
        preserving a single space after if one was present
  - "- " (hyphen followed by space) -> "-"  (cosmetic normalization)
  - ́ (combining acute) after any other letter -> dropped (rare fallback)

Usage:
    pip install indic-transliteration
    python transliterate_songs.py songs.json output.json
    python transliterate_songs.py songs.json output.json --pretty
    python transliterate_songs.py songs.json output.json --report report.txt
    python transliterate_songs.py songs.json test.json --limit 5 --pretty
"""

import argparse
import json
import re
import unicodedata
from pathlib import Path

from indic_transliteration import sanscript
from indic_transliteration.sanscript import transliterate


# ---------------------------------------------------------------------------
# Devanagari Unicode range (used for validation)
# ---------------------------------------------------------------------------
DEVANAGARI_START = 0x0900
DEVANAGARI_END = 0x097F


def is_devanagari_char(ch: str) -> bool:
    return DEVANAGARI_START <= ord(ch) <= DEVANAGARI_END


# ---------------------------------------------------------------------------
# Pre-cleaning — fixes non-standard romanizations
# ---------------------------------------------------------------------------

COMBINING_ACUTE = "\u0301"       #  ́
COMBINING_DOT_BELOW = "\u0323"   #  ̣


# --- Fix 2: regex that attaches stray combining dot to the preceding letter
#             and preserves a single space after, if one was present. ---
def _fix_stray_dot(line: str) -> str:
    """
    Examples:
        "harih ̣ sadā"       -> "hariḥ sadā"
        "mah ̣ vināśite"     -> "maḥ vināśite"
        "pāt ̣ khetari"      -> "pāṭ khetari"
        "harih ̣"            -> "hariḥ"
        "kalitamah ̣ vināśite" -> "kalitamaḥ vināśite"
    """
    def repl(m):
        letter = m.group(1)
        trailing_space = m.group(2) or ""
        return letter + COMBINING_DOT_BELOW + trailing_space

    # (\w)      the letter the dot belongs to
    # \s*       any whitespace before the dot
    # \u0323    the combining dot
    # (\s*)     capture trailing whitespace (preserved)
    return re.sub(
        r"(\w)\s*" + COMBINING_DOT_BELOW + r"(\s*)",
        repl,
        line,
    )


# --- Fix 1: hyphen followed by whitespace -> hyphen only ---
def _fix_hyphen_space(line: str) -> str:
    """
    "guru- veśe"     -> "guru-veśe"
    "śrī- bhakti"    -> "śrī-bhakti"
    """
    return re.sub(r"-\s+", "-", line)


def clean_iast(line: str) -> str:
    """Fix known non-standard romanizations before transliteration."""

    # 1. Windows-1252 smart-quote control characters that leaked through
    #    when the source file was mis-decoded.
    line = (line
            .replace("\u0091", "'")   # 
            .replace("\u0092", "'")   # 
            .replace("\u0093", '"')   # 
            .replace("\u0094", '"'))  # 

    # 2. 'w' is used by kksongs.org as an older spelling for 'v'
    #    e.g. goswāmī -> gosvāmī ; saraswatī -> sarasvatī
    line = line.replace("w", "v")

    # 3. 'ń' (U+0144, Latin small n with acute) is used by kksongs.org
    #    to represent the Bengali/Sanskrit velar nasal 'ṅ' (U+1E45).
    #    e.g. sumańgala -> sumaṅgala ; sańkīrtana -> saṅkīrtana
    line = line.replace("\u0144", "\u1E45")

    # 4. 'm' followed by combining acute (ḿ) is the kksongs.org way of
    #    writing the anusvāra 'ṃ'.  Convert ḿ -> ṃ
    line = line.replace("m" + COMBINING_ACUTE, "\u1E43")  # ṃ

    # 5. Any remaining combining acute after a letter: just drop the accent.
    #    (Very rare; makes the transliterator behave predictably.)
    line = line.replace(COMBINING_ACUTE, "")

    # 6. Fix 2 — attach stray combining dot below to its consonant,
    #    preserving any trailing space that was present.
    line = _fix_stray_dot(line)

    # 7. Fix 1 — remove space after hyphen (cosmetic normalization).
    line = _fix_hyphen_space(line)

    # 8. Normalize to NFC so combining sequences are canonical.
    line = unicodedata.normalize("NFC", line)

    return line


# ---------------------------------------------------------------------------
# Transliteration
# ---------------------------------------------------------------------------

def transliterate_line(iast_line: str) -> str:
    """Convert a single IAST line to Devanagari."""
    return transliterate(iast_line, sanscript.IAST, sanscript.DEVANAGARI)


def validate_devanagari(dev_line: str, source_line: str):
    """
    Return (ok, reason). ok=False if something looks wrong.
    Allowed characters in output:
      - Devanagari block (includes danda ।, ॥, avagraha ऽ, etc.)
      - ASCII space, hyphen, digits, common punctuation
    """
    allowed_extra = set(" -.,;:!?'\"()0123456789[]/&")
    for ch in dev_line:
        if is_devanagari_char(ch):
            continue
        if ch in allowed_extra:
            continue
        return False, f"unexpected character {ch!r} (U+{ord(ch):04X})"

    if re.search(r"[A-Za-z]", source_line) and not re.search(
        r"[\u0900-\u097F]", dev_line
    ):
        return False, "no Devanagari produced"

    return True, ""


# ---------------------------------------------------------------------------
# Loading input
# ---------------------------------------------------------------------------

def load_input(path: Path):
    raw = path.read_text(encoding="utf-8")
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("Top-level JSON must be an object mapping song_id -> song")
    return data


# ---------------------------------------------------------------------------
# Processing
# ---------------------------------------------------------------------------

def process_song(song: dict, report_lines: list):
    sid = song.get("id", "<no-id>")
    lines = song.get("lines") or []
    if not isinstance(lines, list):
        report_lines.append(f"[{sid}] 'lines' is not a list — skipped")
        return song

    dev_lines = []
    for i, raw in enumerate(lines):
        if not isinstance(raw, str):
            report_lines.append(f"[{sid}] line {i}: not a string — skipped")
            dev_lines.append("")
            continue

        cleaned = clean_iast(raw)
        try:
            dev = transliterate_line(cleaned)
        except Exception as e:
            report_lines.append(f"[{sid}] line {i}: transliteration error: {e}")
            dev_lines.append("")
            continue

        ok, reason = validate_devanagari(dev, cleaned)
        if not ok:
            report_lines.append(
                f"[{sid}] line {i}: {reason}\n"
                f"    IAST(raw)     : {raw}\n"
                f"    IAST(cleaned) : {cleaned}\n"
                f"    DEV           : {dev}"
            )

        dev_lines.append(dev)

    song["devanagari"] = dev_lines
    return song


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--report", type=Path, default=None)
    ap.add_argument("--pretty", action="store_true")
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    print(f"Reading {args.input} ...")
    songs = load_input(args.input)

    items = list(songs.items())
    if args.limit:
        items = items[: args.limit]
        songs = dict(items)
    print(f"  Loaded {len(songs)} songs")

    report_lines = []
    for sid, song in songs.items():
        process_song(song, report_lines)

    args.output.write_text(
        json.dumps(songs, ensure_ascii=False,
                   indent=2 if args.pretty else None),
        encoding="utf-8",
    )
    print(f"Wrote {args.output}")

    if args.report:
        if report_lines:
            args.report.write_text("\n".join(report_lines), encoding="utf-8")
            print(f"Wrote {len(report_lines)} problem lines to {args.report}")
        else:
            args.report.write_text("No problems detected.\n", encoding="utf-8")
            print("No problems detected.")
    else:
        if report_lines:
            print(f"\n{len(report_lines)} problem lines (see report):")
            for r in report_lines[:20]:
                print("  " + r.splitlines()[0])
            if len(report_lines) > 20:
                print(f"  ... and {len(report_lines) - 20} more")


if __name__ == "__main__":
    main()