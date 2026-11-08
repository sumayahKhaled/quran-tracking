const fs = require('fs');

let appJs = fs.readFileSync('js/app.js', 'utf8');

// Function to calculate quarter consolidation progress for a surah
const tathbeetCalcHelper = `
  // دالة حساب تقدم التثبيت بالأرباع للسورة المحددة بدقة
  function getSurahTathbeetProgress(surahName) {
    const sName = surahName || (AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال';
    let sObj = null;
    if (typeof QURAN_SURAHS !== 'undefined') {
      sObj = QURAN_SURAHS.find(s => s.name === sName);
    }
    if (!sObj && window.QURAN_SURAHS) {
      sObj = window.QURAN_SURAHS.find(s => s.name === sName);
    }
    const sId = sObj ? sObj.id : 8;
    const totalVerses = sObj ? sObj.verses : 75;

    // جلب أرباع السورة
    const dict = (typeof QURAN_SURAH_QUARTERS !== 'undefined') ? QURAN_SURAH_QUARTERS : (window.QURAN_SURAH_QUARTERS || {});
    const canonical = dict[sId] || [];
    let quarters = [];

    if (canonical.length > 0) {
      quarters = canonical.map((item, i) => ({
        num: i + 1,
        fromAyah: item[0],
        toAyah: item[1]
      }));
    } else {
      quarters = [{ num: 1, fromAyah: 1, toAyah: totalVerses }];
    }

    const totalQuarters = quarters.length;
    let completedQuarters = 0;
    let totalScore = 0; // مجموع النقاط الجزئية (سماع + تسجيل + 7 تكرارات)
    const maxScore = totalQuarters * 3; // كل ربع له 3 أركان: سماع، تسجيل، تكرار

    quarters.forEach(q => {
      const key = \`quarter_progress_\${sId}_\${q.fromAyah}_\${q.toAyah}\`;
      let prog = null;
      try {
        const saved = localStorage.getItem(key);
        if (saved) prog = JSON.parse(saved);
      } catch (_) {}

      let qScore = 0;
      if (prog) {
        if (prog.heardFirstTime) qScore += 1;
        if (prog.recordedRecitation) qScore += 1;
        const rep = prog.repetitionCount || 0;
        if (rep >= 7) {
          qScore += 1;
        } else if (rep > 0) {
          qScore += (rep / 7);
        }

        if (prog.heardFirstTime && prog.recordedRecitation && rep >= 7) {
          completedQuarters++;
        }
      }
      totalScore += qScore;
    });

    const percent = Math.min(100, Math.round((totalScore / maxScore) * 1000) / 10);
    return {
      surahName: sName,
      surahId: sId,
      totalQuarters,
      completedQuarters,
      percent,
      isFinished: (completedQuarters === totalQuarters)
    };
  }
  window.getSurahTathbeetProgress = getSurahTathbeetProgress;
`;

// Insert tathbeetCalcHelper before renderSurahCard
appJs = appJs.replace('  // 1. Render Current Surah Card', tathbeetCalcHelper + '\n  // 1. Render Current Surah Card');

// Update renderSurahCard to reflect tathbeet progress and label
const targetRenderCard = `  // 1. Render Current Surah Card
  function renderSurahCard() {
    const config = AppState.surahConfig;
    const nameEl = document.getElementById('currentSurahName');
    const percentEl = document.getElementById('currentSurahPercent');
    const ratioEl = document.getElementById('currentSurahRatio');
    const fillEl = document.getElementById('currentSurahFill');
    const statusTextEl = document.getElementById('currentSurahStatusText');

    if (!nameEl) return;

    const total = parseInt(config.totalVerses) || 1;
    const current = Math.min(total, parseInt(config.currentVerse) || 0);
    const percent = Math.min(100, Math.round((current / total) * 1000) / 10);
    const remaining = total - current;

    nameEl.textContent = \`سورة \${config.name || 'البقرة'}\`;
    percentEl.textContent = \`\${percent}%\`;
    ratioEl.textContent = \`\${current} من \${total} آية\`;
    fillEl.style.width = \`\${percent}%\`;

    statusTextEl.innerHTML = \`تم حفظ <strong>\${current}</strong> آية (المتبقي: <strong>\${remaining}</strong> آية)\`;

    // زرّا إتمام السورة عند الوصول إلى 100% وإشعار مرحلة التثبيت
    const completionRow = document.getElementById('surahCompletionActionsRow');
    const tathbeetNotice = document.getElementById('surahInTathbeetNotice');
    const tathbeetTitle = document.getElementById('tathbeetNoticeTitle');

    const isInTathbeet = (AppState.surahConfig && AppState.surahConfig.status === 'ready_for_tathbeet');

    if (tathbeetNotice) {
      if (isInTathbeet) {
        tathbeetNotice.style.display = 'flex';
        if (tathbeetTitle) {
          tathbeetTitle.textContent = \`أنت الآن في مرحلة تثبيت سورة \${config.name}\`;
        }
      } else {
        tathbeetNotice.style.display = 'none';
      }
    }

    if (completionRow) {
      if (percent >= 100 && !isInTathbeet) {
        completionRow.style.display = 'flex';
        const nextSurahObj = getNextSurahInfo(config.name);
        const nextLabel = document.getElementById('btnGoToNextSurahLabel');
        if (nextLabel) {
          nextLabel.textContent = nextSurahObj ? \`الانتقال لسورة \${nextSurahObj.name}\` : 'الانتقال للسورة التالية';
        }
      } else {
        completionRow.style.display = 'none';
      }
    }
  }`;

