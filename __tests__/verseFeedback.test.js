// What became of a match.
//
// The whole value of this log is that the numbers arrive with the verdict. A
// row saying only "wrong" is worth nothing: the question is never whether a
// match was wrong, it is which threshold let it through.
//
// The ordering rule is the part worth testing hardest. Signals arrive in any
// order and from two different kinds of source - a deliberate thumb and
// whatever somebody did anyway - so "keep the strongest" has to hold in both
// directions or a dismissal will quietly erase a thumbs-up that followed it.

import AsyncStorage from '@react-native-async-storage/async-storage';

import NetInfo from '@react-native-community/netinfo';

import {
  clearFeedback,
  enqueue,
  exportFeedback,
  flush,
  isStronger,
  queuedCount,
} from '../src/verses/feedback';

// Offline unless a test says otherwise. The queue has to survive that, which
// is the whole point of it existing rather than posting on the spot.
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({isConnected: false, isInternetReachable: false}),
  ),
  addEventListener: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    getItem: jest.fn(k => Promise.resolve(store[k] ?? null)),
    setItem: jest.fn((k, v) => {
      store[k] = v;
      return Promise.resolve();
    }),
    removeItem: jest.fn(k => {
      delete store[k];
      return Promise.resolve();
    }),
    __reset: () => {
      store = {};
    },
  };
});

const row = (over = {}) => ({
  key: 'bg-2.13-1000',
  verdict: 'shown',
  id: 'bg-2.13',
  ref: 'BG 2.13',
  source: 'heard',
  position: 137,
  runChars: 61,
  solidRatio: 0.49,
  coverage: 0.87,
  confidence: 0.78,
  votes: 1,
  ...over,
});

beforeEach(() => {
  AsyncStorage.__reset();
  jest.clearAllMocks();
});

describe('which signal wins', () => {
  it('lets a deliberate verdict override an incidental one', () => {
    // Somebody may clear the panel because they already know the verse. A
    // thumb afterwards says what the dismissal only hinted at.
    expect(isStronger('right', 'dismissed')).toBe(true);
    expect(isStronger('wrong', 'dismissed')).toBe(true);
  });

  it('does not let a weaker signal erase a stronger one', () => {
    expect(isStronger('dismissed', 'right')).toBe(false);
    expect(isStronger('shown', 'wrong')).toBe(false);
  });

  it('ranks a revisit above everything', () => {
    // Seeking back to a verse is someone acting on the match rather than
    // reporting on it, which is the least deniable evidence there is.
    expect(isStronger('revisited', 'right')).toBe(true);
    expect(isStronger('right', 'revisited')).toBe(false);
  });

  it('treats an unrecognised verdict as the weakest thing there is', () => {
    expect(isStronger('shown', 'nonsense')).toBe(true);
  });
});

describe('the queue', () => {
  it('keeps the evidence that produced each match', async () => {
    await enqueue([row({verdict: 'wrong'})]);
    const table = await exportFeedback();

    expect(table).toContain('wrong');
    expect(table).toContain('BG 2.13');
    expect(table).toContain('61'); // runChars
    expect(table).toContain('0.49'); // solidRatio
    expect(table).toContain('0.78'); // confidence
    // A run of wrong answers from one passage is a different problem from a
    // run scattered through an hour.
    expect(table).toContain('137');
  });

  it('tallies the verdicts', async () => {
    await enqueue([
      row({verdict: 'revisited'}),
      row({key: 'a', verdict: 'wrong'}),
      row({key: 'b', verdict: 'shown'}),
      row({key: 'c', verdict: 'shown'}),
    ]);
    const table = await exportFeedback();
    expect(table).toContain('4 matches');
    expect(table).toContain('2 shown');
    expect(table).toContain('1 wrong');
  });

  it('accumulates across recordings rather than replacing', async () => {
    await enqueue([row({key: 'a'})]);
    await enqueue([row({key: 'b'}), row({key: 'c'})]);
    expect(await queuedCount()).toBe(3);
  });

  it('survives a match with no evidence at all', async () => {
    // The cited path carries almost none, and a citation can still be wrong.
    await enqueue([
      {key: 'x', verdict: 'wrong', ref: 'SB 1.2.6', source: 'cited'},
    ]);
    expect(await exportFeedback()).toContain('SB 1.2.6');
  });

  it('shrugs off being given nothing', async () => {
    await enqueue([]);
    await enqueue(null);
    expect(await queuedCount()).toBe(0);
    expect(await exportFeedback()).toBe('Nothing recorded yet.');
  });

  it('forgets on request', async () => {
    await enqueue([row()]);
    await clearFeedback();
    expect(await queuedCount()).toBe(0);
  });
});


describe('with no connection', () => {
  it('keeps everything rather than losing it', async () => {
    // The case this is built for: a lecture played on a train. Nothing may be
    // dropped until a server has actually taken it.
    await enqueue([row({key: 'a'}), row({key: 'b'})]);
    expect(await flush()).toBe(0);
    expect(await queuedCount()).toBe(2);
  });

  it('does not even attempt the request', async () => {
    // Offline, fetch does not fail quickly - it sits until the platform gives
    // up. Asking NetInfo first is what keeps that off the player's back.
    global.fetch = jest.fn();
    await enqueue([row()]);
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sends what was held once the connection returns', async () => {
    await enqueue([row({key: 'a'}), row({key: 'b'})]);

    NetInfo.fetch.mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
    });
    global.fetch = jest.fn(() => Promise.resolve({ok: true}));

    expect(await flush()).toBe(2);
    expect(await queuedCount()).toBe(0);
  });

  it('keeps the rows when the server refuses them', async () => {
    // A 500, or an endpoint that does not exist yet. Dropping them here would
    // lose the data to a problem that is going to be fixed.
    await enqueue([row()]);

    NetInfo.fetch.mockResolvedValueOnce({
      isConnected: true,
      isInternetReachable: true,
    });
    global.fetch = jest.fn(() => Promise.resolve({ok: false, status: 404}));

    expect(await flush()).toBe(0);
    expect(await queuedCount()).toBe(1);
  });
});
