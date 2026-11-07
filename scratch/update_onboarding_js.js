const fs = require('fs');

let code = fs.readFileSync('js/onboarding-wizard.js', 'utf8');

const generatorFunctionCode = `
  // توليد جدول المراجعة الدورية وأرباع التثبيت بناءً على بيانات الملف الشخصي
  function generateReviewSchedule(profile) {
    if (!profile || !profile.memorization || !profile.currentTarget || !profile.schedule) {
      return null;
    }
    const surahList = getSurahList();
    const cycleDays = parseInt(profile.schedule.revisionCycleDays, 10) || 10;
    const isReverse = (profile.memorization.direction === 'nas_to_fatihah');
    const curSurahId = parseInt(profile.currentTarget.surahId, 10) || (isReverse ? 114 : 1);
    const curSurah = getSurahById(curSurahId) || surahList[0];

    // 1. تحديد السورة السابقة (للتثبيت بالأرباع والمراجعة القريبة)
    let prevSurah = null;
    if (isReverse) {
      prevSurah = getSurahById(curSurahId + 1);
    } else {
      prevSurah = getSurahById(curSurahId - 1);
    }
    if (!prevSurah) {
      prevSurah = curSurah;
    }

    // 2. تحديد قائمة السور للمراجعة البعيدة
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

    // فرز السور بحسب مسار الحفظ المختار
    if (isReverse) {
      surahs.sort((a, b) => b.id - a.id);
    } else {
      surahs.sort((a, b) => a.id - b.id);
    }

    // تقسيم السور بتسلسل منتظم (chunks)
    const total = surahs.length;
    const chunkSize = total / cycleDays;
    const scheduleRows = [];

    for (let i = 0; i < cycleDays; i++) {
      const dayNum = i + 1;
      const start = Math.floor(i * chunkSize);
      const end = Math.floor((i + 1) * chunkSize);
      const daySurahs = surahs.slice(start, end);

      let distantText = '';
      if (daySurahs.length === 0) {
        distantText = 'مراجعة عامة وتثبيت للمحفوظ';
      } else if (daySurahs.length === 1) {
        distantText = 'سورة ' + daySurahs[0].name + ' (كاملة)';
      } else if (daySurahs.length <= 3) {
        distantText = daySurahs.map(s => 'سورة ' + s.name).join(' و');
      } else {
        distantText = 'من سورة ' + daySurahs[0].name + ' إلى سورة ' + daySurahs[daySurahs.length - 1].name + ' (' + daySurahs.length + ' سور)';
      }

      // المراجعة القريبة: تقسيم السورة السابقة أو الحالية
      let nearText = '';
      if (prevSurah && prevSurah.verses > 0) {
        const partSize = Math.max(1, Math.ceil(prevSurah.verses / cycleDays));
        const fromV = Math.min(prevSurah.verses, (i * partSize) + 1);
        const toV = Math.min(prevSurah.verses, (i + 1) * partSize);
        if (fromV <= toV) {
          nearText = 'سورة ' + prevSurah.name + ' (' + fromV + ' - ' + toV + ')';
        } else {
          nearText = 'سورة ' + prevSurah.name + ' (تثبيت ومراجعة)';
        }
      } else {
        nearText = 'تثبيت سورة ' + curSurah.name;
      }

      scheduleRows.push({
        day: dayNum,
        nearReview: nearText,
        distantReview: distantText
      });
    }

    return {
      scheduleRows: scheduleRows,
      previousSurah: prevSurah.name,
      previousSurahId: prevSurah.id
    };
  }

  // تطبيق الخطة والجداول المشتقة ديناميكياً على حالة التطبيق AppState
  function applyProfileToAppState(profile) {
    if (!profile || !window.AppState) return;
    const curSurah = getSurahById(profile.currentTarget.surahId);
    if (!curSurah) return;

    window.AppState.surahConfig = {
      name: curSurah.name,
      totalVerses: curSurah.verses,
      currentVerse: (profile.currentTarget.status === 'ready_for_tathbeet') ? curSurah.verses : (parseInt(profile.currentTarget.currentVerse, 10) || 0),
      dailyTarget: Math.round(profile.schedule.dailyNewAmount * 15)
    };
    window.AppState.reverseMemorizationOrder = (profile.memorization.direction === 'nas_to_fatihah');
    window.AppState.totalCycleDays = profile.schedule.revisionCycleDays;

    // توليد الجداول ديناميكياً
    const gen = generateReviewSchedule(profile);
    if (gen) {
      window.AppState.surahConfig.previousSurah = gen.previousSurah;
      window.AppState.tenDaySchedule = gen.scheduleRows;

      // ضبط السورة السابقة في أداة التثبيت بالأرباع تلقائياً
      const qSelect = document.getElementById('quarterSurahSelect');
      if (qSelect) {
        qSelect.value = String(gen.previousSurahId);
        if (typeof window.applyQuarterSelection === 'function') {
          window.applyQuarterSelection();
        }
      }
    }

    // تحديث روتين أيام الأسبوع بناءً على الأيام النشطة ويوم التثبيت
    if (window.AppState.weeklySchedule && Array.isArray(profile.schedule.activeDays)) {
      const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      DAY_KEYS.forEach((dKey, idx) => {
        const isActive = profile.schedule.activeDays.includes(idx);
        const isConsDay = (profile.schedule.consolidationDay === idx);
        if (window.AppState.weeklySchedule[dKey]) {
          window.AppState.weeklySchedule[dKey].hasNew = isActive;
          window.AppState.weeklySchedule[dKey].hasConsolidation = isConsDay || isActive;
          window.AppState.weeklySchedule[dKey].hasNearReview = isActive || isConsDay;
          window.AppState.weeklySchedule[dKey].hasDistantReview = isActive || isConsDay;
        }
      });
    }

    if (typeof window.persistState === 'function') {
      window.persistState();
    }
    if (typeof window.renderAll === 'function') {
      window.renderAll();
    }
    if (typeof window.populateSettingsForm === 'function') {
      window.populateSettingsForm();
    }
    if (typeof window.populateUnifiedPlanForm === 'function') {
      window.populateUnifiedPlanForm();
    }
  }
`;

