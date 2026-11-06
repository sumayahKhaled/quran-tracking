const qText = require('../data/quran_text.json');
function normalizeArabicText(str) {
  if (!str) return '';
  return str
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function wordsMatch(spoken, target) {
  if (!spoken || !target) return false;
  if (spoken === target) return true;
  const cleanS = spoken.replace(/^[وف]/, '');
  const cleanT = target.replace(/^[وف]/, '');
  if (cleanS === cleanT && cleanS.length > 2) return true;
  const sNoTanween = spoken.replace(/ا$/, '');
  const tNoTanween = target.replace(/ا$/, '');
  if (sNoTanween === tNoTanween && sNoTanween.length > 1) return true;
  const sNoAlif = spoken.replace(/ا/g, '');
  const tNoAlif = target.replace(/ا/g, '');
  if (sNoAlif === tNoAlif && sNoAlif.length > 1) return true;
  return false;
}

const transcript = 'الحمد لله رب العالمين الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين';
const spoken = normalizeArabicText(transcript).split(/\s+/).filter(Boolean);

console.log('Total spoken words:', spoken.length);

// Verse 1:2
let words = qText['1:2'].split(/\s+/).map((w, idx) => ({ index: idx, text: w, normalized: normalizeArabicText(w), matched: false, stumbled: false }));
let cursor = 0;
let cur = 0;
while (cursor < spoken.length && cur < words.length) {
  if (wordsMatch(spoken[cursor], words[cur].normalized)) {
    words[cur].matched = true;
    cur++;
    cursor++;
  } else {
    words[cur].stumbled = true;
    cursor++;
  }
}
console.log('1:2 finished. cur:', cur, 'cursor:', cursor);
let carryCursor = cursor;

// Now advance to 1:3:
let words3 = qText['1:3'].split(/\s+/).map((w, idx) => ({ index: idx, text: w, normalized: normalizeArabicText(w), matched: false, stumbled: false }));
cur = 0;
cursor = carryCursor;
console.log('Starting 1:3 with cursor:', cursor, 'remaining spoken words:', spoken.slice(cursor));
while (cursor < spoken.length && cur < words3.length) {
  console.log(`1:3 checking spoken[${cursor}]="${spoken[cursor]}" vs target[${cur}]="${words3[cur].normalized}"`);
  if (wordsMatch(spoken[cursor], words3[cur].normalized)) {
    console.log('  MATCH!');
    words3[cur].matched = true;
    cur++;
    cursor++;
  } else {
    console.log('  MISMATCH!');
    words3[cur].stumbled = true;
    cursor++;
  }
}
console.log('1:3 result: cur:', cur, 'words3 length:', words3.length, 'cursor:', cursor);
