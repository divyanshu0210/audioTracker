// verseRecognition.js
//
// The JS side of the listener - see
// android/app/src/main/java/com/audiotracker/verses/.
//
// Android-only, and says so rather than pretending. iOS has no equivalent of
// playback capture: an app cannot read its own output there at all, so the
// feature does not exist on that platform and the panel never offers it.
//
// Nothing here decides what a verse is. The native side produces a stream of
// guessed words - Devanagari, because the model is Hindi - this forwards them,
// and useVerseStore is the only thing that decides anything. That is what keeps
// the matching testable on a laptop, which is most of why the corpus work could
// be verified at all.

import {
  NativeEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from 'react-native';

import useVerseStore from './useVerseStore';

const {VerseRecognition} = NativeModules;

export const isSupportedPlatform = Platform.OS === 'android';

// Why `start` can fail. Worth keeping distinct: each has a different thing the
// person can do about it, and "it didn't work" helps nobody.
export const VerseError = {
  unsupported: 'unsupported',
  permission: 'permission',
  declined: 'declined',
  noActivity: 'no_activity',
  noModel: 'no_model',
  failed: 'failed',
};

export const EXPLANATIONS = {
  [VerseError.unsupported]: 'Listening needs Android 10 or newer.',
  [VerseError.permission]: 'Verse detection needs permission to read the audio.',
  [VerseError.declined]: 'Listening was not allowed.',
  [VerseError.noActivity]: 'The app has to be open to start listening.',
  [VerseError.noModel]: 'The speech model has not been downloaded yet.',
  [VerseError.failed]: 'Listening could not be started.',
};

let emitter = null;
let subscriptions = [];

const getEmitter = () => {
  if (!emitter && VerseRecognition) emitter = new NativeEventEmitter(VerseRecognition);
  return emitter;
};

/**
 * What this device can do.
 *
 * Always resolves - a device with no module reports everything false rather
 * than throwing, so callers never need a try/catch just to draw a row.
 */
export const capabilities = async () => {
  if (!isSupportedPlatform || !VerseRecognition) {
    return {supported: false, hasPermission: false, modelReady: false, listening: false};
  }
  try {
    return await VerseRecognition.capabilities();
  } catch (err) {
    console.warn('[verses] capabilities failed:', err?.message);
    return {supported: false, hasPermission: false, modelReady: false, listening: false};
  }
};

/**
 * Ask for RECORD_AUDIO.
 *
 * The rationale matters more than usual here. The system dialog says
 * "microphone", because that is the only permission Android has for opening an
 * AudioRecord - but nothing listens to the room. It reads the audio this app is
 * playing. Saying so first is the difference between a reasonable request and
 * an alarming one.
 */
export const requestPermission = async () => {
  if (!isSupportedPlatform) return false;
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Listen for verses',
        message:
          'To recognise verses and songs, the app reads the audio it is playing. ' +
          'Android asks for microphone permission to do that. Nothing is recorded, ' +
          'and nothing leaves your phone.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('[verses] permission request failed:', err?.message);
    return false;
  }
};

/** Download the speech model, reporting progress as a fraction. */
export const prepareModel = async onProgress => {
  if (!isSupportedPlatform || !VerseRecognition) return false;

  const sub = onProgress
    ? getEmitter()?.addListener('verseModelProgress', ({read, total}) =>
        onProgress(total > 0 ? read / total : 0),
      )
    : null;

  try {
    await VerseRecognition.prepareModel();
    return true;
  } finally {
    sub?.remove();
  }
};

/** Ask the system to fetch it when convenient - see VerseModelWorker. */
export const scheduleModelDownload = async () => {
  if (!isSupportedPlatform || !VerseRecognition) return false;
  try {
    await VerseRecognition.scheduleModelDownload();
    return true;
  } catch (err) {
    console.log('[verses] could not schedule the model download:', err?.message);
    return false;
  }
};

export const deleteModel = async () => {
  if (!isSupportedPlatform || !VerseRecognition) return false;
  return VerseRecognition.deleteModel();
};

/**
 * Start listening.
 *
 * Shows the system's capture-consent dialog - that is the system's decision,
 * not this app's, and there is no way to remember the answer. Resolving means
 * the service is starting, not that anything has been heard.
 */
