const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('js/quran-data.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const QURAN_SURAHS = sandbox.window.QURAN_SURAHS;

function generateReviewSchedule(profile) {
  const { memorization, currentTarget, schedule } = profile;
  const cycleDays = parseInt(schedule.revisionCycleDays, 10) || 10;
  const isReverse = (memorization.direction === 'nas_to_fatihah');
  const curSurahId = parseInt(currentTarget.surahId, 10) || (isReverse ? 114 : 1);
  const curSurah = QURAN_SURAHS.find(s => s.id === curSurahId) || QURAN_SURAHS[0];

  // 1. Determine previous surah for near review & quarter consolidation
  let prevSurah = null;
  if (isReverse) {
    // next in mushaf order (e.g. current is Anfal 8 -> previous was Tawbah 9)
    prevSurah = QURAN_SURAHS.find(s => s.id === curSurahId + 1);
  } else {
    // previous in mushaf order (e.g. current is Anfal 8 -> previous was A'raf 7)
    prevSurah = QURAN_SURAHS.find(s => s.id === curSurahId - 1);
  }
  if (!prevSurah) {
    prevSurah = curSurah;
  }

  // 2. Determine surahs to review in distant review
  let surahs = [];
  const type = memorization.type;
  const val = memorization.value;

  if (type === 'khatim') {
    surahs = [...QURAN_SURAHS];
  } else if (type === 'juz') {
    const juzCount = parseInt(val, 10) || 10;
    if (isReverse) {
      const startPage = Math.max(1, 604 - (juzCount * 20));
      surahs = QURAN_SURAHS.filter(s => s.endPage >= startPage);
    } else {
      const endPage = Math.min(604, juzCount * 20);
      surahs = QURAN_SURAHS.filter(s => s.startPage <= endPage);
    }
  } else if (type === 'surah_range') {
    const fId = Math.min(val.from || 1, val.to || 114);
    const tId = Math.max(val.from || 1, val.to || 114);
    surahs = QURAN_SURAHS.filter(s => s.id >= fId && s.id <= tId);
  } else {
    // beginner
    surahs = [curSurah];
  }

  if (isReverse) {
    surahs.sort((a, b) => b.id - a.id);
  } else {
    surahs.sort((a, b) => a.id - b.id);
  }

  // 3. Divide distant review into cycleDays buckets
  const buckets = Array.from({ length: cycleDays }, () => []);
  surahs.forEach((s, idx) => {
    buckets[idx % cycleDays].push(s);
  });

  // 4. Distribute near review across cycleDays
  const scheduleRows = [];
  for (let i = 0; i < cycleDays; i++) {
    const dayNum = i + 1;
    // Distant review text
    const bSurahs = buckets[i];
    let distantText = '';
    if (bSurahs.length === 0) {
      distantText = `مراجعة عامة وتثبيت للمحفوظ`;
    } else if (bSurahs.length === 1) {
      distantText = `سورة ${bSurahs[0].name} (كاملة)`;
    } else if (bSurahs.length <= 3) {
      distantText = bSurahs.map(s => `سورة ${s.name}`).join(' و');
    } else {
      distantText = `من سورة ${bSurahs[0].name} إلى سورة ${bSurahs[bSurahs.length - 1].name} (${bSurahs.length} سور)`;
    }

    // Near review text: based on current or previous surah quarters
    let nearText = '';
    if (prevSurah && prevSurah.verses > 0) {
      const partSize = Math.max(1, Math.ceil(prevSurah.verses / cycleDays));
      const fromV = Math.min(prevSurah.verses, (i * partSize) + 1);
      const toV = Math.min(prevSurah.verses, (i + 1) * partSize);
      if (fromV <= toV) {
        nearText = `سورة ${prevSurah.name} (${fromV} - ${toV})`;
      } else {
        nearText = `سورة ${prevSurah.name} (تثبيت ومراجعة)`;
      }
    } else {
      nearText = `تثبيت سورة ${curSurah.name}`;
    }

    scheduleRows.push({
      day: dayNum,
      nearReview: nearText,
      distantReview: distantText
    });
  }

  return {
    scheduleRows,
    previousSurah: prevSurah.name,
    previousSurahId: prevSurah.id
  };
}

const res = generateReviewSchedule({
  name: 'سمية',
  memorization: { type: 'juz', value: 10, direction: 'nas_to_fatihah' },
  currentTarget: { surahId: 8, status: 'ready_for_tathbeet' },
  schedule: { revisionCycleDays: 10, activeDays: [0, 1, 2, 3], consolidationDay: 4, dailyNewAmount: 1 }
});

console.log('Result Previous Surah:', res.previousSurah);
console.log('Days:');
res.scheduleRows.forEach(r => {
  console.log(`Day ${r.day}: [Near: ${r.nearReview}] | [Distant: ${r.distantReview}]`);
});

