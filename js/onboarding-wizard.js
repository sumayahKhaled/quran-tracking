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
      page: 1,
      status: 'new' // 'new' | 'memorizing' | 'ready_for_tathbeet'
    },
    schedule: {
      dailyNewAmount: 1, // 0.5 (نصف صفحة) | 1 (صفحة كاملة) | 2 (صفحتين)
      activeDays: [0, 1, 2, 3], // الأحد، الإثنين، الثلاثاء، الأربعاء
      consolidationDay: 4, // الخميس
      revisionCycleDays: 10 // 7 | 10 | 15
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

  function getPageForSurah(surahId) {
    if (window.MushafViewer && typeof window.MushafViewer.getAyahPageNumber === 'function') {
      return window.MushafViewer.getAyahPageNumber(surahId, 1) || 1;
    }
    const map = (typeof QURAN_AYAH_PAGE_MAP !== 'undefined' ? QURAN_AYAH_PAGE_MAP : null) || (window.QURAN_AYAH_PAGE_MAP || null);
    if (map && map[surahId] && map[surahId][0]) {
      return map[surahId][0][1] || 1;
    }
    return 1;
  }

  function getSurahById(id) {
    const list = getSurahList();
    return list.find(s => s.id === parseInt(id, 10)) || list[0] || { id: 1, name: 'الفاتحة', verses: 7 };
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

              <!-- خيار دمج: تحديد المحفوظ (بالأجزاء أو بالسّور) في بطاقة واحدة واضحة -->
              <div class="onb-unified-selection-card" id="onbUnifiedMemCard">
                <div class="onb-unified-header">
                  <span class="onb-card-main-title">تحديد مقدار محفوظك السابق</span>
                  <span class="onb-card-sub-desc">اختر الطريقة الأنسب لتحديد ما تحفظه بدقة:</span>
                </div>

                <!-- مفتاح التبديل الداخلي بين الأجزاء والسور -->
                <div class="onb-mode-tabs">
                  <button type="button" class="onb-mode-tab active" id="onbTabJuz" data-mode="juz">
                    <span>تحديد بالأجزاء (كم جزء)</span>
                  </button>
                  <button type="button" class="onb-mode-tab" id="onbTabSurah" data-mode="surah_range">
                    <span>تحديد من سورة إلى سورة</span>
                  </button>
                </div>

                <!-- حقل الأجزاء -->
                <div id="onbJuzDropdownContainer" class="onb-nested-input-row" style="display:block;">
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

                <!-- حقل من سورة إلى سورة -->
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
              <label class="onb-label" for="onbTargetSurahSelect">السورة المستهدفة</label>
              <select id="onbTargetSurahSelect" class="onb-select"></select>
            </div>

            <div class="onb-form-group" id="onbPageInputGroup">
              <label class="onb-label" for="onbTargetPageInput">رقم الصفحة الحالية في المصحف</label>
              <div style="position:relative;">
                <input type="number" id="onbTargetPageInput" class="onb-input" min="1" max="604" value="1" />
                <span class="onb-input-badge">صفحة</span>
              </div>
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
                  <span class="onb-pill-text">شغال عليها تكرار وتسميع أولي</span>
                </label>
                <label class="onb-pill-option" data-status="ready_for_tathbeet">
                  <input type="radio" name="onbSurahStatus" value="ready_for_tathbeet" />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">خلصت حفظها وأبي أدخلها مرحلة التثبيت</span>
                </label>
              </div>
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

          <!-- الشاشة 3: إيقاع الورد الأسبوعي -->
          <div class="onboarding-screen" id="onbScreen3">
            <h2 class="onb-title">كيف ودّك ترتب جدولك الأسبوعي؟</h2>
            <p class="onb-desc">اختر الحمل اللي تقدر تدوم عليه؛ قليل دائم خير من كثير منقطع.</p>

            <!-- مقدار الحفظ الجديد يومياً -->
            <div class="onb-form-group" style="margin-top:16px;">
              <label class="onb-label">مقدار الحفظ الجديد يومياً</label>
              <div class="onb-pills-row" id="onbNewAmountRow">
                <button type="button" class="onb-chip-btn" data-val="0.5">نصف صفحة</button>
                <button type="button" class="onb-chip-btn active" data-val="1">صفحة كاملة (وجه)</button>
                <button type="button" class="onb-chip-btn" data-val="2">صفحتين</button>
              </div>
            </div>

            <!-- أيام الحفظ والتسميع (Multi-select Chips) -->
            <div class="onb-form-group">
              <label class="onb-label">أيام الحفظ والتسميع (اختر أيام نشاطك)</label>
              <div class="onb-days-chips-grid" id="onbActiveDaysGrid">
                <button type="button" class="onb-day-chip active" data-day="0">الأحد</button>
                <button type="button" class="onb-day-chip active" data-day="1">الإثنين</button>
                <button type="button" class="onb-day-chip active" data-day="2">الثلاثاء</button>
                <button type="button" class="onb-day-chip active" data-day="3">الأربعاء</button>
                <button type="button" class="onb-day-chip" data-day="4">الخميس</button>
                <button type="button" class="onb-day-chip" data-day="5">الجمعة</button>
                <button type="button" class="onb-day-chip" data-day="6">السبت</button>
              </div>
            </div>

            <!-- يوم الربط والتثبيت (Single select) -->
            <div class="onb-form-group">
              <label class="onb-label" for="onbConsolidationDaySelect">يوم الربط والتثبيت (مخصص للتمكين)</label>
              <select id="onbConsolidationDaySelect" class="onb-select">
                <option value="4" selected>الخميس</option>
                <option value="5">الجمعة</option>
                <option value="6">السبت</option>
                <option value="0">الأحد</option>
                <option value="1">الإثنين</option>
                <option value="2">الثلاثاء</option>
                <option value="3">الأربعاء</option>
              </select>
            </div>

            <!-- دورة ختم المحفوظ القديم -->
            <div class="onb-form-group">
              <label class="onb-label">دورة ختم المحفوظ القديم</label>
              <div class="onb-radio-pills-col">
                <label class="onb-pill-option" data-cycle="7">
                  <input type="radio" name="onbCycleDays" value="7" />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">أختم محفوظي السابق كل 7 أيام</span>
                </label>
                <label class="onb-pill-option active" data-cycle="10">
                  <input type="radio" name="onbCycleDays" value="10" checked />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">أختم محفوظي كل 10 أيام (المقترح)</span>
                </label>
                <label class="onb-pill-option" data-cycle="15">
                  <input type="radio" name="onbCycleDays" value="15" />
                  <span class="onb-pill-dot"></span>
                  <span class="onb-pill-text">أختم محفوظي كل 15 يوم</span>
                </label>
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
                  <span class="onb-sum-val" id="sumStartSurahVal">سورة الفاتحة (ص 1)</span>
                </div>
                <div class="onb-summary-item">
                  <span class="onb-sum-label">حالة المحطة</span>
                  <span class="onb-sum-val" id="sumStatusVal">سورة جديدة</span>
                </div>
              </div>

              <div class="onb-summary-divider"></div>

              <div class="onb-summary-item" style="width:100%;">
                <span class="onb-sum-label">تفصيل الورد الأسبوعي</span>
                <ul class="onb-plan-features-list">
                  <li id="sumDailyNewItem">الجديد: صفحة كاملة يومياً في أيام النشاط.</li>
                  <li id="sumConsolidationItem">الربط القريب والتمكين: يوم الخميس من كل أسبوع.</li>
                  <li id="sumCycleItem">المراجعة الدورية: ختم المحفوظ كل 10 أيام.</li>
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
    const unifiedCard = document.getElementById('onbUnifiedMemCard');
    const tabJuz = document.getElementById('onbTabJuz');
    const tabSurah = document.getElementById('onbTabSurah');
    const juzContainer = document.getElementById('onbJuzDropdownContainer');
    const surahRangeContainer = document.getElementById('onbSurahRangeContainer');

    let customMemMode = 'juz'; // 'juz' | 'surah_range'

    function setCustomMemMode(mode) {
      customMemMode = mode;
      wizardData.memorization.type = mode;
      if (tabJuz && tabSurah) {
        tabJuz.classList.toggle('active', mode === 'juz');
        tabSurah.classList.toggle('active', mode === 'surah_range');
      }
      if (juzContainer) juzContainer.style.display = (mode === 'juz') ? 'block' : 'none';
      if (surahRangeContainer) surahRangeContainer.style.display = (mode === 'surah_range') ? 'block' : 'none';
    }

    if (tabJuz) {
      tabJuz.addEventListener('click', (e) => {
        e.stopPropagation();
        memCards.forEach(c => c.classList.remove('selected'));
        if (unifiedCard) unifiedCard.classList.add('selected');
        setCustomMemMode('juz');
      });
    }

    if (tabSurah) {
      tabSurah.addEventListener('click', (e) => {
        e.stopPropagation();
        memCards.forEach(c => c.classList.remove('selected'));
        if (unifiedCard) unifiedCard.classList.add('selected');
        setCustomMemMode('surah_range');
      });
    }

    if (unifiedCard) {
      unifiedCard.addEventListener('click', (e) => {
        if (e.target.closest('select') || e.target.closest('button')) return;
        memCards.forEach(c => c.classList.remove('selected'));
        unifiedCard.classList.add('selected');
        wizardData.memorization.type = customMemMode;
      });
    }

    memCards.forEach(card => {
      card.addEventListener('click', () => {
        memCards.forEach(c => c.classList.remove('selected'));
        if (unifiedCard) unifiedCard.classList.remove('selected');
        card.classList.add('selected');
        const input = card.querySelector('input');
        if (input) input.checked = true;

        const type = card.dataset.type;
        wizardData.memorization.type = type;
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
    const pageInput = document.getElementById('onbTargetPageInput');
    if (surahSelect && pageInput) {
      surahSelect.addEventListener('change', () => {
        const sId = parseInt(surahSelect.value, 10);
        wizardData.currentTarget.surahId = sId;
        const page = getPageForSurah(sId);
        pageInput.value = page;
        wizardData.currentTarget.page = page;
      });
      pageInput.addEventListener('input', () => {
        wizardData.currentTarget.page = parseInt(pageInput.value, 10) || 1;
      });
    }

    const statusPills = modal.querySelectorAll('.onb-pill-option[data-status]');
    const pageGroup = document.getElementById('onbPageInputGroup');

    function updatePageInputVisibility(status) {
      const isDone = (status === 'ready_for_tathbeet');
      if (pageInput) {
        pageInput.disabled = isDone;
      }
      if (pageGroup) {
        pageGroup.style.transition = 'opacity 0.25s ease, filter 0.25s ease';
        if (isDone) {
          pageGroup.style.opacity = '0.4';
          pageGroup.style.pointerEvents = 'none';
          pageGroup.style.filter = 'grayscale(1)';
        } else {
          pageGroup.style.opacity = '1';
          pageGroup.style.pointerEvents = 'auto';
          pageGroup.style.filter = 'none';
        }
      }
    }

    statusPills.forEach(pill => {
      pill.addEventListener('click', () => {
        statusPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const input = pill.querySelector('input');
        if (input) input.checked = true;
        wizardData.currentTarget.status = pill.dataset.status;
        updatePageInputVisibility(pill.dataset.status);
      });
    });

    const btnStep2 = document.getElementById('onbBtnStep2Next');
    if (btnStep2) {
      btnStep2.addEventListener('click', () => {
        wizardData.currentTarget.surahId = parseInt(surahSelect.value, 10) || 1;
        wizardData.currentTarget.page = parseInt(pageInput.value, 10) || 1;
        goToStep(3);
      });
    }

    // 4. الشاشة 3: إيقاع الورد الأسبوعي
    const newAmountBtns = modal.querySelectorAll('#onbNewAmountRow .onb-chip-btn');
    newAmountBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        newAmountBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        wizardData.schedule.dailyNewAmount = parseFloat(btn.dataset.val) || 1;
      });
    });

    const dayChips = modal.querySelectorAll('#onbActiveDaysGrid .onb-day-chip');
    dayChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        const activeDays = [];
        modal.querySelectorAll('#onbActiveDaysGrid .onb-day-chip.active').forEach(c => {
          activeDays.push(parseInt(c.dataset.day, 10));
        });
        wizardData.schedule.activeDays = activeDays.length ? activeDays : [0, 1, 2, 3];
      });
    });

    const cyclePills = modal.querySelectorAll('.onb-pill-option[data-cycle]');
    cyclePills.forEach(pill => {
      pill.addEventListener('click', () => {
        cyclePills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const input = pill.querySelector('input');
        if (input) input.checked = true;
        wizardData.schedule.revisionCycleDays = parseInt(pill.dataset.cycle, 10) || 10;
      });
    });

    const btnStep3 = document.getElementById('onbBtnStep3Next');
    if (btnStep3) {
      btnStep3.addEventListener('click', () => {
        const consSel = document.getElementById('onbConsolidationDaySelect');
        wizardData.schedule.consolidationDay = parseInt(consSel.value, 10);
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

    [targetSel, rangeFrom, rangeTo].forEach(sel => {
      if (!sel || sel.children.length > 0) return;
      list.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية)`;
        sel.appendChild(opt);
      });
    });

    if (rangeFrom) rangeFrom.value = '1';
    if (rangeTo) rangeTo.value = '114';
    if (targetSel) targetSel.value = '1';
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
    if (card) card.scrollTo({ top: 0, behavior: 'smooth' });

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
      sumStartSurahVal.textContent = `سورة ${curS.name} (ص ${wizardData.currentTarget.page})`;
    }

    // 4. حالة السورة
    const sumStatusVal = document.getElementById('sumStatusVal');
    if (sumStatusVal) {
      const st = wizardData.currentTarget.status;
      sumStatusVal.textContent = (st === 'new')
        ? 'سورة جديدة'
        : (st === 'memorizing' ? 'تكرار وتسميع أولي' : 'مرحلة التثبيت بالأرباع');
    }

    // 5. تفاصيل الورد
    const sumDailyNew = document.getElementById('sumDailyNewItem');
    if (sumDailyNew) {
      const amt = wizardData.schedule.dailyNewAmount;
      const amtStr = (amt === 0.5) ? 'نصف صفحة' : (amt === 1 ? 'صفحة كاملة' : 'صفحتين');
      const daysCount = wizardData.schedule.activeDays.length;
      sumDailyNew.textContent = `الجديد: ${amtStr} يومياً (${daysCount} أيام في الأسبوع).`;
    }

    const sumConsolidation = document.getElementById('sumConsolidationItem');
    if (sumConsolidation) {
      const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      const cDay = ARABIC_DAYS[wizardData.schedule.consolidationDay] || 'الخميس';
      sumConsolidation.textContent = `الربط القريب والتمكين: يوم ${cDay} من كل أسبوع.`;
    }

    const sumCycle = document.getElementById('sumCycleItem');
    if (sumCycle) {
      sumCycle.textContent = `المراجعة الدورية: ختم المحفوظ كل ${wizardData.schedule.revisionCycleDays} أيام.`;
    }

    // 6. الموعد التقديري التقريبي
    const etaText = document.getElementById('sumEtaText');
    if (etaText) {
      let pagesRemaining = 604;
      if (wizardData.memorization.type === 'khatim') {
        pagesRemaining = 604;
        etaText.innerHTML = `الموعد التقديري لتمكين وضبط الختمة بالكامل: <strong>حوالي 2 إلى 3 أشهر</strong> بدورة مراجعة كل ${wizardData.schedule.revisionCycleDays} أيام إن شاء الله.`;
      } else {
        const memJuz = (wizardData.memorization.type === 'juz') ? wizardData.memorization.value : 0;
        pagesRemaining = Math.max(20, 604 - (memJuz * 20));
        const pagesPerWeek = wizardData.schedule.dailyNewAmount * wizardData.schedule.activeDays.length;
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
      // beginner
      surahs = [curSurah];
    }

    // فرز السور بحسب مسار الحفظ المختار
    if (isReverse) {
      surahs.sort((a, b) => b.id - a.id);
    } else {
      surahs.sort((a, b) => a.id - b.id);
    }

    // تقسيم السور بتسلسل منتظم (chunks)
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

      // المراجعة القريبة: تقسيم السورة السابقة أو الحالية
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

    window.AppState.surahConfig = {
      name: curSurah.name,
      totalVerses: curSurah.verses,
      currentVerse: (profile.currentTarget.status === 'ready_for_tathbeet') ? curSurah.verses : (parseInt(profile.currentTarget.currentVerse, 10) || 0),
      dailyTarget: Math.round(profile.schedule.dailyNewAmount * 15)
    };
    window.AppState.reverseMemorizationOrder = (profile.memorization.direction === 'nas_to_fatihah');
    window.AppState.totalCycleDays = profile.schedule.revisionCycleDays;

    // توليد الجداول ديناميكياً
    const gen = generateReviewSchedule(profile);
    if (gen) {
      window.AppState.surahConfig.previousSurah = gen.previousSurah;
      window.AppState.tenDaySchedule = gen.scheduleRows;

      // ضبط السورة السابقة في أداة التثبيت بالأرباع تلقائياً
      const qSelect = document.getElementById('quarterSurahSelect');
      if (qSelect) {
        qSelect.value = String(gen.previousSurahId);
        if (typeof window.applyQuarterSelection === 'function') {
          window.applyQuarterSelection();
        }
      }
    }

    // تحديث روتين أيام الأسبوع بناءً على الأيام النشطة ويوم التثبيت
    if (window.AppState.weeklySchedule && Array.isArray(profile.schedule.activeDays)) {
      const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      DAY_KEYS.forEach((dKey, idx) => {
        const isActive = profile.schedule.activeDays.includes(idx);
        const isConsDay = (profile.schedule.consolidationDay === idx);
        if (window.AppState.weeklySchedule[dKey]) {
          window.AppState.weeklySchedule[dKey].hasNew = isActive;
          window.AppState.weeklySchedule[dKey].hasConsolidation = isConsDay || isActive;
          window.AppState.weeklySchedule[dKey].hasNearReview = isActive || isConsDay;
          window.AppState.weeklySchedule[dKey].hasDistantReview = isActive || isConsDay;
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
    const userProfile = {
      name: wizardData.name || 'يا حافظ القرآن',
      memorization: {
        type: wizardData.memorization.type,
        value: wizardData.memorization.value,
        direction: wizardData.memorization.direction
      },
      currentTarget: {
        surahId: wizardData.currentTarget.surahId,
        page: wizardData.currentTarget.page,
        status: wizardData.currentTarget.status
      },
      schedule: {
        dailyNewAmount: wizardData.schedule.dailyNewAmount,
        activeDays: wizardData.schedule.activeDays,
        consolidationDay: wizardData.schedule.consolidationDay,
        revisionCycleDays: wizardData.schedule.revisionCycleDays
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
      localStorage.setItem('tibyan_mushaf_page', String(userProfile.currentTarget.page));
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
      const navMushafBtn = document.querySelector('.nav-item-btn[data-tab="view-mushaf"]');
      if (navMushafBtn) navMushafBtn.click();
      if (window.MushafViewer && typeof window.MushafViewer.loadPage === 'function') {
        window.MushafViewer.loadPage(userProfile.currentTarget.page);
      }
    }, 400);
  }

  // فحص البدء التلقائي (First-time Guard)
  // يظهر فقط بعد إتمام تسجيل الدخول بنجاح بحساب، أو بعد النقر على الدخول كزائر محلي لأول مرة
  // وممنوع ظهور المعالج إطلاقاً أثناء وجود المستخدم في شاشة الدخول (وهو زائر قبل الدخول)
  function checkAndLaunchOnboarding() {
    // 1. فحص هل المستخدم ما زال في شاشة الدخول/التسجيل: ممنوع يظهر إطلاقاً
    const body = document.body;
    if (!body || body.classList.contains('auth-out') || body.classList.contains('auth-loading')) {
      return;
    }

    // 2. التحقق من وجود جلسة دخول حقيقية: مستخدم مسجل دخول (auth-in + uid مسجل) أو اختار صراحة الدخول كزائر
    const isAuthIn = body.classList.contains('auth-in');
    const isExplicitGuest = localStorage.getItem('quran_is_guest') === 'true';
    const isCachedAuth = localStorage.getItem('quran_auth_cached') === 'true';
    const hasUid = !!(window.quranStorage && window.quranStorage.uid && window.quranStorage.uid !== 'guest_user') || !!localStorage.getItem('quran_cached_uid');

    // إذا لم يكن قد تم تسجيل الدخول بنجاح، أو لم يختر الدخول كزائر محلي، فلا يظهر المعالج
    if (!isAuthIn || (!isExplicitGuest && !isCachedAuth && !hasUid)) {
      return;
    }

    // 3. إذا سبق له إكمال المعالج لهذا الحساب أو الزائر، لا تفتحه
    if (isCompleted()) {
      return;
    }

    // 4. إذا كان لديه بيانات سابقة بالفعل في حسابه، نعتبر المعالج مكتملاً تلقائياً ولا نزعجه
    if (window.quranStorage && typeof window.quranStorage.getLocalData === 'function') {
      const existingData = window.quranStorage.getLocalData();
      if (existingData && (existingData.surahConfig || existingData.completedSurahs || existingData.tenDaySchedule)) {
        localStorage.setItem(getCompletedKey(), 'true');
        localStorage.setItem(STORAGE_KEY_COMPLETED, 'true');
        return;
      }
    }

    // إنشاء وعرض المعالج لمرة واحدة فقط
    createModalDOM();
    const modal = document.getElementById('serajOnboardingModal');
    if (modal) {
      setTimeout(() => {
        // تأكيد إضافي قبل العرض أن شاشة الدخول ليست ظاهرة
        if (document.body.classList.contains('auth-out') || document.body.classList.contains('auth-loading')) {
          modal.remove();
          return;
        }
        modal.classList.add('show');
        goToStep(0);
      }, 250);
    }
  }

  // تصدير واجهة المعالج برمجياً لإمكانية إعادة فتحه من الإعدادات
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

  // تشغيل الفحص فقط بعد استقرار التطبيق والتحقق من حالة الدخول
  window.addEventListener('load', () => {
    setTimeout(checkAndLaunchOnboarding, 600);
  });

})();

