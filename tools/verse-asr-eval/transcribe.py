"""Run a candidate speech model over real recordings, on a desktop.

The point of this script is to answer the model question *before* anything is
rebuilt on Android. Twice now a complete native integration has been written -
Whisper, then Vosk with the Hindi model - and both times the answer to "can this
model actually read Sanskrit recitation" arrived from a phone, after the work.

It is a cheap question to ask here. The matcher is plain JavaScript and runs in
Node, so the only missing piece is text: point this at a lecture, get a
timestamped transcript, and hand that to evaluate.js.

What comes out is deliberately raw. The transcript is printed as the model
produced it, because the first thing worth knowing is not a score - it is
whether the Devanagari coming back looks anything like what is being chanted.

Two backends, because the two models worth trying are packaged differently:

  sushrota  Su-shrota, IndicConformer-CTC finetuned for shastric and
            recitational Sanskrit by Prof. Prathosh A P (IISc). ~129M
            parameters, and the one to beat: 6.0% CER on Bhagavata chant,
            4.36% on in-the-wild phone recordings. Trained on Bhagavatam,
            Upanisad, Gita and Rgveda recitation - our corpus, more or less.
            A .nemo checkpoint, so it needs the NeMo toolkit.

  indic     AI4Bharat IndicConformer 600M multilingual, via transformers.
            Sanskrit is one of its 22 languages but it is not specialised for
            recitation. Useful mainly as a baseline to measure sushrota
            against, and it can also read the Hindi commentary.

Usage:
    python transcribe.py lecture.mp3                       # sushrota, default
    python transcribe.py lecture.mp3 --backend indic --lang sa --lang hi
"""

import argparse
import json
import os
import subprocess
import sys
import wave

SAMPLE_RATE = 16000

# Long enough to hold a whole verse - most take fifteen to twenty seconds to
# recite - so that a verse is usually inside one chunk rather than split across
# two. Mirrors WINDOW_MS in useVerseStore.js for the same reason.
CHUNK_SECONDS = 20.0

# Chunk boundaries fall mid-word. The overlap means every moment of audio is
# heard once with its left context intact and once with its right, so a verse
# landing on a seam still appears whole in one of the two.
OVERLAP_SECONDS = 3.0


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
            "It is needed because these recordings are mp3/m4a/opus and the "
            "model wants 16 kHz mono PCM."
        )


def decode(path, cache_dir):
    """Any media file to 16 kHz mono PCM, via ffmpeg.

    Everything in this app's library arrives as a stream URL, a Drive file or a
    device file in whatever format it happened to be uploaded in, so being
    fussy about container is not an option.
    """
    os.makedirs(cache_dir, exist_ok=True)
    out = os.path.join(cache_dir, os.path.basename(path) + f".{SAMPLE_RATE}.wav")
    if os.path.exists(out):
        return out

    print(f"  decoding {os.path.basename(path)} ...", flush=True)
    subprocess.run(
        [
            ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
            "-i", path,
            "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "wav", out,
        ],
        check=True,
    )
    return out


def read_wav(path):
    import numpy as np

    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            sys.exit(f"{path}: expected 16-bit mono")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype="<i2").astype("float32") / 32768.0


SUSHROTA_REPO = "prathoshap/sushrota-sanskrit-asr"
SUSHROTA_FILE = "sushrota_sanskrit_asr_v13b.nemo"

# The Sanskrit token slice of the aggregate multilingual vocabulary, straight
# from the model card. The checkpoint carries all of IndicConformer's languages;
# decoding has to be restricted to these columns or the output is drawn from the
# wrong alphabet entirely.
SA_OFFSET, SA_VOCAB, SA_BLANK = 4096, 256, 5632


