// Firebase Auth (Google) + Firestore sync لمنصة تبيان
// البيانات تُحفظ محلياً لكل حساب على حدة، وتتزامن مع Cloud Firestore.

const DIRECT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyC5BN-rpq5v0Qcj8N_YxYiUBIWhCdT6iww",
  authDomain: "quran-tracking-14e6f.firebaseapp.com",
  projectId: "quran-tracking-14e6f",
  storageBucket: "quran-tracking-14e6f.firebasestorage.app",
  messagingSenderId: "241929105660",
  appId: "1:241929105660:web:67026356f228e941cfe779",
  measurementId: "G-YNQYSQWP9K"
};

class QuranStorageService {
  constructor() {
    this.LEGACY_KEY = 'quran_memorization_data_v1';
    this.uid = null;
    this.auth = null;
    this.firestore = null;
    this.isCloudConnected = false;
    this.unsubscribeListener = null;
    this.onCloudUpdateCallback = null;
  }

  get storageKey() { return this.uid ? `${this.LEGACY_KEY}_${this.uid}` : this.LEGACY_KEY; }

  loadScript(src) {
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.getAttribute('data-loaded') === 'true') return resolve(true);
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', () => resolve(false), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.setAttribute('data-loaded', 'true'); resolve(true); };
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async ensureFirebaseLoaded() {
    const CDN_BASE = 'https://www.gstatic.com/firebasejs/10.8.0';
    if (typeof firebase === 'undefined') {
      await this.loadScript(`${CDN_BASE}/firebase-app-compat.js`);
    }
    if (typeof firebase !== 'undefined' && typeof firebase.auth !== 'function') {
      await this.loadScript(`${CDN_BASE}/firebase-auth-compat.js`);
    }
    if (typeof firebase !== 'undefined' && typeof firebase.firestore !== 'function') {
      await this.loadScript(`${CDN_BASE}/firebase-firestore-compat.js`);
    }
  }

  async initFirebase() {
    try {
      if (typeof firebase === 'undefined' || typeof firebase.auth !== 'function') {
        await this.ensureFirebaseLoaded();
      }
      if (typeof firebase === 'undefined') {
        return { success: false, message: 'مكتبة فايربيس غير متوفرة. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.' };
      }
      if (typeof firebase.auth !== 'function') {
        return { success: false, message: 'تعذر تحميل مكتبة تسجيل الدخول. تحقق من الاتصال بالإنترنت ثم أعد المحاولة.' };
      }
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(DIRECT_FIREBASE_CONFIG);
      }
      this.auth = firebase.auth();
      this.firestore = typeof firebase.firestore === 'function' ? firebase.firestore() : null;
      this.isCloudConnected = true;
      return { success: true };
    } catch (err) {
      console.error('Firebase init error:', err);
      return { success: false, message: 'خطأ في الاتصال بفايربيس: ' + (err.message || err) };
    }
  }

  // ---------- المصادقة ----------
  onAuthChanged(cb) {
    if (this.auth && typeof this.auth.onAuthStateChanged === 'function') {
      return this.auth.onAuthStateChanged(cb);
    }
    return () => {};
  }

  async signInWithGoogle() {
    if (!this.auth) {
      const init = await this.initFirebase();
      if (!init.success || !this.auth) {
        throw new Error(init.message || 'تعذر الاتصال بخدمة تسجيل الدخول، تحقق من اتصالك بالإنترنت ثم أعد المحاولة');
      }
    }
    if (typeof firebase === 'undefined' || !firebase.auth || typeof firebase.auth.GoogleAuthProvider !== 'function') {
      throw new Error('مكتبة تسجيل الدخول غير متوفرة حالياً، يرجى تحديث الصفحة والمحاولة مجدداً');
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await this.auth.signInWithPopup(provider);
      return { user: result.user, isNewUser: !!(result.additionalUserInfo && result.additionalUserInfo.isNewUser) };
    } catch (err) {
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        await this.auth.signInWithRedirect(provider); // يعمل في التطبيق المثبّت (PWA)
        return { redirecting: true };
      }
      throw err;
    }
  }

  async signOut() {
    this.stopSync();
    if (this.auth && typeof this.auth.signOut === 'function') {
      await this.auth.signOut();
    }
  }

  // ---------- التخزين المحلي (لكل مستخدم) ----------
  getLocalData() {
    try {
      let raw = localStorage.getItem(this.storageKey);
      if (!raw) { // ترحيل بيانات ما قبل تسجيل الدخول مرة واحدة
        raw = localStorage.getItem(this.LEGACY_KEY);
        if (raw) { localStorage.setItem(this.storageKey, raw); localStorage.removeItem(this.LEGACY_KEY); }
      }
      return raw ? JSON.parse(raw) : null;
    } catch (e) { console.warn('Could not read localStorage:', e); return null; }
  }

  saveLocalData(data) {
    try { localStorage.setItem(this.storageKey, JSON.stringify(data)); }
    catch (e) { console.error('Could not save to localStorage:', e); }
  }

  // ---------- المزامنة السحابية ----------
  startSync(user) { this.uid = user.uid; }

  stopSync() {
    if (this.unsubscribeListener) { this.unsubscribeListener(); this.unsubscribeListener = null; }
    this.uid = null;
  }

  beginRealtime() {
    if (!this.firestore || !this.uid) return;
    if (this.unsubscribeListener) this.unsubscribeListener();
    const docRef = this.firestore.collection('quran_trackers').doc(this.uid);
    this.unsubscribeListener = docRef.onSnapshot((doc) => {
      const local = this.getLocalData();
      if (!doc.exists) { if (local) this.pushToCloud(local); return; } // حساب جديد: ارفع البيانات المحلية
      const cloud = doc.data();
      if (cloud && cloud.payload && (!local || (cloud.updatedAt && (!local.updatedAt || cloud.updatedAt > local.updatedAt)))) {
        this.saveLocalData(cloud.payload);
        if (this.onCloudUpdateCallback) this.onCloudUpdateCallback(cloud.payload);
      }
    }, (error) => console.warn('Realtime listener error:', error));
  }

  async pushToCloud(data) {
    if (!this.firestore || !this.uid) return { cloud: false };
    try {
      await this.firestore.collection('quran_trackers').doc(this.uid).set({
        userId: this.uid, updatedAt: data.updatedAt || Date.now(), payload: data
      }, { merge: true });
      return { cloud: true };
    } catch (e) { console.error('Failed to sync to cloud:', e); return { cloud: false, error: e.message }; }
  }

  async saveData(data) {
    if (!data) return { success: false };
    data.updatedAt = Date.now();
    this.saveLocalData(data);
    if (!this.uid) return { success: true, cloud: false };
    const r = await this.pushToCloud(data);
    return { success: true, ...r };
  }
}

window.quranStorage = new QuranStorageService();
