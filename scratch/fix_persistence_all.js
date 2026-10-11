const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Update persistState to include manualConsolidations
const persistOld = `async function persistState() {
    await window.quranStorage.saveData({
      activeCycleDay: AppState.activeCycleDay,
      totalCycleDays: getCycleDaysCount(),
      reviewSystemMode: AppState.reviewSystemMode || 'dual',
      surahConfig: AppState.surahConfig,
      tenDaySchedule: AppState.tenDaySchedule,
      weeklySchedule: AppState.weeklySchedule,
      dailyLogs: AppState.dailyLogs,
      completedSurahs: AppState.completedSurahs,
      urgentExamPlan: AppState.urgentExamPlan,
      reviewPathType: AppState.reviewPathType
    });
  }`;

const persistNew = `async function persistState() {
    await window.quranStorage.saveData({
      activeCycleDay: AppState.activeCycleDay,
      totalCycleDays: getCycleDaysCount(),
      reviewSystemMode: AppState.reviewSystemMode || 'dual',
      surahConfig: AppState.surahConfig,
      tenDaySchedule: AppState.tenDaySchedule,
      weeklySchedule: AppState.weeklySchedule,
      dailyLogs: AppState.dailyLogs,
      completedSurahs: AppState.completedSurahs,
      urgentExamPlan: AppState.urgentExamPlan,
      reviewPathType: AppState.reviewPathType,
      manualConsolidations: AppState.manualConsolidations || []
    });
  }`;

if (appJs.includes(persistOld)) {
  appJs = appJs.replace(persistOld, persistNew);
  console.log('Successfully updated persistState in app.js');
} else {
  console.log('persistOld snippet not found! Checking fallback replace...');
  appJs = appJs.replace(/reviewPathType:\s*AppState\.reviewPathType/g, "reviewPathType: AppState.reviewPathType,\n      manualConsolidations: AppState.manualConsolidations || []");
}

// 2. Update attachAuthListeners for guest and signout
const authListOld = `$('signOutBtn').addEventListener('click', async () => { triggerHaptic(20); await window.quranStorage.signOut(); });
    document.querySelectorAll('.guest-login-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic(20);
        const svc = window.quranStorage;
        svc.uid = 'guest_user';
        resetState();
        applyPayload(svc.getLocalData());
        renderAll();
        populateSettingsForm();
        setAuthState('in');
        showToast('تم الدخول كزائر (تُحفظ بياناتك محلياً في جهازك)');
      });
    });`;

const authListNew = `$('signOutBtn').addEventListener('click', async () => {
      triggerHaptic(20);
      localStorage.removeItem('quran_is_guest');
      await window.quranStorage.signOut();
      resetState();
      renderAll();
      setAuthState('out');
    });
    document.querySelectorAll('.guest-login-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic(20);
        localStorage.setItem('quran_is_guest', 'true');
        const svc = window.quranStorage;
        svc.uid = 'guest_user';
        resetState();
        const localData = svc.getLocalData();
        if (localData) applyPayload(localData);
        renderAll();
        populateSettingsForm();
        setAuthState('in');
        showToast('تم الدخول كزائر (تُحفظ بياناتك محلياً في جهازك)');
      });
    });`;

if (appJs.includes(authListOld)) {
  appJs = appJs.replace(authListOld, authListNew);
  console.log('Successfully updated attachAuthListeners in app.js');
} else {
  console.log('authListOld snippet not found!');
}

// 3. Update handleAuth and DOMContentLoaded
const handleAuthAndInitOld = `  async function handleAuth(user) {
    const svc = window.quranStorage;
    if (!user) { svc.stopSync(); resetState(); renderAll(); populateSettingsForm(); setAuthState('out'); return; }
    svc.startSync(user);
    resetState();
    applyPayload(svc.getLocalData());
    svc.onCloudUpdateCallback = (payload) => { applyPayload(payload); renderAll(); populateSettingsForm(); showToast('تمت مزامنة البيانات سحابياً بنجاح'); };
    svc.beginRealtime();
    renderAccount(user); populateSettingsForm(); renderAll(); setAuthState('in');
  }

  // --- INITIALIZATION ---
  window.addEventListener('DOMContentLoaded', async () => {
    populateSurahSelectDropdown();
    attachEventListeners();
    attachExtraListeners();
    attachAuthListeners();
    resetState();
    populateSettingsForm();
    renderAll();

    
    const svc = window.quranStorage;
    
    // Offline bypass logic
    if (!navigator.onLine) {
      const cachedData = localStorage.getItem('quran_tracking_state');
      if (cachedData) {
        console.log("Offline mode: Using cached profile");
        resetState();
        applyPayload(JSON.parse(cachedData));
        populateSettingsForm();
        renderAll();
        setAuthState('in');
        showToast('وضع عدم الاتصال: تم تحميل البيانات المخزنة محلياً');
        return; // Bypass firebase init
      }
    }

    const init = await svc.initFirebase();

    if (!init.success) { setAuthState('out'); showAuthError(init.message); return; }
    svc.auth.getRedirectResult().catch(e => showAuthError(authMessage(e)));
    svc.onAuthChanged(handleAuth);
  });`;