const commitFuncTarget = `    // 2. تطبيق الإعدادات فوراً على AppState في app.js
    if (window.AppState) {
      const curSurah = getSurahById(userProfile.currentTarget.surahId);
      window.AppState.surahConfig = {
        name: curSurah.name,
        totalVerses: curSurah.verses,
        currentVerse: (userProfile.currentTarget.status === 'ready_for_tathbeet') ? curSurah.verses : 0,
        dailyTarget: Math.round(userProfile.schedule.dailyNewAmount * 15) // تقريباً 15 آية للصفحة
      };
      window.AppState.reverseMemorizationOrder = (userProfile.memorization.direction === 'nas_to_fatihah');
      window.AppState.totalCycleDays = userProfile.schedule.revisionCycleDays;

      if (typeof window.persistState === 'function') {
        window.persistState();
      }
      if (typeof window.renderAll === 'function') {
        window.renderAll();
      }
      if (typeof window.populateSettingsForm === 'function') {
        window.populateSettingsForm();
      }
    }`;

const commitFuncReplacement = `    // 2. تطبيق الإعدادات وتوليد الجداول فوراً على AppState في app.js
    applyProfileToAppState(userProfile);`;

// Insert generator functions before commitUserProfile
code = code.replace('  // حفظ الكائن النهائي وتطبيقه على النظام', generatorFunctionCode + '\n  // حفظ الكائن النهائي وتطبيقه على النظام');

if (!code.includes(commitFuncTarget)) {
  console.error('commitFuncTarget not found!');
  process.exit(1);
}

code = code.replace(commitFuncTarget, commitFuncReplacement);

// Export generateReviewSchedule and applyProfileToAppState
code = code.replace('  window.SerajOnboarding = {', `  window.generateReviewSchedule = generateReviewSchedule;
  window.applyProfileToAppState = applyProfileToAppState;
  window.SerajOnboarding = {`);

fs.writeFileSync('js/onboarding-wizard.js', code, 'utf8');
console.log('Successfully updated onboarding-wizard.js with dynamic review generator!');