export const startListening = async () => {
  const store = useVerseStore.getState();

  if (!isSupportedPlatform || !VerseRecognition) {
    store.setUnavailable(EXPLANATIONS[VerseError.unsupported], VerseError.unsupported);
    return false;
  }

  // Torn down first: a restart after a failure would otherwise leave the old
  // subscriptions attached and every recognised phrase would arrive twice,
  // which the store reads as corroboration it has not actually got.
  detach();

  const bus = getEmitter();
  subscriptions = [
    bus.addListener('verseSpeech', ({text, confidence}) => {
      useVerseStore.getState().ingest(text, confidence);
    }),
    bus.addListener('verseCaptureState', ({state, reason}) => {
      const current = useVerseStore.getState();
      if (state === 'listening') current.setListening(true);
      // 'idle' is a playback pause: the session is up and the projection still
      // held, but nothing is being read.
      else if (state === 'idle' || state === 'stopped') current.setListening(false);
      else if (state === 'failed') {
        const text = String(reason || '').toLowerCase();
        const code = text.includes('permission') || text.includes('allow')
          ? VerseError.permission
          : VerseError.failed;
        current.setUnavailable(reason || EXPLANATIONS[code], code);
      }
    }),
  ];

  try {
    await VerseRecognition.start();
    return true;
  } catch (err) {
    detach();
    const code = err?.code || VerseError.failed;
    const failureCode = code === VerseError.permission || code === VerseError.declined
      ? code
      : VerseError.failed;
    store.setUnavailable(
      EXPLANATIONS[code] || err?.message || EXPLANATIONS[VerseError.failed],
      failureCode,
    );
    return false;
  }
};

/**
 * Stop or start reading, without giving up the capture session.
 *
 * What a playback pause maps onto. Deliberately not `stopListening`: Android
 * will not let a MediaProjection be re-acquired without asking again, so
 * tearing the session down on every pause meant a consent dialog every time
 * somebody pressed play.
 */
export const setCapturing = async capturing => {
  if (!isSupportedPlatform || !VerseRecognition) return;
  try {
    await VerseRecognition.setCapturing(capturing);
  } catch (err) {
    console.warn('[verses] setCapturing failed:', err?.message);
  }
};

/** Keep the capture grant but release the large recognizer after idle time. */
export const releaseModelAfterIdle = async () => {
  if (!isSupportedPlatform || !VerseRecognition) return;
  try {
    await VerseRecognition.releaseModelAfterIdle();
  } catch (err) {
    console.warn('[verses] could not schedule idle model release:', err?.message);
  }
};

/** Pause and detach this screen's listeners while retaining MediaProjection. */
export const pauseListening = async () => {
  detach();
  useVerseStore.getState().setListening(false);
  await setCapturing(false);
};

export const stopListening = async () => {
  detach();
  useVerseStore.getState().setListening(false);
  if (!isSupportedPlatform || !VerseRecognition) return;
  try {
    await VerseRecognition.stop();
  } catch (err) {
    console.warn('[verses] stop failed:', err?.message);
  }
};

const detach = () => {
  subscriptions.forEach(sub => sub?.remove());
  subscriptions = [];
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Wait for the WorkManager-owned download to create its complete marker. */
const waitForModel = async () => {
  // Enqueue is idempotent: an existing/running unique job is kept, while a
  // completed model makes the native side return immediately.
  if (!(await scheduleModelDownload())) return false;
  while (true) {
    const caps = await capabilities();
    if (caps.modelReady) {
      return true;
    }
    await wait(1000);
  }
};

/**
 * Everything needed before listening can start, in order, asking as it goes.
 *
 * Returns true only if it is now running. Each step can end the sequence, and
 * each leaves the store carrying a reason the panel can show.
 */
export const enableListening = async () => {
  const store = useVerseStore.getState();

  const caps = await capabilities();
  if (!caps.supported) {
    store.setUnavailable(EXPLANATIONS[VerseError.unsupported], VerseError.unsupported);
    return false;
  }

  if (!caps.hasPermission && !(await requestPermission())) {
    store.setUnavailable(EXPLANATIONS[VerseError.permission], VerseError.permission);
    return false;
  }

  if (!caps.modelReady) {
    try {
      if (!(await waitForModel())) throw new Error('model download could not be queued');
    } catch (err) {
      store.setUnavailable(
        'The speech model is waiting for a suitable connection.',
        VerseError.noModel,
      );
      return false;
    }
  }

  return startListening();
};
