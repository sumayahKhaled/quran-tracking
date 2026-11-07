// test schedule generation logic
const fs = require('fs');

// Load QURAN_SURAHS from quran-data.js
const code = fs.readFileSync('js/quran-data.js', 'utf8');
const vm = require('vm');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const QURAN_SURAHS = sandbox.window.QURAN_SURAHS;
console.log('Surahs count:', QURAN_SURAHS.length);

function getSurahsForProfile(profile) {
  const { memorization, currentTarget } = profile;
  const { type, value, direction } = memorization;
  const isReverse = (direction === 'nas_to_fatihah');

  let list = [];
  if (type === 'khatim') {
    list = [...QURAN_SURAHS];
  } else if (type === 'juz') {
    const juzCount = parseInt(value, 10) || 10;
    if (isReverse) {
      // e.g. 10 juz from end: Juz 21 to 30 (Surah 29/33 to 114)
      const startPage = Math.max(1, 604 - (juzCount * 20));
      list = QURAN_SURAHS.filter(s => s.endPage >= startPage);
    } else {
      // e.g. 10 juz from beginning: Juz 1 to 10 (Surah 1 to 9)
      const endPage = Math.min(604, juzCount * 20);
      list = QURAN_SURAHS.filter(s => s.startPage <= endPage);
    }
  } else if (type === 'surah_range') {
    const fromId = (value && value.from) || 1;
    const toId = (value && value.to) || 114;
    const minId = Math.min(fromId, toId);
    const maxId = Math.max(fromId, toId);
    list = QURAN_SURAHS.filter(s => s.id >= minId && s.id <= maxId);
  } else {
    // beginner
    const curId = currentTarget.surahId || 114;
    list = QURAN_SURAHS.filter(s => s.id === curId);
  }

  // order list based on direction
  if (isReverse) {
    list.sort((a, b) => b.id - a.id);
  } else {
    list.sort((a, b) => a.id - b.id);
  }
  return list;
}

console.log('Test reverse juz 10:');
const testRev = getSurahsForProfile({
  memorization: { type: 'juz', value: 10, direction: 'nas_to_fatihah' },
  currentTarget: { surahId: 8 }
});
console.log('Rev count:', testRev.length, 'first:', testRev[0].name, 'last:', testRev[testRev.length-1].name);

const testFwd = getSurahsForProfile({
  memorization: { type: 'juz', value: 10, direction: 'fatihah_to_nas' },
  currentTarget: { surahId: 8 }
});
console.log('Fwd count:', testFwd.length, 'first:', testFwd[0].name, 'last:', testFwd[testFwd.length-1].name);

