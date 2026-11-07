const fs = require('fs');

let code = fs.readFileSync('js/onboarding-wizard.js', 'utf8');

// Replace surahs collection in generateReviewSchedule to guarantee that:
// When status is 'ready_for_tathbeet', the surah currently in tathbeet is the current target surah (e.g. الأنفال),
// and the previous surah (e.g. التوبة) is explicitly in the distant review list (surahs).
// Also when الأنفال itself finishes tathbeet, it moves into distant review.

const targetSurahCalc = `    // 2. تحديد قائمة السور للمراجعة البعيدة
    let surahs = [];
    const type = profile.memorization.type;
    const val = profile.memorization.value;

    if (type === 'khatim') {
      surahs = [...surahList];
    } else if (type === 'juz') {
      const juzCount = parseInt(val, 10) || 10;
      if (isReverse) {
        const startPage = Math.max(1, 604 - (juzCount * 20));
        surahs = surahList.filter(s => s.endPage >= startPage);
      } else {
        const endPage = Math.min(604, juzCount * 20);
        surahs = surahList.filter(s => s.startPage <= endPage);
      }
    } else if (type === 'surah_range') {
      const fId = Math.min((val && val.from) || 1, (val && val.to) || 114);
      const tId = Math.max((val && val.from) || 1, (val && val.to) || 114);
      surahs = surahList.filter(s => s.id >= fId && s.id <= tId);
    } else {
      // beginner
      surahs = [curSurah];
    }`;

const newSurahCalc = `    // 2. تحديد قائمة السور للمراجعة البعيدة
    let surahs = [];
    const type = profile.memorization.type;
    const val = profile.memorization.value;

    if (type === 'khatim') {
      surahs = [...surahList];
    } else if (type === 'juz') {
      const juzCount = parseInt(val, 10) || 10;
      if (isReverse) {
        const startPage = Math.max(1, 604 - (juzCount * 20));
        surahs = surahList.filter(s => s.endPage >= startPage);
      } else {
        const endPage = Math.min(604, juzCount * 20);
        surahs = surahList.filter(s => s.startPage <= endPage);
      }
    } else if (type === 'surah_range') {
      const fId = Math.min((val && val.from) || 1, (val && val.to) || 114);
      const tId = Math.max((val && val.from) || 1, (val && val.to) || 114);
      surahs = surahList.filter(s => s.id >= fId && s.id <= tId);
    } else {
      // beginner
      surahs = [curSurah];
    }

    // إذا كانت السورة في مرحلة التثبيت (مثل الأنفال)، فتأكد أن السورة التي تم الانتهاء من تثبيتها (التوبة) مضافة تلقائياً في قائمة المراجعة
    if (prevSurah && !surahs.some(s => s.id === prevSurah.id)) {
      surahs.push(prevSurah);
    }`;

code = code.replace(targetSurahCalc, newSurahCalc);

// Also in applyProfileToAppState:
// When status is ready_for_tathbeet, the active quarter consolidation surah is curSurah (e.g. الأنفال),
// while distant review automatically reviews the previous surahs (including التوبة).
const targetApplyQuarter = `      // ضبط السورة السابقة في أداة التثبيت بالأرباع تلقائياً
      const qSelect = document.getElementById('quarterSurahSelect');
      if (qSelect) {
        qSelect.value = String(gen.previousSurahId);
        if (typeof window.applyQuarterSelection === 'function') {
          window.applyQuarterSelection();
        }
      }`;

const newApplyQuarter = `      // ضبط سورة التثبيت في أداة التثبيت بالأرباع تلقائياً
      const qSelect = document.getElementById('quarterSurahSelect');
      if (qSelect) {
        // إذا كان المستخدم في مرحلة تثبيت السورة الحالية، تكون هي السورة المحددة في أداة التثبيت
        const isTathbeet = (profile.currentTarget.status === 'ready_for_tathbeet');
        qSelect.value = String(isTathbeet ? curSurah.id : gen.previousSurahId);
        if (typeof window.applyQuarterSelection === 'function') {
          window.applyQuarterSelection();
        }
      }`;

code = code.replace(targetApplyQuarter, newApplyQuarter);

fs.writeFileSync('js/onboarding-wizard.js', code, 'utf8');
console.log('Successfully updated generateReviewSchedule and applyProfileToAppState in onboarding-wizard.js!');

