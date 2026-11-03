// Firebase Auth (Google) + Firestore sync لمنصة سراج
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
    this.lastSyncTime = null;
    this.isSyncing = false;
  }

  get storageKey() {
    return (this.uid && this.uid !== 'guest_user') ? `${this.LEGACY_KEY}_${this.uid}` : this.LEGACY_KEY;
  }

  _getTimestampMs(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds !== undefined) return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1e6) : 0);
    if (val instanceof Date) return val.getTime();
    const parsed = Date.parse(val);
    return isNaN(parsed) ? 0 : parsed;
  }

  _emitSyncStatus(status, detail) {
    try {
      window.dispatchEvent(new CustomEvent('seraj:sync-status', {
        detail: { status, detail, lastSyncTime: this.lastSyncTime }
      }));
    } catch (_) { }
  }

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
    return () => { };
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
        if (!raw && this.uid && this.uid !== 'guest_user') {
          // ترحيل بيانات ما قبل تسجيل الدخول إذا لم تكن هناك بيانات سابقة للحساب
          raw = localStorage.getItem(this.LEGACY_KEY);
          if (raw) {
            localStorage.setItem(this.storageKey, raw);
          }
        }
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('Could not read localStorage:', e);
      return null;
    }
  }

  saveLocalData(data) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('Could not save to localStorage:', e);
    }
  }

  // ---------- المزامنة السحابية ----------
  startSync(user) {
    this.uid = user ? user.uid : null;
  }

  stopSync() {
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
      this.unsubscribeListener = null;
    }
    this.uid = null;
    this._emitSyncStatus('offline');
  }

  beginRealtime() {
    if (!this.firestore || !this.uid || this.uid === 'guest_user') return;
    if (this.unsubscribeListener) {
      this.unsubscribeListener();
      this.unsubscribeListener = null;
    }
    const docRef = this.firestore.collection('quran_trackers').doc(this.uid);
    this.unsubscribeListener = docRef.onSnapshot((doc) => {
      const local = this.getLocalData();
      if (!doc.exists) {
        if (local) this.pushToCloud(local);
        return;
      }
      const cloud = doc.data();
        if (!cloud) return;
        const cloudPayload = cloud.payload || cloud;
        const cloudTime = this._getTimestampMs(cloud.updatedAt || (cloudPayload && cloudPayload.updatedAt));
        const localTime = this._getTimestampMs(local && local.updatedAt);

        if (cloudPayload && (!local || !localTime || cloudTime > localTime)) {
          this.saveLocalData(cloudPayload);
          this.lastSyncTime = cloudTime || Date.now();
          if (this.onCloudUpdateCallback) {
            this.onCloudUpdateCallback(cloudPayload);
          }
          this._emitSyncStatus('synced');
        } else if (local && localTime > cloudTime) {
          // التعديلات المحلية على هذا الجهاز أحدث، نرفعها للسحابة فوراً لتحديث الأجهزة الأخرى
          this.pushToCloud(local);
        }
  }, (error) => {
    console.warn('Realtime listener error:', error);
    this._emitSyncStatus('error', error.message);
  });
  }

  async pushToCloud(data) {
  if (!this.firestore || !this.uid || this.uid === 'guest_user') return { cloud: false };
  try {
    this._emitSyncStatus('syncing');
    // تطهير البيانات من أي قيم undefined لمنع أخطاء فايرستور
    const cleanData = JSON.parse(JSON.stringify(data));
    const now = Date.now();
    cleanData.updatedAt = cleanData.updatedAt || now;

    await this.firestore.collection('quran_trackers').doc(this.uid).set({
        userId: this.uid,
      updatedAt: cleanData.updatedAt,
      payload: cleanData
    }, { merge: true });

    this.lastSyncTime = cleanData.updatedAt;
    this._emitSyncStatus('synced');
    return { cloud: true };
} catch (e) {
  console.error('Failed to sync to cloud:', e);
  this._emitSyncStatus('error', e.message);
  return { cloud: false, error: e.message };
}
  }

  async syncWithCloud(force = false) {
  if (!this.firestore || !this.uid || this.uid === 'guest_user') {
    return { success: false, message: 'غير مسجل الدخول بسحابة سراج' };
  }
  if (this.isSyncing) return { success: true, message: 'المزامنة جارية بالفعل' };
  this.isSyncing = true;
  try {
    this._emitSyncStatus('syncing');
    const docRef = this.firestore.collection('quran_trackers').doc(this.uid);
    const doc = await docRef.get({ source: 'server' });
    const local = this.getLocalData();

    if (!doc.exists) {
      if (local) await this.pushToCloud(local);
      this.isSyncing = false;
      return { success: true, updated: false, message: 'تم رفع البيانات المحلية إلى السحابة بنجاح' };
    }

    const cloud = doc.data();
    if (!cloud) {
      this.isSyncing = false;
      return { success: false, message: 'لا توجد بيانات محفوظة في السحابة' };
    }

    const cloudPayload = cloud.payload || cloud;
    const cloudTime = this._getTimestampMs(cloud.updatedAt || (cloudPayload && cloudPayload.updatedAt));
    const localTime = this._getTimestampMs(local && local.updatedAt);

    if (force || !local || !localTime || cloudTime >= localTime) {
      this.saveLocalData(cloudPayload);
      this.lastSyncTime = cloudTime || Date.now();
      if (this.onCloudUpdateCallback) {
        this.onCloudUpdateCallback(cloudPayload);
      }
      this._emitSyncStatus('synced');
      this.isSyncing = false;
      return { success: true, updated: true, message: 'تم تحديث واسترجاع أحدث بياناتك من السحابة بنجاح' };
    } else {
      await this.pushToCloud(local);
      this.isSyncing = false;
      return { success: true, updated: false, message: 'بيانات الجهاز محدثة، وتمت مزامنتها مع السحابة' };
    }
  } catch (e) {
    console.error('Manual sync error:', e);
    this._emitSyncStatus('error', e.message);
    this.isSyncing = false;
    return { success: false, error: e.message, message: 'تعذر الاتصال بالسحابة: ' + (e.message || 'خطأ في الشبكة') };
  }
}

  async saveData(data) {
  if (!data) return { success: false };
  data.updatedAt = Date.now();
  this.saveLocalData(data);
  if (!this.uid || this.uid === 'guest_user') return { success: true, cloud: false };
  const r = await this.pushToCloud(data);
  return { success: true, ...r };
}
}

window.quranStorage = new QuranStorageService();
