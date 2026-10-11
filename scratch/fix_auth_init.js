const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
let content = fs.readFileSync(appJsPath, 'utf8');

// Replace attachAuthListeners block
const oldAuthListeners = `  function attachAuthListeners() {
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
    $('googleSignInBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('googleSignUpBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('signOutBtn').addEventListener('click', async () => { triggerHaptic(20); await window.quranStorage.signOut(); });
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
    });
  }`;

const newAuthListeners = `  function attachAuthListeners() {
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
    $('googleSignInBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('googleSignUpBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('signOutBtn').addEventListener('click', async () => {
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
    });
  }`;

// Normalize line endings to \n for matching
let normalized = content.replace(/\r\n/g, '\n');
let normOldAuth = oldAuthListeners.replace(/\r\n/g, '\n');

if (normalized.includes(normOldAuth)) {
  normalized = normalized.replace(normOldAuth, newAuthListeners.replace(/\r\n/g, '\n'));
  console.log('attachAuthListeners replaced successfully.');
} else {
  console.log('Failed to match attachAuthListeners.');
}

// Replace handleAuth and DOMContentLoaded
const oldInit = `  async function handleAuth(user) {
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

const newInit = `  async function handleAuth(user) {
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

let normOldInit = oldInit.replace(/\r\n/g, '\n');
if (normalized.includes(normOldInit)) {
  normalized = normalized.replace(normOldInit, newInit.replace(/\r\n/g, '\n'));
  console.log('handleAuth and DOMContentLoaded replaced successfully.');
} else {
  console.log('Failed to match handleAuth and DOMContentLoaded.');
}

fs.writeFileSync(appJsPath, normalized, 'utf8');
console.log('Saved app.js successfully.');
