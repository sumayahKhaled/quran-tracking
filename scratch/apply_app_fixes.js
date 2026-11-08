const fs = require('fs');

let code = fs.readFileSync('js/app.js', 'utf8');

// 1. isTathbeetActive definition
const tathbeetActiveHelper = `
  // دالة فحص موحدة وشاملة لما إذا كانت السورة الحالية في مرحلة التثبيت بالأرباع
  function isTathbeetActive() {
    const config = AppState.surahConfig;
    if (!config) return false;

    // 1. فحص الحالة في AppState مباشرة
    if (config.status === 'ready_for_tathbeet') return true;

    // 2. فحص السورة النشطة للتثبيت المخزنة في LocalStorage
    const savedActiveSurah = localStorage.getItem('seraj_active_tathbeet_surah');
    if (savedActiveSurah && savedActiveSurah === config.name) {
      config.status = 'ready_for_tathbeet';
      return true;
    }

    // 3. فحص وضع التثبيت العام
    if (localStorage.getItem('seraj_tathbeet_mode') === 'true' && (!savedActiveSurah || savedActiveSurah === config.name)) {
      config.status = 'ready_for_tathbeet';
      return true;
    }

    // 4. فحص الملف الشخصي tibyan_user_profile
    try {
      const profStr = localStorage.getItem('tibyan_user_profile');
      if (profStr) {
        const prof = JSON.parse(profStr);
        if (prof && prof.currentTarget && prof.currentTarget.status === 'ready_for_tathbeet') {
          let sObj = null;
          if (typeof QURAN_SURAHS !== 'undefined') sObj = QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (!sObj && window.QURAN_SURAHS) sObj = window.QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (sObj && sObj.name === config.name) {
            config.status = 'ready_for_tathbeet';
            return true;
          }
        }
      }
    } catch (_) {}

    return false;
  }
  window.isTathbeetActive = isTathbeetActive;
`;

// Insert isTathbeetActive before getSurahTathbeetProgress
if (!code.includes('function isTathbeetActive()')) {
  code = code.replace('  // دالة حساب تقدم التثبيت بالأرباع للسورة المحددة بدقة', tathbeetActiveHelper + '\n  // دالة حساب تقدم التثبيت بالأرباع للسورة المحددة بدقة');
}

// 2. Update calculateDailyProgress to use isTathbeetActive()
code = code.replace(
  "const isUnderTathbeet = (AppState.surahConfig && AppState.surahConfig.status === 'ready_for_tathbeet');",
  "const isUnderTathbeet = isTathbeetActive();"
);

// 3. Update renderSurahCard
const targetRenderCard = `    const isInTathbeet = (config && config.status === 'ready_for_tathbeet');

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
    }`;

const newRenderCard = `    const isInTathbeet = isTathbeetActive();
    document.body.classList.toggle('tathbeet-active-mode', isInTathbeet);

    if (isInTathbeet) {
      // السورة في مرحلة التثبيت: يظهر عنوان "تثبيت سورة كذا" ونسبة تقدم التثبيت بالأرباع
      const tProg = getSurahTathbeetProgress(config.name);
      if (typeLabelEl) typeLabelEl.textContent = 'مرحلة التثبيت والتمكين';
      nameEl.textContent = \`تثبيت سورة \${config.name || 'الأنفال'}\`;
      percentEl.textContent = \`\${tProg.percent}%\`;
      ratioEl.textContent = \`\${tProg.completedQuarters} من \${tProg.totalQuarters} أرباع مكتملة\`;
      fillEl.style.width = \`\${tProg.percent}%\`;
      statusTextEl.innerHTML = \`تم إتقان <strong>\${tProg.completedQuarters}</strong> من <strong>\${tProg.totalQuarters}</strong> أرباع بالأرباع والتكرار\`;

      // إخفاء أزرار زيادة الآيات تماماً أثناء مرحلة التثبيت
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
    }`;

code = code.replace(targetRenderCard, newRenderCard);

// 4. Update renderDynamicVisibility
const targetDyn = `    // قسم الحفظ الجديد: يتم إخفاؤه تماماً طالما المستخدم في مرحلة التثبيت
    const secNew = document.getElementById('sectionNewMemoCard');
    const isSurahInTathbeet = (AppState.surahConfig && AppState.surahConfig.status === 'ready_for_tathbeet');
    if (secNew) {
      secNew.style.display = (!isSurahInTathbeet && routine.hasNew) ? 'block' : 'none';
    }`;

