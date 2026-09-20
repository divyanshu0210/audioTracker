// verseTitle.js
//
// What the recording's own name gives away, before a second of it is heard.
//
// These files are very often filed by their subject - "BG 2.13", "SB 1.1.1
// morning class", a folder named after a canto - which is a free answer to
// "what is this lecture about" available at the moment the player opens.
//
// It is the lecture's subject, though, not what is being recited at any given
// moment, so what it produces is only a starting point. Anything actually heard
// replaces it, and it never enters the history: the history records moments in
// the recording, and this belongs to no moment.
//
// This used to also work out the recording's language, for picking between an
// English and a Hindi model. There is one model now - see VerseModelStore.java
// - so there is nothing to pick.

import {lastCitation} from './citations';
import {lookup} from './corpusText';

/**
 * The verse a title names, as a full record ready to show, or null.
 *
 * Takes the title and the path, because a great many of these are filed under
 * a folder that names the verse when the filename does not.
 */
export const verseFromTitle = (...parts) => {
  const text = parts.filter(Boolean).join(' ');
  if (!text) return null;

  const cited = lastCitation(text);
  if (!cited) return null;

  // A misread number names a verse that does not exist. Failing to resolve is
  // how that gets discarded.
  const record = lookup(cited.id);
  return record ? {...record, id: cited.id} : null;
};

export default verseFromTitle;
