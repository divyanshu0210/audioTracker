// No hook below an early return, in the panel.
//
// VersePanel returns early three times before it draws anything - the feature
// is off, the recogniser could not start, nothing has been matched yet - and a
// hook placed after any of them runs on some renders and not others. React
// counts hooks per render, so the next render throws `Rendered more hooks than
// during the previous render` and takes the whole tree down with it.
//
// This is not hypothetical and it is not caught by anything else here. A
// useMemo for the pranama mantras' section names was added next to the code
// that used it, which is the natural place to put it and is below all three
// returns. It type-checks, it lints, it parses, every test passed, and the
// panel broke on the device.
//
// Read as text rather than rendered, because rendering this component needs a
// native module, a zustand store and a corpus. The check is crude and the bug
// it prevents is not subtle.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'src', 'verses', 'VersePanel.jsx');

describe('VersePanel hook order', () => {
  const source = fs.readFileSync(FILE, 'utf8').split('\n');

  it('calls no hook after the first early return', () => {
    const firstReturn = source.findIndex(line =>
      /^\s{2}if \(!enabled\) return null;/.test(line),
    );
    // If this moves or is renamed the test is measuring nothing, so fail loudly
    // rather than quietly passing on an empty range.
    expect(firstReturn).toBeGreaterThan(0);

    const below = [];
    source.forEach((line, i) => {
      // A hook call, not a property access like `state.useX` and not a
      // definition. Comments mentioning one are ignored.
      if (i <= firstReturn) return;
      if (/^\s*(\/\/|\*)/.test(line)) return;
      if (/(^|[^.\w])use[A-Z]\w*\(/.test(line)) below.push(`${i + 1}: ${line.trim()}`);
    });

    expect(below).toEqual([]);
  });
});
