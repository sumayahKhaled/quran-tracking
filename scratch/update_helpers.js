const fs = require('fs');

let code = fs.readFileSync('js/app.js', 'utf8');

// Replace isTathbeetActive with enhanced version
const oldHelperRegex = /\/\/ دالة فحص موحدة وشاملة لما إذا كانت السورة الحالية في مرحلة التثبيت بالأرباع[\s\S]*?window\.isTathbeetActive = isTathbeetActive;/;

const newHelper = `// دالة فحص موحدة وشاملة لما إذا كانت السورة الحالية في مرحلة التثبيت بالأرباع
  function isTathbeetActive() {
    if (!AppState.surahConfig) {
      AppState.surahConfig = defaultSurahConfig();
    }
    const config = AppState.surahConfig;

    // 1. فحص الحالة في AppState مباشرة
    if (config.status === 'ready_for_tathbeet') return true;

    // 2. فحص السورة النشطة للتثبيت المخزنة في LocalStorage
    const savedActiveSurah = localStorage.getItem('seraj_active_tathbeet_surah');
    if (savedActiveSurah) {
      config.name = savedActiveSurah;
      config.status = 'ready_for_tathbeet';
      let sObj = null;
      if (typeof QURAN_SURAHS !== 'undefined') sObj = QURAN_SURAHS.find(s => s.name === savedActiveSurah);
      if (!sObj && window.QURAN_SURAHS) sObj = window.QURAN_SURAHS.find(s => s.name === savedActiveSurah);
      if (sObj) {
        config.totalVerses = sObj.verses;
        config.currentVerse = sObj.verses;
      }
      return true;
    }

    // 3. فحص الملف الشخصي tibyan_user_profile
    try {
      const profStr = localStorage.getItem('tibyan_user_profile');
      if (profStr) {
        const prof = JSON.parse(profStr);
        if (prof && prof.currentTarget && prof.currentTarget.status === 'ready_for_tathbeet') {
          let sObj = null;
          if (typeof QURAN_SURAHS !== 'undefined') sObj = QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (!sObj && window.QURAN_SURAHS) sObj = window.QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (sObj) {
            config.name = sObj.name;
            config.totalVerses = sObj.verses;
            config.currentVerse = sObj.verses;
            config.status = 'ready_for_tathbeet';
            localStorage.setItem('seraj_active_tathbeet_surah', sObj.name);
            localStorage.setItem('seraj_tathbeet_mode', 'true');
            return true;
          }
        }
      }
    } catch (_) {}

    // 4. فحص وضع التثبيت العام
    if (localStorage.getItem('seraj_tathbeet_mode') === 'true') {
      config.status = 'ready_for_tathbeet';
      return true;
    }

    return false;
  }
  window.isTathbeetActive = isTathbeetActive;`;

code = code.replace(oldHelperRegex, newHelper);

// Export renderAll, renderSurahCard, renderDynamicVisibility, renderDailyChecklist
const oldRenderReportsExport = `  window.renderReports = renderReports;`;
const newRenderExports = `  window.renderReports = renderReports;
  window.renderAll = renderAll;
  window.renderSurahCard = renderSurahCard;
  window.renderDynamicVisibility = renderDynamicVisibility;
  window.renderDailyChecklist = renderDailyChecklist;`;

code = code.replace(oldRenderReportsExport, newRenderExports);

fs.writeFileSync('js/app.js', code, 'utf8');
console.log('Successfully updated js/app.js with enhanced isTathbeetActive and render exports!');
