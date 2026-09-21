"""Run the app's speech model over a recording, on a desktop.

This runs the same two ONNX graphs the phone runs, chunked the same way, with
the same greedy CTC decode - so what comes out here is what the phone would have
heard. That is the point of it. A laptop is a much faster place to find out that
a model cannot read something than a device is, and the app's matcher is plain
JavaScript that runs under Node, so the only thing a desktop was ever missing is
the text.

Needs no PyTorch, no NeMo and no transformers. The model is published as ONNX
and onnxruntime is enough:

    pip install onnxruntime numpy imageio-ffmpeg

Usage:
    python transcribe.py lecture.mp3
    node evaluate.js out/lecture.jsonl
"""

import argparse
import json
import os
import subprocess
import sys
import wave

import numpy as np

SAMPLE_RATE = 16000

REPO = "gnumanth/sushrota-sanskrit-asr-onnx"
CTC = "sushrota_sanskrit_ctc_int8.onnx"
PREPROCESSOR = "preprocessor.onnx"
VOCAB = "sanskrit_vocab.json"
BASE_URL = f"https://huggingface.co/{REPO}/resolve/main/"

# Index 0 of the vocabulary, dropped by the CTC collapse.
BLANK = 0
# SentencePiece's word-boundary marker, which becomes an ordinary space.
WORD_START = "▁"

# These mirror VerseCaptureService.java, and keeping them the same is most of
# the value of this script: a harness that chunks differently from the app
# measures something the app will not reproduce.
WINDOW_SECONDS = 10.0
HOP_SECONDS = 5.0
MIN_SECONDS = 2.0


def ffmpeg_path():
    """A usable ffmpeg, preferring one already installed."""
    from shutil import which

    found = which("ffmpeg")
    if found:
        return found
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit(
            "No ffmpeg. Either install one, or: pip install imageio-ffmpeg\n"
            "It is needed because these recordings are mp3, m4a and opus and "
            "the model wants 16 kHz mono PCM."
        )