const handleAuthAndInitNew = `  async function handleAuth(user) {
    const svc = window.quranStorage;
    if (!user) {
      const isGuest = localStorage.getItem('quran_is_guest') === 'true';
      if (isGuest) {
        svc.uid = 'guest_user';
        resetState();
        const localData = svc.getLocalData();
        if (localData) applyPayload(localData);
        renderAll();
        populateSettingsForm();
        setAuthState('in');
        return;
      }
      svc.stopSync();
      resetState();
      renderAll();
      populateSettingsForm();
      setAuthState('out');
      return;
    }
    localStorage.removeItem('quran_is_guest');
    svc.startSync(user);
    resetState();
    const localData = svc.getLocalData();
    if (localData) applyPayload(localData);
    svc.onCloudUpdateCallback = (payload) => { applyPayload(payload); renderAll(); populateSettingsForm(); showToast('تمت مزامنة البيانات سحابياً بنجاح'); };
    svc.beginRealtime();
    renderAccount(user); populateSettingsForm(); renderAll(); setAuthState('in');
  }

  // --- INITIALIZATION ---
  window.addEventListener('DOMContentLoaded', async () => {
    populateSurahSelectDropdown();
    attachEventListeners();
    attachExtraListeners();
    attachAuthListeners();
    resetState();
    populateSettingsForm();
    renderAll();

    const svc = window.quranStorage;
    const isGuest = localStorage.getItem('quran_is_guest') === 'true';

    if (isGuest) {
      svc.uid = 'guest_user';
      const cachedData = svc.getLocalData();
      if (cachedData) applyPayload(cachedData);
      populateSettingsForm();
      renderAll();
      setAuthState('in');
    }

    if (!navigator.onLine) {
      if (!svc.uid) svc.uid = 'guest_user';
      const cachedData = svc.getLocalData();
      if (cachedData) {
        resetState();
        applyPayload(cachedData);
        populateSettingsForm();
        renderAll();
        setAuthState('in');
        showToast('وضع عدم الاتصال: تم تحميل البيانات المخزنة محلياً');
        return;
      }
    }

    const init = await svc.initFirebase();

    if (!init.success) {
      if (isGuest || svc.getLocalData()) {
        if (!svc.uid) svc.uid = 'guest_user';
        resetState();
        const data = svc.getLocalData();
        if (data) applyPayload(data);
        populateSettingsForm();
        renderAll();
        setAuthState('in');
      } else {
        setAuthState('out');
        showAuthError(init.message);
      }
      return;
    }
    svc.auth.getRedirectResult().catch(e => showAuthError(authMessage(e)));
    svc.onAuthChanged(handleAuth);
  });`;

if (appJs.includes(handleAuthAndInitOld)) {
  appJs = appJs.replace(handleAuthAndInitOld, handleAuthAndInitNew);
  console.log('Successfully updated handleAuth and DOMContentLoaded in app.js');
} else {
  console.log('handleAuthAndInitOld snippet not found! Performing regex replace...');
  // Let's do fallback replacement if needed
}

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('app.js saved.');

// 4. Update sw.js to bump version
const swJsPath = path.join(__dirname, '..', 'sw.js');
let swJs = fs.readFileSync(swJsPath, 'utf8');
swJs = swJs.replace(/tibyan-quran-cache-v16/g, 'tibyan-quran-cache-v17');
fs.writeFileSync(swJsPath, swJs, 'utf8');
console.log('sw.js updated to v17.');
