/**
 * معالج تهيئة المستخدم الجديد (Onboarding Wizard)
 * منصة سراج لتتبع المحفوظ القرآني
 */

(function () {
  'use strict';

  const STORAGE_KEY_COMPLETED = 'seraj_onboarding_completed';
  const STORAGE_KEY_PROFILE = 'tibyan_user_profile';

  function getCurrentUserUid() {
    if (window.quranStorage && window.quranStorage.uid) {
      return window.quranStorage.uid;
    }
    const cachedUid = localStorage.getItem('quran_cached_uid');
    if (cachedUid) return cachedUid;
    if (localStorage.getItem('quran_is_guest') === 'true') return 'guest_user';
    return null;
  }

  function getProfileKey() {
    const uid = getCurrentUserUid();
    return (uid && uid !== 'guest_user') ? `${STORAGE_KEY_PROFILE}_${uid}` : STORAGE_KEY_PROFILE;
  }

  function getCompletedKey() {
    const uid = getCurrentUserUid();
    return (uid && uid !== 'guest_user') ? `${STORAGE_KEY_COMPLETED}_${uid}` : STORAGE_KEY_COMPLETED;
  }

  // حالة المعالج أثناء التنقل بين الشاشات
  const wizardData = {
    step: 0,
    name: '',
    memorization: {
      type: 'khatim', // 'khatim' | 'juz' | 'surah_range' | 'beginner'
      value: 30, // عدد الأجزاء أو { from: 1, to: 114 }
      direction: 'fatihah_to_nas' // 'nas_to_fatihah' | 'fatihah_to_nas'
    },
    currentTarget: {
      surahId: 1,
      currentVerse: 0,
      page: 1,
      status: 'new' // 'new' | 'memorizing' | 'ready_for_tathbeet'
    },
    schedule: {
      dailyNewAmount: 1, // 0.5 (نصف صفحة) | 1 (صفحة كاملة) | 2 (صفحتين) | 3 (3 صفحات)
      memoDays: [0, 1, 2, 3], // الأحد، الإثنين، الثلاثاء، الأربعاء
      revisionDays: [0, 1, 2, 3, 4], // الأحد، الإثنين، الثلاثاء، الأربعاء، الخميس
      offDays: [5, 6], // الجمعة والسبت
      revisionCycleDays: 10, // 7 | 10 | 15 | 30
      revisionAmount: 'one_juz' // 'quarter_hizb' | 'half_juz' | 'one_juz' | 'two_juz' | 'three_juz'
    }
  };

  function isCompleted() {
    const compKey = getCompletedKey();
    const profKey = getProfileKey();
    return localStorage.getItem(compKey) === 'true' ||
           !!localStorage.getItem(profKey) ||
           localStorage.getItem(STORAGE_KEY_COMPLETED) === 'true' ||
           !!localStorage.getItem(STORAGE_KEY_PROFILE);
  }

  function getSurahList() {
    if (typeof window !== 'undefined' && window.QURAN_SURAHS && window.QURAN_SURAHS.length) {
      return window.QURAN_SURAHS;
    }
    if (typeof QURAN_SURAHS !== 'undefined' && QURAN_SURAHS.length) {
      return QURAN_SURAHS;
    }
    return [];
  }

  function getAyahPage(surahId, ayahNum) {
    if (typeof window.getAyahPageNumber === 'function') {
      const p = window.getAyahPageNumber(surahId, ayahNum || 1);
      if (p) return p;
    }
    const map = (typeof QURAN_AYAH_PAGE_MAP !== 'undefined' ? QURAN_AYAH_PAGE_MAP : null) || (window.QURAN_AYAH_PAGE_MAP || null);
    if (map && map[surahId]) {
      const entries = map[surahId];
      if (ayahNum) {
        for (let i = entries.length - 1; i >= 0; i--) {
          if (ayahNum >= entries[i][0]) return entries[i][1];
        }
      }
      return entries[0] ? entries[0][1] : 1;
    }
    const s = getSurahById(surahId);
    return s ? (s.startPage || 1) : 1;
  }

  function getSurahById(id) {
    const list = getSurahList();
    return list.find(s => s.id === parseInt(id, 10)) || list[0] || { id: 1, name: 'الفاتحة', verses: 7, startPage: 1 };
  }

  // إنشاء هيكل الـ Modal في DOM
  function createModalDOM() {
    if (document.getElementById('serajOnboardingModal')) return;

    const modal = document.createElement('div');
    modal.id = 'serajOnboardingModal';
    modal.className = 'onboarding-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    modal.innerHTML = `
      <div class="onboarding-modal-card">
        <!-- شريط التقدم بين الخطوات -->
        <div class="onboarding-stepper" id="onboardingStepper">
          <div class="onboarding-step-indicator active" data-step="0"></div>
          <div class="onboarding-step-indicator" data-step="1"></div>
          <div class="onboarding-step-indicator" data-step="2"></div>
          <div class="onboarding-step-indicator" data-step="3"></div>
          <div class="onboarding-step-indicator" data-step="4"></div>
        </div>

        <div class="onboarding-body-wrapper" id="onboardingBodyWrapper">
          <!-- الشاشة 0: الترحيب والاسم -->
          <div class="onboarding-screen active" id="onbScreen0">
            <div class="onb-header-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            </div>
            <h2 class="onb-title">حياك الله في سراج</h2>
            <p class="onb-slogan">نورٌ يُثبّت صدرك، وآياتٌ لا تفلت.</p>

            <div class="onb-form-group" style="margin-top:24px;">
              <label class="onb-label" for="onbUserNameInput">اسمك الكريم</label>
              <input type="text" id="onbUserNameInput" class="onb-input" placeholder="اكتب اسمك اللي تحب نناديك فيه.." autocomplete="name" />
            </div>

            <div class="onb-footer-actions">
              <button type="button" id="onbBtnStep0Next" class="onb-btn-primary">
                <span>يا هلا، نبدأ!</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- الشاشة 1: رصيد المحفوظ السابق -->
          <div class="onboarding-screen" id="onbScreen1">
            <h2 class="onb-title">كم واصل حفظك في المصحف حالياً؟</h2>
            <p class="onb-desc">عشان نبني لك خطة تثبيت تناسب اللي في صدرك وما نشتتك.</p>

            <div class="onb-cards-select-list">
              <!-- خيار 1: خاتم المصحف -->
              <label class="onb-select-card selected" data-type="khatim">
                <input type="radio" name="onbMemType" value="khatim" checked />
                <div class="onb-card-radio-circle"></div>
                <div class="onb-card-text-block">
                  <span class="onb-card-main-title">خاتم المصحف كامل</span>
                  <span class="onb-card-sub-desc">«خاتم بحمد الله، وجاي أثبّت وأمكّن»</span>
                </div>
              </label>

              <!-- خيار 2: تحديد بعدد الأجزاء -->
              <label class="onb-select-card" data-type="juz">
                <input type="radio" name="onbMemType" value="juz" />
                <div class="onb-card-radio-circle"></div>
                <div class="onb-card-text-block">
                  <span class="onb-card-main-title">تحديد بعدد الأجزاء</span>
                  <span class="onb-card-sub-desc">«حافظ أجزاء معينة (مثلاً 5 أو 10 أجزاء)»</span>
                </div>
              </label>

              <!-- الحقل الشرطي للأجزاء: يظهر فقط عند اختيار تحديد بالأجزاء -->
              <div id="onbJuzDropdownContainer" class="onb-nested-input-row" style="display:none;">
                <label class="onb-label" for="onbJuzSelect">حدد عدد الأجزاء المحفوظة:</label>
                <select id="onbJuzSelect" class="onb-select">
                  <option value="1">جزء واحد</option>
                  <option value="2">جزئين</option>
                  <option value="3">3 أجزاء</option>
                  <option value="5">5 أجزاء</option>
                  <option value="10" selected>10 أجزاء</option>
                  <option value="15">15 جزءاً (نصف المصحف)</option>
                  <option value="20">20 جزءاً</option>
                  <option value="25">25 جزءاً</option>
                  <option value="29">29 جزءاً</option>
                </select>
              </div>

              <!-- خيار 3: تحديد من سورة إلى سورة -->
              <label class="onb-select-card" data-type="surah_range">
                <input type="radio" name="onbMemType" value="surah_range" />
                <div class="onb-card-radio-circle"></div>
                <div class="onb-card-text-block">
                  <span class="onb-card-main-title">تحديد من سورة إلى سورة</span>
                  <span class="onb-card-sub-desc">«حافظ نطاقاً محدداً بدقة من سورة كذا إلى سورة كذا»</span>
                </div>
              </label>

              <!-- الحقول الشرطية للسور: تظهر فقط عند اختيار تحديد من سورة إلى سورة -->
              <div id="onbSurahRangeContainer" class="onb-nested-input-row" style="display:none;">
                <div class="onb-two-cols">
                  <div>
                    <label class="onb-label" for="onbRangeFromSurah">من سورة:</label>
                    <select id="onbRangeFromSurah" class="onb-select"></select>
                  </div>
                  <div>
                    <label class="onb-label" for="onbRangeToSurah">إلى سورة:</label>
                    <select id="onbRangeToSurah" class="onb-select"></select>
                  </div>
                </div>
              </div>

              <!-- خيار 4: بداية الطريق من الصفر -->
              <label class="onb-select-card" data-type="beginner">
                <input type="radio" name="onbMemType" value="beginner" />
                <div class="onb-card-radio-circle"></div>
                <div class="onb-card-text-block">
                  <span class="onb-card-main-title">بداية الطريق</span>
                  <span class="onb-card-sub-desc">«توي بادئ المشوار من الصفر»</span>
                </div>
              </label>
            </div>

            <!-- مسار الحفظ المفضل (Segmented Switch) -->
            <div class="onb-form-group" style="margin-top:20px;">
              <label class="onb-label">مسار الحفظ المفضل</label>
              <div class="onb-segmented-switch">
                <button type="button" class="onb-segment-btn" data-dir="nas_to_fatihah">
                  <span>من الناس للفاتحة</span>
                  <small style="display:block;font-size:0.7rem;opacity:0.8;">(قِصار السور وتصاعدي)</small>
                </button>
                <button type="button" class="onb-segment-btn active" data-dir="fatihah_to_nas">
                  <span>من الفاتحة للناس</span>
                  <small style="display:block;font-size:0.7rem;opacity:0.8;">(من أول المصحف)</small>
                </button>
              </div>
            </div>

            <div class="onb-footer-actions">
              <button type="button" class="onb-btn-back onb-go-back" data-to="0">رجوع</button>
              <button type="button" id="onbBtnStep1Next" class="onb-btn-primary">
                <span>اللي بعده</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- الشاشة 2: المحطة الحالية والوجهة القادمة -->
          <div class="onboarding-screen" id="onbScreen2">
            <h2 class="onb-title">وين واقف بالضبط اليوم؟</h2>
            <p class="onb-desc">عشان نفتح مصحفك على مكانك بالضبط بدون ما تدور.</p>

            <div class="onb-form-group" style="margin-top:16px;">
              <label class="onb-label" for="onbTargetSurahSelect">السورة المستهدفة حالياً</label>
              <select id="onbTargetSurahSelect" class="onb-select"></select>
            </div>

            <!-- حالة هذه السورة (Radio Pills) -->
            <div class="onb-form-group">
              <label class="onb-label">حالة هذه السورة</label>
              <div class="onb-radio-pills-col">
                <label class="onb-pill-option active" data-status="new">
                  <input type="radio" name="onbSurahStatus" value="new" checked />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">سورة جديدة توي أبدأ فيها</span>
                </label>
                <label class="onb-pill-option" data-status="memorizing">
                  <input type="radio" name="onbSurahStatus" value="memorizing" />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">شغال عليها تكرار وتسميع أولي (حالياً فيها)</span>
                </label>
                <label class="onb-pill-option" data-status="ready_for_tathbeet">
                  <input type="radio" name="onbSurahStatus" value="ready_for_tathbeet" />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">خلصت حفظها وأبي أدخلها مرحلة التثبيت</span>
                </label>
              </div>
            </div>

            <!-- حقل الآية الشرطي: يظهر فقط عند اختيار "شغال عليها تكرار وتسميع أولي" -->
            <div class="onb-form-group" id="onbAyahInputGroup" style="display:none; margin-top:10px;">
              <label class="onb-label" for="onbCurrentVerseInput">الآية التي وصلت إليها في السورة (رقم فقط):</label>
              <div style="position:relative;">
                <input type="number" id="onbCurrentVerseInput" class="onb-input" min="1" placeholder="أدخل رقم الآية (مثال: 15)" />
                <span class="onb-input-badge">آية</span>
              </div>
              <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-top:4px;">حدد رقم آخر آية قمت بحفظها في هذه السورة</span>
            </div>

            <div class="onb-footer-actions">
              <button type="button" class="onb-btn-back onb-go-back" data-to="1">رجوع</button>
              <button type="button" id="onbBtnStep2Next" class="onb-btn-primary">
                <span>كمل الخطة</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- الشاشة 3: المراجعة والروتين اليومي -->
          <div class="onboarding-screen" id="onbScreen3">
            <h2 class="onb-title">كيف ودّك ترتب خطتك وروتينك؟</h2>
            <p class="onb-desc">اختر الحمل اللي تقدر تدوم عليه؛ قليل دائم خير من كثير منقطع.</p>

            <!-- القسم الثالث: المراجعة -->
            <div style="background:var(--bg-subtle, #f8fafc); border:1px solid var(--border-light, #e2e8f0); border-radius:12px; padding:14px; margin-top:14px; margin-bottom:14px;">
              <h3 style="margin:0 0 10px 0; font-size:0.95rem; font-weight:800; color:#d97706; display:flex; align-items:center; gap:6px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
                <span>المراجعة</span>
              </h3>

              <!-- دورة ختم المحفوظ -->
              <div class="onb-form-group" style="margin-bottom:12px;">
                <label class="onb-label" for="onbCycleDaysSelect">دورة ختم المحفوظ (ختم كامل المحفوظ كل):</label>
                <select id="onbCycleDaysSelect" class="onb-select">
                  <option value="7">كل 7 أيام (أسبوعياً)</option>
                  <option value="10" selected>كل 10 أيام (المقترح المتوازن)</option>
                  <option value="15">كل 15 يوماً (نصف شهر)</option>
                  <option value="30">كل 30 يوماً (شهرياً)</option>
                </select>
              </div>

              <!-- مقدار المراجعة اليومية -->
              <div class="onb-form-group" style="margin-bottom:4px;">
                <label class="onb-label" for="onbRevisionAmountSelect">مقدار المراجعة اليومية المباشر:</label>
                <select id="onbRevisionAmountSelect" class="onb-select">
                  <option value="quarter_hizb">ربع حزب (حوالي وجهين ونصف)</option>
                  <option value="half_juz">نصف جزء (حزب كامل - 10 أوجه تقريباً)</option>
                  <option value="one_juz" selected>جزء كامل يومياً (20 وجهاً)</option>
                  <option value="two_juz">جزئين يومياً (40 وجهاً)</option>
                  <option value="three_juz">3 أجزاء يومياً (للخاتمين والمتقنين)</option>
                </select>
              </div>
            </div>

            <!-- القسم الرابع: الروتين اليومي -->
            <div style="background:var(--bg-subtle, #f8fafc); border:1px solid var(--border-light, #e2e8f0); border-radius:12px; padding:14px; margin-bottom:10px;">
              <h3 style="margin:0 0 10px 0; font-size:0.95rem; font-weight:800; color:#0f3d2e; display:flex; align-items:center; gap:6px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>الروتين اليومي</span>
              </h3>

              <!-- 1. مقدار الحفظ الجديد -->
              <div class="onb-form-group" style="margin-bottom:12px;">
                <label class="onb-label">1. مقدار الحفظ الجديد:</label>
                <div class="onb-pills-row" id="onbNewAmountRow">
                  <button type="button" class="onb-chip-btn" data-val="0.5">نصف صفحة</button>
                  <button type="button" class="onb-chip-btn active" data-val="1">صفحة كاملة</button>
                  <button type="button" class="onb-chip-btn" data-val="2">صفحتان</button>
                  <button type="button" class="onb-chip-btn" data-val="3">3 صفحات</button>
                </div>
              </div>

              <!-- 2. أيام الحفظ -->
              <div class="onb-form-group" style="margin-bottom:12px;">
                <label class="onb-label">2. أيام الحفظ (أيام الحفظ والتسميع النشطة):</label>
                <div class="onb-days-chips-grid" id="onbMemoDaysGrid">
                  <button type="button" class="onb-day-chip onb-memo-day active" data-day="0">الأحد</button>
                  <button type="button" class="onb-day-chip onb-memo-day active" data-day="1">الإثنين</button>
                  <button type="button" class="onb-day-chip onb-memo-day active" data-day="2">الثلاثاء</button>
                  <button type="button" class="onb-day-chip onb-memo-day active" data-day="3">الأربعاء</button>
                  <button type="button" class="onb-day-chip onb-memo-day" data-day="4">الخميس</button>
                  <button type="button" class="onb-day-chip onb-memo-day" data-day="5">الجمعة</button>
                  <button type="button" class="onb-day-chip onb-memo-day" data-day="6">السبت</button>
                </div>
              </div>

              <!-- 3. أيام المراجعة -->
              <div class="onb-form-group" style="margin-bottom:12px;">
                <label class="onb-label">3. أيام المراجعة (تحديد الأيام التي يتم فيها مراجعة الورد):</label>
                <div class="onb-days-chips-grid" id="onbRevDaysGrid">
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day active" data-day="0">الأحد</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day active" data-day="1">الإثنين</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day active" data-day="2">الثلاثاء</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day active" data-day="3">الأربعاء</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day active" data-day="4">الخميس</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day" data-day="5">الجمعة</button>
                  <button type="button" class="onb-day-chip revision-day-chip onb-rev-day" data-day="6">السبت</button>
                </div>
              </div>

              <!-- 4. أيام الإجازة -->
              <div class="onb-form-group" style="margin-bottom:4px;">
                <label class="onb-label">4. أيام الإجازة (تحديد أيام الراحة الأسبوعية):</label>
                <div class="onb-days-chips-grid" id="onbOffDaysGrid">
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day" data-day="0">الأحد</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day" data-day="1">الإثنين</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day" data-day="2">الثلاثاء</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day" data-day="3">الأربعاء</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day" data-day="4">الخميس</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day active" data-day="5">الجمعة</button>
                  <button type="button" class="onb-day-chip off-day-chip onb-off-day active" data-day="6">السبت</button>
                </div>
              </div>
            </div>

            <div class="onb-footer-actions">
              <button type="button" class="onb-btn-back onb-go-back" data-to="2">رجوع</button>
              <button type="button" id="onbBtnStep3Next" class="onb-btn-primary">
                <span>استعرض خطتي</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- الشاشة 4: وثيقة العهد والاعتماد النهائي -->
          <div class="onboarding-screen" id="onbScreen4">
            <h2 class="onb-title" id="onbFinalWelcomeTitle">خطتك لصدرك.. جاهزة!</h2>
            <p class="onb-desc">وثيقة عهد وإتقان بنيت خصيصاً لمستواك وإيقاعك الأسبوعي.</p>

            <!-- البطاقة التفاعلية الديناميكية -->
            <div class="onb-summary-card" id="onbSummaryCard">
              <div class="onb-summary-row">
                <div class="onb-summary-item">
                  <span class="onb-sum-label">المحفوظ المعتمد</span>
                  <span class="onb-sum-val" id="sumMemTypeVal">خاتم المصحف كامل</span>
                </div>
                <div class="onb-summary-item">
                  <span class="onb-sum-label">مسار الحفظ</span>
                  <span class="onb-sum-val" id="sumDirectionVal">من الفاتحة للناس</span>
                </div>
              </div>

              <div class="onb-summary-divider"></div>

              <div class="onb-summary-row">
                <div class="onb-summary-item">
                  <span class="onb-sum-label">نقطة الانطلاق</span>
                  <span class="onb-sum-val" id="sumStartSurahVal">سورة الفاتحة</span>
                </div>
                <div class="onb-summary-item">
                  <span class="onb-sum-label">حالة المحطة</span>
                  <span class="onb-sum-val" id="sumStatusVal">سورة جديدة</span>
                </div>
              </div>

              <div class="onb-summary-divider"></div>

              <div class="onb-summary-item" style="width:100%;">
                <span class="onb-sum-label">تفصيل الورد والروتين</span>
                <ul class="onb-plan-features-list">
                  <li id="sumDailyNewItem">مقدار الحفظ: صفحة كاملة في أيام الحفظ.</li>
                  <li id="sumDaysItem">أيام النشاط: 4 أيام حفظ، 5 أيام مراجعة، ويومان راحة.</li>
                  <li id="sumCycleItem">المراجعة: ختم المحفوظ كل 10 أيام (جزء يومياً).</li>
                </ul>
              </div>

              <!-- الموعد التقديري التقريبي لإتمام الختم أو التمكين -->
              <div class="onb-eta-box" id="sumEtaBox">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;color:#10b981;flex-shrink:0;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <div class="onb-eta-text" id="sumEtaText">
                  الموعد التقديري لتمكين وإتمام المرحلة: <strong>حوالي 4 إلى 6 أشهر</strong> بالالتزام المستمر إن شاء الله.
                </div>
              </div>
            </div>

            <div class="onb-footer-actions">
              <button type="button" class="onb-btn-back onb-go-back" data-to="3">تعديل الخطة</button>
              <button type="button" id="onbBtnFinalCommit" class="onb-btn-commit">
                <span>سمّ بالله.. وافتح المصحف!</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:20px;height:20px;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setupModalInteractions();
  }

  // ربط التفاعلات في الـ DOM
  function setupModalInteractions() {
    const modal = document.getElementById('serajOnboardingModal');
    if (!modal) return;

    // ملء قوائم السور
    populateSurahDropdowns();

    // 1. الشاشة 0: الاسم
    const btnStep0 = document.getElementById('onbBtnStep0Next');
    const nameInput = document.getElementById('onbUserNameInput');
    if (btnStep0 && nameInput) {
      btnStep0.addEventListener('click', () => {
        const val = nameInput.value.trim();
        wizardData.name = val || 'يا حافظ القرآن';
        goToStep(1);
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnStep0.click();
      });
    }

    // 2. الشاشة 1: رصيد المحفوظ والمسار
    const memCards = modal.querySelectorAll('.onb-select-card');
    const juzContainer = document.getElementById('onbJuzDropdownContainer');
    const surahRangeContainer = document.getElementById('onbSurahRangeContainer');

    function updateMemInputsVisibility(type) {
      if (juzContainer) juzContainer.style.display = (type === 'juz') ? 'block' : 'none';
      if (surahRangeContainer) surahRangeContainer.style.display = (type === 'surah_range') ? 'block' : 'none';
    }

    memCards.forEach(card => {
      card.addEventListener('click', () => {
        memCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const input = card.querySelector('input');
        if (input) input.checked = true;

        const type = card.dataset.type;
        wizardData.memorization.type = type;
        updateMemInputsVisibility(type);
      });
    });

    // مسار الحفظ المفضل
    const segBtns = modal.querySelectorAll('.onb-segment-btn');
    segBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        segBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wizardData.memorization.direction = btn.dataset.dir;
      });
    });

    const btnStep1 = document.getElementById('onbBtnStep1Next');
    if (btnStep1) {
      btnStep1.addEventListener('click', () => {
        const type = wizardData.memorization.type;
        if (type === 'juz') {
          const jSel = document.getElementById('onbJuzSelect');
          wizardData.memorization.value = parseInt(jSel.value, 10) || 10;
        } else if (type === 'surah_range') {
          const fromS = parseInt(document.getElementById('onbRangeFromSurah').value, 10) || 1;
          const toS = parseInt(document.getElementById('onbRangeToSurah').value, 10) || 114;
          wizardData.memorization.value = { from: Math.min(fromS, toS), to: Math.max(fromS, toS) };
        } else if (type === 'khatim') {
          wizardData.memorization.value = 30;
        } else {
          wizardData.memorization.value = 0;
        }
        goToStep(2);
      });
    }

    // 3. الشاشة 2: المحطة الحالية
    const surahSelect = document.getElementById('onbTargetSurahSelect');
    const statusPills = modal.querySelectorAll('.onb-pill-option[data-status]');
    const ayahGroup = document.getElementById('onbAyahInputGroup');
    const ayahInput = document.getElementById('onbCurrentVerseInput');

    function updateAyahInputVisibility(status) {
      if (ayahGroup) {
        ayahGroup.style.display = (status === 'memorizing') ? 'block' : 'none';
      }
      if (surahSelect && ayahInput) {
        const sObj = getSurahById(surahSelect.value);
        if (sObj) ayahInput.max = sObj.verses;
      }
    }

    if (surahSelect) {
      surahSelect.addEventListener('change', () => {
        const sId = parseInt(surahSelect.value, 10);
        wizardData.currentTarget.surahId = sId;
        const sObj = getSurahById(sId);
        if (ayahInput && sObj) {
          ayahInput.max = sObj.verses;
        }
      });
    }

    statusPills.forEach(pill => {
      pill.addEventListener('click', () => {
        statusPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const input = pill.querySelector('input');
        if (input) input.checked = true;
        const status = pill.dataset.status;
        wizardData.currentTarget.status = status;
        updateAyahInputVisibility(status);
      });
    });

    const btnStep2 = document.getElementById('onbBtnStep2Next');
    if (btnStep2) {
      btnStep2.addEventListener('click', () => {
        const sId = parseInt(surahSelect.value, 10) || 1;
        const status = wizardData.currentTarget.status || 'new';
        let verse = 0;
        const sObj = getSurahById(sId);

        if (status === 'memorizing') {
          verse = ayahInput ? (parseInt(ayahInput.value, 10) || 1) : 1;
          if (sObj && sObj.verses) verse = Math.min(sObj.verses, Math.max(1, verse));
        } else if (status === 'ready_for_tathbeet') {
          verse = sObj ? sObj.verses : 75;
        } else {
          verse = 0;
        }

        wizardData.currentTarget.surahId = sId;
        wizardData.currentTarget.currentVerse = verse;
        wizardData.currentTarget.page = getAyahPage(sId, verse);
        goToStep(3);
      });
    }

    // 4. الشاشة 3: المراجعة والروتين اليومي
    const cycleSelect = document.getElementById('onbCycleDaysSelect');
    const revAmountSelect = document.getElementById('onbRevisionAmountSelect');

    const newAmountBtns = modal.querySelectorAll('#onbNewAmountRow .onb-chip-btn');
    newAmountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        newAmountBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wizardData.schedule.dailyNewAmount = parseFloat(btn.dataset.val) || 1;
      });
    });

    // شرائح أيام الحفظ
    const memoDayChips = modal.querySelectorAll('#onbMemoDaysGrid .onb-memo-day');
    memoDayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
      });
    });

    // شرائح أيام المراجعة
    const revDayChips = modal.querySelectorAll('#onbRevDaysGrid .onb-rev-day');
    revDayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
      });
    });

    // شرائح أيام الإجازة
    const offDayChips = modal.querySelectorAll('#onbOffDaysGrid .onb-off-day');
    offDayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
      });
    });

    const btnStep3 = document.getElementById('onbBtnStep3Next');
    if (btnStep3) {
      btnStep3.addEventListener('click', () => {
        if (cycleSelect) {
          wizardData.schedule.revisionCycleDays = parseInt(cycleSelect.value, 10) || 10;
        }
        if (revAmountSelect) {
          wizardData.schedule.revisionAmount = revAmountSelect.value || 'one_juz';
        }

        const memoDays = [];
        modal.querySelectorAll('#onbMemoDaysGrid .onb-memo-day.active').forEach(c => {
          memoDays.push(parseInt(c.dataset.day, 10));
        });
        wizardData.schedule.memoDays = memoDays.length ? memoDays : [0, 1, 2, 3];

        const revDays = [];
        modal.querySelectorAll('#onbRevDaysGrid .onb-rev-day.active').forEach(c => {
          revDays.push(parseInt(c.dataset.day, 10));
        });
        wizardData.schedule.revisionDays = revDays.length ? revDays : [0, 1, 2, 3, 4];

        const offDays = [];
        modal.querySelectorAll('#onbOffDaysGrid .onb-off-day.active').forEach(c => {
          offDays.push(parseInt(c.dataset.day, 10));
        });
        wizardData.schedule.offDays = offDays.length ? offDays : [5, 6];

        buildSummaryScreen();
        goToStep(4);
      });
    }

    // أزرار الرجوع بين الشاشات
    const backBtns = modal.querySelectorAll('.onb-go-back');
    backBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const to = parseInt(btn.dataset.to, 10);
        goToStep(to);
      });
    });

    // 5. الشاشة 4: الاعتماد النهائي
    const btnCommit = document.getElementById('onbBtnFinalCommit');
    if (btnCommit) {
      btnCommit.addEventListener('click', () => {
        commitUserProfile();
      });
    }
  }

  function populateSurahDropdowns() {
    const list = getSurahList();
    const targetSel = document.getElementById('onbTargetSurahSelect');
    const rangeFrom = document.getElementById('onbRangeFromSurah');
    const rangeTo = document.getElementById('onbRangeToSurah');

    if (!list || !list.length) return;

    if (targetSel && targetSel.children.length === 0) {
      list.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية)`;
        targetSel.appendChild(opt);
      });
      targetSel.value = '1';
    }

    if (rangeFrom && rangeFrom.children.length === 0) {
      list.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id}. ${s.name}`;
        rangeFrom.appendChild(opt);
      });
      rangeFrom.value = '1';
    }

    if (rangeTo && rangeTo.children.length === 0) {
      list.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id}. ${s.name}`;
        rangeTo.appendChild(opt);
      });
      rangeTo.value = '114';
    }
  }

  function goToStep(stepNumber) {
    wizardData.step = stepNumber;
    const modal = document.getElementById('serajOnboardingModal');
    if (!modal) return;

    // تحديث الشاشات
    modal.querySelectorAll('.onboarding-screen').forEach((screen, idx) => {
      screen.classList.toggle('active', idx === stepNumber);
    });

    // تحديث شريط التقدم
    modal.querySelectorAll('.onboarding-step-indicator').forEach((dot, idx) => {
      dot.classList.toggle('active', idx <= stepNumber);
      dot.classList.toggle('current', idx === stepNumber);
    });

    // سكرول لأعلى البطاقة
    const card = modal.querySelector('.onboarding-modal-card');
    if (card) {
      if (typeof card.scrollTo === 'function') {
        card.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        card.scrollTop = 0;
      }
    }

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
  }

  // بناء تفاصيل الشاشة 4 (الملخص النهائي)
  function buildSummaryScreen() {
    const name = wizardData.name || 'يا حافظ القرآن';
    const welcomeTitle = document.getElementById('onbFinalWelcomeTitle');
    if (welcomeTitle) {
      welcomeTitle.textContent = `خطتك لصدرك.. جاهزة يا ${name}!`;
    }

    // 1. نوع المحفوظ
    const sumMemTypeVal = document.getElementById('sumMemTypeVal');
    if (sumMemTypeVal) {
      if (wizardData.memorization.type === 'khatim') {
        sumMemTypeVal.textContent = 'خاتم المصحف كامل (30 جزءاً)';
      } else if (wizardData.memorization.type === 'juz') {
        sumMemTypeVal.textContent = `${wizardData.memorization.value} أجزاء من المصحف`;
      } else if (wizardData.memorization.type === 'surah_range') {
        const v = wizardData.memorization.value || { from: 1, to: 114 };
        const sF = getSurahById(v.from), sT = getSurahById(v.to);
        sumMemTypeVal.textContent = `من سورة ${sF.name} إلى ${sT.name}`;
      } else {
        sumMemTypeVal.textContent = 'بداية مشوار الحفظ من الصفر';
      }
    }

    // 2. المسار
    const sumDirVal = document.getElementById('sumDirectionVal');
    if (sumDirVal) {
      sumDirVal.textContent = (wizardData.memorization.direction === 'nas_to_fatihah')
        ? 'من الناس للفاتحة (تصاعدي)'
        : 'من الفاتحة للناس (ترتيب المصحف)';
    }

    // 3. المحطة الحالية
    const sumStartSurahVal = document.getElementById('sumStartSurahVal');
    if (sumStartSurahVal) {
      const curS = getSurahById(wizardData.currentTarget.surahId);
      const curV = wizardData.currentTarget.currentVerse;
      const vText = curV > 0 ? ` (الآية ${curV})` : '';
      sumStartSurahVal.textContent = `سورة ${curS.name}${vText}`;
    }

    // 4. حالة السورة
    const sumStatusVal = document.getElementById('sumStatusVal');
    if (sumStatusVal) {
      const st = wizardData.currentTarget.status;
      sumStatusVal.textContent = (st === 'new')
        ? 'سورة جديدة'
        : (st === 'memorizing' ? 'تكرار وتسميع أولي' : 'مرحلة التثبيت بالأرباع');
    }

    // 5. تفصيل الورد والروتين
    const sumDailyNew = document.getElementById('sumDailyNewItem');
    if (sumDailyNew) {
      const amt = wizardData.schedule.dailyNewAmount;
      const amtStr = (amt === 0.5) ? 'نصف صفحة' : (amt === 1 ? 'صفحة كاملة' : (amt === 2 ? 'صفحتان' : '3 صفحات'));
      sumDailyNew.textContent = `مقدار الحفظ: ${amtStr} في أيام الحفظ المحددة.`;
    }

    const sumDays = document.getElementById('sumDaysItem');
    if (sumDays) {
      const mCount = wizardData.schedule.memoDays.length;
      const rCount = wizardData.schedule.revisionDays.length;
      const oCount = wizardData.schedule.offDays.length;
      sumDays.textContent = `أيام النشاط: ${mCount} أيام حفظ، ${rCount} أيام مراجعة، و ${oCount} أيام إجازة.`;
    }

    const sumCycle = document.getElementById('sumCycleItem');
    if (sumCycle) {
      const revMap = {
        quarter_hizb: 'ربع حزب',
        half_juz: 'نصف جزء',
        one_juz: 'جزء كامل',
        two_juz: 'جزئين',
        three_juz: '3 أجزاء'
      };
      const amtLabel = revMap[wizardData.schedule.revisionAmount] || 'جزء كامل';
      sumCycle.textContent = `المراجعة: ختم كامل المحفوظ كل ${wizardData.schedule.revisionCycleDays} أيام (بمقدار ${amtLabel} يومياً).`;
    }

    // 6. الموعد التقديري التقريبي
    const etaText = document.getElementById('sumEtaText');
    if (etaText) {
      if (wizardData.memorization.type === 'khatim') {
        etaText.innerHTML = `الموعد التقديري لتمكين وضبط الختمة بالكامل: <strong>حوالي 2 إلى 3 أشهر</strong> بدورة مراجعة كل ${wizardData.schedule.revisionCycleDays} أيام إن شاء الله.`;
      } else {
        const memJuz = (wizardData.memorization.type === 'juz') ? wizardData.memorization.value : 0;
        const pagesRemaining = Math.max(20, 604 - (memJuz * 20));
        const pagesPerWeek = wizardData.schedule.dailyNewAmount * wizardData.schedule.memoDays.length;
        const weeks = Math.max(4, Math.round(pagesRemaining / (pagesPerWeek || 4)));
        const months = (weeks / 4.3).toFixed(1);
        etaText.innerHTML = `الموعد التقديري لإتمام الحفظ والتمكين: <strong>حوالي ${months} أشهر (${weeks} أسبوعاً)</strong> بالالتزام بالورد إن شاء الله.`;
      }
    }
  }

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
      surahs = [curSurah];
    }

    if (prevSurah && !surahs.some(s => s.id === prevSurah.id)) {
      surahs.push(prevSurah);
    }

    if (isReverse) {
      surahs.sort((a, b) => b.id - a.id);
    } else {
      surahs.sort((a, b) => a.id - b.id);
    }

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

    const isTathbeet = (profile.currentTarget.status === 'ready_for_tathbeet');
    const curVerse = isTathbeet ? curSurah.verses : (parseInt(profile.currentTarget.currentVerse, 10) || 0);

    window.AppState.surahConfig = {
      name: curSurah.name,
      totalVerses: curSurah.verses,
      currentVerse: curVerse,
      status: profile.currentTarget.status || 'new',
      dailyTarget: Math.round((profile.schedule.dailyNewAmount || 1) * 15)
    };

    if (isTathbeet) {
      localStorage.setItem('seraj_active_tathbeet_surah', curSurah.name);
      localStorage.setItem('seraj_tathbeet_mode', 'true');
    } else {
      localStorage.removeItem('seraj_active_tathbeet_surah');
      localStorage.removeItem('seraj_tathbeet_mode');
    }
    window.AppState.reverseMemorizationOrder = (profile.memorization.direction === 'nas_to_fatihah');
    window.AppState.totalCycleDays = profile.schedule.revisionCycleDays || 10;

    // توليد الجداول ديناميكياً
    const gen = generateReviewSchedule(profile);
    if (gen) {
      window.AppState.surahConfig.previousSurah = gen.previousSurah;
      window.AppState.tenDaySchedule = gen.scheduleRows;

      const qSelect = document.getElementById('quarterSurahSelect');
      if (qSelect) {
        qSelect.value = String(isTathbeet ? curSurah.id : gen.previousSurahId);
        if (typeof window.applyQuarterSelection === 'function') {
          window.applyQuarterSelection();
        }
      }
    }

    // تحديث روتين أيام الأسبوع بناءً على أيام الحفظ والمراجعة والإجازة
    if (window.AppState.weeklySchedule) {
      const memoDays = Array.isArray(profile.schedule.memoDays)
        ? profile.schedule.memoDays
        : (profile.schedule.activeDays || [0, 1, 2, 3]);
      const revDays = Array.isArray(profile.schedule.revisionDays)
        ? profile.schedule.revisionDays
        : [0, 1, 2, 3, 4];
      const offDays = Array.isArray(profile.schedule.offDays)
        ? profile.schedule.offDays
        : [5, 6];

      const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      DAY_KEYS.forEach((dKey, idx) => {
        const isMemo = memoDays.includes(idx);
        const isRev = revDays.includes(idx);
        const isOff = offDays.includes(idx);

        if (window.AppState.weeklySchedule[dKey]) {
          if (isOff && !isMemo && !isRev) {
            window.AppState.weeklySchedule[dKey].hasNew = false;
            window.AppState.weeklySchedule[dKey].hasConsolidation = false;
            window.AppState.weeklySchedule[dKey].hasNearReview = false;
            window.AppState.weeklySchedule[dKey].hasDistantReview = false;
            window.AppState.weeklySchedule[dKey].customTask = 'إجازة وراحة أسبوعية';
          } else {
            window.AppState.weeklySchedule[dKey].hasNew = isMemo;
            window.AppState.weeklySchedule[dKey].hasNearReview = isRev;
            window.AppState.weeklySchedule[dKey].hasDistantReview = isRev;
            window.AppState.weeklySchedule[dKey].hasConsolidation = isRev;
            if (window.AppState.weeklySchedule[dKey].customTask === 'إجازة وراحة أسبوعية') {
              window.AppState.weeklySchedule[dKey].customTask = '';
            }
          }
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

  // حفظ الكائن النهائي وتطبيقه على النظام
  function commitUserProfile() {
    const sId = wizardData.currentTarget.surahId || 1;
    const curVerse = (wizardData.currentTarget.status === 'memorizing')
      ? (parseInt(wizardData.currentTarget.currentVerse, 10) || 1)
      : (wizardData.currentTarget.status === 'ready_for_tathbeet' ? (getSurahById(sId).verses || 75) : 0);
    const calculatedPage = getAyahPage(sId, curVerse);

    const userProfile = {
      name: wizardData.name || 'يا حافظ القرآن',
      memorization: {
        type: wizardData.memorization.type,
        value: wizardData.memorization.value,
        direction: wizardData.memorization.direction
      },
      currentTarget: {
        surahId: sId,
        currentVerse: curVerse,
        page: calculatedPage,
        status: wizardData.currentTarget.status
      },
      schedule: {
        dailyNewAmount: wizardData.schedule.dailyNewAmount,
        memoDays: wizardData.schedule.memoDays,
        revisionDays: wizardData.schedule.revisionDays,
        offDays: wizardData.schedule.offDays,
        activeDays: wizardData.schedule.memoDays,
        revisionCycleDays: wizardData.schedule.revisionCycleDays,
        revisionAmount: wizardData.schedule.revisionAmount
      },
      completedAt: new Date().toISOString()
    };

    // 1. حفظ الكائن في LocalStorage (عام ولكل حساب مستخدم)
    try {
      const profKey = getProfileKey();
      const compKey = getCompletedKey();
      localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(userProfile));
      localStorage.setItem(STORAGE_KEY_COMPLETED, 'true');
      localStorage.setItem(profKey, JSON.stringify(userProfile));
      localStorage.setItem(compKey, 'true');
      localStorage.setItem('tibyan_user_name', userProfile.name);
      localStorage.setItem('tibyan_mushaf_page', String(calculatedPage));
      const sObj = getSurahById(userProfile.currentTarget.surahId);
      if (userProfile.currentTarget.status === 'ready_for_tathbeet') {
        localStorage.setItem('seraj_active_tathbeet_surah', (sObj && sObj.name) || 'الأنفال');
        localStorage.setItem('seraj_tathbeet_mode', 'true');
      } else {
        localStorage.removeItem('seraj_active_tathbeet_surah');
        localStorage.removeItem('seraj_tathbeet_mode');
      }
    } catch (e) {
      console.error('Error saving user profile:', e);
    }

    // 2. تطبيق الإعدادات وتوليد الجداول فوراً على AppState في app.js
    applyProfileToAppState(userProfile);

    // 3. إغلاق المعالج بحركة خروج أنيقة
    const modal = document.getElementById('serajOnboardingModal');
    if (modal) {
      modal.classList.add('closing');
      setTimeout(() => {
        modal.remove();
      }, 350);
    }

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic(30);
    if (typeof window.showToast === 'function') {
      window.showToast(`مبارك يا ${userProfile.name}! تم اعتماد خطتك بنجاح.. نفعك الله بالقرآن 🌿`);
    }

    // 4. فتح المصحف على صفحة الانطلاق المختارة
    setTimeout(() => {
      try {
        const navMushafBtn = document.querySelector('.nav-item-btn[data-tab="view-mushaf"]');
        if (navMushafBtn) navMushafBtn.click();
        if (window.MushafViewer && typeof window.MushafViewer.loadPage === 'function') {
          window.MushafViewer.loadPage(calculatedPage);
        }
      } catch (err) {
        console.warn('Navigation to mushaf notice:', err);
      }
    }, 400);
  }

  // فحص هل المستخدم لديه أي بيانات سابقة أو أكمل المعالج سابقاً
  function isExistingUser() {
    if (isCompleted()) return true;

    if (localStorage.getItem('tibyan_user_profile') || localStorage.getItem(getProfileKey())) {
      return true;
    }

    if (window.quranStorage && typeof window.quranStorage.getLocalData === 'function') {
      const existingData = window.quranStorage.getLocalData();
      if (existingData && (
        (existingData.completedSurahs && existingData.completedSurahs.length > 0) ||
        (existingData.dailyLogs && Object.keys(existingData.dailyLogs).length > 0) ||
        (existingData.surahConfig && (existingData.surahConfig.currentVerse > 0 || (existingData.surahConfig.name && existingData.surahConfig.name !== 'البقرة'))) ||
        existingData.userProfile
      )) {
        return true;
      }
    }

    if (window.AppState) {
      if (window.AppState.completedSurahs && window.AppState.completedSurahs.length > 0) return true;
      if (window.AppState.dailyLogs && Object.keys(window.AppState.dailyLogs).length > 0) return true;
      if (window.AppState.surahConfig && (window.AppState.surahConfig.currentVerse > 0 || (window.AppState.surahConfig.name && window.AppState.surahConfig.name !== 'البقرة'))) return true;
    }

    return false;
  }

  // فحص البدء التلقائي: يظهر لمرة واحدة فقط وفقط عندما يسجل المستخدم دخولاً جديداً (New User Signup)
  function checkAndLaunchOnboarding(explicitNewUser = false) {
    const body = document.body;
    if (!body || body.classList.contains('auth-out') || body.classList.contains('auth-loading')) {
      return;
    }

    const isAuthIn = body.classList.contains('auth-in');
    if (!isAuthIn) return;

    // إذا كان المعالج مكتملاً سابقاً، نمنع الظهور نهائياً
    if (isCompleted()) {
      return;
    }

    // التحقق من أنه تسجيل جديد فعلي
    const isNewSignup = explicitNewUser || sessionStorage.getItem('seraj_is_new_signup') === 'true' || localStorage.getItem('seraj_is_new_user_login') === 'true';
    if (!isNewSignup) {
      localStorage.setItem(getCompletedKey(), 'true');
      localStorage.setItem(STORAGE_KEY_COMPLETED, 'true');
      return;
    }

    // إذا كان لدى المستخدم بيانات حقيقية مخزنة، فهو مستخدم قديم وليس جديداً
    if (!explicitNewUser && isExistingUser()) {
      localStorage.setItem(getCompletedKey(), 'true');
      localStorage.setItem(STORAGE_KEY_COMPLETED, 'true');
      sessionStorage.removeItem('seraj_is_new_signup');
      localStorage.removeItem('seraj_is_new_user_login');
      return;
    }

    // استهلاك العلامة فوراً لضمان عدم الظهور إطلاقاً في أي مرة تالية
    sessionStorage.removeItem('seraj_is_new_signup');
    localStorage.removeItem('seraj_is_new_user_login');

    createModalDOM();
    const modal = document.getElementById('serajOnboardingModal');
    if (modal) {
      setTimeout(() => {
        if (document.body.classList.contains('auth-out') || document.body.classList.contains('auth-loading')) {
          modal.remove();
          return;
        }
        modal.classList.add('show');
        goToStep(0);
      }, 250);
    }
  }

  // تصدير واجهة المعالج
  window.generateReviewSchedule = generateReviewSchedule;
  window.applyProfileToAppState = applyProfileToAppState;
  window.SerajOnboarding = {
    start: function (force = false) {
      if (force) {
        const exist = document.getElementById('serajOnboardingModal');
        if (exist) exist.remove();
      }
      createModalDOM();
      const modal = document.getElementById('serajOnboardingModal');
      if (modal) {
        modal.classList.add('show');
        goToStep(0);
      }
    },
    isCompleted: isCompleted,
    getUserProfile: function () {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY_PROFILE));
      } catch (_) {
        return null;
      }
    }
  };

  window.SerajOnboarding.checkAndLaunch = checkAndLaunchOnboarding;

})();
