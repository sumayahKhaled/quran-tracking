/**
 * منصة تبيان | نظام متابعة المحفوظ القرآني
 * Core Logic & State Management - النسخة المحدثة
 * - الخط: IBM Plex Sans Arabic
 * - إخفاء وإظهار الأقسام ديناميكياً بحسب روتين أيام الأسبوع
 * - بطاقة يوم راحة مع أيقونة كوب الشاي عند خلو اليوم من المهام
 * - ميزة حذف التسجيل الصوتي بجانب كل تسجيل
 * - بدون إيموجيات نهائياً
 */

(function () {
  'use strict';

  // Days mapping in Arabic
  const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Default 10-day review schedule
  const DEFAULT_TEN_DAY_SCHEDULE = [
    { day: 1, nearReview: "سورة البقرة (1 - 75)", distantReview: "جزء عمّ (كاملاً)" },
    { day: 2, nearReview: "سورة البقرة (76 - 141)", distantReview: "سورة تبارك وسورة القلم" },
    { day: 3, nearReview: "سورة البقرة (142 - 202)", distantReview: "سور الحاقة والمعارج ونوح" },
    { day: 4, nearReview: "سورة البقرة (203 - 252)", distantReview: "سور الجن والمزمل والمدثر" },
    { day: 5, nearReview: "سورة البقرة (253 - 286)", distantReview: "سور القيامة والإنسان والمرسلات" },
    { day: 6, nearReview: "سورة آل عمران (1 - 60)", distantReview: "سور النبأ والنازعات وعبس" },
    { day: 7, nearReview: "سورة آل عمران (61 - 120)", distantReview: "سور التكوير والانفطار والمطففين" },
    { day: 8, nearReview: "سورة آل عمران (121 - 165)", distantReview: "سور الانشقاق والبروج والطارق" },
    { day: 9, nearReview: "سورة آل عمران (166 - 200)", distantReview: "من سورة الأعلى إلى سورة الضحى" },
    { day: 10, nearReview: "مراجعة شاملة للأسبوع", distantReview: "من سورة الشرح إلى سورة الناس" }
  ];

  // Default weekly routine configuration
  const DEFAULT_WEEKLY_SCHEDULE = {
    saturday: { name: "السبت", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "حفظ مقرر جديد ومراجعة المقررات" },
    sunday: { name: "الأحد", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "متابعة الحفظ وتثبيت الأوجه السابقة" },
    monday: { name: "الإثنين", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "التكرار وسرد المقرر لرفيقة" },
    tuesday: { name: "الثلاثاء", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "حفظ وتثبيت المقدار المقرر" },
    wednesday: { name: "الأربعاء", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "إتمام حفظ الأسبوع والمراجعة الدورية" },
    thursday: { name: "الخميس", hasNew: false, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, note: "مراجعة وتثبيت ما تم حفظه خلال الأسبوع كاملاً" },
    friday: { name: "الجمعة", hasNew: false, hasConsolidation: false, hasNearReview: false, hasDistantReview: false, note: "يوم راحة وقراءة سورة الكهف" }
  };

  // State object
  const AppState = {
    selectedDate: getTodayDateString(),
    activeCycleDay: 1, // 1 to totalCycleDays
    totalCycleDays: 10, // Default 10 days
    surahConfig: {
      name: "البقرة",
      totalVerses: 286,
      currentVerse: 45,
      dailyTarget: 5
    },
    tenDaySchedule: JSON.parse(JSON.stringify(DEFAULT_TEN_DAY_SCHEDULE)),
    weeklySchedule: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)),
    dailyLogs: {},
    completedSurahs: []
  };

  function getTodayDateString() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function getCycleDaysCount() {
    return AppState.totalCycleDays || (AppState.tenDaySchedule ? AppState.tenDaySchedule.length : 10);
  }

  function updateCycleDaysCount(newCount, showNotification = true) {
    newCount = parseInt(newCount) || 10;
    if (newCount < 1) newCount = 1;
    if (newCount > 365) newCount = 365;
    AppState.totalCycleDays = newCount;

    if (!AppState.tenDaySchedule) AppState.tenDaySchedule = [];
    const currentLen = AppState.tenDaySchedule.length;

    if (newCount > currentLen) {
      for (let d = currentLen + 1; d <= newCount; d++) {
        AppState.tenDaySchedule.push({
          day: d,
          nearReview: `المقرر القريب لليوم ${d}`,
          distantReview: `المقرر البعيد لليوم ${d}`
        });
      }
    } else if (newCount < currentLen) {
      AppState.tenDaySchedule = AppState.tenDaySchedule.slice(0, newCount);
    }

    if (AppState.activeCycleDay > newCount) {
      AppState.activeCycleDay = 1;
    }

    persistState();
    renderAll();
    if (showNotification) {
      showToast(`تم تعديل عدد أيام دورة المراجعة إلى ${newCount} يوم`);
    }
  }

  // Create default daily log entry
  function createEmptyDailyLog(cycleDay = 1) {
    return {
      // New memorization (الحفظ الجديد)
      listeningChecks: [false, false, false],
      tafsirCheck: false,
      initialReviewCheck: false,
      audioRecordingChecks: [false, false, false],
      repetitionCounter: 0,
      friendRecitationChecks: [false, false],

      // Consolidation (التثبيت)
      prevPagesCheck: false,
      prevPagesCounter: 0,
      lastTenPagesCheck: false,

      // Periodic review (المراجعة الدورية)
      nearReviewCheck: false,
      distantReviewCheck: false,
      cycleDay: cycleDay,
      notes: ""
    };
  }

  // Get active log for current selected date
  function getCurrentDailyLog() {
    const date = AppState.selectedDate;
    if (!AppState.dailyLogs[date]) {
      AppState.dailyLogs[date] = createEmptyDailyLog(AppState.activeCycleDay);
    }
    return ensureLog(AppState.dailyLogs[date]);
  }

  // Get active day routine based on selected date
  function getSelectedDayRoutine() {
    const dateParts = AppState.selectedDate.split('-');
    const dateObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
    const dayIndex = dateObj.getDay();
    const dayKey = DAY_KEYS[dayIndex];
    return AppState.weeklySchedule[dayKey] || DEFAULT_WEEKLY_SCHEDULE[dayKey];
  }

  // Calculate daily completion score dynamically based on what's active today
  function calculateDailyProgress(log) {
    const routine = getSelectedDayRoutine();
    let completed = 0;
    let total = 0;

    // New memorization tasks (11 tasks if enabled)
    if (routine.hasNew && !log.missed.memo) {
      total += 11;
      if (log.listeningChecks[0]) completed++;
      if (log.listeningChecks[1]) completed++;
      if (log.listeningChecks[2]) completed++;

      if (log.tafsirCheck) completed++;
      if (log.initialReviewCheck) completed++;

      if (log.audioRecordingChecks[0]) completed++;
      if (log.audioRecordingChecks[1]) completed++;
      if (log.audioRecordingChecks[2]) completed++;

      if (log.repetitionCounter >= 10) completed++;
      else if (log.repetitionCounter > 0) completed += (log.repetitionCounter / 10);

      if (log.friendRecitationChecks[0]) completed++;
      if (log.friendRecitationChecks[1]) completed++;
    }

    // Consolidation tasks (2 tasks if enabled)
    if (routine.hasConsolidation && !log.missed.consolidation) {
      total += 2;
      const isPrevPagesDone = log.prevPagesCheck || (log.prevPagesCounter >= 5);
      if (isPrevPagesDone) completed++;

      if (log.lastTenPagesCheck) completed++;
    }

    // Near review (1 task if enabled)
    if (routine.hasNearReview && !log.missed.review) {
      total += 1;
      if (log.nearReviewCheck) completed++;
    }

    // Distant review (1 task if enabled)
    if (routine.hasDistantReview && !log.missed.review) {
      total += 1;
      if (log.distantReviewCheck) completed++;
    }

    const anyMissed = hasMissed(log);
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : (anyMissed ? 0 : 100);
    return { completed: Math.round(completed), total, percent };
  }

  function triggerHaptic(duration = 20) {
    if (navigator.vibrate) {
      try { navigator.vibrate(duration); } catch (e) { }
    }
  }

  async function persistState() {
    await window.quranStorage.saveData({
      activeCycleDay: AppState.activeCycleDay,
      totalCycleDays: getCycleDaysCount(),
      surahConfig: AppState.surahConfig,
      tenDaySchedule: AppState.tenDaySchedule,
      weeklySchedule: AppState.weeklySchedule,
      dailyLogs: AppState.dailyLogs,
      completedSurahs: AppState.completedSurahs,
      urgentExamPlan: AppState.urgentExamPlan
    });
  }

  function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.25s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2400);
  }

  // --- RENDER FUNCTIONS ---

  // 1. Render Current Surah Card
  function renderSurahCard() {
    const config = AppState.surahConfig;
    const nameEl = document.getElementById('currentSurahName');
    const percentEl = document.getElementById('currentSurahPercent');
    const ratioEl = document.getElementById('currentSurahRatio');
    const fillEl = document.getElementById('currentSurahFill');
    const statusTextEl = document.getElementById('currentSurahStatusText');

    if (!nameEl) return;

    const total = parseInt(config.totalVerses) || 1;
    const current = Math.min(total, parseInt(config.currentVerse) || 0);
    const percent = Math.min(100, Math.round((current / total) * 1000) / 10);
    const remaining = total - current;

    nameEl.textContent = `سورة ${config.name || 'البقرة'}`;
    percentEl.textContent = `${percent}%`;
    ratioEl.textContent = `${current} من ${total} آية`;
    fillEl.style.width = `${percent}%`;

    statusTextEl.innerHTML = `تم حفظ <strong>${current}</strong> آية (المتبقي: <strong>${remaining}</strong> آية)`;
  }

  // 2. Render Dynamic Section Visibility (حسب خطة الأسبوع)
  function renderDynamicVisibility() {
    const routine = getSelectedDayRoutine();
    const isRestDay = !routine.hasNew && !routine.hasConsolidation && !routine.hasNearReview && !routine.hasDistantReview;

    // بطاقة يوم الراحة
    const restDayCard = document.getElementById('restDayCard');
    const milestoneCard = document.getElementById('dailyMilestoneCard');

    if (restDayCard) {
      restDayCard.style.display = isRestDay ? 'flex' : 'none';
    }
    if (milestoneCard) {
      milestoneCard.style.display = isRestDay ? 'none' : 'flex';
    }

    // قسم الحفظ الجديد
    const secNew = document.getElementById('sectionNewMemoCard');
    if (secNew) {
      secNew.style.display = routine.hasNew ? 'block' : 'none';
    }

    // قسم التثبيت
    const secCons = document.getElementById('sectionConsolidationCard');
    if (secCons) {
      secCons.style.display = routine.hasConsolidation ? 'block' : 'none';
    }

    // قسم المراجعة الدورية
    const secPeriodic = document.getElementById('sectionPeriodicCard');
    const hasAnyPeriodic = routine.hasNearReview || routine.hasDistantReview;
    if (secPeriodic) {
      secPeriodic.style.display = hasAnyPeriodic ? 'block' : 'none';
    }

    // الصفوف الفرعية للمراجعة القريبة والبعيدة
    const nearRow = document.getElementById('nearReviewRowGroup');
    if (nearRow) {
      nearRow.style.display = routine.hasNearReview ? 'block' : 'none';
    }

    const distantRow = document.getElementById('distantReviewRowGroup');
    if (distantRow) {
      distantRow.style.display = routine.hasDistantReview ? 'block' : 'none';
    }
  }

  // 3. Render Audio Recordings with Delete Option
  function renderAudioSlots() {
    const container = document.getElementById('audioSlotsContainer');
    if (!container) return;
    container.innerHTML = '';

    [0, 1, 2].forEach(slotIdx => {
      const audioUrl = window.quranRecorder.getRecording(slotIdx);
      if (audioUrl) {
        const slotRow = document.createElement('div');
        slotRow.className = 'audio-slot-item';
        slotRow.id = `audioPlaybackSlot_${slotIdx}`;
        slotRow.innerHTML = `
          <div class="audio-slot-left">
            <span>التسجيل ${slotIdx + 1}:</span>
            <audio controls src="${audioUrl}"></audio>
          </div>
          <button type="button" class="btn-delete-audio" data-slot="${slotIdx}" title="حذف هذا التسجيل" aria-label="حذف هذا التسجيل">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        `;

        slotRow.querySelector('.btn-delete-audio').addEventListener('click', () => {
          triggerHaptic(20);
          window.quranRecorder.deleteRecording(slotIdx);
          const log = getCurrentDailyLog();
          log.audioRecordingChecks[slotIdx] = false;
          persistState();
          renderDailyChecklist();
          renderAudioSlots();
          showToast(`تم حذف التسجيل ${slotIdx + 1}`);
        });

        container.appendChild(slotRow);
      }
    });
  }

  // 4. Render Daily Checkboxes and Counters
  function renderDailyChecklist() {
    const log = getCurrentDailyLog();

    // جلسات الاستماع للقارئ (3 مرات)
    [0, 1, 2].forEach(idx => {
      const card = document.getElementById(`reciterCheck_${idx}`);
      if (card) {
        if (log.listeningChecks[idx]) card.classList.add('checked');
        else card.classList.remove('checked');
      }
    });

    // تفسير المقدار
    const tafsirCard = document.getElementById('tafsirCheckCard');
    if (tafsirCard) {
      if (log.tafsirCheck) tafsirCard.classList.add('checked');
      else tafsirCard.classList.remove('checked');
    }

    // حفظ المقرر والمراجعة الأولية
    const initialRevCard = document.getElementById('initialReviewCard');
    if (initialRevCard) {
      if (log.initialReviewCheck) initialRevCard.classList.add('checked');
      else initialRevCard.classList.remove('checked');
    }

    // تسجيل الصوت ثلاث مرات
    [0, 1, 2].forEach(idx => {
      const card = document.getElementById(`audioRecCheck_${idx}`);
      if (card) {
        if (log.audioRecordingChecks[idx]) card.classList.add('checked');
        else card.classList.remove('checked');
      }
    });

    // التكرار عشر مرات (عداد)
    const repCounter = document.getElementById('repetitionCounterVal');
    if (repCounter) {
      repCounter.textContent = log.repetitionCounter;
      if (log.repetitionCounter >= 10) repCounter.classList.add('completed');
      else repCounter.classList.remove('completed');
    }

    // سرد المحفوظ لرفيقتين
    [0, 1].forEach(idx => {
      const card = document.getElementById(`friendCheck_${idx}`);
      if (card) {
        if (log.friendRecitationChecks[idx]) card.classList.add('checked');
        else card.classList.remove('checked');
      }
    });

    // قسم التثبيت: سرد الأوجه السابقة من السورة الحالية (تشيك بوكس)
    const prevPagesCard = document.getElementById('prevPagesCard');
    if (prevPagesCard) {
      if (log.prevPagesCheck || log.prevPagesCounter >= 5) prevPagesCard.classList.add('checked');
      else prevPagesCard.classList.remove('checked');
    }

    // قسم التثبيت: سرد السورة السابقة للسورة الحالية
    const lastTenCard = document.getElementById('lastTenPagesCard');
    if (lastTenCard) {
      if (log.lastTenPagesCheck) lastTenCard.classList.add('checked');
      else lastTenCard.classList.remove('checked');
    }

    // قسم المراجعة الدورية
    const totalDays = getCycleDaysCount();
    const activeCycleNum = Math.min(AppState.activeCycleDay || 1, totalDays);
    AppState.activeCycleDay = activeCycleNum;
    const currentCycleEntry = AppState.tenDaySchedule.find(item => item.day == activeCycleNum) || AppState.tenDaySchedule[0] || { day: 1, nearReview: "غير محدد", distantReview: "غير محدد" };

    const cycleDayBadge = document.getElementById('periodicCycleDayBadge');
    if (cycleDayBadge) {
      cycleDayBadge.textContent = `اليوم ${activeCycleNum} من ${totalDays}`;
    }

    const nearReviewText = document.getElementById('todayNearReviewPortion');
    if (nearReviewText) {
      nearReviewText.textContent = currentCycleEntry.nearReview || "غير محدد";
    }

    const distantReviewText = document.getElementById('todayDistantReviewPortion');
    if (distantReviewText) {
      distantReviewText.textContent = currentCycleEntry.distantReview || "غير محدد";
    }

    const nearReviewCard = document.getElementById('nearReviewCard');
    if (nearReviewCard) {
      if (log.nearReviewCheck) nearReviewCard.classList.add('checked');
      else nearReviewCard.classList.remove('checked');
    }

    const distantReviewCard = document.getElementById('distantReviewCard');
    if (distantReviewCard) {
      if (log.distantReviewCheck) distantReviewCard.classList.add('checked');
      else distantReviewCard.classList.remove('checked');
    }

    renderDynamicVisibility();
    renderMissed(log);
    renderMilestoneSummary(log);
  }

  // 5. Render Milestone Summary
  function renderMilestoneSummary(log) {
    const stats = calculateDailyProgress(log);
    const circle = document.getElementById('milestoneCircleBar');
    const text = document.getElementById('milestonePercentText');
    const tasksCount = document.getElementById('milestoneTasksCount');

    if (text) text.textContent = `${stats.percent}%`;
    if (tasksCount) tasksCount.textContent = `${stats.completed} من ${stats.total} مهمة مكتملة`;

    if (circle) {
      const offset = 157 - (stats.percent / 100) * 157;
      circle.style.strokeDashoffset = offset;
    }

    if (stats.total > 0 && stats.percent === 100 && !log._notifiedCompletion) {
      log._notifiedCompletion = true;
      showToast('اكتملت جميع مهام الورد المقررة لليوم');
    }
  }

  // 6. Render Date Scroller
  function renderDateScroller() {
    const scroller = document.getElementById('weekScroller');
    if (!scroller) return;

    scroller.innerHTML = '';
    const today = new Date();

    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date();
      d.setDate(today.getDate() + offset);

      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dateNum = String(d.getDate()).padStart(2, '0');
      const dateString = `${y}-${m}-${dateNum}`;
      const dayName = ARABIC_DAYS[d.getDay()];

      const isSelected = dateString === AppState.selectedDate;

      const btn = document.createElement('button');
      btn.className = `day-pill-btn ${isSelected ? 'active' : ''} ${hasMissed(AppState.dailyLogs[dateString]) ? 'has-missed' : ''}`;
      btn.innerHTML = `
        <span class="day-name">${dayName}</span>
        <span class="day-num">${dateNum}</span>
        <span class="day-dot-indicator"></span>
      `;

      btn.addEventListener('click', () => {
        triggerHaptic(15);
        AppState.selectedDate = dateString;
        renderAll();
      });

      scroller.appendChild(btn);
    }

    const hijriBadge = document.getElementById('hijriDateText');
    const gregBadge = document.getElementById('gregorianDateText');

    try {
      const currentSelectedDate = new Date(AppState.selectedDate);
      const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      if (hijriBadge) hijriBadge.textContent = hijriFormatter.format(currentSelectedDate);
      if (gregBadge) gregBadge.textContent = currentSelectedDate.toLocaleDateString('ar-EG', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch (e) {
      if (hijriBadge) hijriBadge.textContent = AppState.selectedDate;
    }
  }

  // 7. Render Review Schedule Table View
  function renderTenDayScheduleTable() {
    const container = document.getElementById('tenDayScheduleList');
    if (!container) return;

    const totalDays = getCycleDaysCount();
    const inputEl = document.getElementById('reviewDaysCountInput');
    if (inputEl && document.activeElement !== inputEl) {
      inputEl.value = totalDays;
    }
    const titleEl = document.getElementById('scheduleCycleTitle');
    if (titleEl) titleEl.textContent = `دورة المراجعة خلال ${totalDays} أيام`;

    container.innerHTML = '';

    AppState.tenDaySchedule.forEach(item => {
      const isCurrentActive = item.day === AppState.activeCycleDay;
      const card = document.createElement('div');
      card.className = `schedule-day-box-formal ${isCurrentActive ? 'active-cycle-day' : ''}`;
      card.innerHTML = `
        <div class="schedule-day-top-bar">
          <div class="schedule-day-label">
            <span>اليوم ${item.day}</span>
            ${isCurrentActive ? '<span class="formal-tag" style="color:var(--primary-medium);font-weight:700;">اليوم النشط حالياً</span>' : ''}
          </div>
          <button class="btn-verse-step set-active-day-btn" data-day="${item.day}" type="button" style="color:var(--text-main);background:var(--bg-subtle);">
            ${isCurrentActive ? 'نشط' : 'تحديد كيوم نشط'}
          </button>
        </div>
        <div class="inputs-grid-portions">
          <div class="portion-field-col">
            <label>المراجعة القريبة:</label>
            <input type="text" class="near-input" data-day="${item.day}" value="${item.nearReview || ''}" placeholder="السور أو الأوجه..." />
          </div>
          <div class="portion-field-col">
            <label>المراجعة البعيدة:</label>
            <input type="text" class="distant-input" data-day="${item.day}" value="${item.distantReview || ''}" placeholder="السور أو الأجزاء..." />
          </div>
        </div>
      `;

      card.querySelector('.set-active-day-btn').addEventListener('click', () => {
        triggerHaptic(20);
        AppState.activeCycleDay = item.day;
        const currentLog = getCurrentDailyLog();
        currentLog.cycleDay = item.day;
        persistState();
        renderAll();
        showToast(`تم تعيين اليوم ${item.day} كيوم المراجعة النشط`);
      });

      const nearInput = card.querySelector('.near-input');
      nearInput.addEventListener('change', (e) => {
        item.nearReview = e.target.value.trim();
        persistState();
        renderDailyChecklist();
      });

      const distantInput = card.querySelector('.distant-input');
      distantInput.addEventListener('change', (e) => {
        item.distantReview = e.target.value.trim();
        persistState();
        renderDailyChecklist();
      });

      container.appendChild(card);
    });
  }

  // 8. Render Weekly Schedule View
  function renderWeeklyScheduleView() {
    const container = document.getElementById('weeklyScheduleList');
    if (!container) return;

    container.innerHTML = '';

    DAY_KEYS.forEach((key) => {
      const routine = AppState.weeklySchedule[key] || DEFAULT_WEEKLY_SCHEDULE[key];
      const card = document.createElement('div');
      card.className = 'weekly-card-formal';
      card.innerHTML = `
        <div class="weekly-card-top">
          <h4 class="weekly-day-title">${routine.name}</h4>
          <span style="font-size:0.72rem;color:var(--text-muted)">تخصيص المهام</span>
        </div>
        <div class="weekly-options-grid">
          <div class="weekly-chip-btn ${routine.hasNew ? 'active' : ''}" data-day="${key}" data-prop="hasNew">
            <span>${routine.hasNew ? '✓' : '○'}</span> حفظ جديد
          </div>
          <div class="weekly-chip-btn ${routine.hasConsolidation ? 'active' : ''}" data-day="${key}" data-prop="hasConsolidation">
            <span>${routine.hasConsolidation ? '✓' : '○'}</span> تثبيت
          </div>
          <div class="weekly-chip-btn ${routine.hasNearReview ? 'active' : ''}" data-day="${key}" data-prop="hasNearReview">
            <span>${routine.hasNearReview ? '✓' : '○'}</span> مراجعة قريبة
          </div>
          <div class="weekly-chip-btn ${routine.hasDistantReview ? 'active' : ''}" data-day="${key}" data-prop="hasDistantReview">
            <span>${routine.hasDistantReview ? '✓' : '○'}</span> مراجعة بعيدة
          </div>
        </div>
        <div class="form-field-group" style="margin-bottom:0">
          <input type="text" class="field-input weekly-note-input" data-day="${key}" value="${routine.note || ''}" placeholder="ملاحظة اليوم (مثال: قراءة سورة الكهف / راحة)" />
        </div>
      `;

      card.querySelectorAll('.weekly-chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
          triggerHaptic(15);
          const prop = chip.getAttribute('data-prop');
          routine[prop] = !routine[prop];
          persistState();
          renderWeeklyScheduleView();
          renderDailyChecklist();
        });
      });

      const noteInput = card.querySelector('.weekly-note-input');
      noteInput.addEventListener('change', (e) => {
        routine.note = e.target.value.trim();
        persistState();
        renderDailyChecklist();
      });

      container.appendChild(card);
    });
  }

  function saveCycleSchedule() {
    triggerHaptic(25);
    const dayBoxes = document.querySelectorAll('#tenDayScheduleList .schedule-day-box-formal');
    dayBoxes.forEach((card, index) => {
      const nearInput = card.querySelector('.near-input');
      const distantInput = card.querySelector('.distant-input');
      if (AppState.tenDaySchedule[index]) {
        if (nearInput) AppState.tenDaySchedule[index].nearReview = nearInput.value.trim();
        if (distantInput) AppState.tenDaySchedule[index].distantReview = distantInput.value.trim();
      }
    });

    const daysInput = document.getElementById('reviewDaysCountInput');
    if (daysInput) {
      const val = parseInt(daysInput.value);
      if (val && val > 0 && val !== getCycleDaysCount()) {
        updateCycleDaysCount(val, false);
      }
    }

    persistState();
    renderDailyChecklist();
    renderDateScroller();
    showToast('تم حفظ جدول دورة المراجعة بنجاح');
  }

  function saveWeeklySchedule() {
    triggerHaptic(25);
    const noteInputs = document.querySelectorAll('#weeklyScheduleList .weekly-note-input');
    noteInputs.forEach(input => {
      const key = input.getAttribute('data-day');
      if (key && AppState.weeklySchedule[key]) {
        AppState.weeklySchedule[key].note = input.value.trim();
      }
    });

    persistState();
    renderDailyChecklist();
    showToast('تم حفظ جدول أيام الأسبوع بنجاح');
  }

  // 9. Render Surah Selection in Settings
  function populateSurahSelectDropdown() {
    const select = document.getElementById('settingsSurahSelect');
    if (!select || select.children.length > 1) return;

    if (window.QURAN_SURAHS) {
      window.QURAN_SURAHS.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية - ${s.type})`;
        opt.dataset.verses = s.verses;
        select.appendChild(opt);
      });
    }

    select.value = AppState.surahConfig.name;

    select.addEventListener('change', (e) => {
      const selectedOpt = select.options[select.selectedIndex];
      const verses = selectedOpt.dataset.verses;
      const surahNameInput = document.getElementById('settingsSurahName');
      const totalVersesInput = document.getElementById('settingsTotalVerses');

      if (surahNameInput) surahNameInput.value = e.target.value;
      if (totalVersesInput && verses) totalVersesInput.value = verses;
    });
  }

  function populateSettingsForm() {
    const surahNameInput = document.getElementById('settingsSurahName');
    const totalVersesInput = document.getElementById('settingsTotalVerses');
    const currentVerseInput = document.getElementById('settingsCurrentVerse');
    const dailyTargetInput = document.getElementById('settingsDailyTarget');
    const activeCycleInput = document.getElementById('settingsActiveCycleDay');

    if (surahNameInput) surahNameInput.value = AppState.surahConfig.name;
    if (totalVersesInput) totalVersesInput.value = AppState.surahConfig.totalVerses;
    if (currentVerseInput) currentVerseInput.value = AppState.surahConfig.currentVerse;
    if (dailyTargetInput) dailyTargetInput.value = AppState.surahConfig.dailyTarget;
    if (activeCycleInput) activeCycleInput.value = AppState.activeCycleDay;
    const surahSel = document.getElementById('settingsSurahSelect');
    if (surahSel) surahSel.value = AppState.surahConfig.name;
  }

  function renderAll() {
    renderSurahCard();
    renderDailyChecklist();
    renderAudioSlots();
    renderDateScroller();
    renderTenDayScheduleTable();
    renderWeeklyScheduleView();
    renderReports();
  }

  // --- EVENT ATTACHMENTS ---

  function attachEventListeners() {
    // 1. Navigation Tabs
    const navButtons = document.querySelectorAll('.nav-item-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic(20);
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const tabTarget = btn.getAttribute('data-tab');
        document.querySelectorAll('.main-view-section').forEach(view => {
          view.classList.remove('active');
        });

        const targetView = document.getElementById(tabTarget);
        if (targetView) targetView.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // 2. Quick verse increments
    const add1VerseBtn = document.getElementById('quickAdd1Verse');
    if (add1VerseBtn) {
      add1VerseBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const max = parseInt(AppState.surahConfig.totalVerses) || 286;
        if (AppState.surahConfig.currentVerse < max) {
          AppState.surahConfig.currentVerse += 1;
          afterVersesAdded(1);
          renderSurahCard();
          persistState();
          showToast(`تم الوصول إلى الآية ${AppState.surahConfig.currentVerse}`);
        }
      });
    }

    const add5VerseBtn = document.getElementById('quickAdd5Verses');
    if (add5VerseBtn) {
      add5VerseBtn.addEventListener('click', () => {
        triggerHaptic(25);
        const max = parseInt(AppState.surahConfig.totalVerses) || 286;
        const before5 = AppState.surahConfig.currentVerse;
        AppState.surahConfig.currentVerse = Math.min(max, before5 + 5);
        afterVersesAdded(AppState.surahConfig.currentVerse - before5);
        renderSurahCard();
        persistState();
        showToast(`تم الوصول إلى الآية ${AppState.surahConfig.currentVerse}`);
      });
    }

    // 3. Checklist Interactions
    // جلسات الاستماع للقارئ (3 مرات)
    [0, 1, 2].forEach(idx => {
      const card = document.getElementById(`reciterCheck_${idx}`);
      if (card) {
        card.addEventListener('click', () => {
          triggerHaptic(15);
          const log = getCurrentDailyLog();
          log.listeningChecks[idx] = !log.listeningChecks[idx];
          renderDailyChecklist();
          persistState();
        });
      }
    });

    // تفسير المقدار
    const tafsirCard = document.getElementById('tafsirCheckCard');
    if (tafsirCard) {
      tafsirCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.tafsirCheck = !log.tafsirCheck;
        renderDailyChecklist();
        persistState();
      });
    }

    // حفظ المقرر والمراجعة الأولية
    const initialRevCard = document.getElementById('initialReviewCard');
    if (initialRevCard) {
      initialRevCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.initialReviewCheck = !log.initialReviewCheck;
        renderDailyChecklist();
        persistState();
      });
    }

    // تسجيل الصوت (3 مرات)
    [0, 1, 2].forEach(idx => {
      const card = document.getElementById(`audioRecCheck_${idx}`);
      if (card) {
        card.addEventListener('click', () => {
          triggerHaptic(15);
          const log = getCurrentDailyLog();
          log.audioRecordingChecks[idx] = !log.audioRecordingChecks[idx];
          renderDailyChecklist();
          persistState();
        });
      }
    });

    // التكرار عشر مرات (عداد)
    const repMinusBtn = document.getElementById('repMinusBtn');
    const repPlusBtn = document.getElementById('repPlusBtn');
    if (repMinusBtn) {
      repMinusBtn.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        if (log.repetitionCounter > 0) {
          log.repetitionCounter--;
          renderDailyChecklist();
          persistState();
        }
      });
    }
    if (repPlusBtn) {
      repPlusBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const log = getCurrentDailyLog();
        log.repetitionCounter++;
        if (log.repetitionCounter === 10) {
          showToast('اكتمل التكرار (10 مرات) بنجاح');
        }
        renderDailyChecklist();
        persistState();
      });
    }

    // سرد المحفوظ لرفيقتين
    [0, 1].forEach(idx => {
      const card = document.getElementById(`friendCheck_${idx}`);
      if (card) {
        card.addEventListener('click', () => {
          triggerHaptic(15);
          const log = getCurrentDailyLog();
          log.friendRecitationChecks[idx] = !log.friendRecitationChecks[idx];
          renderDailyChecklist();
          persistState();
        });
      }
    });

    // قسم التثبيت: سرد الأوجه السابقة من السورة الحالية
    const prevPagesCard = document.getElementById('prevPagesCard');
    if (prevPagesCard) {
      prevPagesCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        const currentlyDone = log.prevPagesCheck || (log.prevPagesCounter >= 5);
        log.prevPagesCheck = !currentlyDone;
        log.prevPagesCounter = log.prevPagesCheck ? 5 : 0;
        renderDailyChecklist();
        persistState();
      });
    }

    // قسم التثبيت: سرد السورة السابقة للسورة الحالية
    const lastTenCard = document.getElementById('lastTenPagesCard');
    if (lastTenCard) {
      lastTenCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.lastTenPagesCheck = !log.lastTenPagesCheck;
        renderDailyChecklist();
        persistState();
      });
    }

    // قسم المراجعة الدورية
    const nearReviewCard = document.getElementById('nearReviewCard');
    if (nearReviewCard) {
      nearReviewCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.nearReviewCheck = !log.nearReviewCheck;
        renderDailyChecklist();
        persistState();
      });
    }

    const distantReviewCard = document.getElementById('distantReviewCard');
    if (distantReviewCard) {
      distantReviewCard.addEventListener('click', () => {
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.distantReviewCheck = !log.distantReviewCheck;
        renderDailyChecklist();
        persistState();
      });
    }

    const open10DayScheduleLink = document.getElementById('open10DayScheduleLink');
    if (open10DayScheduleLink) {
      open10DayScheduleLink.addEventListener('click', () => {
        triggerHaptic(15);
        const scheduleNav = document.querySelector('.nav-item-btn[data-tab="view-schedule"]');
        if (scheduleNav) scheduleNav.click();
      });
    }

    const advanceCycleDayBtn = document.getElementById('advanceCycleDayBtn');
    if (advanceCycleDayBtn) {
      advanceCycleDayBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const totalDays = getCycleDaysCount();
        AppState.activeCycleDay = (AppState.activeCycleDay % totalDays) + 1;
        const log = getCurrentDailyLog();
        log.cycleDay = AppState.activeCycleDay;
        persistState();
        renderAll();
        showToast(`تم الانتقال إلى اليوم ${AppState.activeCycleDay} في دورة المراجعة`);
      });
    }

    // Accordion controls for Schedule page
    const cycleHeader = document.getElementById('cycleScheduleHeader');
    const cycleSection = document.getElementById('cycleScheduleSection');
    if (cycleHeader && cycleSection) {
      cycleHeader.addEventListener('click', () => {
        triggerHaptic(15);
        const isOpen = cycleSection.classList.contains('open');
        cycleSection.classList.toggle('open', !isOpen);
        cycleSection.classList.toggle('collapsed', isOpen);
        cycleHeader.setAttribute('aria-expanded', String(!isOpen));
      });
    }

    const weeklyHeader = document.getElementById('weeklyScheduleHeader');
    const weeklySection = document.getElementById('weeklyScheduleSection');
    if (weeklyHeader && weeklySection) {
      weeklyHeader.addEventListener('click', () => {
        triggerHaptic(15);
        const isOpen = weeklySection.classList.contains('open');
        weeklySection.classList.toggle('open', !isOpen);
        weeklySection.classList.toggle('collapsed', isOpen);
        weeklyHeader.setAttribute('aria-expanded', String(!isOpen));
      });
    }

    const applyDaysBtn = document.getElementById('applyDaysCountBtn');
    if (applyDaysBtn) {
      applyDaysBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const input = document.getElementById('reviewDaysCountInput');
        if (input) {
          const val = parseInt(input.value);
          if (val && val > 0) updateCycleDaysCount(val, true);
        }
      });
    }

    const reviewDaysInput = document.getElementById('reviewDaysCountInput');
    if (reviewDaysInput) {
      reviewDaysInput.addEventListener('change', (e) => {
        const val = parseInt(e.target.value);
        if (val && val > 0 && val !== getCycleDaysCount()) {
          triggerHaptic(20);
          updateCycleDaysCount(val, true);
        }
      });
    }

    const saveCycleBtn = document.getElementById('saveCycleScheduleBtn');
    if (saveCycleBtn) {
      saveCycleBtn.addEventListener('click', () => saveCycleSchedule());
    }

    const saveWeeklyBtn = document.getElementById('saveWeeklyScheduleBtn');
    if (saveWeeklyBtn) {
      saveWeeklyBtn.addEventListener('click', () => saveWeeklySchedule());
    }

    // 4. Voice Recorder Controls
    const startRecordBtn = document.getElementById('startRecordBtn');
    const recordTimer = document.getElementById('recordTimer');

    if (startRecordBtn) {
      startRecordBtn.addEventListener('click', async () => {
        triggerHaptic(30);
        if (window.quranRecorder.isRecording) {
          window.quranRecorder.stopRecording();
          startRecordBtn.classList.remove('recording');
          startRecordBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
            <span>بدء التسجيل</span>
          `;
        } else {
          const log = getCurrentDailyLog();
          let nextSlot = 0;
          if (log.audioRecordingChecks[0] && !log.audioRecordingChecks[1]) nextSlot = 1;
          else if (log.audioRecordingChecks[0] && log.audioRecordingChecks[1]) nextSlot = 2;

          const started = await window.quranRecorder.startRecording(
            nextSlot,
            (timeStr) => {
              if (recordTimer) recordTimer.textContent = timeStr;
            },
            (slotIdx) => {
              log.audioRecordingChecks[slotIdx] = true;
              renderDailyChecklist();
              renderAudioSlots();
              persistState();
              showToast(`تم حفظ التسجيل رقم ${slotIdx + 1}`);
            }
          );

          if (started) {
            startRecordBtn.classList.add('recording');
            startRecordBtn.innerHTML = `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="6" y="6" width="12" height="12"></rect></svg>
              <span>إيقاف التسجيل</span>
            `;
          }
        }
      });
    }

    // 5. Save Surah Settings
    const saveSurahSettingsBtn = document.getElementById('saveSurahSettingsBtn');
    if (saveSurahSettingsBtn) {
      saveSurahSettingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerHaptic(20);
        const nameVal = document.getElementById('settingsSurahName').value.trim();
        const totalVal = parseInt(document.getElementById('settingsTotalVerses').value) || 1;
        const currentVal = parseInt(document.getElementById('settingsCurrentVerse').value) || 0;
        const targetVal = parseInt(document.getElementById('settingsDailyTarget').value) || 5;
        const cycleVal = parseInt(document.getElementById('settingsActiveCycleDay').value) || 1;

        const prevName = AppState.surahConfig.name, prevVerse = parseInt(AppState.surahConfig.currentVerse) || 0;
        AppState.surahConfig.name = nameVal || 'البقرة';
        AppState.surahConfig.totalVerses = totalVal;
        AppState.surahConfig.currentVerse = Math.min(totalVal, currentVal);
        const delta = AppState.surahConfig.currentVerse - prevVerse;
        if (prevName === AppState.surahConfig.name && delta > 0) afterVersesAdded(delta); else syncCompletion();
        AppState.surahConfig.dailyTarget = targetVal;
        AppState.activeCycleDay = Math.min(10, Math.max(1, cycleVal));

        const log = getCurrentDailyLog();
        log.cycleDay = AppState.activeCycleDay;

        persistState();
        renderAll();
        showToast('تم حفظ إعدادات السورة بنجاح');

        const homeNav = document.querySelector('.nav-item-btn[data-tab="view-home"]');
        if (homeNav) homeNav.click();
      });
    }

    // 6. Data Backup & Restore
    const exportDataBtn = document.getElementById('exportDataBtn');
    if (exportDataBtn) {
      exportDataBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(AppState, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `quran_tracker_backup_${getTodayDateString()}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('تم تصدير ملف النسخة الاحتياطية بنجاح');
      });
    }

    const importFileInput = document.getElementById('importFileInput');
    if (importFileInput) {
      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (imported.surahConfig) AppState.surahConfig = imported.surahConfig;
            if (imported.activeCycleDay) AppState.activeCycleDay = imported.activeCycleDay;
            if (imported.tenDaySchedule) AppState.tenDaySchedule = imported.tenDaySchedule;
            if (imported.weeklySchedule) AppState.weeklySchedule = imported.weeklySchedule;
            if (imported.dailyLogs) AppState.dailyLogs = imported.dailyLogs;
            if (Array.isArray(imported.completedSurahs)) AppState.completedSurahs = imported.completedSurahs;

            await persistState();
            renderAll();
            showToast('تم استرجاع البيانات بنجاح');
          } catch (err) {
            alert('الملف غير صالح أو تالف.');
          }
        };
        reader.readAsText(file);
      });
    }

    // Keyboard accessibility for checkboxes
    document.querySelectorAll('[role="checkbox"]').forEach(el => {
      el.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          el.click();
        }
      });
    });
  }

  // ======================================================
  // أدوات مساعدة، عدم الإنجاز، التقارير، تسجيل الدخول
  // ======================================================
  const $ = (id) => document.getElementById(id);
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parseDate = (s) => { const p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const fmtDate = (s) => parseDate(s).toLocaleDateString('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const MISSED_LABELS = { memo: 'الحفظ', consolidation: 'التثبيت', review: 'المراجعة' };
  const MISSED_KEYS = ['memo', 'consolidation', 'review'];

  function defaultSurahConfig() { return { name: "البقرة", totalVerses: 286, currentVerse: 0, dailyTarget: 5 }; }

  function resetState() {
    AppState.selectedDate = getTodayDateString();
    AppState.activeCycleDay = 1;
    AppState.totalCycleDays = 10;
    AppState.surahConfig = defaultSurahConfig();
    AppState.tenDaySchedule = JSON.parse(JSON.stringify(DEFAULT_TEN_DAY_SCHEDULE));
    AppState.weeklySchedule = JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
    AppState.dailyLogs = {};
    AppState.completedSurahs = [];
    AppState.urgentExamPlan = null;
  }

  function applyPayload(p) {
    if (!p) return;
    if (p.activeCycleDay) AppState.activeCycleDay = p.activeCycleDay;

    if (p.totalCycleDays) {
      AppState.totalCycleDays = parseInt(p.totalCycleDays) || 10;
    } else if (Array.isArray(p.tenDaySchedule) && p.tenDaySchedule.length > 0) {
      AppState.totalCycleDays = p.tenDaySchedule.length;
    } else {
      AppState.totalCycleDays = 10;
    }

    if (p.surahConfig) AppState.surahConfig = Object.assign(defaultSurahConfig(), p.surahConfig);

    if (Array.isArray(p.tenDaySchedule) && p.tenDaySchedule.length > 0) {
      AppState.tenDaySchedule = p.tenDaySchedule;
    }

    if (p.weeklySchedule) AppState.weeklySchedule = Object.assign(JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)), p.weeklySchedule);
    if (p.dailyLogs) AppState.dailyLogs = p.dailyLogs;
    if (Array.isArray(p.completedSurahs)) AppState.completedSurahs = p.completedSurahs;
    if (p.urgentExamPlan) AppState.urgentExamPlan = p.urgentExamPlan;

    // Sync array length with AppState.totalCycleDays if needed
    const targetDays = getCycleDaysCount();
    if (!AppState.tenDaySchedule || AppState.tenDaySchedule.length !== targetDays) {
      updateCycleDaysCount(targetDays, false);
    }
  }

  function ensureLog(l) {
    if (!l.missed) l.missed = { memo: false, consolidation: false, review: false };
    if (!Array.isArray(l.memorization)) l.memorization = [];
    return l;
  }

  function routineFor(dateStr) {
    const key = DAY_KEYS[parseDate(dateStr).getDay()];
    return AppState.weeklySchedule[key] || DEFAULT_WEEKLY_SCHEDULE[key];
  }
  function activeKeys(r) {
    return MISSED_KEYS.filter(k => k === 'memo' ? r.hasNew : k === 'consolidation' ? r.hasConsolidation : (r.hasNearReview || r.hasDistantReview));
  }
  function missedText(dateStr, m) {
    const flagged = MISSED_KEYS.filter(k => m[k]);
    const act = activeKeys(routineFor(dateStr));
    if (flagged.length > 1 && act.length === flagged.length && act.every(k => m[k])) return 'الكل';
    return flagged.map(k => MISSED_LABELS[k]).join(' و ');
  }
  const hasMissed = (l) => !!(l && l.missed && (l.missed.memo || l.missed.consolidation || l.missed.review));

  // تسجيل الآيات المحفوظة في سجل اليوم + كشف إتمام السورة
  function afterVersesAdded(added) {
    if (added > 0) {
      const log = getCurrentDailyLog();
      const end = parseInt(AppState.surahConfig.currentVerse), start = end - added + 1;
      const last = log.memorization[log.memorization.length - 1];
      if (last && last.surah === AppState.surahConfig.name && last.to === start - 1) last.to = end;
      else log.memorization.push({ surah: AppState.surahConfig.name, from: start, to: end });
    }
    syncCompletion();
  }

  function syncCompletion() {
    const c = AppState.surahConfig, tot = parseInt(c.totalVerses) || 0, cur = parseInt(c.currentVerse) || 0;
    const i = AppState.completedSurahs.findIndex(x => x.name === c.name);
    if (tot > 0 && cur >= tot) {
      if (i < 0) {
        AppState.completedSurahs.push({ name: c.name, totalVerses: tot, completedOn: AppState.selectedDate });
        reportSurah = c.name;
        showToast(`أتممت سورة ${c.name}، تقريرها جاهز في لوحة التقارير`);
      }
    } else if (i >= 0) AppState.completedSurahs.splice(i, 1);
  }

  // ---------- عدم الإنجاز ----------
  function renderMissed(log) {
    const card = $('missedCard'); if (!card) return;
    const routine = getSelectedDayRoutine(), act = activeKeys(routine), m = log.missed;
    card.style.display = act.length ? 'block' : 'none';
    document.querySelectorAll('#missedChips .missed-chip').forEach(chip => {
      const k = chip.dataset.missed;
      if (k === 'all') chip.classList.toggle('active', act.length > 0 && act.every(x => m[x]));
      else { chip.style.display = act.includes(k) ? '' : 'none'; chip.classList.toggle('active', !!m[k]); }
    });
    const map = { memo: 'sectionNewMemoCard', consolidation: 'sectionConsolidationCard', review: 'sectionPeriodicCard' };
    MISSED_KEYS.forEach(k => { const el = $(map[k]); if (el) el.classList.toggle('is-missed', !!m[k] && act.includes(k)); });
    const txt = missedText(AppState.selectedDate, m);
    const sum = $('missedSummary');
    if (sum) sum.textContent = txt ? `لم يُنجز: ${txt}` : 'لم يُسجَّل شيء لهذا اليوم';
    card.classList.toggle('has-missed', !!txt);
  }

  // ---------- التقارير ----------
  let reportSurah = null;
  const allLogs = () => Object.keys(AppState.dailyLogs).sort().map(d => [d, ensureLog(AppState.dailyLogs[d])]);

  function reportSurahNames() {
    const names = [];
    const add = (n) => { if (n && !names.includes(n)) names.push(n); };
    add(AppState.surahConfig.name);
    AppState.completedSurahs.slice().reverse().forEach(c => add(c.name));
    allLogs().reverse().forEach(([, l]) => l.memorization.forEach(e => add(e.surah)));
    return names;
  }

  const missedRows = (list) => list.map(([d, l]) =>
    `<div class="missed-log-row"><span class="mlr-date">${esc(fmtDate(d))}</span><span class="mlr-what">لم يُنجز: ${esc(missedText(d, l.missed))}</span></div>`).join('');

  function renderReports() {
    const overview = $('reportOverview'); if (!overview) return;
    const logs = allLogs();
    let verses = 0, memoDays = 0;
    logs.forEach(([, l]) => { const v = l.memorization.reduce((a, e) => a + (e.to - e.from + 1), 0); verses += v; if (v) memoDays++; });
    const missedList = logs.filter(([, l]) => hasMissed(l)).reverse();
    const stat = (v, t) => `<div class="report-stat"><div class="report-stat-val">${v}</div><div class="report-stat-label">${t}</div></div>`;
    overview.innerHTML = stat(verses, 'آية محفوظة مسجلة') + stat(memoDays, 'يوم حفظ') + stat(AppState.completedSurahs.length, 'سورة مكتملة') + stat(missedList.length, 'يوم عدم إنجاز');

    // اختيار السورة
    const names = reportSurahNames(), sel = $('reportSurahSelect');
    if (!names.includes(reportSurah)) reportSurah = names[0];
    sel.innerHTML = names.map(n => `<option value="${esc(n)}">سورة ${esc(n)}${AppState.completedSurahs.some(c => c.name === n) ? ' (مكتملة)' : ''}</option>`).join('');
    sel.value = reportSurah;

    const done = AppState.completedSurahs.find(c => c.name === reportSurah);
    $('reportSurahState').textContent = done ? 'مكتملة' : 'جارية';
    const rows = logs.filter(([, l]) => l.memorization.some(e => e.surah === reportSurah));
    const body = $('surahReportBody');

    if (!rows.length) {
      body.innerHTML = '<p class="report-empty">لا توجد أيام حفظ مسجلة لهذه السورة بعد. تُسجَّل الآيات عند استخدام زر +1 أو +5 آيات في الصفحة الرئيسية.</p>';
    } else {
      const first = rows[0][0], last = rows[rows.length - 1][0];
      const span = Math.round((parseDate(last) - parseDate(first)) / 86400000) + 1;
      let vs = 0, reps = 0, revDays = 0;
      const dayHtml = rows.map(([d, l]) => {
        const es = l.memorization.filter(e => e.surah === reportSurah);
        const n = es.reduce((a, e) => a + (e.to - e.from + 1), 0);
        vs += n; reps += l.repetitionCounter || 0;
        if (l.nearReviewCheck || l.distantReviewCheck) revDays++;
        const cnt = (a) => a.filter(Boolean).length;
        const yn = (b) => b ? 'تمت' : 'لم تتم';
        const ranges = es.map(e => e.from === e.to ? `الآية ${e.from}` : `الآيات ${e.from} - ${e.to}`).join('، ');
        const mt = hasMissed(l) ? `<div class="rep-day-missed">لم يُنجز: ${esc(missedText(d, l.missed))}</div>` : '';
        return `<div class="rep-day">
          <div class="rep-day-head"><span class="rep-day-date">${esc(fmtDate(d))}</span><span class="rep-day-verses">${ranges} (${n})</span></div>
          <dl class="rep-day-grid">
            <div><dt>التكرار</dt><dd>${l.repetitionCounter || 0} من 10</dd></div>
            <div><dt>الاستماع</dt><dd>${cnt(l.listeningChecks)} من 3</dd></div>
            <div><dt>التسجيل</dt><dd>${cnt(l.audioRecordingChecks)} من 3</dd></div>
            <div><dt>سرد للرفيقتين</dt><dd>${cnt(l.friendRecitationChecks)} من 2</dd></div>
            <div><dt>المراجعة القريبة</dt><dd>${yn(l.nearReviewCheck)}</dd></div>
            <div><dt>المراجعة البعيدة</dt><dd>${yn(l.distantReviewCheck)}</dd></div>
            <div><dt>التثبيت</dt><dd>${yn(l.prevPagesCheck || l.prevPagesCounter >= 5)}</dd></div>
          </dl>${mt}</div>`;
      }).join('');
      const missedIn = logs.filter(([d, l]) => d >= first && d <= last && hasMissed(l)).reverse();
      const stat2 = (v, t) => `<div class="report-stat small"><div class="report-stat-val">${v}</div><div class="report-stat-label">${t}</div></div>`;
      body.innerHTML = `
        <p class="report-range">من ${esc(fmtDate(first))} إلى ${esc(fmtDate(last))}${done ? `، وأُتمّت في ${esc(fmtDate(done.completedOn))}` : ''}</p>
        <div class="report-overview">${stat2(rows.length, 'أيام الحفظ')}${stat2(vs, 'آية')}${stat2(reps, 'مجموع التكرار')}${stat2(revDays, 'أيام المراجعة')}${stat2(span, 'مدة السورة بالأيام')}${stat2(missedIn.length, 'أيام عدم الإنجاز')}</div>
        <div class="rep-days">${dayHtml}</div>
        ${missedIn.length ? `<h4 class="report-sub">أيام عدم الإنجاز خلال السورة</h4>${missedRows(missedIn)}` : ''}`;
    }

    $('missedLogCount').textContent = `${missedList.length} يوم`;
    $('missedLogList').innerHTML = missedList.length ? missedRows(missedList.slice(0, 60)) : '<p class="report-empty">لا توجد أيام عدم إنجاز مسجلة.</p>';
  }

  function downloadSurahReportPDF(surahName) {
    if (!surahName) return;
    const logs = allLogs();
    const rows = logs.filter(([, l]) => l.memorization.some(e => e.surah === surahName));
    const done = AppState.completedSurahs.find(c => c.name === surahName);

    if (!rows.length) {
      showToast('لا توجد بيانات حفظ مسجلة لهذه السورة بعد لتصديرها');
      return;
    }

    const first = rows[0][0], last = rows[rows.length - 1][0];
    const span = Math.round((parseDate(last) - parseDate(first)) / 86400000) + 1;
    let totalVerses = 0, totalReps = 0, totalRevDays = 0;

    const dayRowsHtml = rows.map(([d, l]) => {
      const es = l.memorization.filter(e => e.surah === surahName);
      const n = es.reduce((a, e) => a + (e.to - e.from + 1), 0);
      totalVerses += n;
      totalReps += l.repetitionCounter || 0;
      if (l.nearReviewCheck || l.distantReviewCheck) totalRevDays++;
      const cnt = (a) => (a || []).filter(Boolean).length;
      const yn = (b) => b ? 'تمت' : 'لم تتم';
      const ranges = es.map(e => e.from === e.to ? `الآية ${e.from}` : `الآيات ${e.from} - ${e.to}`).join('، ');
      const isMissed = hasMissed(l);

      return `
        <tr style="${isMissed ? 'background-color: #fef2f2;' : ''}">
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${esc(fmtDate(d))}</td>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">${ranges} (${n})</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${l.repetitionCounter || 0} من 10</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cnt(l.listeningChecks)} من 3</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cnt(l.audioRecordingChecks)} من 3</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cnt(l.friendRecitationChecks)} من 2</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${yn(l.nearReviewCheck)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${yn(l.distantReviewCheck)}</td>
          <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${yn(l.prevPagesCheck || l.prevPagesCounter >= 5)}</td>
        </tr>
      `;
    }).join('');

    const pdfContainer = document.createElement('div');
    pdfContainer.style.padding = '20px';
    pdfContainer.style.fontFamily = "'IBM Plex Sans Arabic', Arial, sans-serif";
    pdfContainer.style.direction = 'rtl';
    pdfContainer.style.color = '#13241e';
    pdfContainer.style.backgroundColor = '#ffffff';

    pdfContainer.innerHTML = `
      <div style="text-align: center; border-bottom: 2px solid #0f3d2e; padding-bottom: 12px; margin-bottom: 20px;">
        <h1 style="color: #0f3d2e; font-size: 22px; margin-bottom: 4px;">منصة تبيان | نظام متابعة المحفوظ القرآني</h1>
        <h2 style="color: #9a6b1f; font-size: 18px; margin: 0;">تقرير الإنجاز لسورة ${esc(surahName)} ${done ? '(مكتملة)' : '(جارية)'}</h2>
        <p style="font-size: 12px; color: #6b8277; margin-top: 6px;">تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')} | الفترة: من ${esc(fmtDate(first))} إلى ${esc(fmtDate(last))}</p>
      </div>

      <div style="display: flex; justify-content: space-around; background: #f0fdf9; border: 1px solid #0d9488; border-radius: 8px; padding: 12px; margin-bottom: 20px; text-align: center;">
        <div><strong style="font-size: 16px; color: #0f3d2e;">${rows.length}</strong><div style="font-size: 11px; color: #4b6358;">أيام الحفظ</div></div>
        <div><strong style="font-size: 16px; color: #0f3d2e;">${totalVerses}</strong><div style="font-size: 11px; color: #4b6358;">آية محفوظة</div></div>
        <div><strong style="font-size: 16px; color: #0f3d2e;">${totalReps}</strong><div style="font-size: 11px; color: #4b6358;">مجموع التكرار</div></div>
        <div><strong style="font-size: 16px; color: #0f3d2e;">${totalRevDays}</strong><div style="font-size: 11px; color: #4b6358;">أيام المراجعة</div></div>
        <div><strong style="font-size: 16px; color: #0f3d2e;">${span}</strong><div style="font-size: 11px; color: #4b6358;">المدة بالأيام</div></div>
      </div>

      <h3 style="color: #0f3d2e; font-size: 14px; margin-bottom: 8px;">تفاصيل الأيام والسجل اليومي:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #0f3d2e; color: #ffffff;">
            <th style="padding: 8px; border: 1px solid #0f3d2e;">التاريخ</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">الآيات</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">التكرار</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">الاستماع</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">التسجيل</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">السرد</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">م. قريبة</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">م. بعيدة</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">التثبيت</th>
          </tr>
        </thead>
        <tbody>
          ${dayRowsHtml}
        </tbody>
      </table>

      <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #6b8277; border-top: 1px solid #eee; padding-top: 10px;">
        تم استخراج هذا التقرير تلقائياً من منصة تبيان الرقمية للمحفوظ القرآني
      </div>
    `;

    if (window.html2pdf) {
      showToast('جارِ إنشاء ملف PDF...');
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `تقرير_سورة_${surahName}_${getTodayDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      window.html2pdf().set(opt).from(pdfContainer).save().then(() => {
        showToast('تم تحميل ملف PDF بنجاح');
      }).catch(err => {
        console.error(err);
        fallbackPrintPDF(pdfContainer.innerHTML);
      });
    } else {
      fallbackPrintPDF(pdfContainer.innerHTML);
    }
  }

  function fallbackPrintPDF(htmlContent) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('يرجى السماح بالنوافذ المنبثقة لطباعة أو حفظ التقرير.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>تقرير سورة</title>
        <style>
          body { font-family: 'IBM Plex Sans Arabic', Arial, sans-serif; direction: rtl; padding: 20px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() { window.print(); window.close(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  function attachExtraListeners() {
    $('missedToggleBtn').addEventListener('click', () => {
      const opts = $('missedOptions'), open = opts.hidden;
      opts.hidden = !open;
      $('missedToggleBtn').setAttribute('aria-expanded', String(open));
      $('missedCard').classList.toggle('open', open);
    });
    $('missedChips').addEventListener('click', (e) => {
      const chip = e.target.closest('.missed-chip'); if (!chip) return;
      triggerHaptic(15);
      const log = getCurrentDailyLog(), act = activeKeys(getSelectedDayRoutine()), k = chip.dataset.missed;
      if (k === 'all') { const on = act.every(x => log.missed[x]); act.forEach(x => { log.missed[x] = !on; }); }
      else log.missed[k] = !log.missed[k];
      persistState(); renderDailyChecklist(); renderDateScroller(); renderReports();
    });
    $('reportSurahSelect').addEventListener('change', (e) => { reportSurah = e.target.value; renderReports(); });
    const downloadPdfBtn = $('downloadSurahPdfBtn');
    if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener('click', () => {
        triggerHaptic(20);
        downloadSurahReportPDF(reportSurah);
      });
    }

    // مراجعة مستعجلة لإختبار
    const openExamBtn = $('openUrgentExamBtn');
    if (openExamBtn) {
      openExamBtn.addEventListener('click', () => {
        triggerHaptic(20);
        openUrgentExamModal();
      });
    }

    const closeExamBtn = $('closeUrgentExamModalBtn');
    if (closeExamBtn) {
      closeExamBtn.addEventListener('click', () => {
        triggerHaptic(15);
        closeUrgentExamModal();
      });
    }

    const generateExamBtn = $('generateUrgentExamPlanBtn');
    if (generateExamBtn) {
      generateExamBtn.addEventListener('click', () => {
        triggerHaptic(20);
        createUrgentExamPlan();
      });
    }

    // توثيق الإنجاز ومشاركة التقرير مع الأستاذة
    const docBtn = $('docSnapshotBtn');
    if (docBtn) {
      docBtn.addEventListener('click', () => {
        captureHomeDocumentation();
      });
    }

    const closeDocBtn = $('closeDocModalBtn');
    if (closeDocBtn) {
      closeDocBtn.addEventListener('click', () => {
        triggerHaptic(15);
        const modal = $('docSnapshotModal');
        if (modal) modal.hidden = true;
      });
    }

    const shareBtn = $('shareDocBtn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => {
        shareDocAchievement();
      });
    }

    const downloadImgBtn = $('downloadDocImgBtn');
    if (downloadImgBtn) {
      downloadImgBtn.addEventListener('click', () => {
        downloadDocImage();
      });
    }
  }

  // ---------- مراجعة مستعجلة لإختبار ----------
  const JUZ_SURAH_MAP = [
    { juz: 1, from: 1, to: 2 },
    { juz: 2, from: 2, to: 2 },
    { juz: 3, from: 2, to: 3 },
    { juz: 4, from: 3, to: 4 },
    { juz: 5, from: 4, to: 4 },
    { juz: 6, from: 4, to: 5 },
    { juz: 7, from: 5, to: 6 },
    { juz: 8, from: 6, to: 7 },
    { juz: 9, from: 7, to: 8 },
    { juz: 10, from: 8, to: 9 },
    { juz: 11, from: 9, to: 11 },
    { juz: 12, from: 11, to: 12 },
    { juz: 13, from: 12, to: 14 },
    { juz: 14, from: 15, to: 16 },
    { juz: 15, from: 17, to: 18 },
    { juz: 16, from: 18, to: 20 },
    { juz: 17, from: 21, to: 22 },
    { juz: 18, from: 23, to: 25 },
    { juz: 19, from: 25, to: 27 },
    { juz: 20, from: 27, to: 29 },
    { juz: 21, from: 29, to: 33 },
    { juz: 22, from: 33, to: 36 },
    { juz: 23, from: 36, to: 39 },
    { juz: 24, from: 39, to: 41 },
    { juz: 25, from: 41, to: 45 },
    { juz: 26, from: 46, to: 51 },
    { juz: 27, from: 51, to: 57 },
    { juz: 28, from: 58, to: 66 },
    { juz: 29, from: 67, to: 77 },
    { juz: 30, from: 78, to: 114 }
  ];

  const QURAN_SURAH_PAGES = {
    1: { startPage: 1, pagesCount: 1 },
    2: { startPage: 2, pagesCount: 48 },
    3: { startPage: 50, pagesCount: 27 },
    4: { startPage: 77, pagesCount: 30 },
    5: { startPage: 106, pagesCount: 22 },
    6: { startPage: 128, pagesCount: 23 },
    7: { startPage: 151, pagesCount: 26 },
    8: { startPage: 177, pagesCount: 10 },
    9: { startPage: 187, pagesCount: 21 },
    10: { startPage: 208, pagesCount: 14 },
    11: { startPage: 221, pagesCount: 15 },
    12: { startPage: 235, pagesCount: 14 },
    13: { startPage: 249, pagesCount: 7 },
    14: { startPage: 255, pagesCount: 7 },
    15: { startPage: 262, pagesCount: 6 },
    16: { startPage: 267, pagesCount: 15 },
    17: { startPage: 282, pagesCount: 12 },
    18: { startPage: 293, pagesCount: 12 },
    19: { startPage: 305, pagesCount: 8 },
    20: { startPage: 312, pagesCount: 10 },
    21: { startPage: 322, pagesCount: 10 },
    22: { startPage: 332, pagesCount: 10 },
    23: { startPage: 342, pagesCount: 8 },
    24: { startPage: 350, pagesCount: 10 },
    25: { startPage: 359, pagesCount: 8 },
    26: { startPage: 367, pagesCount: 10 },
    27: { startPage: 377, pagesCount: 9 },
    28: { startPage: 385, pagesCount: 12 },
    29: { startPage: 396, pagesCount: 9 },
    30: { startPage: 404, pagesCount: 7 },
    31: { startPage: 411, pagesCount: 4 },
    32: { startPage: 415, pagesCount: 3 },
    33: { startPage: 418, pagesCount: 10 },
    34: { startPage: 428, pagesCount: 7 },
    35: { startPage: 434, pagesCount: 7 },
    36: { startPage: 440, pagesCount: 6 },
    37: { startPage: 446, pagesCount: 7 },
    38: { startPage: 453, pagesCount: 6 },
    39: { startPage: 458, pagesCount: 10 },
    40: { startPage: 467, pagesCount: 10 },
    41: { startPage: 477, pagesCount: 6 },
    42: { startPage: 483, pagesCount: 7 },
    43: { startPage: 489, pagesCount: 7 },
    44: { startPage: 496, pagesCount: 3 },
    45: { startPage: 499, pagesCount: 4 },
    46: { startPage: 502, pagesCount: 5 },
    47: { startPage: 507, pagesCount: 4 },
    48: { startPage: 511, pagesCount: 5 },
    49: { startPage: 515, pagesCount: 3 },
    50: { startPage: 518, pagesCount: 3 },
    51: { startPage: 520, pagesCount: 4 },
    52: { startPage: 523, pagesCount: 3 },
    53: { startPage: 526, pagesCount: 3 },
    54: { startPage: 528, pagesCount: 4 },
    55: { startPage: 531, pagesCount: 4 },
    56: { startPage: 534, pagesCount: 4 },
    57: { startPage: 537, pagesCount: 5 },
    58: { startPage: 542, pagesCount: 4 },
    59: { startPage: 545, pagesCount: 4 },
    60: { startPage: 549, pagesCount: 3 },
    61: { startPage: 551, pagesCount: 2 },
    62: { startPage: 553, pagesCount: 2 },
    63: { startPage: 554, pagesCount: 2 },
    64: { startPage: 556, pagesCount: 2 },
    65: { startPage: 558, pagesCount: 2 },
    66: { startPage: 560, pagesCount: 2 },
    67: { startPage: 562, pagesCount: 3 },
    68: { startPage: 564, pagesCount: 3 },
    69: { startPage: 566, pagesCount: 3 },
    70: { startPage: 568, pagesCount: 3 },
    71: { startPage: 570, pagesCount: 2 },
    72: { startPage: 572, pagesCount: 2 },
    73: { startPage: 574, pagesCount: 2 },
    74: { startPage: 575, pagesCount: 3 },
    75: { startPage: 577, pagesCount: 2 },
    76: { startPage: 578, pagesCount: 3 },
    77: { startPage: 580, pagesCount: 2 },
    78: { startPage: 582, pagesCount: 2 },
    79: { startPage: 583, pagesCount: 2 },
    80: { startPage: 585, pagesCount: 1 },
    81: { startPage: 586, pagesCount: 1 },
    82: { startPage: 587, pagesCount: 1 },
    83: { startPage: 587, pagesCount: 2 },
    84: { startPage: 589, pagesCount: 2 },
    85: { startPage: 590, pagesCount: 1 },
    86: { startPage: 591, pagesCount: 1 },
    87: { startPage: 591, pagesCount: 1 },
    88: { startPage: 592, pagesCount: 2 },
    89: { startPage: 593, pagesCount: 2 },
    90: { startPage: 594, pagesCount: 1 },
    91: { startPage: 595, pagesCount: 1 },
    92: { startPage: 595, pagesCount: 1 },
    93: { startPage: 596, pagesCount: 1 },
    94: { startPage: 596, pagesCount: 1 },
    95: { startPage: 597, pagesCount: 1 },
    96: { startPage: 597, pagesCount: 1 },
    97: { startPage: 598, pagesCount: 1 },
    98: { startPage: 598, pagesCount: 2 },
    99: { startPage: 599, pagesCount: 1 },
    100: { startPage: 599, pagesCount: 1 },
    101: { startPage: 600, pagesCount: 1 },
    102: { startPage: 600, pagesCount: 1 },
    103: { startPage: 601, pagesCount: 1 },
    104: { startPage: 601, pagesCount: 1 },
    105: { startPage: 601, pagesCount: 1 },
    106: { startPage: 602, pagesCount: 1 },
    107: { startPage: 602, pagesCount: 1 },
    108: { startPage: 602, pagesCount: 1 },
    109: { startPage: 603, pagesCount: 1 },
    110: { startPage: 603, pagesCount: 1 },
    111: { startPage: 603, pagesCount: 1 },
    112: { startPage: 604, pagesCount: 1 },
    113: { startPage: 604, pagesCount: 1 },
    114: { startPage: 604, pagesCount: 1 }
  };

  function getJuzsForSurahRange(fromId, toId) {
    const juzs = [];
    JUZ_SURAH_MAP.forEach(item => {
      if (item.to >= fromId && item.from <= toId) {
        if (!juzs.includes(item.juz)) juzs.push(item.juz);
      }
    });
    return juzs.length ? juzs : [1];
  }

  function populateExamSurahSelects() {
    const fromSel = $('examFromSurahSelect');
    const toSel = $('examToSurahSelect');
    if (!fromSel || !toSel || fromSel.children.length > 0) return;

    if (window.QURAN_SURAHS) {
      window.QURAN_SURAHS.forEach(s => {
        const opt1 = document.createElement('option');
        opt1.value = s.id;
        opt1.textContent = `${s.id}. سورة ${s.name}`;
        fromSel.appendChild(opt1);

        const opt2 = document.createElement('option');
        opt2.value = s.id;
        opt2.textContent = `${s.id}. سورة ${s.name}`;
        toSel.appendChild(opt2);
      });
    }

    if ($('examStartDate')) $('examStartDate').value = getTodayDateString();
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const y = future.getFullYear(), m = String(future.getMonth() + 1).padStart(2, '0'), d = String(future.getDate()).padStart(2, '0');
    if ($('examEndDate')) $('examEndDate').value = `${y}-${m}-${d}`;

    fromSel.value = 1;
    toSel.value = 5;
  }

  function openUrgentExamModal() {
    populateExamSurahSelects();
    renderUrgentExamModal();
    const modal = $('urgentExamModal');
    if (modal) modal.hidden = false;
  }

  function closeUrgentExamModal() {
    const modal = $('urgentExamModal');
    if (modal) modal.hidden = true;
  }

  function createUrgentExamPlan() {
    const startStr = $('examStartDate').value;
    const endStr = $('examEndDate').value;
    const fromId = parseInt($('examFromSurahSelect').value) || 1;
    const toId = parseInt($('examToSurahSelect').value) || 114;

    if (fromId > toId) {
      showToast('يرجى اختيار نطاق سور صحيح (سورة البداية أصغر من أو تساوي النهاية)');
      return;
    }

    const surahsList = window.QURAN_SURAHS.filter(s => s.id >= fromId && s.id <= toId);
    const includedJuzs = getJuzsForSurahRange(fromId, toId);

    const juzsState = {};
    includedJuzs.forEach(j => { juzsState[j] = false; });

    const surahsState = {};
    surahsList.forEach(s => {
      const pageMeta = QURAN_SURAH_PAGES[s.id] || { startPage: 1, pagesCount: 1 };
      const pagesState = {};
      for (let p = 1; p <= pageMeta.pagesCount; p++) {
        pagesState[p] = false;
      }

      surahsState[s.id] = {
        id: s.id,
        name: s.name,
        verses: s.verses,
        startPage: pageMeta.startPage,
        pagesCount: pageMeta.pagesCount,
        checked: false,
        pages: pagesState,
        difficulty: '',
        hardPages: ''
      };
    });

    AppState.urgentExamPlan = {
      startDate: startStr,
      endDate: endStr,
      fromSurahId: fromId,
      toSurahId: toId,
      fromSurahName: surahsList[0].name,
      toSurahName: surahsList[surahsList.length - 1].name,
      juzs: juzsState,
      surahs: surahsState
    };

    persistState();
    renderUrgentExamModal();
    showToast('تم إنشاء خطة المراجعة المستعجلة بنجاح');
  }

  window.urgentExamAccordionState = window.urgentExamAccordionState || {};

  function renderUrgentExamModal() {
    const container = $('urgentExamContent');
    if (!container) return;

    const plan = AppState.urgentExamPlan;
    if (!plan || !plan.surahs) {
      container.innerHTML = `
        <p style="font-size:0.82rem;color:var(--text-muted);text-align:center;padding:24px 0;">
          لم يتم إنشاء خطة مراجعة مستعجلة بعد. حدد التواريخ والسور واضغط على الزر أعلاه.
        </p>
      `;
      return;
    }

    if ($('examStartDate') && plan.startDate) $('examStartDate').value = plan.startDate;
    if ($('examEndDate') && plan.endDate) $('examEndDate').value = plan.endDate;
    if ($('examFromSurahSelect')) $('examFromSurahSelect').value = plan.fromSurahId;
    if ($('examToSurahSelect')) $('examToSurahSelect').value = plan.toSurahId;

    const surahKeys = Object.keys(plan.surahs);
    const juzKeys = Object.keys(plan.juzs || {});

    // Ensure pages state initialized for older plans
    surahKeys.forEach(k => {
      const s = plan.surahs[k];
      const meta = QURAN_SURAH_PAGES[s.id] || { startPage: 1, pagesCount: 1 };
      if (!s.startPage) s.startPage = meta.startPage;
      if (!s.pagesCount) s.pagesCount = meta.pagesCount;
      if (!s.pages) {
        s.pages = {};
        for (let p = 1; p <= s.pagesCount; p++) {
          s.pages[p] = !!s.checked;
        }
      }
    });

    let totalPagesCount = 0;
    let completedPagesCount = 0;

    surahKeys.forEach(k => {
      const s = plan.surahs[k];
      const pKeys = Object.keys(s.pages);
      totalPagesCount += pKeys.length;
      pKeys.forEach(p => {
        if (s.pages[p]) completedPagesCount++;
      });
    });

    const percent = totalPagesCount > 0 ? Math.round((completedPagesCount / totalPagesCount) * 100) : 0;
    const hardSurahs = surahKeys.filter(k => plan.surahs[k].difficulty === 'hard' || (plan.surahs[k].hardPages && plan.surahs[k].hardPages.trim() !== ''));

    // Map Surahs into Juz groups
    const juzGroups = {};
    juzKeys.forEach(jId => {
      juzGroups[jId] = [];
    });

    surahKeys.forEach(sId => {
      const numericId = parseInt(sId);
      const matchingJuz = JUZ_SURAH_MAP.find(m => numericId >= m.from && numericId <= m.to);
      const targetJuz = matchingJuz ? matchingJuz.juz : (juzKeys[0] || 1);
      if (!juzGroups[targetJuz]) juzGroups[targetJuz] = [];
      juzGroups[targetJuz].push(plan.surahs[sId]);
    });

    container.innerHTML = `
      <div style="background:var(--primary-subtle);border:1px solid var(--border-light);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
          <div>
            <strong style="color:var(--primary-medium);font-size:0.95rem;">خطة المراجعة: سورة ${esc(plan.fromSurahName)} إلى ${esc(plan.toSurahName)}</strong>
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">
              الفترة: من ${esc(plan.startDate)} إلى ${esc(plan.endDate)}
            </div>
          </div>
          <span style="font-size:1.1rem;font-weight:800;color:var(--primary-medium);">${percent}%</span>
        </div>
        <div class="surah-bar-outer" style="height:10px;margin:6px 0 10px;">
          <div class="surah-bar-fill" style="width:${percent}%;"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <span style="font-size:0.75rem;color:var(--text-main);">إنجاز الأوجه: ${completedPagesCount} من ${totalPagesCount} وجه</span>
          <button id="downloadExamPdfBtn" type="button" class="btn-verse-step" style="background:var(--primary);color:#fff;display:inline-flex;align-items:center;gap:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            <span>تصدير تقرير PDF</span>
          </button>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        <h4 style="font-size:0.88rem;font-weight:700;color:var(--primary-medium);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
          <span>📖 قائمة الأجزاء والسور والأوجه المقررة</span>
          <span style="font-size:0.72rem;color:var(--text-muted);font-weight:normal;">(${juzKeys.length} أجزاء)</span>
        </h4>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${Object.keys(juzGroups).map(jId => {
            const surahsInJuz = juzGroups[jId];
            const isJuzComplete = surahsInJuz.length > 0 && surahsInJuz.every(s => s.checked);
            const juzDoneSurahs = surahsInJuz.filter(s => s.checked).length;
            const isJuzCollapsed = window.urgentExamAccordionState['juz-' + jId] === true;

            return `
              <div class="juz-accordion-card">
                <div class="juz-accordion-header" data-juz="${jId}">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="juz-accordion-arrow" style="transition:transform 0.2s;display:inline-block;transform:${isJuzCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};">▼</span>
                    <strong style="font-size:0.92rem;color:var(--primary-medium);">الجزء ${jId}</strong>
                  </div>
                  <div>
                    ${isJuzComplete ? '<span style="font-size:0.72rem;color:#15803d;font-weight:700;background:#dcfce7;padding:3px 8px;border-radius:12px;">تم إنجاز الجزء بالكامل ✓</span>' : `<span style="font-size:0.72rem;color:var(--text-muted);">${juzDoneSurahs} من ${surahsInJuz.length} سور مكتملة</span>`}
                  </div>
                </div>

                <div class="juz-accordion-body ${isJuzCollapsed ? 'collapsed' : ''}" id="juzBody-${jId}">
                  ${surahsInJuz.length === 0 ? '<p style="font-size:0.75rem;color:var(--text-muted);margin:0;">لا توجد سور مشمولة في هذا الجزء</p>' : ''}
                  
                  ${surahsInJuz.map(s => {
                    const donePagesInSurah = Object.values(s.pages).filter(v => v === true).length;
                    const totalPagesInSurah = s.pagesCount;
                    const isSurahCollapsed = window.urgentExamAccordionState['surah-' + s.id] === true;

                    return `
                      <div class="surah-accordion-card ${s.checked ? 'surah-done-card' : ''}">
                        <div class="surah-accordion-header" data-surah="${s.id}">
                          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span class="surah-accordion-arrow" style="transition:transform 0.2s;display:inline-block;transform:${isSurahCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)'};">▼</span>
                            <input type="checkbox" class="exam-surah-check" data-surah="${s.id}" ${s.checked ? 'checked' : ''} onclick="event.stopPropagation();" />
                            <strong style="font-size:0.86rem;color:var(--text-main);">${s.id}. سورة ${esc(s.name)}</strong>
                            <span style="font-size:0.72rem;color:var(--text-muted);">(${totalPagesInSurah} ${totalPagesInSurah === 1 ? 'وجه' : 'أوجه'})</span>
                          </div>

                          <div style="display:flex;align-items:center;gap:6px;">
                            ${s.checked ? '<span class="badge-done" style="background:#15803d;color:#ffffff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;">تم الإنجاز ✓</span>' : `<span style="font-size:0.72rem;color:var(--text-muted);">${donePagesInSurah} من ${totalPagesInSurah} وجه</span>`}
                          </div>
                        </div>

                        <div class="surah-accordion-body ${isSurahCollapsed ? 'collapsed' : ''}" id="surahBody-${s.id}">
                          <div style="margin-bottom:10px;">
                            <div style="font-size:0.76rem;font-weight:700;color:var(--primary-medium);margin-bottom:8px;">
                              📜 أوجه / صفحات سورة ${esc(s.name)}:
                            </div>
                            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:6px;">
                              ${Object.keys(s.pages).map(pIdx => {
                                const isDone = s.pages[pIdx];
                                const pNum = s.startPage + parseInt(pIdx) - 1;
                                return `
                                  <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;background:${isDone ? '#f0fdf4' : 'var(--bg-subtle)'};border:1px solid ${isDone ? '#bbf7d0' : 'var(--border-light)'};border-radius:6px;cursor:pointer;font-size:0.76rem;user-select:none;">
                                    <input type="checkbox" class="exam-page-check" data-surah="${s.id}" data-page="${pIdx}" ${isDone ? 'checked' : ''} />
                                    <span style="font-weight:600;color:${isDone ? '#166534' : 'var(--text-main)'};">وجه ${pIdx} <span style="font-size:0.68rem;color:var(--text-muted);">(ص ${pNum})</span></span>
                                  </label>
                                `;
                              }).join('')}
                            </div>
                          </div>

                          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:8px;border-top:1px dashed var(--border-light);">
                            <span style="font-size:0.73rem;color:var(--text-muted);">تقييم السورة:</span>
                            <button type="button" class="difficulty-badge-btn easy ${s.difficulty === 'easy' ? 'active' : ''}" data-surah="${s.id}" data-diff="easy">
                              ${s.difficulty === 'easy' ? '✓ ' : ''}سهلة
                            </button>
                            <button type="button" class="difficulty-badge-btn hard ${s.difficulty === 'hard' ? 'active' : ''}" data-surah="${s.id}" data-diff="hard">
                              ${s.difficulty === 'hard' ? '⚠️ ' : ''}صعبة
                            </button>
                            <input type="text" class="field-input exam-hard-pages-input" data-surah="${s.id}" value="${esc(s.hardPages || '')}" placeholder="تحديد أوجه صعبة (مثال: وجه 2 و 4)..." style="font-size:0.73rem;padding:4px 8px;flex:1;min-width:140px;" />
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <div style="background:var(--bg-subtle);border:1px dashed var(--border-color);border-radius:var(--radius-sm);padding:14px;margin-top:16px;">
        <h4 style="font-size:0.88rem;font-weight:700;color:var(--primary-medium);margin-bottom:8px;">
          📊 تقرير ملخص الاختبار الختامي
        </h4>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">
          ملخص إنجاز الأوجه والسور والأوجه الصعبة المحددة لمراجعتها قبيل دخول الاختبار:
        </p>

        ${hardSurahs.length > 0 ? `
          <div style="margin-bottom:10px;">
            <strong style="font-size:0.78rem;color:#991b1b;display:block;margin-bottom:4px;">⚠️ الأوجه والسور الصعبة المحددة للمراجعة:</strong>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${hardSurahs.map(k => {
                const s = plan.surahs[k];
                return `<span class="hard-pages-tag">سورة ${esc(s.name)} ${s.hardPages ? '(' + esc(s.hardPages) + ')' : '(صعبة)'}</span>`;
              }).join('')}
            </div>
          </div>
        ` : `
          <p style="font-size:0.75rem;color:#15803d;margin-bottom:10px;">لا توجد سور أو أوجه صعبة محددة، ممتاز!</p>
        `}

        <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.78rem;color:var(--text-main);padding-top:6px;border-top:1px solid var(--border-light);">
          <span>نسبة إنجاز الأوجه: <strong>${percent}%</strong></span>
          <span>الحالة: <strong>${percent === 100 ? 'مكتملة جاهزة للإختبار 🎉' : 'جارية للمراجعة ⏳'}</strong></span>
        </div>
      </div>
    `;

    // Bind Juz Accordion Header Toggles
    container.querySelectorAll('.juz-accordion-header').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const jId = hdr.getAttribute('data-juz');
        window.urgentExamAccordionState['juz-' + jId] = !window.urgentExamAccordionState['juz-' + jId];
        const bodyEl = container.querySelector(`#juzBody-${jId}`);
        const arrowEl = hdr.querySelector('.juz-accordion-arrow');
        if (bodyEl) bodyEl.classList.toggle('collapsed');
        if (arrowEl) arrowEl.style.transform = window.urgentExamAccordionState['juz-' + jId] ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    });

    // Bind Surah Accordion Header Toggles
    container.querySelectorAll('.surah-accordion-header').forEach(hdr => {
      hdr.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const sId = hdr.getAttribute('data-surah');
        window.urgentExamAccordionState['surah-' + sId] = !window.urgentExamAccordionState['surah-' + sId];
        const bodyEl = container.querySelector(`#surahBody-${sId}`);
        const arrowEl = hdr.querySelector('.surah-accordion-arrow');
        if (bodyEl) bodyEl.classList.toggle('collapsed');
        if (arrowEl) arrowEl.style.transform = window.urgentExamAccordionState['surah-' + sId] ? 'rotate(-90deg)' : 'rotate(0deg)';
      });
    });

    // Bind Page Checkboxes Change
    container.querySelectorAll('.exam-page-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const sId = e.target.getAttribute('data-surah');
        const pIdx = e.target.getAttribute('data-page');
        const s = plan.surahs[sId];
        if (s && s.pages) {
          s.pages[pIdx] = e.target.checked;
          const allDone = Object.values(s.pages).every(v => v === true);
          s.checked = allDone;

          // Check if parent Juz complete
          const numericId = parseInt(sId);
          const matchingJuz = JUZ_SURAH_MAP.find(m => numericId >= m.from && numericId <= m.to);
          if (matchingJuz) {
            const jId = matchingJuz.juz;
            const surahsInJuz = surahKeys.map(k => plan.surahs[k]).filter(sItem => sItem.id >= matchingJuz.from && sItem.id <= matchingJuz.to);
            plan.juzs[jId] = surahsInJuz.every(sItem => sItem.checked);
          }

          persistState();
          renderUrgentExamModal();
        }
      });
    });

    // Bind Surah Checkbox Direct Toggle
    container.querySelectorAll('.exam-surah-check').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const sId = e.target.getAttribute('data-surah');
        const s = plan.surahs[sId];
        if (s) {
          s.checked = e.target.checked;
          if (s.pages) {
            Object.keys(s.pages).forEach(pIdx => {
              s.pages[pIdx] = e.target.checked;
            });
          }

          const numericId = parseInt(sId);
          const matchingJuz = JUZ_SURAH_MAP.find(m => numericId >= m.from && numericId <= m.to);
          if (matchingJuz) {
            const jId = matchingJuz.juz;
            const surahsInJuz = surahKeys.map(k => plan.surahs[k]).filter(sItem => sItem.id >= matchingJuz.from && sItem.id <= matchingJuz.to);
            plan.juzs[jId] = surahsInJuz.every(sItem => sItem.checked);
          }

          persistState();
          renderUrgentExamModal();
        }
      });
    });

    container.querySelectorAll('.difficulty-badge-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic(15);
        const sId = btn.getAttribute('data-surah');
        const diff = btn.getAttribute('data-diff');
        plan.surahs[sId].difficulty = plan.surahs[sId].difficulty === diff ? '' : diff;
        persistState();
        renderUrgentExamModal();
      });
    });

    container.querySelectorAll('.exam-hard-pages-input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const sId = inp.getAttribute('data-surah');
        plan.surahs[sId].hardPages = e.target.value.trim();
        persistState();
        renderUrgentExamModal();
      });
    });

    const pdfBtn = container.querySelector('#downloadExamPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        triggerHaptic(20);
        downloadUrgentExamReportPDF();
      });
    }
  }

  function downloadUrgentExamReportPDF() {
    const plan = AppState.urgentExamPlan;
    if (!plan || !plan.surahs) return;

    const surahKeys = Object.keys(plan.surahs);
    let totalPagesCount = 0;
    let completedPagesCount = 0;

    surahKeys.forEach(k => {
      const s = plan.surahs[k];
      if (s.pages) {
        const pKeys = Object.keys(s.pages);
        totalPagesCount += pKeys.length;
        pKeys.forEach(p => {
          if (s.pages[p]) completedPagesCount++;
        });
      }
    });

    const percent = totalPagesCount > 0 ? Math.round((completedPagesCount / totalPagesCount) * 100) : 0;
    const hardSurahs = surahKeys.filter(k => plan.surahs[k].difficulty === 'hard' || (plan.surahs[k].hardPages && plan.surahs[k].hardPages.trim() !== ''));

    const pdfContainer = document.createElement('div');
    pdfContainer.style.padding = '20px';
    pdfContainer.style.fontFamily = "'IBM Plex Sans Arabic', Arial, sans-serif";
    pdfContainer.style.direction = 'rtl';
    pdfContainer.style.color = '#13241e';
    pdfContainer.style.backgroundColor = '#ffffff';
    pdfContainer.style.letterSpacing = 'normal';

    const hardListHtml = hardSurahs.length > 0 ? hardSurahs.map(k => {
      const s = plan.surahs[k];
      return `<li style="margin-bottom:4px;color:#991b1b;font-weight:bold;">سورة ${esc(s.name)}: ${s.hardPages ? esc(s.hardPages) : 'صعبة (تحتاج إعادة نظر)'}</li>`;
    }).join('') : '<li style="color:#15803d;">لا توجد أوجه أو سور صعبة محددة.</li>';

    const surahRowsHtml = surahKeys.map(k => {
      const s = plan.surahs[k];
      const diffText = s.difficulty === 'easy' ? 'سهلة' : (s.difficulty === 'hard' ? 'صعبة ⚠️' : 'عادي');
      const donePages = s.pages ? Object.values(s.pages).filter(v => v === true).length : 0;
      const totalPages = s.pagesCount || 1;
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${s.id}</td>
          <td style="padding:8px;border:1px solid #ddd;font-weight:bold;text-align:center;">سورة ${esc(s.name)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${s.verses} آية</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${donePages} من ${totalPages} وجه ${s.checked ? '✓' : ''}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${diffText}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${esc(s.hardPages || '-')}</td>
        </tr>
      `;
    }).join('');

    pdfContainer.innerHTML = `
      <div style="text-align: center; border-bottom: 2px solid #0f3d2e; padding-bottom: 12px; margin-bottom: 20px;">
        <h1 style="color: #0f3d2e; font-size: 22px; margin-bottom: 4px;">منصة تبيان | نظام متابعة المحفوظ القرآني</h1>
        <h2 style="color: #9a6b1f; font-size: 18px; margin: 0;">تقرير خطة المراجعة المستعجلة للإختبار</h2>
        <p style="font-size: 12px; color: #6b8277; margin-top: 6px;">
          النطاق: من سورة ${esc(plan.fromSurahName)} إلى ${esc(plan.toSurahName)} | الفترة: من ${esc(plan.startDate)} إلى ${esc(plan.endDate)}
        </p>
      </div>

      <div style="display: flex; justify-content: space-around; background: #f0fdf9; border: 1px solid #0d9488; border-radius: 8px; padding: 12px; margin-bottom: 20px; text-align: center;">
        <div><strong style="font-size: 18px; color: #0f3d2e;">${percent}%</strong><div style="font-size: 11px; color: #4b6358;">نسبة إنجاز الأوجه</div></div>
        <div><strong style="font-size: 18px; color: #0f3d2e;">${completedPagesCount} من ${totalPagesCount}</strong><div style="font-size: 11px; color: #4b6358;">الأوجه المكتملة</div></div>
        <div><strong style="font-size: 18px; color: #0f3d2e;">${hardSurahs.length}</strong><div style="font-size: 11px; color: #4b6358;">أوجه/سور صعبة</div></div>
      </div>

      <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:12px;margin-bottom:20px;">
        <h3 style="color:#991b1b;font-size:14px;margin-top:0;margin-bottom:8px;">⚠️ الأوجه والسور الصعبة المحددة لمراجعتها قبل الاختبار:</h3>
        <ul style="margin:0;padding-right:20px;font-size:12px;">
          ${hardListHtml}
        </ul>
      </div>

      <h3 style="color: #0f3d2e; font-size: 14px; margin-bottom: 8px;">جدول تتبع السور والأوجه المشمولة:</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #0f3d2e; color: #ffffff;">
            <th style="padding: 8px; border: 1px solid #0f3d2e;">#</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">السورة</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">الآيات</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">الأوجه المنجزة</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">التقييم</th>
            <th style="padding: 8px; border: 1px solid #0f3d2e;">الأوجه الصعبة</th>
          </tr>
        </thead>
        <tbody>
          ${surahRowsHtml}
        </tbody>
      </table>

      <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #6b8277; border-top: 1px solid #eee; padding-top: 10px;">
        تم استخراج هذا التقرير تلقائياً من منصة تبيان الرقمية للمحفوظ القرآني | تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}
      </div>
    `;

    if (window.html2pdf) {
      showToast('جارِ إنشاء ملف PDF...');
      const opt = {
        margin: [10, 10, 10, 10],
        filename: `تقرير_المراجعة_المستعجلة_${getTodayDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      window.html2pdf().set(opt).from(pdfContainer).save().then(() => {
        showToast('تم تحميل ملف PDF بنجاح');
      }).catch(err => {
        console.error(err);
        fallbackPrintPDF(pdfContainer.innerHTML);
      });
    } else {
      fallbackPrintPDF(pdfContainer.innerHTML);
    }
  }

  // ---------- تسجيل الدخول / التسجيل ----------
  function setAuthState(st) {
    document.body.classList.remove('auth-loading', 'auth-out', 'auth-in');
    document.body.classList.add('auth-' + st);
  }
  function showAuthError(msg) { const el = $('authError'); el.hidden = !msg; el.textContent = msg || ''; }
  function authMessage(err) {
    const map = {
      'auth/network-request-failed': 'تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.',
      'auth/unauthorized-domain': 'هذا النطاق غير مصرح به. أضفه في فايربيس: Authentication ثم Settings ثم Authorized domains.',
      'auth/operation-not-allowed': 'تسجيل الدخول عبر جوجل غير مفعّل في مشروع فايربيس.',
      'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد بطريقة دخول مختلفة.',
      'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً.'
    };
    return map[err.code] || ('تعذر تسجيل الدخول: ' + (err.message || err.code || ''));
  }
  function setAuthMode(mode) {
    $('tabLogin').classList.toggle('active', mode === 'login');
    $('tabSignup').classList.toggle('active', mode === 'signup');
    $('tabLogin').setAttribute('aria-selected', String(mode === 'login'));
    $('tabSignup').setAttribute('aria-selected', String(mode === 'signup'));
    $('panelLogin').style.display = mode === 'login' ? '' : 'none';
    $('panelSignup').style.display = mode === 'signup' ? '' : 'none';
    showAuthError('');
    authMode = mode;
  }
  let authMode = 'login';

  async function doGoogle(btn) {
    showAuthError(''); btn.disabled = true;
    try {
      const r = await window.quranStorage.signInWithGoogle();
      if (r.redirecting) return;
      showToast(authMode === 'signup'
        ? (r.isNewUser ? 'تم إنشاء حسابك بنجاح' : 'لديك حساب مسبقاً، تم تسجيل دخولك')
        : (r.isNewUser ? 'تم إنشاء حساب جديد لك' : 'تم تسجيل الدخول بنجاح'));
    } catch (e) {
      if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') showAuthError(authMessage(e));
    } finally { btn.disabled = false; }
  }

  function attachAuthListeners() {
    document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setAuthMode(b.dataset.mode)));
    $('googleSignInBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('googleSignUpBtn').addEventListener('click', (e) => doGoogle(e.currentTarget));
    $('signOutBtn').addEventListener('click', async () => { triggerHaptic(20); await window.quranStorage.signOut(); });
  }

  // ---------- توثيق الإنجاز ومشاركته ----------
  let currentSnapshotBlob = null;
  let currentSnapshotDataUrl = null;

  function drawDocSnapshotNativeCanvas(data) {
    const scale = 2;
    const width = 480 * scale;
    const height = 560 * scale;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    function drawRoundedRect(c, x, y, w, h, r) {
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + h - r);
      c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      c.lineTo(x + r, y + h);
      c.quadraticCurveTo(x, y + h, x, y + h - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
    }

    // Background Gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0b1511');
    bgGradient.addColorStop(1, '#08100d');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Outer border container
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 3 * scale;
    drawRoundedRect(ctx, 12 * scale, 12 * scale, width - 24 * scale, height - 24 * scale, 16 * scale);
    ctx.stroke();

    // Header Title
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6ee7b7';
    ctx.font = `bold ${20 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText('منصة تبيان | توثيق الإنجاز اليومي 📖', width / 2, 52 * scale);

    // Date
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`تاريخ التوثيق: ${data.dateStr}`, width / 2, 78 * scale);

    // Separator Line
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.moveTo(32 * scale, 95 * scale);
    ctx.lineTo(width - 32 * scale, 95 * scale);
    ctx.stroke();

    // Card 1: Surah Progress
    ctx.fillStyle = '#13241e';
    ctx.strokeStyle = '#1f3a30';
    ctx.lineWidth = 1 * scale;
    drawRoundedRect(ctx, 24 * scale, 110 * scale, width - 48 * scale, 120 * scale, 10 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${12 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText('السورة المقررة الحالية:', width - 40 * scale, 134 * scale);

    ctx.fillStyle = '#fbbf24';
    ctx.font = `bold ${18 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`سورة ${data.surahName}`, width - 40 * scale, 162 * scale);

    ctx.fillStyle = '#e5e7eb';
    ctx.font = `${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`تم حفظ ${data.currentVerse} من ${data.totalVerses} آية (${data.surahPercent}%)`, width - 40 * scale, 186 * scale);

    // Progress Bar
    const pbX = 40 * scale;
    const pbY = 198 * scale;
    const pbW = width - 80 * scale;
    const pbH = 8 * scale;

    ctx.fillStyle = '#1f3a30';
    drawRoundedRect(ctx, pbX, pbY, pbW, pbH, 4 * scale);
    ctx.fill();

    if (data.surahPercent > 0) {
      ctx.fillStyle = '#fbbf24';
      const fillW = Math.max(8 * scale, (pbW * Math.min(100, data.surahPercent)) / 100);
      drawRoundedRect(ctx, pbX + (pbW - fillW), pbY, fillW, pbH, 4 * scale);
      ctx.fill();
    }

    // Card 2: Reviews
    ctx.fillStyle = '#13241e';
    ctx.strokeStyle = '#1f3a30';
    ctx.lineWidth = 1 * scale;
    drawRoundedRect(ctx, 24 * scale, 245 * scale, width - 48 * scale, 125 * scale, 10 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${14 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText('مقدار المراجعة اليومية:', width - 40 * scale, 272 * scale);

    ctx.fillStyle = '#ffffff';
    ctx.font = `${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`المراجعة القريبة: ${data.nearRev}`, width - 40 * scale, 302 * scale);

    ctx.fillStyle = data.nearCheck ? '#34d399' : '#f87171';
    ctx.font = `bold ${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(data.nearCheck ? '(تمت ✓)' : '(لم تتم ✕)', 40 * scale, 302 * scale);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`المراجعة البعيدة: ${data.distantRev}`, width - 40 * scale, 332 * scale);

    ctx.fillStyle = data.distantCheck ? '#34d399' : '#f87171';
    ctx.font = `bold ${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(data.distantCheck ? '(تمت ✓)' : '(لم تتم ✕)', 40 * scale, 332 * scale);

    // Card 3: Total Milestone
    ctx.fillStyle = '#0f2d23';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1 * scale;
    drawRoundedRect(ctx, 24 * scale, 385 * scale, width - 48 * scale, 60 * scale, 10 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `${14 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText('مستوى إنجاز الورد اليومي الإجمالي:', width - 40 * scale, 421 * scale);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#34d399';
    ctx.font = `bold ${20 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`${data.milestonePercent}%`, 40 * scale, 423 * scale);

    // Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6b7280';
    ctx.font = `${11 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText('تم التوثيق عبر منصة تبيان الرقمية تتبع المحفوظ القرآني', width / 2, 480 * scale);

    return canvas;
  }

  async function captureHomeDocumentation() {
    triggerHaptic(25);
    showToast('جارِ التقاط صورة التوثيق، الرجاء الانتظار...');

    const targetEl = document.getElementById('view-home');
    if (!targetEl || typeof htmlToImage === 'undefined') {
      showToast('أداة التصوير غير متوفرة');
      return;
    }

    const snapBtn = document.getElementById('docSnapshotBtn');
    let snapHeader = null;
    let oldDisplay = '';
    
    if (snapBtn && snapBtn.parentElement) {
      snapHeader = snapBtn.parentElement;
      oldDisplay = snapHeader.style.display;
      snapHeader.style.display = 'none'; // إخفاء زر التوثيق من الصورة
    }

    try {
      const dataUrl = await htmlToImage.toPng(targetEl, {
        backgroundColor: '#0c241c',
        pixelRatio: 2,
        style: {
          margin: '0',
          padding: '10px'
        }
      });

      if (snapHeader) {
        snapHeader.style.display = oldDisplay; // استرجاع زر التوثيق
      }

      currentSnapshotDataUrl = dataUrl;

      const byteString = atob(currentSnapshotDataUrl.split(',')[1]);
      const mimeString = currentSnapshotDataUrl.split(',')[0].split(':')[1].split(';')[0];
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      currentSnapshotBlob = new Blob([ab], { type: mimeString });

      const imgEl = document.getElementById('docSnapshotImg');
      if (imgEl) imgEl.src = currentSnapshotDataUrl;

      const modal = document.getElementById('docSnapshotModal');
      if (modal) modal.hidden = false;
      showToast('تم التقاط صورة الصفحة بنجاح');
    } catch(e) {
      if (snapHeader) snapHeader.style.display = oldDisplay;
      console.error('Error with html-to-image:', e);
      showToast('حدث خطأ أثناء التقاط الصورة');
    }
  }

  async function shareDocAchievement() {
    triggerHaptic(20);
    const surahName = AppState.surahConfig ? AppState.surahConfig.name : 'البقرة';
    const verseCount = AppState.surahConfig ? AppState.surahConfig.currentVerse : 0;
    const totalVerses = AppState.surahConfig ? AppState.surahConfig.totalVerses : 286;
    const todayLog = getCurrentDailyLog();
    const cycleDay = AppState.activeCycleDay || 1;
    const current10Day = AppState.tenDaySchedule.find(item => item.day == cycleDay) || AppState.tenDaySchedule[0] || {};
    const nearRev = current10Day.nearReview || 'المقرر اليومي';
    const distantRev = current10Day.distantReview || 'المقرر اليومي';

    const shareText = `منصة تبيان | 📖 توثيق الإنجاز اليومي للقرآن الكريم
🗓️ التاريخ: ${fmtDate(getTodayDateString())}
🟢 السورة المقررة: سورة ${surahName} (${verseCount} من ${totalVerses} آية)
🔹 المراجعة القريبة: ${nearRev} (${todayLog.nearReviewCheck ? 'تمت ✓' : 'جارية'})
🔸 المراجعة البعيدة: ${distantRev} (${todayLog.distantReviewCheck ? 'تمت ✓' : 'جارية'})
✨ تم استخراج التوثيق بنجاح من منصة تبيان الرقمية`;

    if (currentSnapshotBlob && navigator.share && navigator.canShare) {
      try {
        const file = new File([currentSnapshotBlob], `توثيق_إنجاز_تبيان_${getTodayDateString()}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'توثيق الإنجاز اليومي - منصة تبيان',
            text: shareText,
            files: [file]
          });
          showToast('تمت مشاركة الإنجاز بنجاح');
          return;
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.warn('Share error:', err);
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'توثيق الإنجاز اليومي - منصة تبيان',
          text: shareText
        });
        return;
      } catch (e) { }
    }

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(waUrl, '_blank');
    showToast('تم فتح واتساب لمشاركة التقرير');
  }

  function downloadDocImage() {
    triggerHaptic(20);
    if (!currentSnapshotDataUrl) return;
    const a = document.createElement('a');
    a.href = currentSnapshotDataUrl;
    a.download = `توثيق_إنجاز_تبيان_${getTodayDateString()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('تم حفظ صورة التوثيق بنجاح');
  }

  function renderAccount(user) {
    $('accountName').textContent = user.displayName || 'مستخدم تبيان';
    $('accountEmail').textContent = user.email || '';
    const img = $('accountPhoto');
    if (user.photoURL) { img.src = user.photoURL; img.hidden = false; } else img.hidden = true;
  }

  async function handleAuth(user) {
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
    const init = await svc.initFirebase();
    if (!init.success) { setAuthState('out'); showAuthError(init.message); return; }
    svc.auth.getRedirectResult().catch(e => showAuthError(authMessage(e)));
    svc.onAuthChanged(handleAuth);
  });

})();