const newRenderCard = `  // 1. Render Current Surah Card
  function renderSurahCard() {
    const config = AppState.surahConfig;
    const nameEl = document.getElementById('currentSurahName');
    const typeLabelEl = document.getElementById('currentSurahTypeLabel');
    const percentEl = document.getElementById('currentSurahPercent');
    const ratioEl = document.getElementById('currentSurahRatio');
    const fillEl = document.getElementById('currentSurahFill');
    const statusTextEl = document.getElementById('currentSurahStatusText');
    const quickButtonsRow = document.querySelector('.surah-action-buttons');

    if (!nameEl) return;

    const isInTathbeet = (config && config.status === 'ready_for_tathbeet');

    if (isInTathbeet) {
      // السورة في مرحلة التثبيت: يظهر عنوان "تثبيت سورة كذا" ونسبة تقدم التثبيت بالأرباع
      const tProg = getSurahTathbeetProgress(config.name);
      if (typeLabelEl) typeLabelEl.textContent = 'مرحلة التثبيت والتمكين';
      nameEl.textContent = \`تثبيت سورة \${config.name || 'الأنفال'}\`;
      percentEl.textContent = \`\${tProg.percent}%\`;
      ratioEl.textContent = \`\${tProg.completedQuarters} من \${tProg.totalQuarters} أرباع مكتملة\`;
      fillEl.style.width = \`\${tProg.percent}%\`;
      statusTextEl.innerHTML = \`تم إتقان <strong>\${tProg.completedQuarters}</strong> من <strong>\${tProg.totalQuarters}</strong> أرباع بالأرباع والتكرار\`;

      // إخفاء أزرار زيادة الآيات أثناء مرحلة التثبيت
      if (quickButtonsRow) quickButtonsRow.style.display = 'none';
    } else {
      // السورة في مرحلة الحفظ العادي
      const total = parseInt(config.totalVerses) || 1;
      const current = Math.min(total, parseInt(config.currentVerse) || 0);
      const percent = Math.min(100, Math.round((current / total) * 1000) / 10);
      const remaining = total - current;

      if (typeLabelEl) typeLabelEl.textContent = 'السورة المقررة الحالية';
      nameEl.textContent = \`سورة \${config.name || 'البقرة'}\`;
      percentEl.textContent = \`\${percent}%\`;
      ratioEl.textContent = \`\${current} من \${total} آية\`;
      fillEl.style.width = \`\${percent}%\`;
      statusTextEl.innerHTML = \`تم حفظ <strong>\${current}</strong> آية (المتبقي: <strong>\${remaining}</strong> آية)\`;

      if (quickButtonsRow) quickButtonsRow.style.display = 'flex';
    }

    // زرّا إتمام السورة عند الوصول إلى 100% وإشعار مرحلة التثبيت
    const completionRow = document.getElementById('surahCompletionActionsRow');
    const tathbeetNotice = document.getElementById('surahInTathbeetNotice');
    const tathbeetTitle = document.getElementById('tathbeetNoticeTitle');

    if (tathbeetNotice) {
      if (isInTathbeet) {
        tathbeetNotice.style.display = 'flex';
        if (tathbeetTitle) {
          tathbeetTitle.textContent = \`أنت الآن في مرحلة تثبيت سورة \${config.name}\`;
        }
      } else {
        tathbeetNotice.style.display = 'none';
      }
    }

    if (completionRow) {
      const total = parseInt(config.totalVerses) || 1;
      const current = Math.min(total, parseInt(config.currentVerse) || 0);
      const percent = Math.min(100, Math.round((current / total) * 1000) / 10);

      if (percent >= 100 && !isInTathbeet) {
        completionRow.style.display = 'flex';
        const nextSurahObj = getNextSurahInfo(config.name);
        const nextLabel = document.getElementById('btnGoToNextSurahLabel');
        if (nextLabel) {
          nextLabel.textContent = nextSurahObj ? \`الانتقال لسورة \${nextSurahObj.name}\` : 'الانتقال للسورة التالية';
        }
      } else {
        completionRow.style.display = 'none';
      }
    }
  }`;

appJs = appJs.replace(targetRenderCard, newRenderCard);

// 3. Hide new memo section in renderDynamicVisibility while in tathbeet stage
const targetSecNew = `    // قسم الحفظ الجديد
    const secNew = document.getElementById('sectionNewMemoCard');
    if (secNew) {
      secNew.style.display = routine.hasNew ? 'block' : 'none';
    }`;

const newSecNew = `    // قسم الحفظ الجديد: يتم إخفاؤه تماماً طالما المستخدم في مرحلة التثبيت
    const secNew = document.getElementById('sectionNewMemoCard');
    const isSurahInTathbeet = (AppState.surahConfig && AppState.surahConfig.status === 'ready_for_tathbeet');
    if (secNew) {
      secNew.style.display = (!isSurahInTathbeet && routine.hasNew) ? 'block' : 'none';
    }`;

appJs = appJs.replace(targetSecNew, newSecNew);

// 4. Also in calculateDailyProgress, do not require new memo tasks if in tathbeet stage
const targetCalcDaily = `    // New memorization tasks (dynamically respects planConfig)
    if (routine && routine.hasNew && !missed.memo) {`;

const newCalcDaily = `    // New memorization tasks (dynamically respects planConfig & skipped during tathbeet stage)
    const isUnderTathbeet = (AppState.surahConfig && AppState.surahConfig.status === 'ready_for_tathbeet');
    if (!isUnderTathbeet && routine && routine.hasNew && !missed.memo) {`;

appJs = appJs.replace(targetCalcDaily, newCalcDaily);

fs.writeFileSync('js/app.js', appJs, 'utf8');
console.log('Successfully updated js/app.js with tathbeet progress and section visibility!');

