// modelPrefetch.js
//
// Asking for the speech model to be downloaded, so that verse detection is
// ready before anybody asks for it.
//
// One line, because everything this used to do is WorkManager's now - see
// VerseModelWorker.java. It checked the connection, counted attempts and drove
// the download itself, all from JS, which meant none of it ran unless somebody
// had the app open at that moment.
//
// Called from the login screen, which is the initial route and so mounts on
// every launch. The answer to "what if they are offline during onboarding" is
// that the job waits until they are not.

import {scheduleModelDownload} from './verseRecognition';

/**
 * Ask for the model. Resolves immediately and cannot fail.
 *
 * A request, not a download - the work may run days later, with the app closed.
 * Cheap to call unconditionally: the native side drops it at once if the model
 * is already here, and the work is unique, so a job already waiting is left
 * alone.
 */
export const prefetchVerseModel = () => scheduleModelDownload();

export default prefetchVerseModel;
