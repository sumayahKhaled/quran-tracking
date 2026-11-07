const fs = require('fs');

let appJs = fs.readFileSync('js/app.js', 'utf8');

const unifiedPlanHandlers = `
  // --- UNIFIED PLAN & REVIEW SETTINGS MODULE ---
  function initUnifiedPlanSettings() {
    const memTypeSelect = document.getElementById('unifMemTypeSelect');
    const juzContainer = document.getElementById('unifJuzContainer');
    const juzSelect = document.getElementById('unifJuzCount');
    const rangeContainer = document.getElementById('unifSurahRangeContainer');
    const rangeFrom = document.getElementById('unifRangeFromSurah');
    const rangeTo = document.getElementById('unifRangeToSurah');
    const dirSelect = document.getElementById('unifDirectionSelect');
    const targetSurah = document.getElementById('unifTargetSurahSelect');
    const pageInput = document.getElementById('unifTargetPageInput');
    const verseInput = document.getElementById('unifCurrentVerseInput');
    const statusSelect = document.getElementById('unifSurahStatusSelect');
    const dailyNewSelect = document.getElementById('unifDailyNewSelect');
    const cycleDaysSelect = document.getElementById('unifCycleDaysSelect');
    const consDaySelect = document.getElementById('unifConsolidationDaySelect');
    const dayBtns = document.querySelectorAll('#unifActiveDaysGrid .unif-day-btn');
    const saveBtn = document.getElementById('saveUnifiedPlanBtn');

    // تعبئة قوائم السور
    function populateDropdowns() {
      const list = window.QURAN_SURAHS || [];
      if (targetSurah && targetSurah.children.length === 0) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.id + '. سورة ' + s.name + ' (' + s.verses + ' آية)';
          targetSurah.appendChild(opt);
        });
      }
      if (rangeFrom && rangeFrom.children.length === 0) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.id + '. ' + s.name;
          rangeFrom.appendChild(opt);
        });
      }
      if (rangeTo && rangeTo.children.length === 0) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = s.id + '. ' + s.name;
          rangeTo.appendChild(opt);
        });
      }
    }
    populateDropdowns();

    // تبديل ظهور حقول المحفوظ بحسب النوع المختار
    function updateMemTypeVisibility() {
      const type = memTypeSelect ? memTypeSelect.value : 'juz';
      if (juzContainer) juzContainer.style.display = (type === 'juz') ? 'block' : 'none';
      if (rangeContainer) rangeContainer.style.display = (type === 'surah_range') ? 'grid' : 'none';
    }

    if (memTypeSelect) {
      memTypeSelect.addEventListener('change', updateMemTypeVisibility);
    }

    // تحديث الصفحة تلقائياً عند تغيير السورة
    if (targetSurah) {
      targetSurah.addEventListener('change', () => {
        const sId = parseInt(targetSurah.value, 10);
        if (typeof window.getSurahById === 'function' && pageInput) {
          const s = window.getSurahById(sId);
          if (s) {
            pageInput.value = s.startPage || 1;
            if (verseInput) verseInput.max = s.verses;
          }
        }
      });
    }

    // عند اختيار مرحلة التثبيت، تعطيل رقم الصفحة
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        if (pageInput) {
          pageInput.disabled = (statusSelect.value === 'ready_for_tathbeet');
        }
      });
    }

    // اختيار أيام الأسبوع
    dayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (typeof triggerHaptic === 'function') triggerHaptic(15);
      });
    });

    // تعبئة النموذج من البيانات المخزنة
    function populateUnifiedPlanForm() {
      populateDropdowns();
      let profile = null;
      try {
        profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
      } catch (_) {}

      if (!profile) {
        // اشتقاق البيانات من AppState الحالية
        profile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: 'juz',
            value: 10,
            direction: AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas'
          },
          currentTarget: {
            surahId: 1,
            page: 1,
            status: 'new'
          },
          schedule: {
            dailyNewAmount: 1,
            activeDays: [0, 1, 2, 3],
            consolidationDay: 4,
            revisionCycleDays: AppState.totalCycleDays || 10
          }
        };
        if (window.QURAN_SURAHS && AppState.surahConfig && AppState.surahConfig.name) {
          const sFound = window.QURAN_SURAHS.find(s => s.name === AppState.surahConfig.name);
          if (sFound) {
            profile.currentTarget.surahId = sFound.id;
            profile.currentTarget.page = sFound.startPage || 1;
          }
        }
      }

      if (memTypeSelect) memTypeSelect.value = profile.memorization.type || 'juz';
      if (juzSelect && profile.memorization.type === 'juz') {
        juzSelect.value = String(profile.memorization.value || 10);
      }
      if (profile.memorization.type === 'surah_range' && profile.memorization.value) {
        if (rangeFrom) rangeFrom.value = String(profile.memorization.value.from || 1);
        if (rangeTo) rangeTo.value = String(profile.memorization.value.to || 114);
      }
      updateMemTypeVisibility();

      if (dirSelect) {
        dirSelect.value = profile.memorization.direction || (AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas');
      }

      if (targetSurah) targetSurah.value = String(profile.currentTarget.surahId || 1);
      if (pageInput) {
        pageInput.value = profile.currentTarget.page || 1;
        pageInput.disabled = (profile.currentTarget.status === 'ready_for_tathbeet');
      }
      if (verseInput) {
        verseInput.value = (AppState.surahConfig && AppState.surahConfig.currentVerse) || 0;
      }
      if (statusSelect) statusSelect.value = profile.currentTarget.status || 'new';

      if (dailyNewSelect) dailyNewSelect.value = String(profile.schedule.dailyNewAmount || 1);
      if (cycleDaysSelect) cycleDaysSelect.value = String(profile.schedule.revisionCycleDays || 10);
      if (consDaySelect) consDaySelect.value = String(profile.schedule.consolidationDay !== undefined ? profile.schedule.consolidationDay : 4);

      const activeDays = profile.schedule.activeDays || [0, 1, 2, 3];
      dayBtns.forEach(btn => {
        const d = parseInt(btn.dataset.day, 10);
        if (activeDays.includes(d)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }
    window.populateUnifiedPlanForm = populateUnifiedPlanForm;

    // حفظ النموذج وتطبيق التغييرات
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        if (typeof triggerHaptic === 'function') triggerHaptic(25);
        const memType = memTypeSelect ? memTypeSelect.value : 'juz';
        let memVal = 10;
        if (memType === 'juz') {
          memVal = parseInt(juzSelect.value, 10) || 10;
        } else if (memType === 'surah_range') {
          const f = parseInt(rangeFrom.value, 10) || 1;
          const t = parseInt(rangeTo.value, 10) || 114;
          memVal = { from: Math.min(f, t), to: Math.max(f, t) };
        } else if (memType === 'khatim') {
          memVal = 30;
        } else {
          memVal = 0;
        }

        const sId = targetSurah ? (parseInt(targetSurah.value, 10) || 1) : 1;
        const sPage = pageInput ? (parseInt(pageInput.value, 10) || 1) : 1;
        const curVerse = verseInput ? (parseInt(verseInput.value, 10) || 0) : 0;
        const sStatus = statusSelect ? statusSelect.value : 'new';
        const sDir = dirSelect ? dirSelect.value : 'fatihah_to_nas';

        const activeDays = [];
        document.querySelectorAll('#unifActiveDaysGrid .unif-day-btn.active').forEach(b => {
          activeDays.push(parseInt(b.dataset.day, 10));
        });

        const userProfile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: memType,
            value: memVal,
            direction: sDir
          },
          currentTarget: {
            surahId: sId,
            page: sPage,
            status: sStatus,
            currentVerse: curVerse
          },
          schedule: {
            dailyNewAmount: parseFloat(dailyNewSelect.value) || 1,
            activeDays: activeDays.length ? activeDays : [0, 1, 2, 3],
            consolidationDay: parseInt(consDaySelect.value, 10),
            revisionCycleDays: parseInt(cycleDaysSelect.value, 10) || 10
          },
          completedAt: new Date().toISOString()
        };

        // حفظ في LocalStorage
        try {
          localStorage.setItem('tibyan_user_profile', JSON.stringify(userProfile));
          if (window.quranStorage && window.quranStorage.uid) {
            localStorage.setItem('tibyan_user_profile_' + window.quranStorage.uid, JSON.stringify(userProfile));
          }
          localStorage.setItem('tibyan_mushaf_page', String(sPage));
        } catch (e) {
          console.error(e);
        }

        // تطبيق الخطة وإعادة بناء الجداول بالكامل
        if (typeof window.applyProfileToAppState === 'function') {
          window.applyProfileToAppState(userProfile);
        }

        showToast('تم حفظ الخطة وإعادة بناء جداول المراجعة والأرباع بنجاح 🌿');
        hideSettingsSubpages();
      });
    }
  }
`;

