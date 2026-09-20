// Hindi lectures.
//
// A lot of this library is lectured in Hindi, and the question that matters is
// not whether the matcher understands Hindi - it understands no language at
// all, only sounds - but whether Hindi breaks it.
//
// There is a specific reason to worry. The false-positive test elsewhere uses
// English prose, which shares almost nothing phonetically with Sanskrit. Hindi
// shares an enormous amount: it is full of tatsama words carried over
// unchanged, so `atma`, `dharm`, `bhagwan` and `karm` all turn up in ordinary
// Hindi speech and all appear in the corpus. If anything is going to make the
// panel name a verse nobody recited, it is a Hindi sentence.
//
// The other half is the happy one: a verse recited inside a Hindi lecture is
// still Sanskrit. The commentary around it changes language; the recitation
// does not, which is what the matcher is looking at.
//
// The strings below are Hindi as an English recogniser would render it -
// romanised, because that is the only form the matching side ever sees.

import {identify} from '../src/verses/matcher';

const HINDI_SPEECH = [
  'to aaj hum bhagavad gita ke bare mein charcha karenge',
  'yeh sharir nashvar hai lekin atma amar hai',
  'krishna bhagwan ne arjun se kaha ki tum apna karm karo',
  'hamein roz japa karna chahiye aur bhakti ke saath rehna chahiye',
  'is sansar mein sabhi jeev atma parmatma ka ansh hai',
  'guru maharaj ne bataya ki prem hi sabse bada dharm hai',
  'aaj hum shrimad bhagavatam ke das ve skandh ki katha sunenge',
  'bhagwan ki kripa se hi hum is marg par chal sakte hain',
  'arjun ne kaha ki main yuddh nahi karna chahta hun',
  'jo vyakti nishkam karm karta hai vah mukti pata hai',
];

describe('a lecture given in Hindi', () => {
  it('never names a verse during ordinary Hindi speech', () => {
    // The harder half of the precision question - see the note above on why
    // Hindi is a worse adversary here than English is.
    const fp = HINDI_SPEECH.map(s => ({s, hit: identify(s)})).filter(x => x.hit);
    fp.forEach(x => console.log(`   false positive: "${x.s}" -> ${x.hit.ref}`));
    expect(fp).toHaveLength(0);
  });

  it('still finds a Sanskrit verse recited inside it', () => {
    // BG 4.7, announced and explained in Hindi, recited in Sanskrit - which is
    // how these lectures actually go.
    const heard =
      'to dekhiye krishna kehte hain yada yada hi dharmasya glanir bhavati ' +
      'bharata abhyutthanam adharmasya tadatmanam srjamy aham iska matlab yeh hai';
    const hit = identify(heard);
    expect(hit).not.toBeNull();
    expect(hit.ref).toBe('BG 4.7');
  });

  it('is not thrown off by Hindi on both sides of the recitation', () => {
    const heard =
      'ab hum dekhenge ki bhagwan kya kehte hain ' +
      'dehino smin yatha dehe kaumaram yauvanam jara ' +
      'tatha dehantara praptir dhiras tatra na muhyati ' +
      'iska arth yeh hai ki atma kabhi nahi marti';
    expect(identify(heard)?.ref).toBe('BG 2.13');
  });
});
