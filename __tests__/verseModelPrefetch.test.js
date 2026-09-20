// Asking for the speech model.
//
// Very little left to test here, and that is a result rather than an omission.
// The connection check, the attempt counting and the retry backoff all used to
// live in JS and are WorkManager's now, where the system enforces them instead
// of the app checking once at launch. What remains is that the request is made,
// that it is safe to make on every launch, and that it never disturbs one.

import {prefetchVerseModel} from '../src/verses/modelPrefetch';
import {scheduleModelDownload} from '../src/verses/verseRecognition';

jest.mock('../src/verses/verseRecognition', () => ({
  scheduleModelDownload: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  scheduleModelDownload.mockResolvedValue(true);
});

describe('prefetchVerseModel', () => {
  it('asks for the download', async () => {
    await expect(prefetchVerseModel()).resolves.toBe(true);
    expect(scheduleModelDownload).toHaveBeenCalledTimes(1);
  });

  it('is safe to call on every launch', async () => {
    // Enqueueing is unique and KEEP natively, so repeating cannot stack up
    // duplicate downloads. Calling it unconditionally is what makes being
    // offline during onboarding a non-event.
    await prefetchVerseModel();
    await prefetchVerseModel();
    expect(scheduleModelDownload).toHaveBeenCalledTimes(2);
  });

  it('never fails a launch', async () => {
    scheduleModelDownload.mockResolvedValue(false);
    await expect(prefetchVerseModel()).resolves.toBe(false);
  });
});
