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
.venv/Scripts/python -m pip install onnxruntime numpy imageio-ffmpeg
```

No PyTorch, no NeMo, no transformers. The model is published as ONNX, and
onnxruntime is all that runs it — the same thing the phone does.

`imageio-ffmpeg` ships a static ffmpeg, so nothing has to be installed
system-wide. It is needed because the library's recordings are mp3, m4a and opus
and the models all want 16 kHz mono PCM.

## Running it

```sh
.venv/Scripts/python transcribe.py ~/clips/bg-lecture.mp3
node evaluate.js out/bg-lecture.jsonl
```

The first run downloads about 190 MB of model. After that it is quick — the
model is quoted at thirty times real time on a laptop CPU, so a forty minute
lecture takes a couple of minutes.

`transcribe.py` windows the audio exactly as `VerseCaptureService.java` does —
ten seconds at a time, five seconds apart — and decodes it exactly as
`SanskritRecognizer.java` does. That is deliberate and worth preserving: it
means a disagreement between this and the phone is a bug in the app's audio
capture, not a difference of method.

## The model

[Su-śrotā](https://huggingface.co/prathoshap/sushrota-sanskrit-asr), AI4Bharat's
IndicConformer-CTC finetuned for śāstric and recitational Sanskrit by Prof.
Prathosh A P at IISc, in the
[ONNX export](https://huggingface.co/gnumanth/sushrota-sanskrit-asr-onnx) by
gnumanth. About 115M active parameters, INT8, Apache-2.0.

Its training data is close to this app's corpus: Bhāgavata Purāṇa, Upaniṣad and
stotra recordings from 21 reciters, plus Gītā and Ṛgveda recitation.

Reported: **6.0% CER on Bhāgavata chant**, 4.36% on in-the-wild phone
recordings, 7.2% on Vedānta prose.

Read the character error rate, not the word error rate. Sanskrit word boundaries
are orthographic — sandhi fuses words — so the model card notes that roughly
half its WER is spacing disagreement. `phonetics.js` discards word boundaries
before matching anything, so that half of the error does not exist for us. This
is the rare case where a model's headline weakness is irrelevant to the
application.

It hears Sanskrit and nothing else, which is the point — an English model
transcribed the commentary and missed the verse, and a Hindi model produced
fluent nonsense on chanting. The cost is that it cannot hear a spoken citation
("Bhagavad-gītā, chapter two, verse thirteen"), which was a real second source
of matches. Whether that is worth a second model is still open.

## What to look at

`evaluate.js` prints the raw transcript as well as the verdict, and the
transcript is the more important half. A verse count of zero has three causes
that look identical from the count alone:

- **nothing heard** — empty chunks, few characters. Not a matcher problem.
- **nonsense heard** — fluent Devanāgarī unrelated to the audio. The model is
  the ceiling, and no threshold rescues it.
- **something reasonable declined** — the near-miss list will show runs sitting
  just under the gates. That is tunable, in `matcher.js`.

## On the device

Already wired up: `onnxruntime-android` runs the same two graphs, and
`SanskritRecognizer.java` holds the decode. Nothing downstream of "text arrives"
changed, because that side was already tested.
