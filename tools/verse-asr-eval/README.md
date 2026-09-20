# Choosing a speech model, on a desktop

This directory exists because of a mistake made twice. Both Whisper and Vosk
were integrated into the Android app in full — native module, foreground
service, model download, permissions — before anyone knew whether the model
could read Sanskrit recitation. Both times the answer came back from a phone,
after the work, and was no.

The question is cheap to ask here. The matcher is plain JavaScript and runs
under Node, so the only thing a desktop is missing is text.

```
transcribe.py   audio  -> timestamped transcript (JSONL)
evaluate.js     JSONL  -> what the panel would have shown
```

## Setup

```sh
python -m venv .venv
.venv/Scripts/python -m pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m pip install transformers imageio-ffmpeg numpy soundfile
.venv/Scripts/python -m pip install "nemo_toolkit[asr]"     # sushrota only
```

`imageio-ffmpeg` ships a static ffmpeg, so nothing has to be installed
system-wide. It is needed because the library's recordings are mp3, m4a and opus
and the models all want 16 kHz mono PCM.

## Running it

```sh
.venv/Scripts/python transcribe.py ~/clips/bg-lecture.mp3
node evaluate.js out/bg-lecture.sushrota.sa.ctc.jsonl
```

The first run downloads the checkpoint. Transcription is roughly real-time on a
CPU, so a forty minute lecture takes about forty minutes — start it and go away.

## The models

**`--backend sushrota`** (the default) is
[Su-śrotā](https://huggingface.co/prathoshap/sushrota-sanskrit-asr), AI4Bharat's
IndicConformer-CTC finetuned for śāstric and recitational Sanskrit by Prof.
Prathosh A P at IISc. About 129M parameters. Its training data is close to this
app's corpus: Bhāgavata Purāṇa, Upaniṣad and stotra recordings from 21 reciters,
plus Gītā and Ṛgveda recitation.

Reported: **6.0% CER on Bhāgavata chant**, 4.36% on in-the-wild phone
recordings, 7.2% on Vedānta prose.

Read the character error rate, not the word error rate. Sanskrit word boundaries
are orthographic — sandhi fuses words — so the model card notes that roughly
half its WER is spacing disagreement. `phonetics.js` discards word boundaries
before matching anything, so that half of the error does not exist for us. This
is the rare case where a model's headline weakness is irrelevant to the
application.

**`--backend indic`** is
[IndicConformer 600M multilingual](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual),
Su-śrotā's base model, covering all 22 scheduled languages. Not specialised for
recitation, so mainly a baseline — but it is the one that can also read the
Hindi commentary, which matters for the citation path (a lecturer saying
"Bhagavad-gītā, chapter two, verse thirteen" is the strongest signal the feature
has, and a Sanskrit-only model cannot hear it).

## What to look at

`evaluate.js` prints the raw transcript as well as the verdict, and the
transcript is the more important half. A verse count of zero has three causes
that look identical from the count alone:

- **nothing heard** — empty chunks, few characters. Not a matcher problem.
- **nonsense heard** — fluent Devanāgarī unrelated to the audio. The model is
  the ceiling, and no threshold rescues it.
- **something reasonable declined** — the near-miss list will show runs sitting
  just under the gates. That is tunable, in `matcher.js`.

## If the numbers are good

The route to the device is
[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx), which runs NeMo CTC models
natively and has React Native bindings. NeMo exports ONNX itself
(`model.export("sushrota.onnx")`), and at 129M parameters the quantised result
should be comparable to the Vosk model it replaces.

Nothing downstream of "text arrives" needs to change. That side is already
tested.
