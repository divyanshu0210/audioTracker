// Numbers a server is allowed to change.
//
// The validation here is the whole point of the module, not housekeeping. This
// endpoint can alter how every device decides what a verse is, from a machine
// nobody is watching - so a value that makes no sense has to be refused rather
// than adopted. A config setting minRunChars to zero would make every window of
// noise match something, on every phone at once, and no APK would be involved
// in causing it or in fixing it.

import {
  applyTuning,
  isPenalised,
  tuning,
} from '../src/verses/tuning';
import {MIN_RUN_CHARS} from '../src/verses/matcher';

// The module keeps live state, so each test starts from the shipped values.
beforeEach(() => {
  applyTuning({});
});

describe('what ships', () => {
  it('works with no server ever', () => {
    const t = tuning();
    // Against the matcher's own constant rather than a literal. The two are
    // the same number in two files - the matcher's is what ships, tuning's is
    // what a server may move it from - and they have to agree, so tuning the
    // value in one place and not the other is a real way to get a device
    // behaving differently from the bench it was measured on.
    expect(t.minRunChars).toBe(MIN_RUN_CHARS);
    expect(t.missPenalty).toBeCloseTo(0.34);
    expect(t.minConfidence).toBeCloseTo(0.35);
  });

  it('penalises nothing until told to', () => {
    expect(isPenalised('bg-2.13')).toBe(false);
  });
});

describe('what a server may change', () => {
  it('takes a sensible correction', () => {
    const taken = applyTuning({minConfidence: 0.52, missPenalty: 0.4});
    expect(taken).toEqual(expect.arrayContaining(['minConfidence', 'missPenalty']));
    expect(tuning().minConfidence).toBeCloseTo(0.52);
    expect(tuning().missPenalty).toBeCloseTo(0.4);
  });

  it('refuses a value outside its range', () => {
    // The failure this exists to prevent: a run threshold of zero matches
    // everything, everywhere, at once.
    applyTuning({minRunChars: 0});
    expect(tuning().minRunChars).toBe(MIN_RUN_CHARS);

    applyTuning({minRunChars: 500});
    expect(tuning().minRunChars).toBe(MIN_RUN_CHARS);
  });

  it('refuses anything that is not a number', () => {
    applyTuning({minConfidence: '0.9'});
    expect(tuning().minConfidence).toBeCloseTo(0.35);

    applyTuning({minConfidence: NaN});
    expect(tuning().minConfidence).toBeCloseTo(0.35);
  });

  it('keeps the rest when one value is bad', () => {
    // A single rejected field must not take a good config down with it.
    applyTuning({minRunChars: 0, minConfidence: 0.5});
    expect(tuning().minRunChars).toBe(MIN_RUN_CHARS);
    expect(tuning().minConfidence).toBeCloseTo(0.5);
  });

  it('returns to the shipped values when a field is dropped', () => {
    // Absent means "no correction", not "keep the last one" - otherwise a
    // threshold withdrawn on the server would live on every device forever.
    applyTuning({minConfidence: 0.7});
    expect(tuning().minConfidence).toBeCloseTo(0.7);

    applyTuning({missPenalty: 0.5});
    expect(tuning().minConfidence).toBeCloseTo(0.35);
  });

  it('shrugs off rubbish entirely', () => {
    expect(applyTuning(null)).toEqual([]);
    expect(applyTuning('nonsense')).toEqual([]);
    expect(tuning().minRunChars).toBe(MIN_RUN_CHARS);
  });
});

describe('the penalty list', () => {
  it('marks what the server named', () => {
    applyTuning({penalise: ['sb-4.28.3', 'cc-adi-1.1']});
    expect(isPenalised('sb-4.28.3')).toBe(true);
    expect(isPenalised('bg-2.13')).toBe(false);
  });

  it('clears when the server stops naming one', () => {
    applyTuning({penalise: ['sb-4.28.3']});
    applyTuning({penalise: []});
    expect(isPenalised('sb-4.28.3')).toBe(false);
  });

  it('ignores entries that are not ids', () => {
    applyTuning({penalise: ['sb-4.28.3', 42, null, {}]});
    expect(isPenalised('sb-4.28.3')).toBe(true);
  });

  it('ignores a penalty list that is not a list', () => {
    applyTuning({penalise: 'sb-4.28.3'});
    expect(isPenalised('sb-4.28.3')).toBe(false);
  });
});