// Insert initUnifiedPlanSettings in app.js and wire up openUnifiedPlanSettingsBtn
const navAnchor = "    // 7. Settings Sub-pages Navigation";
const newNavLogic = `    // 7. Settings Sub-pages Navigation
    const openUnifiedPlanBtn = document.getElementById('openUnifiedPlanSettingsBtn');
    const backUnifiedPlanBtn = document.getElementById('backFromUnifiedPlanBtn');

    if (openUnifiedPlanBtn) {
      openUnifiedPlanBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsUnifiedPlanSubpage');
        if (typeof window.populateUnifiedPlanForm === 'function') {
          window.populateUnifiedPlanForm();
        }
      });
    }
    if (backUnifiedPlanBtn) {
      backUnifiedPlanBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }
`;

appJs = appJs.replace(navAnchor, newNavLogic);

// Add initUnifiedPlanSettings call inside attachEventListeners
const attachEndTarget = "    // Initial populate of settings form\n    populateSettingsForm();";
const attachEndReplacement = "    // Initial populate of settings form\n    populateSettingsForm();\n    initUnifiedPlanSettings();";

if (appJs.includes(attachEndTarget)) {
  appJs = appJs.replace(attachEndTarget, attachEndReplacement);
} else {
  // alternative location
  appJs = appJs.replace("populateSettingsForm();", "populateSettingsForm();\n    initUnifiedPlanSettings();");
}

// Append module code before closing of IIFE
const iifeClose = "})();";
appJs = appJs.substring(0, appJs.lastIndexOf(iifeClose)) + unifiedPlanHandlers + "\n" + iifeClose + "\n";

fs.writeFileSync('js/app.js', appJs, 'utf8');
console.log('Successfully updated app.js with unified plan settings logic!');