def decode_audio(path, cache_dir):
    """Any media file to 16 kHz mono PCM.

    Everything in this app's library arrives as a stream URL, a Drive file or a
    device file in whatever format it was uploaded in, so being fussy about the
    container is not an option.
    """
    os.makedirs(cache_dir, exist_ok=True)
    out = os.path.join(cache_dir, os.path.basename(path) + f".{SAMPLE_RATE}.wav")
    if not os.path.exists(out):
        print(f"  decoding {os.path.basename(path)} ...", flush=True)
        subprocess.run(
            [
                ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
                "-i", path,
                "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "wav", out,
            ],
            check=True,
        )

    with wave.open(out, "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            sys.exit(f"{out}: expected 16-bit mono")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype="<i2").astype("float32") / 32768.0


def fetch_model(cache_dir):
    """The three files, downloaded once. About 190 MB, nearly all of it the CTC."""
    import urllib.request

    os.makedirs(cache_dir, exist_ok=True)
    paths = {}
    for name in (PREPROCESSOR, VOCAB, CTC):
        target = os.path.join(cache_dir, name)
        if not os.path.exists(target):
            print(f"  fetching {name} ...", flush=True)
            # Written aside and moved, so an interrupted download is never
            # mistaken for a model on the next run.
            part = target + ".part"
            urllib.request.urlretrieve(BASE_URL + name, part)
            os.replace(part, target)
        paths[name] = target
    return paths


class Recognizer:
    """The same two graphs and the same greedy decode as SanskritRecognizer.java."""

    def __init__(self, cache_dir):
        import onnxruntime as ort

        paths = fetch_model(cache_dir)
        print("  loading sessions ...", flush=True)
        self.preprocessor = ort.InferenceSession(paths[PREPROCESSOR])
        self.ctc = ort.InferenceSession(paths[CTC])
        with open(paths[VOCAB], encoding="utf-8") as fh:
            self.vocab = json.load(fh)

    def __call__(self, samples):
        feats, lengths = self.preprocessor.run(
            None,
            {
                "audio_signal": samples[np.newaxis, :],
                "length": np.array([len(samples)], dtype=np.int64),
            },
        )
        logits = self.ctc.run(None, {"audio_signal": feats, "length": lengths})[0]

        # Whether the graph ends in a log_softmax or a bare linear, decided the
        # same way SanskritRecognizer.java decides it: log probabilities are
        # never positive.
        log_probs = bool((logits <= 0).all())

        # Greedy, not a beam search, and for the same reason the app is: a beam
        # prefers sequences that look like real Sanskrit, which is exactly the
        # wrong bias. What the matcher wants is what the model actually heard,
        # including the parts it heard badly.
        out, previous = [], -1
        total, emitted = 0.0, 0
        frames = logits[0]
        for i, token in enumerate(np.argmax(frames, axis=-1)):
            token = int(token)
            if token != previous and token != BLANK:
                out.append(self.vocab[token])
                row = frames[i]
                peak = float(row.max())
                # Mean probability of the characters actually emitted, exactly
                # as the app computes it - blanks excluded, or every window
                # would sit near 1.0 and the number would mean nothing.
                total += np.exp(peak) if log_probs else 1.0 / np.exp(row - peak).sum()
                emitted += 1
            previous = token
        text = "".join(out).replace(WORD_START, " ").strip()
        return text, (total / emitted if emitted else 0.0)


def windows(audio, hop_seconds=None, max_seconds=None):
    """The app's windowing: ten seconds at a time, four seconds apart.

    Both can be overridden, and for building a confusion table both should be.
    The overlap exists to mirror how quickly the panel reacts, which costs two
    and a half times the compute for audio that has already been read; and a
    bhajan's first few minutes give as many aligned windows as anyone needs. For
    measuring what the model mishears, neither buys anything.
    """
    if max_seconds:
        audio = audio[: int(max_seconds * SAMPLE_RATE)]

    window = int(WINDOW_SECONDS * SAMPLE_RATE)
    hop = int((hop_seconds or HOP_SECONDS) * SAMPLE_RATE)
    minimum = int(MIN_SECONDS * SAMPLE_RATE)

    at = 0
    while at < len(audio):
        end = min(len(audio), at + window)
        if end - at < minimum:
            break
        yield at / SAMPLE_RATE, end / SAMPLE_RATE, audio[at:end]
        at += hop


def main():
    # Devanagari to a console that cannot encode it.
    #
    # Windows defaults to a codepage with none of these characters, so the
    # first line of Sanskrit this printed killed the run - after writing one
    # window, and with a traceback about codecs that looks nothing like what
    # went wrong. The transcript is the point of the program; the progress
    # printing is not, and it should never be able to stop it.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="+", help="lecture files, any format")
    ap.add_argument("--out-dir", default="out")
    ap.add_argument(
        "--hop", type=float, default=None,
        help="seconds between windows; pass 10 for no overlap",
    )
    ap.add_argument(
        "--minutes", type=float, default=None,
        help="stop after this much of each recording",
    )
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    recognise = Recognizer(os.path.join(here, ".cache"))

    for path in args.audio:
        audio = decode_audio(path, os.path.join(here, ".cache"))
        print(f"\n{os.path.basename(path)}  ({len(audio)/SAMPLE_RATE/60:.1f} min)")

        stem = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(out_dir, f"{stem}.jsonl")

        # Already done. Makes a run resumable, which matters when the work is
        # hours long and split across several processes - each one can be given
        # the whole list and will simply skip what another has finished.
        if os.path.exists(out) and os.path.getsize(out) > 0:
            print('  (done already)', flush=True)
            continue

        with open(out, "w", encoding="utf-8") as fh:
            previous = ""
            for start, end, chunk in windows(
                audio, args.hop, args.minutes and args.minutes * 60
            ):
                text, confidence = recognise(chunk)
                # Skipped for the same reason the app skips it: overlapping
                # windows return the same passage twice, and forwarding both
                # would have the store counting one reading as two.
                if text and text == previous:
                    continue
                previous = text

                fh.write(
                    json.dumps(
                        {
                            "start": round(start, 2),
                            "end": round(end, 2),
                            "text": text,
                            # What the app gates on before the matcher ever
                            # sees the window. Recorded because it was set
                            # without a single measurement.
                            "confidence": round(float(confidence), 3),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                fh.flush()
                # Printed as it goes: a long file is worth abandoning early if
                # the first minute already comes back as nonsense.
                mins, secs = divmod(int(start), 60)
                print(f"  [{mins:02d}:{secs:02d}] {text[:110]}", flush=True)

        print(f"  -> {os.path.relpath(out, here)}")


if __name__ == "__main__":
    main()
