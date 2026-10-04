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

  function updateCycleDaysCount(newCount) {
    newCount = parseInt(newCount) || 10;
    if (newCount < 1) newCount = 1;
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
    showToast(`تم تعديل عدد أيام دورة المراجعة إلى ${newCount} يوم`);
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
      completedSurahs: AppState.completedSurahs
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
    const selectEl = document.getElementById('reviewDaysCountSelect');
    if (selectEl) selectEl.value = totalDays;
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

    const reviewDaysCountSelect = document.getElementById('reviewDaysCountSelect');
    if (reviewDaysCountSelect) {
      reviewDaysCountSelect.addEventListener('change', (e) => {
        triggerHaptic(20);
        updateCycleDaysCount(parseInt(e.target.value));
      });
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
    AppState.surahConfig = defaultSurahConfig();
    AppState.tenDaySchedule = JSON.parse(JSON.stringify(DEFAULT_TEN_DAY_SCHEDULE));
    AppState.weeklySchedule = JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
    AppState.dailyLogs = {};
    AppState.completedSurahs = [];
  }

  function applyPayload(p) {
    if (!p) return;
    if (p.activeCycleDay) AppState.activeCycleDay = p.activeCycleDay;
    if (p.surahConfig) AppState.surahConfig = Object.assign(defaultSurahConfig(), p.surahConfig);
    if (p.tenDaySchedule && p.tenDaySchedule.length === 10) AppState.tenDaySchedule = p.tenDaySchedule;
    if (p.weeklySchedule) AppState.weeklySchedule = Object.assign(JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)), p.weeklySchedule);
    if (p.dailyLogs) AppState.dailyLogs = p.dailyLogs;
    if (Array.isArray(p.completedSurahs)) AppState.completedSurahs = p.completedSurahs;
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
