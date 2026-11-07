const fs = require('fs');

let appJs = fs.readFileSync('js/app.js', 'utf8');

// 1. Update renderSurahCard to handle the tathbeet notice and UI updates
const oldRenderSurahCard = `    // زرّا إتمام السورة عند الوصول إلى 100%
    const completionRow = document.getElementById('surahCompletionActionsRow');
    if (completionRow) {
      if (percent >= 100) {
        completionRow.style.display = 'flex';
        const nextSurahObj = getNextSurahInfo(config.name);
        const nextLabel = document.getElementById('btnGoToNextSurahLabel');
        if (nextLabel) {
          nextLabel.textContent = nextSurahObj ? \`الانتقال لسورة \${nextSurahObj.name}\` : 'الانتقال للسورة التالية';
        }
      } else {
        completionRow.style.display = 'none';
      }
    }`;

const newRenderSurahCard = `    // زرّا إتمام السورة عند الوصول إلى 100% وإشعار مرحلة التثبيت
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
    }`;

appJs = appJs.replace(oldRenderSurahCard, newRenderSurahCard);

// 2. Update btnGoToConsolidation click handler and add btnOpenTathbeetPage click handler
const oldBtnCons = `    const btnGoToCons = document.getElementById('btnGoToConsolidation');
    if (btnGoToCons) {
      btnGoToCons.addEventListener('click', () => {
        triggerHaptic(20);
        // التحويل مباشرة إلى قسم التثبيت بالأرباع في صفحة أدوات
        const currentSurah = AppState.surahConfig ? AppState.surahConfig.name : '';
        const found = QuranData && QuranData.surahs ? QuranData.surahs.find(s => s.name === currentSurah) : null;
        const surahId = found ? found.id : 1;
        if (typeof window.openQuarterConsolidation === 'function') {
          window.openQuarterConsolidation(surahId);
        } else {
          const toolsTabBtn = document.querySelector('.nav-item-btn[data-tab="view-tools"]');
          if (toolsTabBtn) toolsTabBtn.click();
        }
      });
    }`;

const newBtnCons = `    // وظيفة الانتقال إلى مرحلة التثبيت ونقل السورة السابقة إلى المراجعة وإعادة توزيع الجداول
    function transitionToTathbeetStage() {
      const curSurahName = (AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال';
      let curSurahObj = null;
      if (typeof QURAN_SURAHS !== 'undefined') {
        curSurahObj = QURAN_SURAHS.find(s => s.name === curSurahName);
      }
      const curSurahId = curSurahObj ? curSurahObj.id : 8;

      // السورة التي كانت في التثبيت سابقاً (مثلاً التوبة)
      const prevTathbeetSurah = (AppState.surahConfig && AppState.surahConfig.previousSurah) || 'التوبة';

      // 1. تعيين حالة السورة الحالية (مثلاً الأنفال) لتكون مرحلة التثبيت
      if (!AppState.surahConfig) AppState.surahConfig = {};
      AppState.surahConfig.status = 'ready_for_tathbeet';
      AppState.surahConfig.previousSurah = curSurahName; // تصبح الأنفال هي سورة التثبيت والربط

      // 2. تحديث البروفايل وتضمين السورة السابقة (التوبة) في المحفوظ ونقلها للمراجعة الدورية
      let profile = null;
      try {
        profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
      } catch (_) {}

      if (!profile) {
        profile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: 'juz',
            value: 10,
            direction: AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas'
          },
          currentTarget: {
            surahId: curSurahId,
            page: curSurahObj ? curSurahObj.startPage : 177,
            status: 'ready_for_tathbeet'
          },
          schedule: {
            dailyNewAmount: 1,
            activeDays: [0, 1, 2, 3],
            consolidationDay: 4,
            revisionCycleDays: AppState.totalCycleDays || 10
          }
        };
      }

      profile.currentTarget.surahId = curSurahId;
      profile.currentTarget.status = 'ready_for_tathbeet';

      // 3. إعادة توليد جدول المراجعة الدورية وتقسيم الأيام تلقائياً بحيث تشمل السورة المنتهية
      if (typeof window.applyProfileToAppState === 'function') {
        window.applyProfileToAppState(profile);
      } else {
        persistState();
        renderAll();
      }

      // حفظ البروفايل المحدث
      try {
        localStorage.setItem('tibyan_user_profile', JSON.stringify(profile));
      } catch (_) {}

      showToast(\`تم بدء مرحلة تثبيت سورة \${curSurahName} ونقل سورة \${prevTathbeetSurah} للمراجعة الدورية 🌿\`);
    }

    const btnGoToCons = document.getElementById('btnGoToConsolidation');
    if (btnGoToCons) {
      btnGoToCons.addEventListener('click', () => {
        triggerHaptic(20);
        transitionToTathbeetStage();
        const currentSurah = AppState.surahConfig ? AppState.surahConfig.name : '';
        const found = (typeof QURAN_SURAHS !== 'undefined') ? QURAN_SURAHS.find(s => s.name === currentSurah) : null;
        const surahId = found ? found.id : 8;
        if (typeof window.openQuarterConsolidation === 'function') {
          window.openQuarterConsolidation(surahId);
        }
      });
    }

    const btnOpenTathbeetPage = document.getElementById('btnOpenTathbeetPage');
    if (btnOpenTathbeetPage) {
      btnOpenTathbeetPage.addEventListener('click', () => {
        triggerHaptic(20);
        const currentSurah = AppState.surahConfig ? AppState.surahConfig.name : '';
        const found = (typeof QURAN_SURAHS !== 'undefined') ? QURAN_SURAHS.find(s => s.name === currentSurah) : null;
        const surahId = found ? found.id : 8;
        if (typeof window.openQuarterConsolidation === 'function') {
          window.openQuarterConsolidation(surahId);
        }
      });
    }`;

appJs = appJs.replace(oldBtnCons, newBtnCons);

fs.writeFileSync('js/app.js', appJs, 'utf8');
console.log('Successfully updated transitionToTathbeetStage in js/app.js!');