class Sushrota:
    """IndicConformer-CTC finetuned for Sanskrit recitation.

    Greedy CTC over the Sanskrit slice, as the model card specifies. Kept
    deliberately close to the published snippet - this is a measurement tool,
    and a clever decoder here would mean measuring the decoder.
    """

    name = "sushrota"

    def __init__(self, path=None):
        import nemo.collections.asr as na

        if path is None:
            from huggingface_hub import hf_hub_download

            print(f"fetching {SUSHROTA_FILE} ...", flush=True)
            path = hf_hub_download(repo_id=SUSHROTA_REPO, filename=SUSHROTA_FILE)

        print("restoring the checkpoint ...", flush=True)
        self.model = na.models.EncDecHybridRNNTCTCBPEModel.restore_from(path).eval()
        self.tokenizer = self.model.tokenizer.tokenizers_dict["sa"]

    def __call__(self, wav, lang=None, decoder=None):
        import numpy as np
        import torch

        signal = torch.tensor(wav).unsqueeze(0)
        length = torch.tensor([len(wav)])
        with torch.no_grad():
            encoded, _ = self.model.forward(
                input_signal=signal, input_signal_length=length
            )
            logprobs = self.model.ctc_decoder(encoder_output=encoded)[0].cpu().numpy()

        cols = [SA_BLANK] + list(range(SA_OFFSET, SA_OFFSET + SA_VOCAB))
        sliced = logprobs[:, cols]
        # Re-normalise over the slice: the original log-softmax was taken over
        # the whole multilingual vocabulary, so the columns kept here do not sum
        # to one on their own.
        peak = sliced.max(1, keepdims=True)
        sliced = sliced - (peak + np.log(np.exp(sliced - peak).sum(1, keepdims=True)))

        out, previous = [], -1
        for token in sliced.argmax(1):
            token = int(token)
            # Standard CTC collapse: drop blanks (0 here) and repeats.
            if token != previous and token != 0:
                out.append(self.tokenizer.ids_to_tokens([token - 1])[0])
            previous = token
        return "".join(out).replace("▁", " ").strip()


class IndicConformer:
    """AI4Bharat's multilingual model, through transformers."""

    name = "indic"

    def __init__(self, path=None):
        from transformers import AutoModel

        repo = path or "ai4bharat/indic-conformer-600m-multilingual"
        print(f"loading {repo} (a few GB on first run) ...", flush=True)
        self.model = AutoModel.from_pretrained(repo, trust_remote_code=True)

    def __call__(self, wav, lang="sa", decoder="ctc"):
        import torch

        with torch.no_grad():
            text = self.model(torch.from_numpy(wav).unsqueeze(0), lang, decoder)
        if isinstance(text, (list, tuple)):
            text = text[0]
        return str(text).strip()


def load_model(backend, path):
    return Sushrota(path) if backend == "sushrota" else IndicConformer(path)


def transcribe(model, audio, lang, decoder):
    step = CHUNK_SECONDS - OVERLAP_SECONDS
    total = len(audio) / SAMPLE_RATE
    at = 0.0
    while at < total:
        start = int(at * SAMPLE_RATE)
        end = min(len(audio), int((at + CHUNK_SECONDS) * SAMPLE_RATE))
        # A sliver at the end is not worth a forward pass, and short buffers
        # are where these models hallucinate most.
        if (end - start) / SAMPLE_RATE < 1.0:
            break

        text = model(audio[start:end], lang, decoder)

        yield {
            "start": round(at, 2),
            "end": round(end / SAMPLE_RATE, 2),
            "lang": lang,
            "decoder": decoder,
            "text": str(text).strip(),
            "model": model.name,
        }
        at += step


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="+", help="lecture files, any format")
    ap.add_argument(
        "--backend", default="sushrota", choices=["sushrota", "indic"],
        help="which model. sushrota is Sanskrit-only and the one to beat",
    )
    ap.add_argument(
        "--lang", action="append", default=None,
        help="indic backend only: language code, repeatable. sa, hi, ...",
    )
    ap.add_argument("--decoder", default="ctc", choices=["ctc", "rnnt"])
    ap.add_argument(
        "--model", default=None,
        help="a local .nemo path or an alternative repo; defaults per backend",
    )
    ap.add_argument("--out-dir", default="out")
    args = ap.parse_args()

    langs = args.lang or ["sa"]
    here = os.path.dirname(os.path.abspath(__file__))
    out_dir = os.path.join(here, args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    # Sanskrit-only backends take no language argument, and pretending
    # otherwise would write misleading filenames.
    if args.backend == "sushrota":
        langs = ["sa"]

    model = load_model(args.backend, args.model)

    for path in args.audio:
        wav_path = decode(path, os.path.join(here, ".cache"))
        audio = read_wav(wav_path)
        print(f"\n{os.path.basename(path)}  ({len(audio)/SAMPLE_RATE/60:.1f} min)")

        for lang in langs:
            stem = os.path.splitext(os.path.basename(path))[0]
            out = os.path.join(
                out_dir, f"{stem}.{model.name}.{lang}.{args.decoder}.jsonl"
            )
            print(f"  --- {lang} / {args.decoder} -> {os.path.relpath(out, here)}")

            with open(out, "w", encoding="utf-8") as fh:
                for row in transcribe(model, audio, lang, args.decoder):
                    fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                    fh.flush()
                    # Printed as it goes, because this is the diagnostic. A
                    # long file is worth abandoning early if the first minute
                    # already comes back as nonsense.
                    mins, secs = divmod(int(row["start"]), 60)
                    print(f"    [{mins:02d}:{secs:02d}] {row['text'][:110]}", flush=True)


if __name__ == "__main__":
    main()