const newDyn = `    // قسم الحفظ الجديد: يتم إخفاؤه تماماً طالما المستخدم في مرحلة التثبيت
    const secNew = document.getElementById('sectionNewMemoCard');
    const isSurahInTathbeet = isTathbeetActive();
    if (secNew) {
      secNew.style.display = (!isSurahInTathbeet && routine.hasNew) ? 'block' : 'none';
    }

    // سرد الأوجه السابقة من السورة الحالية: يتم إخفاؤه أثناء مرحلة التثبيت لأن السورة تثبت بالكامل بالأرباع
    const prevPagesCard = document.getElementById('prevPagesCard');
    if (prevPagesCard) {
      prevPagesCard.style.display = isSurahInTathbeet ? 'none' : '';
    }`;

code = code.replace(targetDyn, newDyn);

// 5. Update renderAudioSlots to safely check window.quranRecorder
const targetAudio = `    [0, 1, 2].forEach(slotIdx => {
      const audioUrl = window.quranRecorder.getRecording(slotIdx);
      if (audioUrl) {`;

const newAudio = `    [0, 1, 2].forEach(slotIdx => {
      const audioUrl = (window.quranRecorder && typeof window.quranRecorder.getRecording === 'function') 
        ? window.quranRecorder.getRecording(slotIdx) 
        : null;
      if (audioUrl) {`;

code = code.replace(targetAudio, newAudio);

// 6. Update renderPrevSurahConsolidation to consolidate active tathbeet surah
const targetPrevCons = `  function renderPrevSurahConsolidation(log) {
    const card = document.getElementById('lastTenPagesCard');
    if (!card) return;

    const prevSurahName = getPreviousSurahName();
    const { surah, quarters } = getSurahQuarters(prevSurahName);`;

const newPrevCons = `  function renderPrevSurahConsolidation(log) {
    const card = document.getElementById('lastTenPagesCard');
    if (!card) return;

    // في مرحلة التثبيت: السورة التي تثبت بالأرباع هي سورة التثبيت نفسها (مثلاً الأنفال)
    // وفي مرحلة الحفظ العادي: السورة التي تثبت بالأرباع هي السورة السابقة (مثلاً التوبة)
    const isTathbeet = isTathbeetActive();
    const consSurahName = isTathbeet
      ? ((AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال')
      : getPreviousSurahName();
    const { surah, quarters } = getSurahQuarters(consSurahName);`;

code = code.replace(targetPrevCons, newPrevCons);

// Also replace occurrence of prevSurahName in text rendering inside renderPrevSurahConsolidation
code = code.replace(
  "if (nameEl) nameEl.textContent = prevSurahName;",
  "if (nameEl) nameEl.textContent = consSurahName;"
);
code = code.replace(
  "showToast(`تم اختيار الربع ${targetNum} من سورة ${prevSurahName}`);",
  "showToast(`تم اختيار الربع ${targetNum} من سورة ${consSurahName}`);"
);

// 7. In navigation tabs, protect settings tab from blank screen
const targetNavTab = `        const targetView = document.getElementById(tabTarget);
        if (targetView) targetView.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });`;

const newNavTab = `        const targetView = document.getElementById(tabTarget);
        if (targetView) targetView.classList.add('active');

        // إذا انتقل المستخدم لتبويب الإعدادات وكان اللوح الرئيسي مخفياً دون صفحة فرعية ظاهرة، استعد اللوح الرئيسي
        if (tabTarget === 'view-settings') {
          const visibleSubpage = document.querySelector('.settings-subpage:not([hidden])');
          if (!visibleSubpage || visibleSubpage.style.display === 'none') {
            hideSettingsSubpages();
          }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });`;

code = code.replace(targetNavTab, newNavTab);

// 8. In transitionToTathbeetStage, ensure local storage flags are set
const targetTrans = `      if (!AppState.surahConfig) AppState.surahConfig = {};
      AppState.surahConfig.status = 'ready_for_tathbeet';
      AppState.surahConfig.previousSurah = curSurahName; // تصبح الأنفال هي سورة التثبيت والربط`;

const newTrans = `      if (!AppState.surahConfig) AppState.surahConfig = {};
      AppState.surahConfig.status = 'ready_for_tathbeet';
      AppState.surahConfig.previousSurah = curSurahName; // تصبح الأنفال هي سورة التثبيت والربط
      localStorage.setItem('seraj_active_tathbeet_surah', curSurahName);
      localStorage.setItem('seraj_tathbeet_mode', 'true');`;

code = code.replace(targetTrans, newTrans);

fs.writeFileSync('js/app.js', code, 'utf8');
console.log('Successfully updated js/app.js!');
