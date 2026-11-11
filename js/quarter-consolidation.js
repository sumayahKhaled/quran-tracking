
  function getLocalDateISO(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

// ======================================================
// نظام التثبيت بالأرباع (Quarter Consolidation System)
// ======================================================

(function () {
  'use strict';

  let currentSurahId = 9; // التوبة افتراضياً
  let fromAyahVal = 1;
  let toAyahVal = 129;
  let quartersData = [];

  // تهيئة عناصر واجهة التثبيت بالأرباع
  function initQuarterConsolidationModule() {
    const cardOpen = document.getElementById('cardOpenQuarterConsolidation');
    const subpage = document.getElementById('quarterConsolidationSubpage');
    const mainPanel = document.getElementById('toolsMainPanel');
    const btnBack = document.getElementById('btnBackFromQuarterConsolidation');
    const surahSelect = document.getElementById('quarterSurahSelect');
    const fromDateInput = document.getElementById('quarterFromDate');
    const toDateInput = document.getElementById('quarterToDate');
    const btnApply = document.getElementById('btnApplyQuarterRange');

    // 1. التنقل بين لوحة الأدوات وصفحة التثبيت بالأرباع
    if (cardOpen) {
      cardOpen.addEventListener('click', () => {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
        if (mainPanel) mainPanel.style.display = 'none';
        if (subpage) {
          subpage.style.display = 'flex';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        populateQuarterSurahSelect();
        // ضبط التواريخ الافتراضية للبداية والنهاية
        const today = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        if (fromDateInput && !fromDateInput.value) fromDateInput.value = getLocalDateISO(today);
        if (toDateInput && !toDateInput.value) toDateInput.value = getLocalDateISO(nextWeek);
        applyQuarterSelection();
      });
    }

    if (btnBack) {
      btnBack.addEventListener('click', () => {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
        if (subpage) subpage.style.display = 'none';
        if (mainPanel) {
          mainPanel.style.display = 'flex';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // 2. تعبئة قائمة السور
    function populateQuarterSurahSelect() {
      if (!surahSelect || surahSelect.children.length > 0) return;
      if (window.QURAN_SURAHS) {
        window.QURAN_SURAHS.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية - ${s.type})`;
          opt.dataset.verses = s.verses;
          opt.dataset.name = s.name;
          surahSelect.appendChild(opt);
        });
        // تحديد السورة الافتراضية من التثبيت النشط أو السورة السابقة
        let defId = '1';
        const activeTathbeetName = localStorage.getItem('seraj_active_tathbeet_surah');
        let found = null;
        if (activeTathbeetName) {
          found = window.QURAN_SURAHS.find(s => s.name === activeTathbeetName);
        }
        if (!found && window.AppState && window.AppState.surahConfig) {
          const prevName = window.AppState.surahConfig.previousSurah;
          const curName = window.AppState.surahConfig.name;
          if (prevName) {
            found = window.QURAN_SURAHS.find(s => s.name === prevName);
          }
          if (!found && curName) {
            found = window.QURAN_SURAHS.find(s => s.name === curName);
          }
        }
        if (found) defId = String(found.id);
        surahSelect.value = defId;
      }
    }

    if (surahSelect) {
      surahSelect.addEventListener('change', () => {
        applyQuarterSelection();
      });
    }

    // 3. الضغط على زر موافق
    if (btnApply) {
      btnApply.addEventListener('click', () => {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(25);
        applyQuarterSelection();
      });
    }
    window.applyQuarterSelection = applyQuarterSelection;
    window.populateQuarterSurahSelect = populateQuarterSurahSelect;
  }

  // حساب الأرباع وتطبيقها
  function applyQuarterSelection() {
    const surahSelect = document.getElementById('quarterSurahSelect');
    const fromDateInput = document.getElementById('quarterFromDate');
    const toDateInput = document.getElementById('quarterToDate');

    const sId = surahSelect ? parseInt(surahSelect.value, 10) : 1;
    const sObj = (typeof window.getSurahById === 'function') ? window.getSurahById(sId) : null;
    const sName = sObj ? sObj.name : 'الفاتحة';
    const totalVerses = sObj ? sObj.verses : 7;

    const startDateStr = fromDateInput ? fromDateInput.value : '';
    const endDateStr = toDateInput ? toDateInput.value : '';

    currentSurahId = sId;
    fromAyahVal = 1;
    toAyahVal = totalVerses;

    // استخراج أرباع السورة بالكامل
    quartersData = calculateSurahQuarters(sId, 1, totalVerses);

    // تحديث البنر بالتواريخ وسورة التثبيت
    const banner = document.getElementById('quarterSurahBanner');
    const sBadge = document.getElementById('quarterSurahNameBadge');
    const rBadge = document.getElementById('quarterRangeBadge');
    const cBadge = document.getElementById('quarterCountBadge');

    if (banner) banner.style.display = 'flex';
    if (sBadge) sBadge.textContent = `سورة ${sName}`;
    if (rBadge) {
      if (startDateStr && endDateStr) {
        rBadge.textContent = `الفترة: من ${startDateStr} إلى ${endDateStr}`;
      } else if (startDateStr) {
        rBadge.textContent = `البداية: ${startDateStr}`;
      } else {
        rBadge.textContent = `إجمالي الآيات (${totalVerses} آية)`;
      }
    }
    if (cBadge) cBadge.textContent = `${quartersData.length} أرباع`;

    // مزامنة سورة قسم التثبيت مع البطاقة الثانية بالصفحة الرئيسية دون المساس ببيانات المسار العادي
    localStorage.setItem('seraj_active_tathbeet_surah', sName);
    if (typeof window.renderSurahCard === 'function') window.renderSurahCard();

    renderQuartersList();
  }

  // تقسيم الأرباع بناءً على بيانات المصحف الرسمية (QURAN_SURAH_QUARTERS)
  function calculateSurahQuarters(surahId, startAyah, endAyah) {
    const dict = (typeof QURAN_SURAH_QUARTERS !== 'undefined') ? QURAN_SURAH_QUARTERS : (window.QURAN_SURAH_QUARTERS || {});
    const canonical = dict[surahId] || [];

    if (canonical.length > 0) {
      // تصفية الأرباع التي تتقاطع مع النطاق المحدد
      const filtered = [];
      canonical.forEach((q, idx) => {
        const qFrom = q[0];
        const qTo = q[1];
        // هل يتقاطع مع النطاق المختار؟
        if (qTo >= startAyah && qFrom <= endAyah) {
          filtered.push({
            canonicalIdx: idx + 1,
            from: Math.max(qFrom, startAyah),
            to: Math.min(qTo, endAyah),
            fromPage: q[2],
            toPage: q[3]
          });
        }
      });

      if (filtered.length > 0) {
        return filtered.map((item, i) => ({
          num: i + 1,
          canonicalNum: item.canonicalIdx,
          title: `الربع ${i + 1}`,
          fromAyah: item.from,
          toAyah: item.to,
          surahId: surahId
        }));
      }
    }

    // تقسيم تلقائي متكافئ إن لم يتوفر جدول الأرباع أو لنطاق جزئي مخصص
    const span = endAyah - startAyah + 1;
    const partsCount = Math.max(1, Math.min(9, Math.ceil(span / 15)));
    const perPart = Math.ceil(span / partsCount);
    const quarters = [];

    let curFrom = startAyah;
    for (let i = 1; i <= partsCount; i++) {
      const curTo = Math.min(endAyah, curFrom + perPart - 1);
      quarters.push({
        num: i,
        canonicalNum: i,
        title: `الربع ${i}`,
        fromAyah: curFrom,
        toAyah: curTo,
        surahId: surahId
      });
      curFrom = curTo + 1;
      if (curFrom > endAyah) break;
    }
    return quarters;
  }

  // استرجاع وحفظ حالة تقدم الربع
  function getQuarterStorageKey(surahId, quarterNum, fromA, toA) {
    return `quarter_progress_${surahId}_${fromA}_${toA}`;
  }

  function getQuarterProgress(surahId, quarterNum, fromA, toA) {
    const key = getQuarterStorageKey(surahId, quarterNum, fromA, toA);
    try {
      const saved = localStorage.getItem(key);
      if (saved) return JSON.parse(saved);
    } catch (_) {}
    return {
      heardFirstTime: false,
      recordedRecitation: false,
      repetitionCount: 0, // عداد 7 تكرارات
      recordingUrl: null,
      isOpen: false // افتح أول ربع افتراضياً
    };
  }

  function saveQuarterProgress(surahId, quarterNum, fromA, toA, data) {
    const key = getQuarterStorageKey(surahId, quarterNum, fromA, toA);
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (_) {}
    if (typeof window.renderSurahCard === 'function') {
      window.renderSurahCard();
    }
    if (typeof window.renderDynamicVisibility === 'function') {
      window.renderDynamicVisibility();
    }
  }

  // رسم قائمة كروت الأرباع
  function renderQuartersList() {
    const container = document.getElementById('quartersListContainer');
    if (!container) return;
    container.innerHTML = '';

    if (!quartersData.length) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);">لا توجد أرباع ضمن النطاق المحدد</div>';
      return;
    }

    quartersData.forEach((q) => {
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      const isComplete = (prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7);

      const card = document.createElement('div');
      card.className = `quarter-item-card ${isComplete ? 'is-completed' : ''} ${prog.isOpen ? 'is-open' : ''}`;
      card.id = `quarterCard_${q.num}`;

      card.innerHTML = `
        <button type="button" class="quarter-header-toggle" aria-expanded="${!!prog.isOpen}">
          <div class="quarter-header-left">
            <span class="quarter-index-pill">${q.num}</span>
            <div class="quarter-header-titles">
              <span class="quarter-title-text">${q.title}</span>
              <span class="quarter-verses-span">الآيات (${q.fromAyah} - ${q.toAyah})</span>
            </div>
          </div>
          <div class="quarter-progress-summary">
            <span class="quarter-status-badge ${isComplete ? 'done' : ''}">
              ${isComplete ? 'مكتمل ✓' : `${prog.repetitionCount}/7 تكرارات`}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="quarter-chevron-icon">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </div>
        </button>

        <div class="quarter-details-drawer">
          <div class="quarter-tasks-group">
            <!-- 1. تشيك بوكس: سماع أول مرة -->
            <div class="quarter-task-row ${prog.heardFirstTime ? 'is-done' : ''}">
              <label class="quarter-task-check-label">
                <input type="checkbox" class="quarter-task-checkbox q-heard-check" ${prog.heardFirstTime ? 'checked' : ''} />
                <span>سماع أول مرة</span>
              </label>
              <div class="quarter-task-actions">
                <button type="button" class="btn-task-action btn-play-quarter" title="تشغيل صوت الربع بالقارئ المعتمد" aria-label="استماع">
                  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:18px;height:18px;">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  </svg>
                </button>
              </div>
            </div>

            <!-- 2. تشيك بوكس: تسجيل -->
            <div class="quarter-task-row ${prog.recordedRecitation ? 'is-done' : ''}">
              <label class="quarter-task-check-label">
                <input type="checkbox" class="quarter-task-checkbox q-rec-check" ${prog.recordedRecitation ? 'checked' : ''} />
                <span>تسجيل</span>
              </label>
              <div class="quarter-task-actions">
                <button type="button" class="btn-task-action btn-record-quarter" title="بدء تسجيل تلاوتك بصوتك" aria-label="تسجيل">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:18px;height:18px;">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="23"></line>
                    <line x1="8" y1="23" x2="16" y2="23"></line>
                  </svg>
                </button>
                <audio class="quarter-audio-playback" style="display:none;" controls></audio>
              </div>
            </div>

            <!-- 3. عداد التكرارات 7 مرات لكل ربع -->
            <div class="quarter-repetition-box">
              <div class="repetition-info">
                <span class="repetition-title">عداد التكرارات (7 مرات لكل ربع)</span>
                <span class="repetition-sub">كرر قراءة الربع 7 مرات لإتقانه وتثبيته</span>
              </div>
              <div class="repetition-counter-controls">
                <button type="button" class="btn-counter-ctrl btn-minus-rep" title="نقص 1">-</button>
                <span class="repetition-val-display ${prog.repetitionCount >= 7 ? 'is-max' : ''}">${prog.repetitionCount} / 7</span>
                <button type="button" class="btn-counter-ctrl btn-plus-rep" title="زيادة 1">+</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // إضافة تفاعلات الربع
      setupQuarterCardEvents(card, q);
      container.appendChild(card);
    });
  }

  // ربط أحداث كرت الربع
  function setupQuarterCardEvents(card, q) {
    const toggleBtn = card.querySelector('.quarter-header-toggle');
    const drawer = card.querySelector('.quarter-details-drawer');
    const heardCheck = card.querySelector('.q-heard-check');
    const recCheck = card.querySelector('.q-rec-check');
    const btnPlay = card.querySelector('.btn-play-quarter');
    const btnRecord = card.querySelector('.btn-record-quarter');
    const recLabel = card.querySelector('.rec-label-text');
    const audioEl = card.querySelector('.quarter-audio-playback');
    const btnMinus = card.querySelector('.btn-minus-rep');
    const btnPlus = card.querySelector('.btn-plus-rep');
    const counterDisplay = card.querySelector('.repetition-val-display, .quarter-counter-display');
    const statusBadge = card.querySelector('.quarter-status-badge');

    // 1. فتح / طي كرت الربع بنقرة واحدة سريعة ومباشرة
    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const willBeOpen = !card.classList.contains('is-open');
      card.classList.toggle('is-open', willBeOpen);
      toggleBtn.setAttribute('aria-expanded', willBeOpen ? 'true' : 'false');
      
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      prog.isOpen = willBeOpen;
      saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
    });

    // 2. تشيك بوكس: سماع أول مرة
    heardCheck.addEventListener('change', () => {
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      prog.heardFirstTime = heardCheck.checked;
      saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
      heardCheck.closest('.quarter-task-row').classList.toggle('is-done', prog.heardFirstTime);
      updateQuarterCardStatus(card, q, prog);
      if (prog.heardFirstTime && window.showToast) window.showToast('أحسنت! تم إنجاز سماع أول مرة بنجاح');
    });

    // تشغيل وإيقاف تلاوة الربع بالقارئ المعتمد (Toggle Play / Pause)
    btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      const mv = window.MushafViewer;
      if (!mv) return;

      const isThisQuarterPlaying = btnPlay.classList.contains('playing') && mv.isReciterPlaying && mv.isReciterPlaying();

      if (isThisQuarterPlaying) {
        // إيقاف الصوت
        if (typeof mv.pauseReciterAudio === 'function') {
          mv.pauseReciterAudio();
        } else if (typeof mv.stopPlayback === 'function') {
          mv.stopPlayback();
        }
        btnPlay.classList.remove('playing');
        btnPlay.title = 'تشغيل صوت الربع بالقارئ المعتمد';
        btnPlay.setAttribute('aria-label', 'استماع');
        btnPlay.innerHTML = `
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:18px;height:18px;">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        `;
        if (window.showToast) window.showToast('تم إيقاف التلاوة مؤقتاً');
      } else {
        // إعادة تعيين جميع أزرار الاستماع الأخرى
        document.querySelectorAll('.btn-play-quarter').forEach(b => {
          b.classList.remove('playing');
          b.title = 'تشغيل صوت الربع بالقارئ المعتمد';
          b.setAttribute('aria-label', 'استماع');
          b.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:18px;height:18px;">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          `;
        });

        // تشغيل الربع
        if (typeof mv.playReciterRange === 'function') {
          mv.playReciterRange(q.surahId, q.fromAyah, q.toAyah, 1);
          btnPlay.classList.add('playing');
          btnPlay.title = 'إيقاف مؤقت لتلاوة الربع';
          btnPlay.setAttribute('aria-label', 'إيقاف مؤقت');
          btnPlay.innerHTML = `
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width:18px;height:18px;">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          `;
          if (window.showToast) window.showToast(`بدأ استماع تلاوة الربع (${q.fromAyah} - ${q.toAyah})`);
        }
      }
    });

    // 3. تشيك بوكس: تسجيل صوتي للتأكد من الأغلاط
    recCheck.addEventListener('change', () => {
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      prog.recordedRecitation = recCheck.checked;
      saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
      recCheck.closest('.quarter-task-row').classList.toggle('is-done', prog.recordedRecitation);
      updateQuarterCardStatus(card, q, prog);
    });

    // زر التسجيل الصوتي المباشر باستخدام الميكروفون
    let isRecordingLocal = false;
    btnRecord.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!window.quranRecorder) {
        alert('ميزة التسجيل غير متوفرة في هذا المتصفح');
        return;
      }

      if (!isRecordingLocal) {
        // بدء التسجيل
        const started = await window.quranRecorder.startRecording(
          q.num,
          (timerStr) => {
            if (recLabel) recLabel.textContent = timerStr;
          },
          (slot, audioUrl) => {
            if (recLabel) recLabel.textContent = 'تشغيل التسجيل';
            btnRecord.classList.remove('recording');
            isRecordingLocal = false;
            if (audioEl) {
              audioEl.src = audioUrl;
              audioEl.style.display = 'block';
            }
            // تحديد التشيك بوكس تلقائياً عند حفظ التسجيل
            recCheck.checked = true;
            const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
            prog.recordedRecitation = true;
            saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
            recCheck.closest('.quarter-task-row').classList.add('is-done');
            updateQuarterCardStatus(card, q, prog);
            if (window.showToast) window.showToast('تم حفظ التسجيل بنجاح ✓');
          }
        );

        if (started) {
          isRecordingLocal = true;
          btnRecord.classList.add('recording');
          if (recLabel) recLabel.textContent = '00:00 (إيقاف)';
        }
      } else {
        // إيقاف التسجيل
        window.quranRecorder.stopRecording();
      }
    });

    // 4. عداد التكرارات 7 مرات
    btnPlus.addEventListener('click', (e) => {
      e.stopPropagation();
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      prog.repetitionCount = (prog.repetitionCount || 0) + 1;
      saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
      counterDisplay.textContent = `${prog.repetitionCount} / 7`;
      counterDisplay.classList.toggle('is-max', prog.repetitionCount >= 7);
      counterDisplay.classList.toggle('is-max', prog.repetitionCount >= 7);
      counterDisplay.classList.toggle('completed', prog.repetitionCount >= 7);
      updateQuarterCardStatus(card, q, prog);
      if (typeof window.triggerHaptic === 'function') window.triggerHaptic(20);
      if (prog.repetitionCount === 7 && window.showToast) {
        window.showToast(`مبارك! أتممت التكرارات السبعة لـ (${q.title}) بنجاح`);
      }
    });

    btnMinus.addEventListener('click', (e) => {
      e.stopPropagation();
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      if ((prog.repetitionCount || 0) > 0) {
        prog.repetitionCount -= 1;
        saveQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah, prog);
        counterDisplay.textContent = `${prog.repetitionCount} / 7`;
        counterDisplay.classList.toggle('completed', prog.repetitionCount >= 7);
        updateQuarterCardStatus(card, q, prog);
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic(15);
      }
    });
  }


  // فحص ما إذا تم إنجاز وتثبيت جميع أرباع السورة بالكامل
  function checkAllQuartersOfSurahCompleted() {
    if (!quartersData || quartersData.length === 0) return false;
    const allDone = quartersData.every(q => {
      const prog = getQuarterProgress(q.surahId, q.num, q.fromAyah, q.toAyah);
      return prog && prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7;
    });

    if (allDone) {
      // إنجاز تثبيت السورة بالكامل!
      const sObj = (typeof window.getSurahById === 'function') ? window.getSurahById(currentSurahId) : null;
      const sName = sObj ? sObj.name : 'السورة';

      if (window.showToast) {
        window.showToast(`هنيئاً لك! أتممت تثبيت وتمكين سورة ${sName} بالكامل بالصدر والقرطاس`);
      }

      // 1. نقل السورة المثبتة (مثلاً الأنفال) إلى قائمة المراجعة الدورية تلقائياً
      if (window.AppState) {
        if (!window.AppState.completedSurahs) window.AppState.completedSurahs = [];
        if (!window.AppState.completedSurahs.includes(sName)) {
          window.AppState.completedSurahs.push(sName);
        }

        // تحديث البروفايل وإعادة توزيع جدول المراجعة الدورية
        let profile = null;
        try {
          profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
        } catch (_) {}

        if (profile) {
          // السورة المثبتة تصبح جزءاً معتمداً من رصيد المحفوظ والمراجعة
          if (typeof window.applyProfileToAppState === 'function') {
            window.applyProfileToAppState(profile);
          }
        }
        if (typeof window.persistState === 'function') {
          window.persistState();
        }
        if (typeof window.renderAll === 'function') {
          window.renderAll();
        }
      }
    }
    return allDone;
  }

  function updateQuarterCardStatus(card, q, prog) {
    const isComplete = (prog.heardFirstTime && prog.recordedRecitation && prog.repetitionCount >= 7);
    card.classList.toggle('is-completed', isComplete);
    const badge = card.querySelector('.quarter-status-badge');
    if (badge) {
      badge.className = `quarter-status-badge ${isComplete ? 'done' : ''}`;
      badge.textContent = isComplete ? 'مكتمل ✓' : `${prog.repetitionCount}/7 تكرارات`;
    }
    // تحديث بطاقة السورة وشريط التقدم في الصفحة الرئيسية فوراً
    if (window.renderAll) {
      window.renderAll();
    }
    if (isComplete) {
      checkAllQuartersOfSurahCompleted();
    }
  }

  // تصدير الدالة العامة لفتح صفحة التثبيت مباشرة من أي مكان (مثلاً عند إتمام السورة)
    // تصدير الدالة العامة لفتح صفحة التثبيت مباشرة من أي مكان (مثلاً عند إتمام السورة)
  window.openQuarterConsolidation = function (surahId) {
    // 1. الانتقال إلى تبويب أدوات في الشريط السفلي
    const navToolsBtn = document.querySelector('.nav-item-btn[data-tab="view-tools"]');
    if (navToolsBtn) navToolsBtn.click();

    // 2. تفعيل التبويب وإخفاء باقي الواجهات
    document.querySelectorAll('.main-view-section').forEach(sec => sec.classList.remove('active'));
    const viewTools = document.getElementById('view-tools');
    if (viewTools) viewTools.classList.add('active');

    // 3. فتح شاشة التثبيت بالأرباع مباشرة وإخفاء لوحة الأدوات الرئيسية
    const mainPanel = document.getElementById('toolsMainPanel');
    const subpage = document.getElementById('quarterConsolidationSubpage');
    if (mainPanel) mainPanel.style.display = 'none';
    if (subpage) {
      subpage.style.display = 'flex';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // 4. تهيئة قائمة السور وتحديد السورة المنجزة
    populateQuarterSurahSelect();
    const surahSelect = document.getElementById('quarterSurahSelect');
    if (surahSelect && surahId) {
      surahSelect.value = String(surahId);
    }

    applyQuarterSelection();
  };

  // تهيئة عند اكتمال تحميل المستند
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQuarterConsolidationModule);
  } else {
    initQuarterConsolidationModule();
  }

})();

