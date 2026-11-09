/**
 * منصة سراج | نظام متابعة المحفوظ القرآني
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

  const LEGACY_DEFAULT_NOTES = [
    "حفظ مقرر جديد ومراجعة المقررات",
    "متابعة الحفظ وتثبيت الأوجه السابقة",
    "التكرار وسرد المقرر لرفيقة",
    "حفظ وتثبيت المقدار المقرر",
    "إتمام حفظ الأسبوع والمراجعة الدورية",
    "مراجعة وتثبيت ما تم حفظه خلال الأسبوع كاملاً"
  ];

  function getCustomTasksForDay(routine) {
    if (!routine) return [];
    const text = (routine.customTask !== undefined ? routine.customTask : routine.note) || '';
    const trimmed = text.trim();
    if (!trimmed) return [];
    if (LEGACY_DEFAULT_NOTES.includes(trimmed)) return [];
    if (trimmed === "يوم راحة") return [];
    if (trimmed === "يوم راحة وقراءة سورة الكهف") {
      return ["قراءة سورة الكهف"];
    }

    const lines = trimmed.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lines.length === 1 && lines[0].includes('،')) {
      const parts = lines[0].split(/[،,]/).map(s => s.trim()).filter(Boolean);
      const hasAyahKeywords = parts.some(p => p.includes('آية') || p.includes('آيات') || /^\d+$/.test(p));
      if (!hasAyahKeywords && parts.length > 1) {
        return parts;
      }
    }
    return lines.length > 0 ? lines : [trimmed];
  }

  // Default weekly routine configuration
  const DEFAULT_WEEKLY_SCHEDULE = {
    saturday: { name: "السبت", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    sunday: { name: "الأحد", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    monday: { name: "الإثنين", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    tuesday: { name: "الثلاثاء", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    wednesday: { name: "الأربعاء", hasNew: true, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    thursday: { name: "الخميس", hasNew: false, hasConsolidation: true, hasNearReview: true, hasDistantReview: true, customTask: "", note: "" },
    friday: { name: "الجمعة", hasNew: false, hasConsolidation: false, hasNearReview: false, hasDistantReview: false, customTask: "قراءة سورة الكهف", note: "يوم راحة وقراءة سورة الكهف" }
  };

  function defaultPlanConfig() {
    return {
      memoRep: { enabled: true, target: 10 },
      listening: { enabled: true, target: 3 },
      recording: { enabled: true, target: 3 },
      friend: { enabled: true, target: 2 },
      nearReview: { enabled: true },
      distantReview: { enabled: true },
      consolidation: { enabled: true, target: 5 }
    };
  }

  // State object
  const AppState = {
    selectedDate: getTodayDateString(),
    activeCycleDay: 1, // 1 to totalCycleDays
    cycleAnchor: null,
    totalCycleDays: 10, // Default 10 days
    reviewPathType: 'split',
    reviewSystemMode: 'dual', // 'dual' (قديم وجديد) or 'single' (مسار واحد)
    reverseMemorizationOrder: false, // true: من الناس للبقرة (عكسي) | false: من البقرة للناس
    surahConfig: {
      name: "البقرة",
      totalVerses: 286,
      currentVerse: 45,
      dailyTarget: 5
    },
    tenDaySchedule: JSON.parse(JSON.stringify(DEFAULT_TEN_DAY_SCHEDULE)),
    weeklySchedule: JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)),
    dailyLogs: {},
    completedSurahs: [],
    planConfig: defaultPlanConfig(),
    ayahBookmarks: {},
    flaggedAyahs: [],
    ayahNotes: {},
    ayahHighlights: {},
    pageNotes: {}
  };
  window.AppState = AppState;

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
          distantReview: `المقرر البعيد لليوم ${d}`,
          singleReview: `المقرر اليومي لليوم ${d}`
        });
      }
    } else if (newCount < currentLen) {
      AppState.tenDaySchedule = AppState.tenDaySchedule.slice(0, newCount);
    }

    if (AppState.activeCycleDay > newCount) {
      AppState.activeCycleDay = 1;
    AppState.cycleAnchor = null;
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
      notes: "",
      customTasks: {}
    };
  }


  function getCycleDayForDate(dateStr) {
    const totalDays = getCycleDaysCount();
    if (totalDays <= 0) return 1;

    let anchor = AppState.cycleAnchor;
    if (!anchor || !anchor.date) {
      const todayStr = getTodayDateString();
      const pastDates = AppState.dailyLogs ? Object.keys(AppState.dailyLogs).filter(d => d < todayStr).sort() : [];
      if (pastDates.length > 0) {
        const lastPast = pastDates[pastDates.length - 1];
        const pastLog = AppState.dailyLogs[lastPast];
        anchor = { date: lastPast, cycleDay: (pastLog && pastLog.cycleDay) || 1 };
      } else {
        const yDate = new Date();
        yDate.setDate(yDate.getDate() - 1);
        const yStr = `${yDate.getFullYear()}-${String(yDate.getMonth() + 1).padStart(2, '0')}-${String(yDate.getDate()).padStart(2, '0')}`;
        anchor = { date: yStr, cycleDay: 1 };
      }
      AppState.cycleAnchor = anchor;
    }

    if (dateStr === anchor.date) {
      return ((anchor.cycleDay - 1) % totalDays) + 1;
    }

    const dAnchor = parseDate(anchor.date);
    const dTarget = parseDate(dateStr);
    const isForward = dTarget > dAnchor;

    let reviewDaysCount = 0;
    let cur = new Date(dAnchor.getTime());

    if (isForward) {
      while (true) {
        cur.setDate(cur.getDate() + 1);
        const curY = cur.getFullYear();
        const curM = String(cur.getMonth() + 1).padStart(2, '0');
        const curD = String(cur.getDate()).padStart(2, '0');
        const curStr = `${curY}-${curM}-${curD}`;

        const routine = routineFor(curStr);
        if (routine && (routine.hasNearReview || routine.hasDistantReview)) {
          reviewDaysCount++;
        }
        if (curStr === dateStr || cur >= dTarget) break;
      }
      return ((anchor.cycleDay - 1 + reviewDaysCount) % totalDays) + 1;
    } else {
      while (true) {
        const curY = cur.getFullYear();
        const curM = String(cur.getMonth() + 1).padStart(2, '0');
        const curD = String(cur.getDate()).padStart(2, '0');
        const curStr = `${curY}-${curM}-${curD}`;

        const routine = routineFor(curStr);
        if (routine && (routine.hasNearReview || routine.hasDistantReview)) {
          reviewDaysCount++;
        }
        if (curStr === dateStr || cur <= dTarget) break;
        cur.setDate(cur.getDate() - 1);
      }
      const raw = (anchor.cycleDay - 1 - reviewDaysCount) % totalDays;
      return (raw < 0 ? raw + totalDays : raw) + 1;
    }
  }

  // Get active log for current selected date
  function getCurrentDailyLog() {
    const date = AppState.selectedDate;
    if (!AppState.dailyLogs[date]) {
      AppState.dailyLogs[date] = createEmptyDailyLog(getCycleDayForDate(date));
    }
    return ensureLog(AppState.dailyLogs[date]);
  }

  // Get active day routine for a specific date or selected date
  function getRoutineForDate(dateStr) {
    const targetDate = dateStr || AppState.selectedDate;
    if (!targetDate || typeof targetDate !== 'string') return DEFAULT_WEEKLY_SCHEDULE.saturday;
    const dateParts = targetDate.split('-');
    if (dateParts.length < 3) return DEFAULT_WEEKLY_SCHEDULE.saturday;
    const dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
    const dayIndex = isNaN(dateObj.getTime()) ? 0 : dateObj.getDay();
    const dayKey = DAY_KEYS[dayIndex];
    return AppState.weeklySchedule[dayKey] || DEFAULT_WEEKLY_SCHEDULE[dayKey];
  }

  function getSelectedDayRoutine() {
    return getRoutineForDate(AppState.selectedDate);
  }

  function hasMissed(l) {
    return !!(l && l.missed && (l.missed.memo || l.missed.consolidation || l.missed.review));
  }

  // Calculate daily completion score dynamically based on what's active today & configured in planConfig
  function calculateDailyProgress(log, forDateStr = null) {
    if (!log) return { completed: 0, total: 0, percent: 0 };
    const dateStr = forDateStr || (log && log.date) || AppState.selectedDate;
    const routine = getRoutineForDate(dateStr);
    let completed = 0;
    let total = 0;

    const missed = log.missed || {};
    const plan = AppState.planConfig || defaultPlanConfig();

    // New memorization tasks (dynamically respects planConfig & skipped during tathbeet stage)
    const isUnderTathbeet = isTathbeetActive();
    if (!isUnderTathbeet && routine && routine.hasNew && !missed.memo) {
      // 1. Listening sessions
      if (plan.listening && plan.listening.enabled) {
        const lTarget = Math.max(1, Math.min(3, parseInt(plan.listening.target, 10) || 3));
        total += lTarget;
        for (let i = 0; i < lTarget; i++) {
          if (log.listeningChecks && log.listeningChecks[i]) completed++;
        }
      }

      // 2. Tafsir
      total += 1;
      if (log.tafsirCheck) completed++;

      // 3. Initial Review
      total += 1;
      if (log.initialReviewCheck) completed++;

      // 4. Voice Recording
      if (plan.recording && plan.recording.enabled) {
        const rTarget = Math.max(1, Math.min(3, parseInt(plan.recording.target, 10) || 3));
        total += rTarget;
        for (let i = 0; i < rTarget; i++) {
          if (log.audioRecordingChecks && log.audioRecordingChecks[i]) completed++;
        }
      }

      // 5. Repetitions
      if (plan.memoRep && plan.memoRep.enabled) {
        const repTarget = Math.max(1, parseInt(plan.memoRep.target, 10) || 10);
        total += 1;
        if (log.repetitionCounter >= repTarget) completed++;
        else if (log.repetitionCounter > 0) completed += (log.repetitionCounter / repTarget);
      }

      // 6. Friend Recitations
      if (plan.friend && plan.friend.enabled) {
        const fTarget = Math.max(1, Math.min(2, parseInt(plan.friend.target, 10) || 2));
        total += fTarget;
        for (let i = 0; i < fTarget; i++) {
          if (log.friendRecitationChecks && log.friendRecitationChecks[i]) completed++;
        }
      }
    }

    // Consolidation tasks (dynamically respects planConfig)
    const isConsEnabled = !plan.consolidation || plan.consolidation.enabled;
    if (routine && routine.hasConsolidation && isConsEnabled && !missed.consolidation) {
      const consTarget = (plan.consolidation && parseInt(plan.consolidation.target, 10)) || 5;
      total += 2;
      const isPrevPagesDone = log.prevPagesCheck || (log.prevPagesCounter >= consTarget);
      if (isPrevPagesDone) completed++;

      if (log.lastTenPagesCheck) completed++;
    }

    // Near review (dynamically respects planConfig)
    const hasNear = routine.hasNearReview && (!plan.nearReview || plan.nearReview.enabled);
    if (hasNear && !missed.review) {
      total += 1;
      if (log.nearReviewCheck) completed++;
    }

    // Distant review (dynamically respects planConfig)
    const isSingleMode = AppState.reviewSystemMode === 'single';
    const hasDistant = !isSingleMode && routine.hasDistantReview && (!plan.distantReview || plan.distantReview.enabled);
    if (hasDistant && !missed.review) {
      total += 1;
      if (log.distantReviewCheck) completed++;
    }

    // Custom tasks from weekly schedule (المهام المخصصة لليوم)
    const customTasks = getCustomTasksForDay(routine);
    if (customTasks.length > 0) {
      const cTasks = log.customTasks || {};
      customTasks.forEach(task => {
        total += 1;
        if (cTasks[task]) completed++;
      });
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
    const curMushafPage = parseInt(localStorage.getItem('tibyan_mushaf_page'), 10) || 1;
    await window.quranStorage.saveData({
      activeCycleDay: AppState.activeCycleDay,
      cycleAnchor: AppState.cycleAnchor,
      prevSurahAnchor: AppState.prevSurahAnchor,
      totalCycleDays: getCycleDaysCount(),
      reviewSystemMode: AppState.reviewSystemMode || 'dual',
      reverseMemorizationOrder: !!AppState.reverseMemorizationOrder,
      surahConfig: AppState.surahConfig,
      tenDaySchedule: AppState.tenDaySchedule,
      weeklySchedule: AppState.weeklySchedule,
      dailyLogs: AppState.dailyLogs,
      completedSurahs: AppState.completedSurahs,
      urgentExamPlan: AppState.urgentExamPlan,
      reviewPathType: AppState.reviewPathType,
      manualConsolidations: AppState.manualConsolidations || [],
      planConfig: AppState.planConfig,
      ayahBookmarks: AppState.ayahBookmarks || {},
      flaggedAyahs: AppState.flaggedAyahs || [],
      ayahNotes: AppState.ayahNotes || {},
      ayahHighlights: AppState.ayahHighlights || {},
      wordHighlights: AppState.wordHighlights || {},
      pageNotes: AppState.pageNotes || {},
      lastMushafPage: curMushafPage
    });
  }
  window.persistState = persistState;

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



  // دالة فحص موحدة وشاملة لما إذا كانت السورة الحالية في مرحلة التثبيت بالأرباع
  function isTathbeetActive() {
    if (!AppState.surahConfig) {
      AppState.surahConfig = defaultSurahConfig();
    }
    const config = AppState.surahConfig;

    // 1. فحص الحالة في AppState مباشرة
    if (config.status === 'ready_for_tathbeet') return true;

    // 2. إذا كانت آيات السورة الحالية مكتملة 100% (تم إتمام حفظ السورة المقررة)
    const total = parseInt(config.totalVerses, 10) || 1;
    const current = parseInt(config.currentVerse, 10) || 0;
    if (total > 0 && current >= total) {
      config.status = 'ready_for_tathbeet';
      localStorage.setItem('seraj_active_tathbeet_surah', config.name);
      localStorage.setItem('seraj_tathbeet_mode', 'true');
      return true;
    }

    // 3. فحص السورة النشطة للتثبيت المخزنة في LocalStorage
    const savedActiveSurah = localStorage.getItem('seraj_active_tathbeet_surah');
    if (savedActiveSurah) {
      config.name = savedActiveSurah;
      config.status = 'ready_for_tathbeet';
      let sObj = null;
      if (typeof QURAN_SURAHS !== 'undefined') sObj = QURAN_SURAHS.find(s => s.name === savedActiveSurah);
      if (!sObj && window.QURAN_SURAHS) sObj = window.QURAN_SURAHS.find(s => s.name === savedActiveSurah);
      if (sObj) {
        config.totalVerses = sObj.verses;
        config.currentVerse = sObj.verses;
      }
      return true;
    }

    // 4. فحص وضع التثبيت العام
    if (localStorage.getItem('seraj_tathbeet_mode') === 'true') {
      config.status = 'ready_for_tathbeet';
      return true;
    }

    // 5. فحص الملف الشخصي tibyan_user_profile
    try {
      const profStr = localStorage.getItem('tibyan_user_profile');
      if (profStr) {
        const prof = JSON.parse(profStr);
        if (prof && prof.currentTarget && prof.currentTarget.status === 'ready_for_tathbeet') {
          let sObj = null;
          if (typeof QURAN_SURAHS !== 'undefined') sObj = QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (!sObj && window.QURAN_SURAHS) sObj = window.QURAN_SURAHS.find(s => s.id === prof.currentTarget.surahId);
          if (sObj) {
            config.name = sObj.name;
            config.totalVerses = sObj.verses;
            config.currentVerse = sObj.verses;
            config.status = 'ready_for_tathbeet';
            localStorage.setItem('seraj_active_tathbeet_surah', sObj.name);
            localStorage.setItem('seraj_tathbeet_mode', 'true');
            return true;
          }
        }
      }
    } catch (_) {}

    return false;
  }
  window.isTathbeetActive = isTathbeetActive;

  // دالة حساب تقدم التثبيت بالأرباع للسورة المحددة بدقة
  function getSurahTathbeetProgress(surahName) {
    const sName = surahName || (AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال';
    let sObj = null;
    if (typeof QURAN_SURAHS !== 'undefined') {
      sObj = QURAN_SURAHS.find(s => s.name === sName);
    }
    if (!sObj && window.QURAN_SURAHS) {
      sObj = window.QURAN_SURAHS.find(s => s.name === sName);
    }
    const sId = sObj ? sObj.id : 8;
    const totalVerses = sObj ? sObj.verses : 75;

    // جلب أرباع السورة
    const dict = (typeof QURAN_SURAH_QUARTERS !== 'undefined') ? QURAN_SURAH_QUARTERS : (window.QURAN_SURAH_QUARTERS || {});
    const canonical = dict[sId] || [];
    let quarters = [];

    if (canonical.length > 0) {
      quarters = canonical.map((item, i) => ({
        num: i + 1,
        fromAyah: item[0],
        toAyah: item[1]
      }));
    } else {
      quarters = [{ num: 1, fromAyah: 1, toAyah: totalVerses }];
    }

    const totalQuarters = quarters.length;
    let completedQuarters = 0;
    let totalScore = 0; // مجموع النقاط الجزئية (سماع + تسجيل + 7 تكرارات)
    const maxScore = totalQuarters * 3; // كل ربع له 3 أركان: سماع، تسجيل، تكرار

    quarters.forEach(q => {
      const key = `quarter_progress_${sId}_${q.fromAyah}_${q.toAyah}`;
      let prog = null;
      try {
        const saved = localStorage.getItem(key);
        if (saved) prog = JSON.parse(saved);
      } catch (_) {}

      let qScore = 0;
      if (prog) {
        if (prog.heardFirstTime) qScore += 1;
        if (prog.recordedRecitation) qScore += 1;
        const rep = prog.repetitionCount || 0;
        if (rep >= 7) {
          qScore += 1;
        } else if (rep > 0) {
          qScore += (rep / 7);
        }

        if (prog.heardFirstTime && prog.recordedRecitation && rep >= 7) {
          completedQuarters++;
        }
      }
      totalScore += qScore;
    });

    const percent = Math.min(100, Math.round((totalScore / maxScore) * 1000) / 10);
    return {
      surahName: sName,
      surahId: sId,
      totalQuarters,
      completedQuarters,
      percent,
      isFinished: (completedQuarters === totalQuarters)
    };
  }
  window.getSurahTathbeetProgress = getSurahTathbeetProgress;

  // 1. Render Current Surah Card
  function renderSurahCard() {
    const config = AppState.surahConfig;
    const nameEl = document.getElementById('currentSurahName');
    const typeLabelEl = document.getElementById('currentSurahTypeLabel');
    const percentEl = document.getElementById('currentSurahPercent');
    const ratioEl = document.getElementById('currentSurahRatio');
    const fillEl = document.getElementById('currentSurahFill');
    const statusTextEl = document.getElementById('currentSurahStatusText');
    const quickButtonsRow = document.querySelector('.surah-action-buttons');

    if (!nameEl) return;

    const isInTathbeet = isTathbeetActive();
    document.body.classList.toggle('tathbeet-active-mode', isInTathbeet);

    if (isInTathbeet) {
      // السورة في مرحلة التثبيت: يظهر عنوان "تثبيت سورة كذا" ونسبة تقدم التثبيت بالأرباع
      const tProg = getSurahTathbeetProgress(config.name);
      if (typeLabelEl) typeLabelEl.textContent = 'مرحلة التثبيت والتمكين';
      nameEl.textContent = `تثبيت سورة ${config.name || 'الأنفال'}`;
      percentEl.textContent = `${tProg.percent}%`;
      ratioEl.textContent = `${tProg.completedQuarters} من ${tProg.totalQuarters} أرباع مكتملة`;
      fillEl.style.width = `${tProg.percent}%`;
      statusTextEl.innerHTML = `تم إتقان <strong>${tProg.completedQuarters}</strong> من <strong>${tProg.totalQuarters}</strong> أرباع بالأرباع والتكرار`;

      // إخفاء أزرار زيادة الآيات تماماً أثناء مرحلة التثبيت
      if (quickButtonsRow) quickButtonsRow.style.display = 'none';
    } else {
      // السورة في مرحلة الحفظ العادي
      const total = parseInt(config.totalVerses) || 1;
      const current = Math.min(total, parseInt(config.currentVerse) || 0);
      const percent = Math.min(100, Math.round((current / total) * 1000) / 10);
      const remaining = total - current;

      if (typeLabelEl) typeLabelEl.textContent = 'السورة المقررة الحالية';
      nameEl.textContent = `سورة ${config.name || 'البقرة'}`;
      percentEl.textContent = `${percent}%`;
      ratioEl.textContent = `${current} من ${total} آية`;
      fillEl.style.width = `${percent}%`;
      statusTextEl.innerHTML = `تم حفظ <strong>${current}</strong> آية (المتبقي: <strong>${remaining}</strong> آية)`;

      if (quickButtonsRow) quickButtonsRow.style.display = 'flex';
    }

    // زرّا إتمام السورة عند الوصول إلى 100% وإشعار مرحلة التثبيت
    const completionRow = document.getElementById('surahCompletionActionsRow');
    const tathbeetNotice = document.getElementById('surahInTathbeetNotice');
    const tathbeetTitle = document.getElementById('tathbeetNoticeTitle');

    if (tathbeetNotice) {
      if (isInTathbeet) {
        tathbeetNotice.style.display = 'flex';
        if (tathbeetTitle) {
          tathbeetTitle.textContent = `أنت الآن في مرحلة تثبيت سورة ${config.name}`;
        }
        const tathDesc = document.getElementById('tathbeetNoticeDesc');
        if (tathDesc) {
          const prevSurahName = config.previousSurah || (config.name === 'الأنفال' ? 'التوبة' : 'السابقة');
          tathDesc.textContent = `تم نقل سورة ${prevSurahName} للمراجعة الدورية وتوزيعها بالأيام`;
        }
        const nextSurahObj = getNextSurahInfo(config.name);
        const tNextLbl = document.getElementById('btnTathbeetGoToNextSurahLabel');
        if (tNextLbl) {
          tNextLbl.textContent = nextSurahObj ? `الانتقال لسورة ${nextSurahObj.name}` : 'الانتقال للسورة التالية';
        }
      } else {
        tathbeetNotice.style.display = 'none';
      }
    }

    if (completionRow) {
      const total = parseInt(config.totalVerses) || 1;
      const current = Math.min(total, parseInt(config.currentVerse) || 0);
      const percent = Math.min(100, Math.round((current / total) * 1000) / 10);

      if (percent >= 100 && !isInTathbeet) {
        completionRow.style.display = 'flex';
        const nextSurahObj = getNextSurahInfo(config.name);
        const nextLabel = document.getElementById('btnGoToNextSurahLabel');
        if (nextLabel) {
          nextLabel.textContent = nextSurahObj ? `الانتقال لسورة ${nextSurahObj.name}` : 'الانتقال للسورة التالية';
        }
      } else {
        completionRow.style.display = 'none';
      }
    }
  }

  function getNextSurahInfo(currentSurahName) {
    if (typeof QURAN_SURAHS === 'undefined' && typeof window.QURAN_SURAHS === 'undefined') return null;
    const list = (typeof window !== 'undefined' && window.QURAN_SURAHS) || QURAN_SURAHS;
    const curClean = (currentSurahName || '').replace(/^سورة\s+/, '').trim();
    const idx = list.findIndex(s => s.name.replace(/^سورة\s+/, '').trim() === curClean);
    if (idx !== -1) {
      const isReverse = !!AppState.reverseMemorizationOrder;
      if (isReverse) {
        // الحفظ العكسي: من الناس إلى البقرة (سورة الأنفال رقم 8 تنتقل إلى الأعراف رقم 7)
        return (idx - 1 >= 0) ? list[idx - 1] : null;
      } else {
        // الحفظ العادي: من البقرة إلى الناس (سورة الأنفال رقم 8 تنتقل إلى التوبة رقم 9)
        return (idx + 1 < list.length) ? list[idx + 1] : null;
      }
    }
    return null;
  }

  // 2. Render Dynamic Section Visibility (حسب خطة الأسبوع وتخصيصات الخطة اليومية)
  function renderDynamicVisibility() {
    const routine = getSelectedDayRoutine();
    const customTasks = getCustomTasksForDay(routine);
    const hasCustomTask = customTasks.length > 0;
    const plan = AppState.planConfig || defaultPlanConfig();

    const isConsEnabled = !plan.consolidation || plan.consolidation.enabled;
    const isSingleMode = AppState.reviewSystemMode === 'single';
    const hasNear = routine.hasNearReview && (!plan.nearReview || plan.nearReview.enabled);
    const hasDistant = !isSingleMode && routine.hasDistantReview && (!plan.distantReview || plan.distantReview.enabled);

    const hasAnyStandard = routine.hasNew || (routine.hasConsolidation && isConsEnabled) || hasNear || hasDistant;
    const rawNote = ((routine.customTask !== undefined ? routine.customTask : routine.note) || '').trim();
    const isExplicitRest = rawNote.includes('راحة') && !hasAnyStandard;
    const isRestDay = (!hasAnyStandard && !hasCustomTask) || isExplicitRest;

    // بطاقة يوم الراحة
    const restDayCard = document.getElementById('restDayCard');
    const milestoneCard = document.getElementById('dailyMilestoneCard');

    if (restDayCard) {
      restDayCard.style.display = isRestDay ? 'flex' : 'none';
    }
    if (milestoneCard) {
      milestoneCard.style.display = 'none';
    }

    // قسم المهمة المخصصة لليوم
    const secCustom = document.getElementById('sectionCustomTaskCard');
    if (secCustom) {
      secCustom.style.display = hasCustomTask ? 'block' : 'none';
    }

    // قسم الحفظ الجديد: يتم إخفاؤه تماماً طالما المستخدم في مرحلة التثبيت
    const secNew = document.getElementById('sectionNewMemoCard');
    const isSurahInTathbeet = isTathbeetActive();
    if (secNew) {
      secNew.style.display = (!isSurahInTathbeet && routine.hasNew) ? 'block' : 'none';
    }

    // سرد الأوجه السابقة من السورة الحالية: يتم إخفاؤه أثناء مرحلة التثبيت لأن السورة تثبت بالكامل بالأرباع
    const prevPagesCard = document.getElementById('prevPagesCard');
    if (prevPagesCard) {
      prevPagesCard.style.display = isSurahInTathbeet ? 'none' : '';
    }

    // تطبيق تخصيصات الخطة اليومية على عناصر قسم الحفظ الجديد (Plan Config):

    // 1.1 جلسات الاستماع
    const listeningGroup = document.getElementById('listeningSectionGroup') || (document.getElementById('reciterCheck_0') ? document.getElementById('reciterCheck_0').parentElement.parentElement : null);
    const isListeningEnabled = plan.listening && plan.listening.enabled;
    const listeningTarget = Math.max(1, Math.min(3, (plan.listening && parseInt(plan.listening.target, 10)) || 3));
    if (listeningGroup) {
      listeningGroup.style.display = isListeningEnabled ? 'block' : 'none';
    }
    if (isListeningEnabled) {
      const listeningTitle = document.getElementById('listeningTitleLabel') || (listeningGroup ? listeningGroup.querySelector('.check-title-main') : null);
      if (listeningTitle) {
        listeningTitle.textContent = listeningTarget === 1 ? 'جلسة الاستماع للقارئ المتقن:' : `جلسات الاستماع للقارئ المتقن (${listeningTarget} مرات):`;
      }
      const listeningGrid = document.getElementById('listeningChecksGrid') || (listeningGroup ? listeningGroup.querySelector('.sub-checks-grid') : null);
      if (listeningGrid) {
        listeningGrid.style.gridTemplateColumns = `repeat(${listeningTarget}, 1fr)`;
      }
      [0, 1, 2].forEach(idx => {
        const el = document.getElementById(`reciterCheck_${idx}`);
        if (el) el.style.display = idx < listeningTarget ? 'flex' : 'none';
      });
    }

    // 1.4 تسجيل الصوت
    const recordingGroup = document.getElementById('recordingSectionGroup') || (document.getElementById('audioRecCheck_0') ? document.getElementById('audioRecCheck_0').parentElement.parentElement : null);
    const isRecordingEnabled = plan.recording && plan.recording.enabled;
    const recordingTarget = Math.max(1, Math.min(3, (plan.recording && parseInt(plan.recording.target, 10)) || 3));
    if (recordingGroup) {
      recordingGroup.style.display = isRecordingEnabled ? 'block' : 'none';
    }
    if (isRecordingEnabled) {
      const recordingTitle = document.getElementById('recordingTitleLabel') || (recordingGroup ? recordingGroup.querySelector('.check-title-main') : null);
      if (recordingTitle) {
        recordingTitle.textContent = recordingTarget === 1 ? 'تسجيل الصوت للمراجعة الذاتية:' : `تسجيل الصوت للمراجعة الذاتية (${recordingTarget} مرات):`;
      }
      const recordingGrid = document.getElementById('recordingChecksGrid') || (recordingGroup ? recordingGroup.querySelector('.sub-checks-grid') : null);
      if (recordingGrid) {
        recordingGrid.style.gridTemplateColumns = `repeat(${recordingTarget}, 1fr)`;
      }
      [0, 1, 2].forEach(idx => {
        const el = document.getElementById(`audioRecCheck_${idx}`);
        if (el) el.style.display = idx < recordingTarget ? 'flex' : 'none';
      });
    }

    // 1.5 عداد التكرار
    const repModule = document.querySelector('.official-counter-module');
    const isRepEnabled = plan.memoRep && plan.memoRep.enabled;
    const repTarget = Math.max(1, (plan.memoRep && parseInt(plan.memoRep.target, 10)) || 10);
    if (repModule) {
      repModule.style.display = isRepEnabled ? 'flex' : 'none';
      const repTitle = repModule.querySelector('.counter-title-bold');
      const repDesc = repModule.querySelector('.counter-desc-muted');
      if (repTitle) repTitle.textContent = `التكرار ${repTarget} مرات`;
      if (repDesc) repDesc.textContent = `تكرار الآيات المقررة ${repTarget} مرات لترسيخ الحفظ`;
    }

    // 1.6 سرد للرفيقتين
    const friendGroup = document.getElementById('friendSectionGroup') || (document.getElementById('friendCheck_0') ? document.getElementById('friendCheck_0').parentElement.parentElement : null);
    const isFriendEnabled = plan.friend && plan.friend.enabled;
    const friendTarget = Math.max(1, Math.min(2, (plan.friend && parseInt(plan.friend.target, 10)) || 2));
    if (friendGroup) {
      friendGroup.style.display = isFriendEnabled ? 'block' : 'none';
    }
    if (isFriendEnabled) {
      const friendTitle = document.getElementById('friendTitleLabel') || (friendGroup ? friendGroup.querySelector('.check-title-main') : null);
      if (friendTitle) {
        friendTitle.textContent = friendTarget === 1 ? 'سرد المحفوظ (مرة واحدة):' : 'سرد المحفوظ لرفيقتين:';
      }
      const friendGrid = document.getElementById('friendChecksGrid') || (friendGroup ? friendGroup.querySelector('div[style*="grid"]') : null);
      if (friendGrid) {
        friendGrid.style.gridTemplateColumns = friendTarget === 1 ? '1fr' : '1fr 1fr';
      }
      [0, 1].forEach(idx => {
        const el = document.getElementById(`friendCheck_${idx}`);
        if (el) el.style.display = idx < friendTarget ? 'flex' : 'none';
      });
    }

    // قسم التثبيت
    const secCons = document.getElementById('sectionConsolidationCard');
    if (secCons) {
      secCons.style.display = (routine.hasConsolidation && isConsEnabled) ? 'block' : 'none';
    }

    // قسم المراجعة الدورية
    const secPeriodic = document.getElementById('sectionPeriodicCard');
    if (secPeriodic) {
      secPeriodic.style.display = (hasNear || hasDistant) ? 'block' : 'none';
    }

    // الصفوف الفرعية للمراجعة القريبة والبعيدة
    const nearRow = document.getElementById('nearReviewRowGroup');
    if (nearRow) {
      nearRow.style.display = hasNear ? 'block' : 'none';
    }

    const distantRow = document.getElementById('distantReviewRowGroup');
    if (distantRow) {
      distantRow.style.display = (isSingleMode || !hasDistant) ? 'none' : 'block';
    }
  }

  // 3. Render Audio Recordings with Delete Option
  function renderAudioSlots() {
    const container = document.getElementById('audioSlotsContainer');
    if (!container) return;
    container.innerHTML = '';

    [0, 1, 2].forEach(slotIdx => {
      const audioUrl = (window.quranRecorder && typeof window.quranRecorder.getRecording === 'function') 
        ? window.quranRecorder.getRecording(slotIdx) 
        : null;
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
  
  function renderManualConsolidations() {
    const container = document.getElementById('manualConsolidationContainer');
    if (!container) return;
    if (!AppState.manualConsolidations || AppState.manualConsolidations.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }
    container.style.display = 'block';
    container.innerHTML = AppState.manualConsolidations.map(item => `
      <div class="check-row-item review-portion-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border:1px solid var(--border-light); border-radius:8px; padding:8px 12px; background:var(--bg-subtle);">
        <div class="check-row-left">
            <span style="font-size:0.85rem; font-weight:600; color:var(--text-main);">${esc(item.text)}</span>
        </div>
        <div class="action-buttons-group" style="display:flex; gap:6px;">
            <button type="button" class="btn-remove-consolidation" data-id="${item.id}" style="padding:4px 10px; background:#bbf7d0; color:#166534; border:1px solid #86efac; border-radius:6px; cursor:pointer; font-size:0.8rem; font-weight:600;">تم</button>
        </div>
      </div>
    `).join('');
  }

  function renderCustomTasks(log) {
    const container = document.getElementById('customTasksList');
    if (!container) return;
    const routine = getSelectedDayRoutine();
    const customTasks = getCustomTasksForDay(routine);

    if (customTasks.length === 0) {
      container.innerHTML = '';
      return;
    }

    const cTasks = log.customTasks || {};
    container.innerHTML = customTasks.map((task, idx) => {
      const isDone = Boolean(cTasks[task]);
      return `
        <div class="check-row-item custom-task-item ${isDone ? 'checked' : ''}" role="checkbox" aria-checked="${isDone}" tabindex="0" data-task-index="${idx}">
          <div class="check-row-left">
            <div class="custom-check-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div>
              <span class="check-title-main">${esc(task)}</span>
              <span class="check-desc-sub">مهمة مقررة لهذا اليوم وفق جدول توزيع أيام الأسبوع</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.custom-task-item').forEach(item => {
      const toggle = () => {
        triggerHaptic(20);
        const idx = parseInt(item.getAttribute('data-task-index'), 10);
        const taskName = customTasks[idx];
        if (!taskName) return;
        if (!log.customTasks) log.customTasks = {};
        log.customTasks[taskName] = !log.customTasks[taskName];
        if (log.customTasks[taskName]) {
          showToast(`تم إنجاز: ${taskName}`);
        }
        persistState();
        renderDailyChecklist();
      };
      item.addEventListener('click', toggle);
      item.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  
  // --- تقسيم السورة السابقة إلى أرباع تتكرر دورياً لضمان قوة الربط والتثبيت ---
  function getPreviousSurahName() {
    const cur = (AppState.surahConfig && AppState.surahConfig.name) || 'البقرة';
    if (AppState.surahConfig && AppState.surahConfig.previousSurah) {
      return AppState.surahConfig.previousSurah;
    }

    if (typeof QURAN_SURAHS !== 'undefined') {
      const idx = QURAN_SURAHS.findIndex(s => s.name === cur);
      if (idx !== -1) {
        const isReverse = !!AppState.reverseMemorizationOrder;
        if (isReverse) {
          // في الحفظ العكسي (من الناس للبقرة): السورة السابقة المحفوظة قبل الأنفال كانت التوبة (idx + 1)
          return (idx + 1 < QURAN_SURAHS.length) ? QURAN_SURAHS[idx + 1].name : 'الناس';
        } else {
          // في الحفظ العادي (من البقرة للناس): السورة السابقة المحفوظة قبل الأنفال كانت الأعراف (idx - 1)
          return (idx - 1 >= 0) ? QURAN_SURAHS[idx - 1].name : 'البقرة';
        }
      }
    }
    return AppState.reverseMemorizationOrder ? 'التوبة' : 'الأعراف';
  }

  function getSurahQuarters(surahName) {
    const sName = surahName || getPreviousSurahName();
    let surah = null;
    if (typeof QURAN_SURAHS !== 'undefined') {
      surah = QURAN_SURAHS.find(s => s.name === sName);
    }
    if (!surah) {
      surah = { id: 9, name: "التوبة", verses: 129, type: "مدنية", startPage: 187, endPage: 207 };
    }

    // 1. تقسيم الأرباع المعتمدة بالمصحف الشريف بدءاً من بداية السورة (تسعة أرباع لسورة التوبة)
    const quartersDict = (typeof QURAN_SURAH_QUARTERS !== 'undefined') ? QURAN_SURAH_QUARTERS : (window.QURAN_SURAH_QUARTERS || null);
    if (quartersDict && quartersDict[surah.id]) {
      const rawList = quartersDict[surah.id];
      const quarters = rawList.map((q, idx) => ({
        num: idx + 1,
        name: `الربع ${idx + 1}`,
        from: q[0],
        to: q[1],
        fromPage: q[2],
        toPage: q[3]
      }));
      return { surah, quarters };
    }

    // احتياط في حال عدم توفر خريطة الأرباع
    const v = surah.verses;
    const quarters = [
      { num: 1, name: 'الربع 1', from: 1, to: v, fromPage: surah.startPage, toPage: surah.endPage }
    ];
    return { surah, quarters };
  }

  function getPrevSurahQuarterForDate(dateStr) {
    const log = AppState.dailyLogs && AppState.dailyLogs[dateStr];
    if (log && log.prevSurahQuarter) {
      return log.prevSurahQuarter;
    }

    const prevSurahName = getPreviousSurahName();
    const { quarters } = getSurahQuarters(prevSurahName);
    const totalQuarters = Math.max(1, quarters.length);

    let anchor = AppState.prevSurahAnchor;
    if (!anchor || !anchor.date) {
      const todayStr = getTodayDateString();
      anchor = { date: todayStr, quarter: 1 };
      AppState.prevSurahAnchor = anchor;
    }

    if (dateStr === anchor.date) {
      return ((anchor.quarter - 1) % totalQuarters) + 1;
    }

    const dAnchor = parseDate(anchor.date);
    const dTarget = parseDate(dateStr);
    const isForward = dTarget > dAnchor;

    let activeDaysCount = 0;
    let cur = new Date(dAnchor.getTime());

    if (isForward) {
      while (true) {
        cur.setDate(cur.getDate() + 1);
        const curY = cur.getFullYear();
        const curM = String(cur.getMonth() + 1).padStart(2, '0');
        const curD = String(cur.getDate()).padStart(2, '0');
        const curStr = `${curY}-${curM}-${curD}`;

        const routine = routineFor(curStr);
        if (!routine || routine.hasConsolidation !== false) {
          activeDaysCount++;
        }
        if (curStr === dateStr || cur >= dTarget) break;
      }
      return ((anchor.quarter - 1 + activeDaysCount) % totalQuarters) + 1;
    } else {
      while (true) {
        const curY = cur.getFullYear();
        const curM = String(cur.getMonth() + 1).padStart(2, '0');
        const curD = String(cur.getDate()).padStart(2, '0');
        const curStr = `${curY}-${curM}-${curD}`;

        const routine = routineFor(curStr);
        if (!routine || routine.hasConsolidation !== false) {
          activeDaysCount++;
        }
        if (curStr === dateStr || cur <= dTarget) break;
        cur.setDate(cur.getDate() - 1);
      }
      const raw = (anchor.quarter - 1 - (activeDaysCount % totalQuarters)) % totalQuarters;
      return (raw < 0 ? raw + totalQuarters : raw) + 1;
    }
  }

  function renderPrevSurahConsolidation(log) {
    const card = document.getElementById('lastTenPagesCard');
    if (!card) return;

    // في مرحلة التثبيت: السورة التي تثبت بالأرباع هي سورة التثبيت نفسها (مثلاً الأنفال)
    // وفي مرحلة الحفظ العادي: السورة التي تثبت بالأرباع هي السورة السابقة (مثلاً التوبة)
    const isTathbeet = isTathbeetActive();
    const consSurahName = isTathbeet
      ? ((AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال')
      : getPreviousSurahName();
    const { surah, quarters } = getSurahQuarters(consSurahName);

    const qNum = log.prevSurahQuarter || getPrevSurahQuarterForDate(AppState.selectedDate);
    const validQNum = (qNum >= 1 && qNum <= quarters.length) ? qNum : 1;
    log.prevSurahQuarter = validQNum;
    const activeQuarter = quarters.find(q => q.num === validQNum) || quarters[0];

    // Card status checked
    if (log.lastTenPagesCheck) {
      card.classList.add('checked');
      card.setAttribute('aria-checked', 'true');
    } else {
      card.classList.remove('checked');
      card.setAttribute('aria-checked', 'false');
    }

    // Dynamic text elements matching the user's mockup:
    // سرد من سورة [التوبة] الربع :[1 من 4 أرباع]
    // الأيات من [1-32]
    const nameEl = document.getElementById('prevSurahNameSpan');
    const ratioEl = document.getElementById('prevSurahQuarterRatioSpan');
    const ayahsEl = document.getElementById('prevSurahAyahsSpan');
    const displayNumEl = document.getElementById('prevQuarterDisplayNum');
    const selectEl = document.getElementById('prevSurahQuarterSelect');

    if (nameEl) nameEl.textContent = consSurahName;
    if (ratioEl) ratioEl.textContent = `${activeQuarter.num} من ${quarters.length} أرباع`;
    if (ayahsEl) ayahsEl.textContent = `الأيات من ${activeQuarter.from}-${activeQuarter.to}`;
    if (displayNumEl) displayNumEl.textContent = String(activeQuarter.num);

    // Populate dropdown options
    if (selectEl) {
      selectEl.innerHTML = quarters.map(q => `
        <option value="${q.num}" ${q.num === activeQuarter.num ? 'selected' : ''}>
          الربع ${q.num}: الآيات ${q.from} - ${q.to} (ص ${q.fromPage} - ${q.toPage})
        </option>
      `).join('');

      selectEl.value = String(activeQuarter.num);

      selectEl.onchange = (e) => {
        const targetNum = parseInt(e.target.value, 10);
        triggerHaptic(15);
        log.prevSurahQuarter = targetNum;
        AppState.prevSurahAnchor = { date: AppState.selectedDate, quarter: targetNum };
        showToast(`تم اختيار الربع ${targetNum} من سورة ${consSurahName}`);
        renderDailyChecklist();
        persistState();
      };
    }
  }

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

    // التكرار (عداد)
    const repTarget = (AppState.planConfig && AppState.planConfig.memoRep && AppState.planConfig.memoRep.target) || 10;
    const repCounter = document.getElementById('repetitionCounterVal');
    if (repCounter) {
      repCounter.textContent = log.repetitionCounter;
      if (log.repetitionCounter >= repTarget) repCounter.classList.add('completed');
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
      const consTarget = (AppState.planConfig && AppState.planConfig.consolidation && parseInt(AppState.planConfig.consolidation.target, 10)) || 5; if (log.prevPagesCheck || log.prevPagesCounter >= consTarget) prevPagesCard.classList.add('checked');
      else prevPagesCard.classList.remove('checked');
    }
    // قسم التثبيت: سرد السورة السابقة للسورة الحالية مقسمة إلى أرباع تتكرر دورياً
    renderPrevSurahConsolidation(log);

    // قسم المراجعة الدورية
    const totalDays = getCycleDaysCount();
    const activeCycleNum = getCycleDayForDate(AppState.selectedDate);
    AppState.activeCycleDay = activeCycleNum;
    if (log) log.cycleDay = activeCycleNum;
    const currentCycleEntry = AppState.tenDaySchedule.find(item => item.day == activeCycleNum) || AppState.tenDaySchedule[0] || { day: 1, nearReview: "غير محدد", distantReview: "غير محدد" };

    const cycleDayBadge = document.getElementById('periodicCycleDayBadge');
    if (cycleDayBadge) {
      cycleDayBadge.textContent = `اليوم ${activeCycleNum} من ${totalDays}`;
    }

    const isSingleMode = AppState.reviewSystemMode === 'single';
    const nearReviewTitle = document.querySelector('#nearReviewCard .portion-type-title');
    const nearReviewText = document.getElementById('todayNearReviewPortion');
    const distantReviewRowGroup = document.getElementById('distantReviewRowGroup');

    if (isSingleMode) {
      if (nearReviewTitle) nearReviewTitle.textContent = 'المراجعة المقررة:';
      if (nearReviewText) {
        nearReviewText.textContent = currentCycleEntry.singleReview || currentCycleEntry.nearReview || "غير محدد";
      }
      if (distantReviewRowGroup) distantReviewRowGroup.style.display = 'none';
    } else {
      if (nearReviewTitle) nearReviewTitle.textContent = 'المراجعة القريبة:';
      if (nearReviewText) {
        nearReviewText.textContent = currentCycleEntry.nearReview || "غير محدد";
      }
      if (distantReviewRowGroup) distantReviewRowGroup.style.display = 'block';
      const distantReviewText = document.getElementById('todayDistantReviewPortion');
      if (distantReviewText) {
        distantReviewText.textContent = currentCycleEntry.distantReview || "غير محدد";
      }
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
    renderCustomTasks(log);
    renderMissed(log);
    renderMilestoneSummary(log);
    renderDateScroller(); // تحديث دوائر التقدم اليومية مباشرة عند تغيير أي مهمة
    renderManualConsolidations();
  }

  // 5. Render Milestone Summary
  function renderMilestoneSummary(log) {
    const stats = calculateDailyProgress(log, AppState.selectedDate);
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

  // 6. Render Date Scroller (Modern Circular Days with Progress Ring & Arabic Greeting)
  function renderDateScroller() {
    const scroller = document.getElementById('weekScroller');
    if (!scroller) return;

    try {
      scroller.innerHTML = '';
      const today = new Date();

      // SVG Flame Icon for Completed / Streak days
      const flameSvg = `<svg class="streak-flame-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5C11.5 4 10 6 8.5 7.5C6.5 9.5 5 12 5 14.5C5 18.5 8.1 21.5 12 21.5C15.9 21.5 19 18.5 19 14.5C19 11 16.5 7 14 4.5C13.5 4 13 3 12.5 2.5C12.3 2.3 12.1 2.3 12 2.5ZM12 8C13.2 9.4 14.5 11.5 14.5 13.8C14.5 15.3 13.4 16.5 12 16.5C10.6 16.5 9.5 15.3 9.5 13.8C9.5 12 10.7 9.8 12 8Z"/></svg>`;

      // حساب بداية الأسبوع من يوم السبت (بدلاً من الأحد)
      const baseDate = (AppState.selectedDate && !isNaN(new Date(AppState.selectedDate).getTime())) ? new Date(AppState.selectedDate) : today;
      const dayOfWeek = baseDate.getDay(); // 0 = الأحد, 6 = السبت
      const diffFromSaturday = (dayOfWeek + 1) % 7; // الفارق عن يوم السبت

      for (let i = 0; i < 7; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() - diffFromSaturday + i);

        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dateNum = String(d.getDate()).padStart(2, '0');
        const dateString = `${y}-${m}-${dateNum}`;
        const dayName = ARABIC_DAYS[d.getDay()];

        const isSelected = dateString === AppState.selectedDate;
        const log = (AppState.dailyLogs && AppState.dailyLogs[dateString]) ? AppState.dailyLogs[dateString] : null;
        let percent = 0;
        let isCompleted = false;
        if (log) {
          const stats = calculateDailyProgress(log, dateString);
          percent = stats.percent || 0;
          isCompleted = stats.total > 0 && percent === 100;
        }

        // حساب قوس التقدم الدائري بنصف قطر 17 (المحيط = 106.8)
        const C = 106.8;
        const dashOffset = (C - (percent / 100) * C).toFixed(1);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `week-day-col ${isSelected ? 'selected-day' : ''} ${isCompleted ? 'has-streak' : ''} ${percent > 0 ? 'has-progress' : ''}`;
        btn.setAttribute('aria-label', `${dayName} ${dateNum} - إنجاز ${percent}%`);
        btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');

        btn.innerHTML = `
          <span class="week-day-name">${dayName}</span>
          <div class="week-day-circle-wrap">
            <svg class="day-progress-svg" viewBox="0 0 42 42" aria-hidden="true">
              <circle class="day-progress-track" cx="21" cy="21" r="17" />
              <circle class="day-progress-fill" cx="21" cy="21" r="17"
                      stroke-dasharray="106.8"
                      stroke-dashoffset="${dashOffset}" />
            </svg>
            <div class="day-progress-inner">
              ${isCompleted ? flameSvg : `<span class="week-day-num">${dateNum}</span>`}
            </div>
          </div>
        `;

        btn.addEventListener('click', () => {
          triggerHaptic(15);
          AppState.selectedDate = dateString;
          renderAll();
        });

        scroller.appendChild(btn);
      }
    } catch (err) {
      console.error('Error rendering week circular scroller:', err);
    }

    // Update Greeting & Dates
    try {
      const hijriBadge = document.getElementById('hijriDateText');
      const gregBadge = document.getElementById('gregorianDateText');
      const greetingNameEl = document.getElementById('homeGreetingName');
      const userInitialEl = document.getElementById('homeUserInitial');
      const userAvatarEl = document.getElementById('homeUserAvatar');

      // User name from storage
      const storedName = localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن';
      if (greetingNameEl) {
        greetingNameEl.textContent = `أهلاً، ${storedName}`;
      }
      if (userInitialEl) {
        let initialChar = 'ح';
        if (storedName && storedName !== 'يا حافظ القرآن') {
          const clean = storedName.replace(/^يا\s+/, '').trim();
          if (clean) initialChar = clean.charAt(0);
        }
        userInitialEl.textContent = initialChar;
      }

      if (userAvatarEl && !userAvatarEl._hasClickListener) {
        userAvatarEl._hasClickListener = true;
        userAvatarEl.style.cursor = 'pointer';
        userAvatarEl.title = 'تخصيص اسم المستخدم';
        userAvatarEl.addEventListener('click', () => {
          const cur = localStorage.getItem('tibyan_user_name') || '';
          const input = prompt('أدخل اسمك الكريم ليظهر بعد كلمة "أهلاً":', cur);
          if (input !== null) {
            const trimmed = input.trim();
            if (trimmed) {
              localStorage.setItem('tibyan_user_name', trimmed);
            } else {
              localStorage.removeItem('tibyan_user_name');
            }
            const sInput = document.getElementById('settingsUserNameInput');
            if (sInput) sInput.value = trimmed;
            renderDateScroller();
          }
        });
      }

      const accGreetingText = document.getElementById('accountGreetingNameText');
      if (accGreetingText) {
        accGreetingText.textContent = storedName;
      }

      const accGreetingBtn = document.getElementById('accountGreetingName');
      if (accGreetingBtn && !accGreetingBtn._hasClickListener) {
        accGreetingBtn._hasClickListener = true;
        accGreetingBtn.style.cursor = 'pointer';
        accGreetingBtn.addEventListener('click', () => {
          const cur = localStorage.getItem('tibyan_user_name') || '';
          const input = prompt('أدخل اسمك الكريم ليظهر بعد كلمة "أهلاً":', cur);
          if (input !== null) {
            const trimmed = input.trim();
            if (trimmed) {
              localStorage.setItem('tibyan_user_name', trimmed);
            } else {
              localStorage.removeItem('tibyan_user_name');
            }
            renderDateScroller();
            const curUser = window.quranStorage && window.quranStorage.auth ? window.quranStorage.auth.currentUser : null;
            renderAccount(curUser);
            showToast('تم تحديث الاسم بنجاح');
          }
        });
      }

      const activeDateStr = AppState.selectedDate || getTodayDateString();
      const currentSelectedDate = new Date(activeDateStr + 'T12:00:00');
      const selectedDayName = ARABIC_DAYS[currentSelectedDate.getDay()];
      const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      let formattedHijri = hijriFormatter.format(currentSelectedDate);
      // إزالة أي هـ مكررة إن كانت موجودة مسبقاً في ناتج التنسيق لضمان ظهور "هـ" واحدة فقط
      formattedHijri = formattedHijri.replace(/\s*هـ?\s*$/g, '').trim();
      if (hijriBadge) {
        hijriBadge.textContent = `${selectedDayName} · ${formattedHijri} هـ`;
      }
      if (gregBadge) {
        gregBadge.textContent = currentSelectedDate.toLocaleDateString('ar-EG', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      }
    } catch (e) {
      console.warn('Error formatting hijri date:', e);
      const hijriBadge = document.getElementById('hijriDateText');
      if (hijriBadge) hijriBadge.textContent = AppState.selectedDate;
    }
  }

  // 7. Render Review Schedule Table View
  function renderTenDayScheduleTable() {
    const container = document.getElementById('tenDayScheduleList');
    if (!container) return;

    const totalDays = getCycleDaysCount();
    const isSingleMode = AppState.reviewSystemMode === 'single';

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

      if (isSingleMode) {
        card.innerHTML = `
          <div class="schedule-day-top-bar">
            <div class="schedule-day-label">
              <span>اليوم ${item.day}</span>
              ${isCurrentActive ? '<span class="formal-tag" style="color:var(--primary-medium);font-weight:700;">اليوم النشط حالياً</span>' : ''}
            </div>
            <button class="set-active-day-btn ${isCurrentActive ? 'is-active' : 'not-active'}" data-day="${item.day}" type="button" title="${isCurrentActive ? 'اليوم النشط حالياً' : 'اضغط للتعيين كيوم نشط'}">
              ${isCurrentActive ? '<span class="dot-active">●</span> نشط' : 'غير نشط (تفعيل)'}
            </button>
          </div>
          
        <div class="inputs-grid-portions">
          <div class="portion-field-col" style="grid-column: 1 / -1; width: 100%;">
            <label>المراجعة المقررة:</label>
            <input type="text" class="single-input" data-day="${item.day}" value="${item.singleReview || item.nearReview || ''}" placeholder="السور أو الأجزاء المقررة..." />
          </div>
        </div>

        `;
      } else {
        card.innerHTML = `
          <div class="schedule-day-top-bar">
            <div class="schedule-day-label">
              <span>اليوم ${item.day}</span>
              ${isCurrentActive ? '<span class="formal-tag" style="color:var(--primary-medium);font-weight:700;">اليوم النشط حالياً</span>' : ''}
            </div>
            <button class="set-active-day-btn ${isCurrentActive ? 'is-active' : 'not-active'}" data-day="${item.day}" type="button" title="${isCurrentActive ? 'اليوم النشط حالياً' : 'اضغط للتعيين كيوم نشط'}">
              ${isCurrentActive ? '<span class="dot-active">●</span> نشط' : 'غير نشط (تفعيل)'}
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
      }

      card.querySelector('.set-active-day-btn').addEventListener('click', () => {
        triggerHaptic(20);
        AppState.activeCycleDay = item.day;
        const currentLog = getCurrentDailyLog();
        currentLog.cycleDay = item.day;
        AppState.cycleAnchor = { date: AppState.selectedDate, cycleDay: item.day };
        persistState();
        renderAll();
        renderTenDayScheduleTable();
        showToast(`تم تعيين اليوم ${item.day} كيوم المراجعة النشط ✓`);
      });

      const singleInput = card.querySelector('.single-input');
      if (singleInput) {
        singleInput.addEventListener('change', (e) => {
          const val = e.target.value.trim();
          item.singleReview = val;
          item.nearReview = val;
          persistState();
          renderDailyChecklist();
        });
      }

      
      const nearInput = card.querySelector('.near-input');
      if (nearInput) {
        nearInput.addEventListener('change', (e) => {
          item.nearReview = e.target.value.trim();
          persistState();
          renderDailyChecklist();
        });

      const continuousInput = card.querySelector('.continuous-input');
      if (continuousInput) {
        continuousInput.addEventListener('change', (e) => {
          item.continuousReview = e.target.value.trim();
          item.nearReview = e.target.value.trim(); // sync fallback
          persistState();
          renderDailyChecklist();
        });
      }

      }

      const distantInput = card.querySelector('.distant-input');
      if (distantInput) {
        distantInput.addEventListener('change', (e) => {
          item.distantReview = e.target.value.trim();
          persistState();
          renderDailyChecklist();
        });
      }

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
      const rawVal = routine.customTask !== undefined ? routine.customTask : (routine.note || '');
      const displayVal = LEGACY_DEFAULT_NOTES.includes(rawVal.trim()) ? '' : rawVal;

      card.innerHTML = `
        <div class="weekly-card-top">
          <h4 class="weekly-day-title">${routine.name}</h4>
          <span style="font-size:0.72rem;color:var(--text-muted)">تخصيص المهام</span>
        </div>
        <div class="weekly-options-grid">
          <div class="weekly-chip-btn ${routine.hasNew ? 'active' : ''}" data-day="${key}" data-prop="hasNew">
            <span>${routine.hasNew ? '' : '○'}</span> حفظ جديد
          </div>
          <div class="weekly-chip-btn ${routine.hasConsolidation ? 'active' : ''}" data-day="${key}" data-prop="hasConsolidation">
            <span>${routine.hasConsolidation ? '' : '○'}</span> تثبيت
          </div>
          <div class="weekly-chip-btn ${routine.hasNearReview ? 'active' : ''}" data-day="${key}" data-prop="hasNearReview">
            <span>${routine.hasNearReview ? '' : '○'}</span> مراجعة قريبة
          </div>
          <div class="weekly-chip-btn ${routine.hasDistantReview ? 'active' : ''}" data-day="${key}" data-prop="hasDistantReview">
            <span>${routine.hasDistantReview ? '' : '○'}</span> مراجعة بعيدة
          </div>
        </div>
        <div class="form-field-group" style="margin-bottom:0">
          <label style="font-size:0.75rem;color:var(--text-main);font-weight:600;display:flex;align-items:center;gap:5px;margin-bottom:4px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;color:var(--primary);"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>المهمة المخصصة لهذا اليوم:</span>
          </label>
          <input type="text" class="field-input weekly-note-input" data-day="${key}" value="${esc(displayVal)}" placeholder="اكتب مهمتك المخصصة (مثال: سرد المحفوظ كامل)" />
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
      const handleInput = (e) => {
        const val = e.target.value;
        routine.customTask = val;
        routine.note = val;
        persistState();
        renderDailyChecklist();
      };
      noteInput.addEventListener('input', handleInput);
      noteInput.addEventListener('change', handleInput);

      container.appendChild(card);
    });
  }

  function saveCycleSchedule() {
    triggerHaptic(25);
    const dayBoxes = document.querySelectorAll('#tenDayScheduleList .schedule-day-box-formal');
    dayBoxes.forEach((card, index) => {
      if (AppState.tenDaySchedule[index]) {
        const singleInput = card.querySelector('.single-input');
        const nearInput = card.querySelector('.near-input');
      const distantInput = card.querySelector('.distant-input');
      const continuousInput = card.querySelector('.continuous-input');
        if (singleInput) {
          const val = singleInput.value.trim();
          AppState.tenDaySchedule[index].singleReview = val;
          AppState.tenDaySchedule[index].nearReview = val;
        }
        if (nearInput) AppState.tenDaySchedule[index].nearReview = nearInput.value.trim();
        if (distantInput) AppState.tenDaySchedule[index].distantReview = distantInput.value.trim();
        if (continuousInput) {
            AppState.tenDaySchedule[index].continuousReview = continuousInput.value.trim();
            AppState.tenDaySchedule[index].nearReview = continuousInput.value.trim(); // Sync
        }
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
        const val = input.value.trim();
        AppState.weeklySchedule[key].note = val;
        AppState.weeklySchedule[key].customTask = val;
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

    const prevSelect = document.getElementById('settingsPrevSurahSelect');
    if (prevSelect && prevSelect.children.length <= 1) {
      const sList = (typeof window !== 'undefined' && window.QURAN_SURAHS) || (typeof QURAN_SURAHS !== 'undefined' ? QURAN_SURAHS : []);
      sList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية - ${s.type})`;
        prevSelect.appendChild(opt);
      });
    }
    if (prevSelect) {
      prevSelect.value = getPreviousSurahName();
    }

    const reverseOrderCheckbox = document.getElementById('settingsReverseMemorizationOrder');
    if (reverseOrderCheckbox) {
      reverseOrderCheckbox.addEventListener('change', () => {
        const reverseBadge = document.getElementById('reverseOrderDirectionBadge');
        if (reverseBadge) {
          reverseBadge.textContent = reverseOrderCheckbox.checked ? '(من الناس للبقرة)' : '(من البقرة للناس)';
          reverseBadge.style.color = reverseOrderCheckbox.checked ? '#d97706' : '#0f3d2e';
          reverseBadge.style.background = reverseOrderCheckbox.checked ? 'rgba(217,119,6,0.1)' : 'rgba(15,61,46,0.1)';
        }
        AppState.reverseMemorizationOrder = reverseOrderCheckbox.checked;
        persistState();
        renderSurahCard();
        // Update previous surah dropdown recommendation
        if (prevSelect && !AppState.surahConfig.previousSurah) {
          prevSelect.value = getPreviousSurahName();
        }
      });
    }

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
    const reverseOrderCheckbox = document.getElementById('settingsReverseMemorizationOrder');
    const reverseBadge = document.getElementById('reverseOrderDirectionBadge');

    if (reverseOrderCheckbox) {
      reverseOrderCheckbox.checked = !!AppState.reverseMemorizationOrder;
      if (reverseBadge) {
        reverseBadge.textContent = reverseOrderCheckbox.checked ? '(من الناس للبقرة)' : '(من البقرة للناس)';
        reverseBadge.style.color = reverseOrderCheckbox.checked ? '#d97706' : '#0f3d2e';
        reverseBadge.style.background = reverseOrderCheckbox.checked ? 'rgba(217,119,6,0.1)' : 'rgba(15,61,46,0.1)';
      }
    }

    if (surahNameInput) surahNameInput.value = AppState.surahConfig.name;
    if (totalVersesInput) totalVersesInput.value = AppState.surahConfig.totalVerses;
    if (currentVerseInput) currentVerseInput.value = AppState.surahConfig.currentVerse;
    if (dailyTargetInput) dailyTargetInput.value = AppState.surahConfig.dailyTarget;
    if (activeCycleInput) activeCycleInput.value = AppState.activeCycleDay;
    const surahSel = document.getElementById('settingsSurahSelect');
    if (surahSel) surahSel.value = AppState.surahConfig.name;
    const prevSurahSel = document.getElementById('settingsPrevSurahSelect');
    if (prevSurahSel) prevSurahSel.value = getPreviousSurahName();

    const nameInput = document.getElementById('settingsUserNameInput');
    if (nameInput) {
      nameInput.value = localStorage.getItem('tibyan_user_name') || '';
    }
  }

  function populatePlanSettingsForm() {
    const plan = AppState.planConfig || defaultPlanConfig();
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

    setCheck('planMemoRepEnabled', plan.memoRep && plan.memoRep.enabled);
    setVal('planMemoRepTarget', (plan.memoRep && plan.memoRep.target) || 10);

    setCheck('planListeningEnabled', plan.listening && plan.listening.enabled);
    setVal('planListeningTarget', (plan.listening && plan.listening.target) || 3);

    setCheck('planRecordingEnabled', plan.recording && plan.recording.enabled);
    setVal('planRecordingTarget', (plan.recording && plan.recording.target) || 3);

    setCheck('planFriendEnabled', plan.friend && plan.friend.enabled);
    setVal('planFriendTarget', (plan.friend && plan.friend.target) || 2);

    setCheck('planNearReviewEnabled', !plan.nearReview || plan.nearReview.enabled);
    setCheck('planDistantReviewEnabled', !plan.distantReview || plan.distantReview.enabled);

    setCheck('planConsolidationEnabled', plan.consolidation && plan.consolidation.enabled);
    setVal('planConsolidationTarget', (plan.consolidation && plan.consolidation.target) || 5);
  }
  window.populateSettingsForm = populateSettingsForm;
  window.populatePlanSettingsForm = populatePlanSettingsForm;
  window.showToast = showToast;

  function showSettingsSubpage(subpageId) {
    const mainPanel = document.getElementById('settingsMainPanel');
    const allSubpages = document.querySelectorAll('.settings-subpage');
    if (mainPanel) {
      mainPanel.hidden = true;
      mainPanel.style.display = 'none';
    }
    allSubpages.forEach(p => {
      p.hidden = true;
      p.style.display = 'none';
    });
    const target = document.getElementById(subpageId);
    if (target) {
      target.hidden = false;
      target.style.display = 'block';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hideSettingsSubpages() {
    const mainPanel = document.getElementById('settingsMainPanel');
    const allSubpages = document.querySelectorAll('.settings-subpage');
    allSubpages.forEach(p => {
      p.hidden = true;
      p.style.display = 'none';
    });
    if (mainPanel) {
      mainPanel.hidden = false;
      mainPanel.style.display = 'flex';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  window.showSettingsSubpage = showSettingsSubpage;
  window.hideSettingsSubpages = hideSettingsSubpages;

  function renderAll() {
    renderSurahCard();
    renderDailyChecklist();
    renderDynamicVisibility();
    renderAudioSlots();
    renderDateScroller();
    renderTenDayScheduleTable();
    renderWeeklyScheduleView();
    renderReports();
  }
  window.renderReports = renderReports;
  window.renderAll = renderAll;
  window.renderSurahCard = renderSurahCard;
  window.renderDynamicVisibility = renderDynamicVisibility;
  window.renderDailyChecklist = renderDailyChecklist;

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

        // إذا انتقل المستخدم لتبويب الإعدادات وكان اللوح الرئيسي مخفياً دون صفحة فرعية ظاهرة، استعد اللوح الرئيسي
        if (tabTarget === 'view-settings') {
          const visibleSubpage = document.querySelector('.settings-subpage:not([hidden])');
          if (!visibleSubpage || visibleSubpage.style.display === 'none') {
            hideSettingsSubpages();
          }
        }

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

    // زرّا إتمام السورة 100%: الانتقال للتثبيت والانتقال للسورة الجديدة
    // وظيفة الانتقال إلى مرحلة التثبيت ونقل السورة السابقة إلى المراجعة وإعادة توزيع الجداول
    function transitionToTathbeetStage() {
      const curSurahName = (AppState.surahConfig && AppState.surahConfig.name) || 'الأنفال';
      let curSurahObj = null;
      if (typeof QURAN_SURAHS !== 'undefined') {
        curSurahObj = QURAN_SURAHS.find(s => s.name === curSurahName);
      }
      const curSurahId = curSurahObj ? curSurahObj.id : 8;

      // السورة التي كانت في التثبيت سابقاً (مثلاً التوبة)
      const prevTathbeetSurah = (AppState.surahConfig && AppState.surahConfig.previousSurah) || 'التوبة';

      // 1. تعيين حالة السورة الحالية (مثلاً الأنفال) لتكون مرحلة التثبيت
      if (!AppState.surahConfig) AppState.surahConfig = {};
      AppState.surahConfig.status = 'ready_for_tathbeet';
      AppState.surahConfig.previousSurah = curSurahName; // تصبح الأنفال هي سورة التثبيت والربط
      localStorage.setItem('seraj_active_tathbeet_surah', curSurahName);
      localStorage.setItem('seraj_tathbeet_mode', 'true');

      // 2. تحديث البروفايل وتضمين السورة السابقة (التوبة) في المحفوظ ونقلها للمراجعة الدورية
      let profile = null;
      try {
        profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
      } catch (_) {}

      if (!profile) {
        profile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: 'juz',
            value: 10,
            direction: AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas'
          },
          currentTarget: {
            surahId: curSurahId,
            page: curSurahObj ? curSurahObj.startPage : 177,
            status: 'ready_for_tathbeet'
          },
          schedule: {
            dailyNewAmount: 1,
            activeDays: [0, 1, 2, 3],
            consolidationDay: 4,
            revisionCycleDays: AppState.totalCycleDays || 10
          }
        };
      }

      profile.currentTarget.surahId = curSurahId;
      profile.currentTarget.status = 'ready_for_tathbeet';

      // 3. إعادة توليد جدول المراجعة الدورية وتقسيم الأيام تلقائياً بحيث تشمل السورة المنتهية
      if (typeof window.applyProfileToAppState === 'function') {
        window.applyProfileToAppState(profile);
      } else {
        persistState();
        renderAll();
      }

      // حفظ البروفايل المحدث
      try {
        localStorage.setItem('tibyan_user_profile', JSON.stringify(profile));
      } catch (_) {}

      showToast(`تم بدء مرحلة تثبيت سورة ${curSurahName} ونقل سورة ${prevTathbeetSurah} للمراجعة الدورية 🌿`);
    }

    const btnGoToCons = document.getElementById('btnGoToConsolidation');
    if (btnGoToCons) {
      btnGoToCons.addEventListener('click', () => {
        triggerHaptic(20);
        transitionToTathbeetStage();
        const currentSurah = AppState.surahConfig ? AppState.surahConfig.name : '';
        const found = (typeof QURAN_SURAHS !== 'undefined') ? QURAN_SURAHS.find(s => s.name === currentSurah) : null;
        const surahId = found ? found.id : 8;
        if (typeof window.openQuarterConsolidation === 'function') {
          window.openQuarterConsolidation(surahId);
        }
      });
    }

    const btnOpenTathbeetPage = document.getElementById('btnOpenTathbeetPage');
    if (btnOpenTathbeetPage) {
      btnOpenTathbeetPage.addEventListener('click', () => {
        triggerHaptic(20);
        const currentSurah = AppState.surahConfig ? AppState.surahConfig.name : '';
        const found = (typeof QURAN_SURAHS !== 'undefined') ? QURAN_SURAHS.find(s => s.name === currentSurah) : null;
        const surahId = found ? found.id : 8;
        if (typeof window.openQuarterConsolidation === 'function') {
          window.openQuarterConsolidation(surahId);
        }
      });
    }

    function transitionToNextSurah() {
      const nextSurahObj = getNextSurahInfo(AppState.surahConfig.name);
      if (!nextSurahObj) {
        showToast('ما شاء الله! وصلت لآخر سورة في المصحف');
        return;
      }

      const oldName = AppState.surahConfig.name;
      AppState.surahConfig.previousSurah = oldName;
      AppState.surahConfig.name = nextSurahObj.name;
      AppState.surahConfig.totalVerses = nextSurahObj.verses;
      AppState.surahConfig.currentVerse = 0;
      AppState.surahConfig.status = 'new';

      localStorage.removeItem('seraj_active_tathbeet_surah');
      localStorage.removeItem('seraj_tathbeet_mode');

      try {
        const profStr = localStorage.getItem('tibyan_user_profile');
        if (profStr) {
          const prof = JSON.parse(profStr);
          prof.currentTarget.surahId = nextSurahObj.id;
          prof.currentTarget.currentVerse = 0;
          prof.currentTarget.status = 'new';
          localStorage.setItem('tibyan_user_profile', JSON.stringify(prof));
          if (window.quranStorage && window.quranStorage.uid) {
            localStorage.setItem('tibyan_user_profile_' + window.quranStorage.uid, JSON.stringify(prof));
          }
          if (typeof window.applyProfileToAppState === 'function') {
            window.applyProfileToAppState(prof);
          }
        }
      } catch (_) {}

      persistState();
      renderAll();
      populateSettingsForm();
      if (typeof initUnifiedPlanSettings === 'function') initUnifiedPlanSettings();
      showToast(`مبروك إتمام سورة ${oldName}! بدأت سورة ${nextSurahObj.name} 🌿`);
    }

    const btnGoToNext = document.getElementById('btnGoToNextSurah');
    if (btnGoToNext) {
      btnGoToNext.addEventListener('click', () => {
        triggerHaptic(25);
        transitionToNextSurah();
      });
    }

    const btnTathNext = document.getElementById('btnTathbeetGoToNextSurah');
    if (btnTathNext) {
      btnTathNext.addEventListener('click', () => {
        triggerHaptic(25);
        transitionToNextSurah();
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
        const repTarget = (AppState.planConfig && AppState.planConfig.memoRep && AppState.planConfig.memoRep.target) || 10;
        if (log.repetitionCounter === repTarget) {
          showToast(`اكتمل التكرار (${repTarget} مرات) بنجاح`);
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
      lastTenCard.addEventListener('click', (e) => {
        if (e.target.closest('.prev-quarter-pill-wrapper')) return;
        triggerHaptic(15);
        const log = getCurrentDailyLog();
        log.lastTenPagesCheck = !log.lastTenPagesCheck;
        const prevSurahName = getPreviousSurahName();
        const { quarters } = getSurahQuarters(prevSurahName);
        const activeQuarter = quarters.find(q => q.num === (log.prevSurahQuarter || 1)) || quarters[0];
        if (log.lastTenPagesCheck) {
          showToast(`تم إنجاز سرد الربع ${activeQuarter.num} من سورة ${prevSurahName} ✓`);
        }
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
        const settingsNav = document.querySelector('.nav-item-btn[data-tab="view-settings"]');
        if (settingsNav) settingsNav.click();
        showSettingsSubpage('settingsScheduleSubpage');
        renderTenDayScheduleTable();
        renderWeeklyScheduleView();
      });
    }

    const advanceCycleDayBtn = document.getElementById('advanceCycleDayBtn');
    if (advanceCycleDayBtn) {
      advanceCycleDayBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const totalDays = getCycleDaysCount();
        const currentDay = getCycleDayForDate(AppState.selectedDate);
        const nextDay = (currentDay % totalDays) + 1;
        AppState.activeCycleDay = nextDay;
        const log = getCurrentDailyLog();
        log.cycleDay = nextDay;
        AppState.cycleAnchor = { date: AppState.selectedDate, cycleDay: nextDay };
        persistState();
        renderAll();
        showToast(`تم الانتقال إلى اليوم ${nextDay} في دورة المراجعة`);
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
        const prevSurahVal = document.getElementById('settingsPrevSurahSelect') ? document.getElementById('settingsPrevSurahSelect').value : '';
        if (prevSurahVal) {
          AppState.surahConfig.previousSurah = prevSurahVal;
        }
        const reverseOrderCheckbox = document.getElementById('settingsReverseMemorizationOrder');
        if (reverseOrderCheckbox) {
          AppState.reverseMemorizationOrder = reverseOrderCheckbox.checked;
        }
        AppState.activeCycleDay = Math.min(10, Math.max(1, cycleVal));

        const log = getCurrentDailyLog();
        log.cycleDay = AppState.activeCycleDay;

        persistState();
        renderAll();
        showToast('تم حفظ إعدادات السورة بنجاح');

        hideSettingsSubpages();

        const homeNav = document.querySelector('.nav-item-btn[data-tab="view-home"]');
        if (homeNav) homeNav.click();
      });
    }

    // 5.1 Settings User Name Live Sync
    const settingsNameInput = document.getElementById('settingsUserNameInput');
    if (settingsNameInput && !settingsNameInput._hasListener) {
      settingsNameInput._hasListener = true;
      settingsNameInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (val) {
          localStorage.setItem('tibyan_user_name', val);
        } else {
          localStorage.removeItem('tibyan_user_name');
        }
        renderDateScroller();
        const accName = document.getElementById('accountName');
        if (accName && (!window.quranStorage || !window.quranStorage.uid || window.quranStorage.uid === 'guest_user')) {
          accName.textContent = val || 'حساب زائر محلي';
        }
      });
    }

    // 5.1 Save Plan Settings
    const savePlanSettingsBtn = document.getElementById('savePlanSettingsBtn');
    if (savePlanSettingsBtn) {
      savePlanSettingsBtn.addEventListener('click', () => {
        triggerHaptic(20);
        if (!AppState.planConfig) AppState.planConfig = defaultPlanConfig();

        const getCheck = (id, def) => { const el = document.getElementById(id); return el ? el.checked : def; };
        const getVal = (id, def) => { const el = document.getElementById(id); return el ? (parseInt(el.value, 10) || def) : def; };

        AppState.planConfig.memoRep = {
          enabled: getCheck('planMemoRepEnabled', true),
          target: getVal('planMemoRepTarget', 10)
        };
        AppState.planConfig.listening = {
          enabled: getCheck('planListeningEnabled', true),
          target: getVal('planListeningTarget', 3)
        };
        AppState.planConfig.recording = {
          enabled: getCheck('planRecordingEnabled', true),
          target: getVal('planRecordingTarget', 3)
        };
        AppState.planConfig.friend = {
          enabled: getCheck('planFriendEnabled', true),
          target: getVal('planFriendTarget', 2)
        };
        AppState.planConfig.nearReview = {
          enabled: getCheck('planNearReviewEnabled', true)
        };
        AppState.planConfig.distantReview = {
          enabled: getCheck('planDistantReviewEnabled', true)
        };
        AppState.planConfig.consolidation = {
          enabled: getCheck('planConsolidationEnabled', true),
          target: getVal('planConsolidationTarget', 5)
        };

        persistState();
        renderAll();
        showToast('تم حفظ خطة المهام اليومية بنجاح');

        hideSettingsSubpages();
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

    // 7. Settings Sub-pages Navigation
    const openUnifiedPlanBtn = document.getElementById('openUnifiedPlanSettingsBtn');
    const backUnifiedPlanBtn = document.getElementById('backFromUnifiedPlanBtn');

    if (openUnifiedPlanBtn) {
      openUnifiedPlanBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsUnifiedPlanSubpage');
        if (typeof window.initUnifiedPlanSettings === 'function') {
          window.initUnifiedPlanSettings();
        }
        if (typeof window.populateUnifiedPlanForm === 'function') {
          window.populateUnifiedPlanForm();
        }
      });
    }
    if (backUnifiedPlanBtn) {
      backUnifiedPlanBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }


    const openSurahBtn = document.getElementById('openSurahSettingsSubpageBtn');
    const backSurahBtn = document.getElementById('backFromSurahSettingsBtn');
    const openPlanBtn = document.getElementById('openPlanSettingsSubpageBtn');
    const backPlanBtn = document.getElementById('backFromPlanSettingsBtn');
    const openReportsBtn = document.getElementById('openReportsSubpageBtn');
    const backReportsBtn = document.getElementById('backFromReportsBtn');
    const openBackupBtn = document.getElementById('openBackupSubpageBtn');
    const backBackupBtn = document.getElementById('backFromBackupBtn');
    const openDownloadBtn = document.getElementById('openDownloadMushafBtn');
    const openScheduleBtn = document.getElementById('openScheduleSubpageBtn') || document.getElementById('openCycleSettingsItemBtn');
    const backScheduleBtn = document.getElementById('backFromScheduleBtn');
    const openUrgentRowBtn = document.getElementById('openUrgentExamSettingsRowBtn');
    const openUrgentBtn = document.getElementById('openUrgentExamBtn');

    if (openSurahBtn) {
      openSurahBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsSurahSubpage');
        populateSettingsForm();
      });
    }
    if (backSurahBtn) {
      backSurahBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }

    if (openPlanBtn) {
      openPlanBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsPlanSubpage');
        populatePlanSettingsForm();
      });
    }
    if (backPlanBtn) {
      backPlanBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }

    if (openReportsBtn) {
      openReportsBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsReportsSubpage');
        renderReports();
      });
    }
    if (backReportsBtn) {
      backReportsBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }

    if (openBackupBtn) {
      openBackupBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsBackupSubpage');
      });
    }
    if (backBackupBtn) {
      backBackupBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }

    if (openDownloadBtn) {
      openDownloadBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsDownloadSubpage');
      });
    }
    const backDownloadBtn = document.getElementById('backFromDownloadBtn');
    if (backDownloadBtn) {
      backDownloadBtn.addEventListener('click', () => {
        hideSettingsSubpages();
      });
    }

    if (openScheduleBtn) {
      openScheduleBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsScheduleSubpage');
        renderTenDayScheduleTable();
        renderWeeklyScheduleView();
      });
    }
    if (backScheduleBtn) {
      backScheduleBtn.addEventListener('click', () => {
        if (window._openedScheduleFromUnifiedPlan) {
          window._openedScheduleFromUnifiedPlan = false;
          showSettingsSubpage('settingsUnifiedPlanSubpage');
        } else {
          hideSettingsSubpages();
        }
      });
    }

    const btnPreviewReviewSchedule = document.getElementById('btnPreviewReviewSchedule');
    if (btnPreviewReviewSchedule) {
      btnPreviewReviewSchedule.addEventListener('click', () => {
        triggerHaptic(15);
        window._openedScheduleFromUnifiedPlan = true;
        const cycleDaysSelectEl = document.getElementById('unifCycleDaysSelect');
        const selectedDays = parseInt(cycleDaysSelectEl ? cycleDaysSelectEl.value : 10, 10) || 10;
        if (typeof updateCycleDaysCount === 'function' && AppState.totalCycleDays !== selectedDays) {
          updateCycleDaysCount(selectedDays, false);
        }
        showSettingsSubpage('settingsScheduleSubpage');
        renderTenDayScheduleTable();
        renderWeeklyScheduleView();
      });
    }

    const backExamBtn = document.getElementById('backFromExamBtn');
    if (openUrgentRowBtn) {
      openUrgentRowBtn.addEventListener('click', () => {
        showSettingsSubpage('settingsExamSubpage');
        populateExamSurahSelects();
        renderUrgentExamModal();
      });
    }

    // زر مراجعة مستعجلة لإختبار داخل صفحة أدوات
    const cardOpenUrgentExam = document.getElementById('cardOpenUrgentExam');
    if (cardOpenUrgentExam) {
      cardOpenUrgentExam.addEventListener('click', () => {
        triggerHaptic(20);
        const toolsMain = document.getElementById('toolsMainPanel');
        const examSub = document.getElementById('settingsExamSubpage');
        const qSub = document.getElementById('quarterConsolidationSubpage');
        if (toolsMain) toolsMain.style.display = 'none';
        if (qSub) qSub.style.display = 'none';
        if (examSub) {
          examSub.removeAttribute('hidden');
          examSub.style.display = 'flex';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        populateExamSurahSelects();
        renderUrgentExamModal();
      });
    }

    if (openUrgentBtn) {
      openUrgentBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSettingsSubpage('settingsExamSubpage');
        populateExamSurahSelects();
        renderUrgentExamModal();
      });
    }

    if (backExamBtn) {
      backExamBtn.addEventListener('click', () => {
        triggerHaptic(15);
        const toolsMain = document.getElementById('toolsMainPanel');
        const examSub = document.getElementById('settingsExamSubpage');
        if (examSub) {
          examSub.style.display = 'none';
          examSub.setAttribute('hidden', '');
        }
        if (toolsMain) {
          toolsMain.style.display = 'flex';
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        hideSettingsSubpages();
      });
    }
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
    AppState.reviewSystemMode = 'dual';
    AppState.surahConfig = defaultSurahConfig();
    AppState.tenDaySchedule = JSON.parse(JSON.stringify(DEFAULT_TEN_DAY_SCHEDULE));
    AppState.weeklySchedule = JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE));
    AppState.dailyLogs = {};
    AppState.completedSurahs = [];
    AppState.urgentExamPlan = null;
    AppState.manualConsolidations = [];
    AppState.ayahHighlights = {};
    AppState.pageNotes = {};
  }

  function applyPayload(p) {
    if (!p) return;
    if (p.activeCycleDay) AppState.activeCycleDay = p.activeCycleDay;
    if (p.cycleAnchor) AppState.cycleAnchor = p.cycleAnchor;
    if (p.prevSurahAnchor) AppState.prevSurahAnchor = p.prevSurahAnchor;
    if (p.reviewSystemMode) AppState.reviewSystemMode = p.reviewSystemMode;
    if (p.manualConsolidations) AppState.manualConsolidations = p.manualConsolidations;
    if (p.reverseMemorizationOrder !== undefined) AppState.reverseMemorizationOrder = !!p.reverseMemorizationOrder;

    if (p.totalCycleDays) {
      AppState.totalCycleDays = parseInt(p.totalCycleDays) || 10;
    } else if (Array.isArray(p.tenDaySchedule) && p.tenDaySchedule.length > 0) {
      AppState.totalCycleDays = p.tenDaySchedule.length;
    } else {
      AppState.totalCycleDays = 10;
    }

    if (p.surahConfig) {
      AppState.surahConfig = Object.assign(defaultSurahConfig(), p.surahConfig);
      const tot = parseInt(AppState.surahConfig.totalVerses, 10) || 1;
      const cur = parseInt(AppState.surahConfig.currentVerse, 10) || 0;
      if ((tot > 0 && cur >= tot) || p.surahConfig.status === 'ready_for_tathbeet') {
        AppState.surahConfig.status = 'ready_for_tathbeet';
        localStorage.setItem('seraj_active_tathbeet_surah', AppState.surahConfig.name);
        localStorage.setItem('seraj_tathbeet_mode', 'true');
      }
    }

    if (Array.isArray(p.tenDaySchedule) && p.tenDaySchedule.length > 0) {
      AppState.tenDaySchedule = p.tenDaySchedule;
    }

    if (p.weeklySchedule) {
      AppState.weeklySchedule = Object.assign(JSON.parse(JSON.stringify(DEFAULT_WEEKLY_SCHEDULE)), p.weeklySchedule);
      DAY_KEYS.forEach(k => {
        const item = AppState.weeklySchedule[k];
        if (item) {
          if (item.note && LEGACY_DEFAULT_NOTES.includes(item.note.trim()) && !item.customTask) {
            item.note = '';
            item.customTask = '';
          } else if (item.customTask === undefined && item.note) {
            item.customTask = item.note;
          }
        }
      });
    }
    if (p.dailyLogs) AppState.dailyLogs = p.dailyLogs;
    if (Array.isArray(p.completedSurahs)) AppState.completedSurahs = p.completedSurahs;
    if (p.urgentExamPlan) {
      AppState.urgentExamPlan = p.urgentExamPlan;
      if (AppState.urgentExamPlan && AppState.urgentExamPlan.surahs && AppState.urgentExamPlan.fromSurahId && AppState.urgentExamPlan.toSurahId) {
        const fromId = parseInt(AppState.urgentExamPlan.fromSurahId, 10);
        const toId = parseInt(AppState.urgentExamPlan.toSurahId, 10);
        Object.keys(AppState.urgentExamPlan.surahs).forEach(k => {
          const numId = parseInt(k, 10);
          if (numId < fromId || numId > toId) {
            delete AppState.urgentExamPlan.surahs[k];
          }
        });
      }
    }
    if (p.planConfig) AppState.planConfig = Object.assign(defaultPlanConfig(), p.planConfig);
    if (p.ayahBookmarks) AppState.ayahBookmarks = p.ayahBookmarks;
    if (Array.isArray(p.flaggedAyahs)) AppState.flaggedAyahs = p.flaggedAyahs;
    if (p.ayahNotes) AppState.ayahNotes = p.ayahNotes;
    if (p.ayahHighlights) AppState.ayahHighlights = p.ayahHighlights;
    if (p.pageNotes) AppState.pageNotes = p.pageNotes;
    if (p.wordHighlights) {
      AppState.wordHighlights = p.wordHighlights;
      if (window.refreshPolygonsDecoration) window.refreshPolygonsDecoration();
    }
    if (p.lastMushafPage && p.lastMushafPage >= 1 && p.lastMushafPage <= 604) {
      localStorage.setItem('tibyan_mushaf_page', p.lastMushafPage);
    }

    // Sync array length with AppState.totalCycleDays if needed
    const targetDays = getCycleDaysCount();
    if (!AppState.tenDaySchedule || AppState.tenDaySchedule.length !== targetDays) {
      updateCycleDaysCount(targetDays, false);
    }
  }

  function ensureLog(l) {
    if (!l.missed) l.missed = { memo: false, consolidation: false, review: false };
    if (!Array.isArray(l.memorization)) l.memorization = [];
    if (!l.customTasks || typeof l.customTasks !== 'object') l.customTasks = {};
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
    let verses = 0, memoDays = 0, revDaysTotal = 0;
    logs.forEach(([, l]) => {
      const v = l.memorization.reduce((a, e) => a + (e.to - e.from + 1), 0);
      verses += v;
      if (v) memoDays++;
      if (l.nearReviewCheck || l.distantReviewCheck) revDaysTotal++;
    });
    const stat = (v, t) => `<div class="report-stat"><div class="report-stat-val">${v}</div><div class="report-stat-label">${t}</div></div>`;
    overview.innerHTML = stat(verses, 'آية محفوظة مسجلة') + stat(memoDays, 'يوم حفظ') + stat(AppState.completedSurahs.length, 'سورة مكتملة') + stat(revDaysTotal, 'يوم مراجعة');

    // اختيار السورة
    const names = reportSurahNames(), sel = $('reportSurahSelect');
    if (!sel) return;
    if (!names.includes(reportSurah)) reportSurah = names[0];
    sel.innerHTML = names.map(n => `<option value="${esc(n)}">سورة ${esc(n)}${AppState.completedSurahs.some(c => c.name === n) ? ' (مكتملة)' : ''}</option>`).join('');
    sel.value = reportSurah;

    const done = AppState.completedSurahs.find(c => c.name === reportSurah);
    if ($('reportSurahState')) $('reportSurahState').textContent = done ? 'مكتملة' : 'جارية';
    const rows = logs.filter(([, l]) => l.memorization.some(e => e.surah === reportSurah));
    const body = $('surahReportBody');
    if (!body) return;

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
        const cnt = (a) => (a || []).filter(Boolean).length;
        const yn = (b) => b ? 'تمت' : 'لم تتم';
        const ranges = es.map(e => e.from === e.to ? `الآية ${e.from}` : `الآيات ${e.from} - ${e.to}`).join('، ');
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
          </dl></div>`;
      }).join('');
      const stat2 = (v, t) => `<div class="report-stat small"><div class="report-stat-val">${v}</div><div class="report-stat-label">${t}</div></div>`;
      body.innerHTML = `
        <p class="report-range">من ${esc(fmtDate(first))} إلى ${esc(fmtDate(last))}${done ? `، وأُتمّت في ${esc(fmtDate(done.completedOn))}` : ''}</p>
        <div class="report-overview">${stat2(rows.length, 'أيام الحفظ')}${stat2(vs, 'آية')}${stat2(reps, 'مجموع التكرار')}${stat2(revDays, 'أيام المراجعة')}${stat2(span, 'مدة السورة بالأيام')}</div>
        <div class="rep-days">${dayHtml}</div>`;
    }

    if ($('missedLogCount')) $('missedLogCount').textContent = '0 يوم';
    if ($('missedLogList')) $('missedLogList').innerHTML = '';
  }

  function buildSurahReportData(surahName) {
    if (!surahName) return null;
    const logs = allLogs();
    const rows = logs.filter(([, l]) => l.memorization && l.memorization.some(e => e.surah === surahName));
    const done = AppState.completedSurahs.find(c => c.name === surahName);

    if (!rows.length) return null;

    const first = rows[0][0], last = rows[rows.length - 1][0];
    const span = Math.round((parseDate(last) - parseDate(first)) / 86400000) + 1;
    let totalVerses = 0, totalReps = 0, totalRevDays = 0;

    const dayRows = rows.map(([d, l]) => {
      const es = l.memorization.filter(e => e.surah === surahName);
      const n = es.reduce((a, e) => a + (e.to - e.from + 1), 0);
      totalVerses += n;
      totalReps += l.repetitionCounter || 0;
      if (l.nearReviewCheck || l.distantReviewCheck) totalRevDays++;
      const cnt = (a) => (a || []).filter(Boolean).length;
      const yn = (b) => b ? 'تمت' : 'لم تتم';
      const ranges = es.map(e => e.from === e.to ? `الآية ${e.from}` : `الآيات ${e.from} - ${e.to}`).join('، ');
      const isMissed = hasMissed(l);

      return {
        dateStr: fmtDate(d),
        versesRange: ranges,
        verseCount: n,
        repetition: `${l.repetitionCounter || 0} من 10`,
        listening: `${cnt(l.listeningChecks)} من 3`,
        recording: `${cnt(l.audioRecordingChecks)} من 3`,
        recitation: `${cnt(l.friendRecitationChecks)} من 2`,
        nearRev: yn(l.nearReviewCheck),
        nearRevOk: !!l.nearReviewCheck,
        distantRev: yn(l.distantReviewCheck),
        distantRevOk: !!l.distantReviewCheck,
        tathbeet: yn(l.prevPagesCheck || l.prevPagesCounter >= 5),
        tathbeetOk: !!(l.prevPagesCheck || l.prevPagesCounter >= 5),
        isMissed
      };
    });

    return {
      surahName,
      isDone: !!done,
      completedDate: done ? fmtDate(done.completedOn) : null,
      firstDate: fmtDate(first),
      lastDate: fmtDate(last),
      memoDaysCount: rows.length,
      totalVerses,
      totalReps,
      totalRevDays,
      spanDays: span,
      dayRows
    };
  }

  function renderSurahReportPrintableHTML(data) {
    if (!data) return '';

    const rowsHtml = data.dayRows.map((r, i) => {
      const bg = r.isMissed ? '#fef2f2' : (i % 2 === 0 ? '#ffffff' : '#f8fafc');
      const badge = (val, ok) => ok
        ? `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#ecfdf5;color:#065f46;font-weight:700;font-size:10px;">${val}</span>`
        : `<span style="display:inline-block;padding:2px 6px;border-radius:4px;background:#f1f5f9;color:#64748b;font-size:10px;">${val}</span>`;

      return `
        <tr style="background-color:${bg};page-break-inside:avoid;">
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-weight:600;font-size:11px;">${r.dateStr}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-weight:700;color:#0f3d2e;font-size:11px;">${r.versesRange} <span style="color:#64748b;font-weight:400;">(${r.verseCount})</span></td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-size:11px;">${r.repetition}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-size:11px;">${r.listening}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-size:11px;">${r.recording}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;font-size:11px;">${r.recitation}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;">${badge(r.nearRev, r.nearRevOk)}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;">${badge(r.distantRev, r.distantRevOk)}</td>
          <td style="padding:8px 6px;border:1px solid #e2e8f0;text-align:center;">${badge(r.tathbeet, r.tathbeetOk)}</td>
        </tr>
      `;
    }).join('');

    const statusBadge = data.isDone
      ? `<span style="background:#10b981;color:#ffffff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">مكتملة ✓</span>`
      : `<span style="background:#f59e0b;color:#ffffff;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;">جارية الآن</span>`;

    return `
      <div style="font-family:'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;direction:rtl;color:#0f172a;line-height:1.5;">
        <!-- الترويسة الرئيسية -->
        <div style="border-bottom:3px solid #0f3d2e;padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h1 style="color:#0f3d2e;font-size:20px;font-weight:800;margin:0 0 4px 0;">سراج | نظام متابعة وإتقان المحفوظ القرآني</h1>
            <div style="display:flex;align-items:center;gap:10px;">
              <h2 style="color:#b45309;font-size:16px;font-weight:700;margin:0;">تقرير إنجاز سورة ${esc(data.surahName)}</h2>
              ${statusBadge}
            </div>
            <p style="font-size:11px;color:#64748b;margin-top:6px;">
              الفترة: من ${data.firstDate} إلى ${data.lastDate} ${data.completedDate ? `| أُتمّت في: ${data.completedDate}` : ''}
            </p>
          </div>
          <div style="text-align:left;font-size:11px;color:#64748b;">
            <div style="font-weight:700;color:#0f3d2e;font-size:12px;">تاريخ التصدير</div>
            <div>${new Date().toLocaleDateString('ar-SA')}</div>
          </div>
        </div>

        <!-- بطاقات ملخص الإحصائيات -->
        <div style="display:grid;grid-template-columns:repeat(5, 1fr);gap:10px;margin-bottom:20px;text-align:center;">
          <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:10px 6px;">
            <div style="font-size:18px;font-weight:800;color:#0f3d2e;">${data.memoDaysCount}</div>
            <div style="font-size:11px;font-weight:600;color:#0f766e;margin-top:2px;">أيام الحفظ</div>
          </div>
          <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:10px 6px;">
            <div style="font-size:18px;font-weight:800;color:#0f3d2e;">${data.totalVerses}</div>
            <div style="font-size:11px;font-weight:600;color:#0f766e;margin-top:2px;">آية محفوظة</div>
          </div>
          <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:10px 6px;">
            <div style="font-size:18px;font-weight:800;color:#0f3d2e;">${data.totalReps}</div>
            <div style="font-size:11px;font-weight:600;color:#0f766e;margin-top:2px;">مجموع التكرار</div>
          </div>
          <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:10px 6px;">
            <div style="font-size:18px;font-weight:800;color:#0f3d2e;">${data.totalRevDays}</div>
            <div style="font-size:11px;font-weight:600;color:#0f766e;margin-top:2px;">أيام المراجعة</div>
          </div>
          <div style="background:#f0fdf9;border:1px solid #99f6e4;border-radius:8px;padding:10px 6px;">
            <div style="font-size:18px;font-weight:800;color:#0f3d2e;">${data.spanDays}</div>
            <div style="font-size:11px;font-weight:600;color:#0f766e;margin-top:2px;">المدة بالأيام</div>
          </div>
        </div>

        <!-- جدول تفاصيل الأيام والسجل اليومي -->
        <div style="margin-bottom:18px;">
          <h3 style="color:#0f3d2e;font-size:13px;font-weight:700;margin-bottom:8px;">تفاصيل الأيام والسجل اليومي:</h3>
          <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #cbd5e1;background:#ffffff;">
            <thead>
              <tr style="background:#0f3d2e;color:#ffffff;text-align:center;">
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">التاريخ</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">الآيات المقررة</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">التكرار</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">الاستماع</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">التسجيل</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">السرد</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">م. قريبة</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">م. بعيدة</th>
                <th style="padding:8px 6px;border:1px solid #0f3d2e;font-weight:700;">التثبيت</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <!-- التذييل الرسمي -->
        <div style="margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748b;">
          <div>منصة سراج الرقمية — نورٌ يُثبّت صدرك، وآياتٌ لا تفلت</div>
          <div>تم التوثيق آلياً من نظام الحفظ والمراجعة</div>
        </div>
      </div>
    `;
  }

  async function downloadSurahReportPDF(surahName) {
    if (!surahName) {
      showToast('يرجى اختيار السورة أولاً');
      return;
    }
    const data = buildSurahReportData(surahName);
    if (!data) {
      showToast('لا توجد بيانات حفظ مسجلة لهذه السورة بعد لتصديرها');
      return;
    }
    const reportHtml = renderSurahReportPrintableHTML(data);
    const filename = `تقرير_سورة_${data.surahName}_${getTodayDateString()}.pdf`;
    await generatePdfFromHtml(reportHtml, filename, data.surahName);
  }

  function printSurahReport(surahName) {
    if (!surahName) {
      showToast('يرجى اختيار السورة أولاً');
      return;
    }
    const data = buildSurahReportData(surahName);
    if (!data) {
      showToast('لا توجد بيانات حفظ مسجلة لهذه السورة بعد لطباعتها');
      return;
    }
    const reportHtml = renderSurahReportPrintableHTML(data);
    openPrintReportWindow(reportHtml, data.surahName);
  }

  function openPrintReportWindow(reportHtml, surahName) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('يرجى السماح بالنوافذ المنبثقة لطباعة أو حفظ التقرير.');
      return;
    }
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="ar" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>تقرير سورة ${esc(surahName || '')} - سراج</title>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700;800&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, Arial, sans-serif;
            direction: rtl;
            background: #ffffff;
            color: #0f172a;
            padding: 24px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        ${reportHtml}
        <script>
          window.addEventListener('load', function() {
            setTimeout(function() {
              window.print();
            }, 350);
          });
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  async function generatePdfFromHtml(reportHtml, filename, surahName) {
    // 1. Overlay
    const overlay = document.createElement('div');
    overlay.id = 'seraj-pdf-spinner-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(15,61,46,0.85);backdrop-filter:blur(4px);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ffffff;font-family:"IBM Plex Sans Arabic",sans-serif;';
    overlay.innerHTML = `
      <div style="width:48px;height:48px;border:4px solid rgba(255,255,255,0.25);border-top-color:#10b981;border-radius:50%;animation:seraj-spin 0.8s linear infinite;margin-bottom:14px;"></div>
      <div style="font-size:1.15rem;font-weight:700;">جارٍ إنشاء ملف التقرير...</div>
      <div style="font-size:0.85rem;opacity:0.85;margin-top:6px;">يرجى الانتظار لحظات لتجهيز ملف الـ PDF</div>
      <style>@keyframes seraj-spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>
    `;
    document.body.appendChild(overlay);

    // 2. Wait for fonts
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) {}
    }

    // 3. Render container placed at (0, 0) with explicit width 794px, opacity 1, inside DOM
    const container = document.createElement('div');
    container.id = 'seraj-pdf-render-box';
    container.style.cssText = 'position:fixed;top:0;left:0;width:794px;min-height:1050px;background:#ffffff;color:#0f172a;z-index:99999;padding:28px 32px;box-sizing:border-box;direction:rtl;';
    container.innerHTML = reportHtml;
    document.body.appendChild(container);

    // Give browser layout cycle time to measure and layout
    await new Promise(r => setTimeout(r, 150));

    let downloadSuccess = false;

    try {
      // Approach A: html2pdf
      if (window.html2pdf) {
        try {
          const opt = {
            margin: [8, 8, 8, 8],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
              scale: 2,
              useCORS: true,
              letterRendering: true,
              scrollY: 0,
              scrollX: 0,
              backgroundColor: '#ffffff'
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
          };

          await window.html2pdf().set(opt).from(container).save();
          downloadSuccess = true;
        } catch (h2pErr) {
          console.warn('html2pdf direct failed, trying fallback:', h2pErr);
        }
      }

      // Approach B: htmlToImage + jsPDF if Approach A failed or not present
      if (!downloadSuccess && window.htmlToImage) {
        try {
          const dataUrl = await window.htmlToImage.toPng(container, {
            quality: 0.98,
            pixelRatio: 2,
            backgroundColor: '#ffffff'
          });

          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = dataUrl;
          });

          const jsPdfLib = window.jspdf ? window.jspdf.jsPDF : (window.jsPDF || null);
          if (jsPdfLib) {
            const pdf = new jsPdfLib({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const pageWidth = 210, pageHeight = 297, margin = 8;
            const printableWidth = pageWidth - (margin * 2);
            const printableHeight = (img.naturalHeight * printableWidth) / img.naturalWidth;
            const pageMaxHeight = pageHeight - (margin * 2);

            let heightLeft = printableHeight;
            let position = margin;
            let page = 1;

            pdf.addImage(dataUrl, 'PNG', margin, position, printableWidth, printableHeight);
            heightLeft -= pageMaxHeight;

            while (heightLeft > 5) {
              position = margin - (page * pageMaxHeight);
              pdf.addPage();
              pdf.addImage(dataUrl, 'PNG', margin, position, printableWidth, printableHeight);
              heightLeft -= pageMaxHeight;
              page++;
            }

            pdf.save(filename);
            downloadSuccess = true;
          }
        } catch (imgErr) {
          console.warn('htmlToImage + jsPDF failed:', imgErr);
        }
      }

      // Approach C: If canvas approaches fail, open print dialog
      if (!downloadSuccess) {
        openPrintReportWindow(reportHtml, surahName);
      } else {
        showToast('تم تحميل ملف التقرير بنجاح ✓');
      }

    } catch (err) {
      console.error('Report export error:', err);
      openPrintReportWindow(reportHtml, surahName);
    } finally {
      if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (container && container.parentNode) container.parentNode.removeChild(container);
    }
  }

  function attachExtraListeners() {

    // Manual Consolidation Input
    const manualReviewAddBtn = document.getElementById('manualReviewAddBtn');
    if (manualReviewAddBtn) {
      manualReviewAddBtn.addEventListener('click', () => {
        const input = document.getElementById('manualReviewInput');
        if (input && input.value.trim() !== '') {
          triggerHaptic(15);
          AppState.manualConsolidations = AppState.manualConsolidations || [];
          AppState.manualConsolidations.push({ id: Date.now().toString(), text: input.value.trim() });
          input.value = '';
          persistState();
          renderAll();
        }
      });
    }

    // ==========================================
    // Cycle Settings Modal (مودال إعدادات دورة المراجعة المطور)
    // ==========================================
    const openCycleSettingsBtn = document.getElementById('openCycleSettingsBtn');
    const closeSettingsModalBtn = document.getElementById('closeSettingsModalBtn');
    const cancelSettingsModalBtn = document.getElementById('cancelSettingsModalBtn');
    const saveSettingsModalBtn = document.getElementById('saveSettingsModalBtn');
    const cycleSettingsModal = document.getElementById('cycleSettingsModal');
    const modalReviewDaysInput = document.getElementById('modalReviewDaysInput');
    const modalDaysDecBtn = document.getElementById('modalDaysDecBtn');
    const modalDaysIncBtn = document.getElementById('modalDaysIncBtn');
    const modalCycleDaysChips = document.getElementById('modalCycleDaysChips');
    const modeCardDual = document.getElementById('modeCardDual');
    const modeCardSingle = document.getElementById('modeCardSingle');
    const modalReviewSystemSelect = document.getElementById('modalReviewSystemSelect');

    function syncCycleModalUI() {
      const currentDays = parseInt(modalReviewDaysInput?.value, 10) || 10;
      // مزامنة الأزرار السريعة (Chips)
      if (modalCycleDaysChips) {
        modalCycleDaysChips.querySelectorAll('.opt-chip').forEach((chip) => {
          const chipDays = parseInt(chip.getAttribute('data-days'), 10);
          chip.classList.toggle('active', chipDays === currentDays);
        });
      }

      // مزامنة بطاقات نظام المراجعة
      const currentMode = modalReviewSystemSelect?.value || 'dual';
      if (modeCardDual) modeCardDual.classList.toggle('selected', currentMode === 'dual');
      if (modeCardSingle) modeCardSingle.classList.toggle('selected', currentMode === 'single');
    }

    function selectReviewMode(mode) {
      triggerHaptic(15);
      if (modalReviewSystemSelect) modalReviewSystemSelect.value = mode;
      syncCycleModalUI();
    }

    function closeCycleModal() {
      triggerHaptic(10);
      if (cycleSettingsModal) {
        cycleSettingsModal.style.display = 'none';
        cycleSettingsModal.hidden = true;
      }
    }

    if (openCycleSettingsBtn && cycleSettingsModal) {
      openCycleSettingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerHaptic(15);
        const days = typeof getCycleDaysCount === 'function' ? getCycleDaysCount() : (AppState.totalCycleDays || 10);
        const mode = AppState.reviewSystemMode || 'dual';

        if (modalReviewDaysInput) modalReviewDaysInput.value = days;
        if (modalReviewSystemSelect) modalReviewSystemSelect.value = mode;

        syncCycleModalUI();
        cycleSettingsModal.hidden = false;
        cycleSettingsModal.style.display = 'flex';
      });
    }

    // أزرار زيادة ونقصان الأيام (Stepper)
    if (modalDaysDecBtn && modalReviewDaysInput) {
      modalDaysDecBtn.addEventListener('click', () => {
        triggerHaptic(10);
        let val = parseInt(modalReviewDaysInput.value, 10) || 10;
        if (val > 1) {
          modalReviewDaysInput.value = val - 1;
          syncCycleModalUI();
        }
      });
    }

    if (modalDaysIncBtn && modalReviewDaysInput) {
      modalDaysIncBtn.addEventListener('click', () => {
        triggerHaptic(10);
        let val = parseInt(modalReviewDaysInput.value, 10) || 10;
        if (val < 365) {
          modalReviewDaysInput.value = val + 1;
          syncCycleModalUI();
        }
      });
    }

    if (modalReviewDaysInput) {
      modalReviewDaysInput.addEventListener('input', () => {
        let val = parseInt(modalReviewDaysInput.value, 10);
        if (val > 365) modalReviewDaysInput.value = 365;
        syncCycleModalUI();
      });
    }

    // الضغط على الخيارات السريعة للأيام (Preset Chips)
    if (modalCycleDaysChips && modalReviewDaysInput) {
      modalCycleDaysChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.opt-chip');
        if (!chip) return;
        triggerHaptic(15);
        const days = chip.getAttribute('data-days');
        if (days) {
          modalReviewDaysInput.value = days;
          syncCycleModalUI();
        }
      });
    }

    // بطاقات اختيار نظام المراجعة
    if (modeCardDual) {
      modeCardDual.addEventListener('click', () => selectReviewMode('dual'));
      modeCardDual.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectReviewMode('dual');
        }
      });
    }

    if (modeCardSingle) {
      modeCardSingle.addEventListener('click', () => selectReviewMode('single'));
      modeCardSingle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectReviewMode('single');
        }
      });
    }

    if (closeSettingsModalBtn) closeSettingsModalBtn.addEventListener('click', closeCycleModal);
    if (cancelSettingsModalBtn) cancelSettingsModalBtn.addEventListener('click', closeCycleModal);

    // إغلاق النافذة عند الضغط على الخلفية
    if (cycleSettingsModal) {
      cycleSettingsModal.addEventListener('click', (e) => {
        if (e.target === cycleSettingsModal) {
          closeCycleModal();
        }
      });
    }

    // حفظ الإعدادات
    if (saveSettingsModalBtn && cycleSettingsModal) {
      saveSettingsModalBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const newDays = parseInt(modalReviewDaysInput?.value, 10);
        const newMode = modalReviewSystemSelect?.value || 'dual';

        if (newDays >= 1 && newDays <= 365) {
          AppState.reviewSystemMode = newMode;
          closeCycleModal();

          if (typeof updateCycleDaysCount === 'function') {
            updateCycleDaysCount(newDays, false);
          } else {
            AppState.totalCycleDays = newDays;
            if (typeof renderTenDayScheduleTable === 'function') renderTenDayScheduleTable();
            if (typeof renderDailyChecklist === 'function') renderDailyChecklist();
          }

          persistState();
          if (typeof renderAll === 'function') renderAll();
          showToast('تم حفظ إعدادات دورة المراجعة بنجاح');
        } else {
          showToast('يرجى إدخال عدد أيام صالح (بين 1 و 365)');
        }
      });
    }

    // Event Delegation for dynamic buttons
    document.addEventListener('click', (e) => {
      const retryBtn = e.target.closest('.btn-retry-wajh');
      if (retryBtn) {
        triggerHaptic(15);
        const surah = retryBtn.getAttribute('data-surah-name');
        const pIdx = retryBtn.getAttribute('data-page-idx');
        const pNum = retryBtn.getAttribute('data-page-num');
        const text = `سورة ${surah} - وجه ${pIdx} (ص ${pNum})`;
        
        // Visual effect
        retryBtn.style.transition = 'all 0.4s ease';
        retryBtn.style.transform = 'rotate(180deg) scale(1.2)';
        retryBtn.style.color = '#15803d';
        
        setTimeout(() => {
          retryBtn.style.transform = 'rotate(0deg) scale(1)';
          retryBtn.style.color = 'var(--primary-medium)';
        }, 500);

        AppState.manualConsolidations = AppState.manualConsolidations || [];
        AppState.manualConsolidations.push({ id: Date.now().toString() + Math.random(), text: text });
        persistState();
        renderAll();
        showToast('تمت الإضافة لقسم التثبيت');
      }

      const removeBtn = e.target.closest('.btn-remove-consolidation');
      if (removeBtn) {
        triggerHaptic(15);
        const id = removeBtn.getAttribute('data-id');
        if (AppState.manualConsolidations) {
          AppState.manualConsolidations = AppState.manualConsolidations.filter(item => item.id !== id);
          persistState();
          renderAll();
        }
      }
      
      const dummyBtn = e.target.closest('.btn-review-repeat-dummy');
      if (dummyBtn) {
        triggerHaptic(10);
        // Do nothing, just stays
      }
    });

    const missedToggleBtn = $('missedToggleBtn');
    if (missedToggleBtn) {
      missedToggleBtn.addEventListener('click', () => {
        const opts = $('missedOptions'), open = opts ? opts.hidden : false;
        if (opts) opts.hidden = !open;
        missedToggleBtn.setAttribute('aria-expanded', String(open));
        const mCard = $('missedCard');
        if (mCard) mCard.classList.toggle('open', open);
      });
    }

    const missedChips = $('missedChips');
    if (missedChips) {
      missedChips.addEventListener('click', (e) => {
        const chip = e.target.closest('.missed-chip'); if (!chip) return;
        triggerHaptic(15);
        const log = getCurrentDailyLog(), act = activeKeys(getSelectedDayRoutine()), k = chip.dataset.missed;
        if (k === 'all') { const on = act.every(x => log.missed[x]); act.forEach(x => { log.missed[x] = !on; }); }
        else log.missed[k] = !log.missed[k];
        persistState(); renderDailyChecklist(); renderDateScroller(); renderReports();
      });
    }
    $('reportSurahSelect').addEventListener('change', (e) => { reportSurah = e.target.value; renderReports(); });
    const downloadPdfBtn = $('downloadSurahPdfBtn');
    if (downloadPdfBtn) {
      downloadPdfBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const selSurah = reportSurah || ($('reportSurahSelect') ? $('reportSurahSelect').value : null);
        downloadSurahReportPDF(selSurah);
      });
    }

    const printPdfBtn = $('printSurahReportBtn');
    if (printPdfBtn) {
      printPdfBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const selSurah = reportSurah || ($('reportSurahSelect') ? $('reportSurahSelect').value : null);
        printSurahReport(selSurah);
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
    if (typeof showSettingsSubpage === 'function') {
      showSettingsSubpage('settingsExamSubpage');
    }
  }

  function closeUrgentExamModal() {
    if (typeof hideSettingsSubpages === 'function') {
      hideSettingsSubpages();
    }
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

    const existingSurahs = (AppState.urgentExamPlan && AppState.urgentExamPlan.surahs) || {};
    const surahsState = {};
    surahsList.forEach(s => {
      const existing = existingSurahs[s.id];
      const pageMeta = QURAN_SURAH_PAGES[s.id] || { startPage: 1, pagesCount: 1 };
      const pagesState = {};
      for (let p = 1; p <= pageMeta.pagesCount; p++) {
        pagesState[p] = existing && existing.pages && existing.pages[p] !== undefined ? existing.pages[p] : false;
      }

      surahsState[s.id] = {
        id: s.id,
        name: s.name,
        verses: s.verses,
        startPage: pageMeta.startPage,
        pagesCount: pageMeta.pagesCount,
        checked: existing ? !!existing.checked : false,
        pages: pagesState,
        difficulty: existing ? (existing.difficulty || '') : '',
        hardPages: existing ? (existing.hardPages || '') : ''
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

    const fromId = parseInt(plan.fromSurahId) || 1;
    const toId = parseInt(plan.toSurahId) || 114;

    if ($('examStartDate') && plan.startDate) $('examStartDate').value = plan.startDate;
    if ($('examEndDate') && plan.endDate) $('examEndDate').value = plan.endDate;
    if ($('examFromSurahSelect')) $('examFromSurahSelect').value = fromId;
    if ($('examToSurahSelect')) $('examToSurahSelect').value = toId;

    // Refresh surah names from master data
    if (window.QURAN_SURAHS) {
      const s1 = window.QURAN_SURAHS.find(s => s.id === fromId);
      const s2 = window.QURAN_SURAHS.find(s => s.id === toId);
      if (s1) plan.fromSurahName = s1.name;
      if (s2) plan.toSurahName = s2.name;
    }

    // 1. Purge any surahs in plan.surahs that are OUTSIDE [fromId, toId]
    let stateMutated = false;
    Object.keys(plan.surahs).forEach(k => {
      const numId = parseInt(k, 10);
      if (numId < fromId || numId > toId) {
        delete plan.surahs[k];
        stateMutated = true;
      }
    });

    // 2. Ensure all surahs in range are present
    if (window.QURAN_SURAHS) {
      const surahsInRange = window.QURAN_SURAHS.filter(s => s.id >= fromId && s.id <= toId);
      surahsInRange.forEach(s => {
        if (!plan.surahs[s.id]) {
          const pageMeta = QURAN_SURAH_PAGES[s.id] || { startPage: 1, pagesCount: 1 };
          const pagesState = {};
          for (let p = 1; p <= pageMeta.pagesCount; p++) {
            pagesState[p] = false;
          }
          plan.surahs[s.id] = {
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
          stateMutated = true;
        }
      });
    }

    // 3. Expected Juzs for this exact surah range
    const expectedJuzs = getJuzsForSurahRange(fromId, toId);
    const expectedJuzSet = new Set(expectedJuzs);
    if (!plan.juzs) plan.juzs = {};
    Object.keys(plan.juzs).forEach(jId => {
      if (!expectedJuzSet.has(parseInt(jId, 10))) {
        delete plan.juzs[jId];
        stateMutated = true;
      }
    });
    expectedJuzs.forEach(jId => {
      if (plan.juzs[jId] === undefined) {
        plan.juzs[jId] = false;
        stateMutated = true;
      }
    });

    if (stateMutated) {
      persistState();
    }

    // Sorted surahKeys strictly in numeric order
    const surahKeys = Object.keys(plan.surahs)
      .map(k => parseInt(k, 10))
      .filter(id => id >= fromId && id <= toId)
      .sort((a, b) => a - b)
      .map(String);

    const juzKeys = expectedJuzs.map(String);

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
      const numericId = parseInt(sId, 10);
      const matchingJuz = JUZ_SURAH_MAP.find(m => numericId >= m.from && numericId <= m.to);
      const targetJuz = matchingJuz ? String(matchingJuz.juz) : (juzKeys[0] || '1');
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
          <span> قائمة الأجزاء والسور والأوجه المقررة</span>
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
                    ${isJuzComplete ? '<span style="font-size:0.72rem;color:#15803d;font-weight:700;background:#dcfce7;padding:3px 8px;border-radius:12px;">تم إنجاز الجزء بالكامل </span>' : `<span style="font-size:0.72rem;color:var(--text-muted);">${juzDoneSurahs} من ${surahsInJuz.length} سور مكتملة</span>`}
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
                            ${s.checked ? '<span class="badge-done" style="background:#15803d;color:#ffffff;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:700;">تم الإنجاز </span>' : `<span style="font-size:0.72rem;color:var(--text-muted);">${donePagesInSurah} من ${totalPagesInSurah} وجه</span>`}
                          </div>
                        </div>

                        <div class="surah-accordion-body ${isSurahCollapsed ? 'collapsed' : ''}" id="surahBody-${s.id}">
                          <div style="margin-bottom:10px;">
                            <div style="font-size:0.76rem;font-weight:700;color:var(--primary-medium);margin-bottom:8px;">
                               أوجه / صفحات سورة ${esc(s.name)}:
                            </div>
                            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(130px, 1fr));gap:6px;">
                              ${Object.keys(s.pages).map(pIdx => {
                                const isDone = s.pages[pIdx];
                                const pNum = s.startPage + parseInt(pIdx) - 1;
                                return `
                                  <div style="display:flex; align-items:center; background:${isDone ? '#f0fdf4' : 'var(--bg-subtle)'}; border:1px solid ${isDone ? '#bbf7d0' : 'var(--border-light)'}; border-radius:6px; overflow:hidden;">
                                    <label style="display:flex;align-items:center;gap:6px;padding:6px 8px;cursor:pointer;font-size:0.76rem;user-select:none;flex:1; margin:0;">
                                      <input type="checkbox" class="exam-page-check" data-surah="${s.id}" data-page="${pIdx}" ${isDone ? 'checked' : ''} />
                                      <span style="font-weight:600;color:${isDone ? '#166534' : 'var(--text-main)'};">وجه ${pIdx} <span style="font-size:0.68rem;color:var(--text-muted);">(ص ${pNum})</span></span>
                                    </label>
                                    <button type="button" class="btn-retry-wajh" data-surah-name="${esc(s.name)}" data-page-idx="${pIdx}" data-page-num="${pNum}" style="background:transparent; border:none; border-right:1px solid ${isDone ? '#bbf7d0' : 'var(--border-light)'}; cursor:pointer; color:var(--primary-medium); padding:0 8px; display:flex; align-items:center; justify-content:center; align-self:stretch;" title="إضافة لقسم التثبيت">
                                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
                                    </button>
                                  </div>
                                `;
                              }).join('')}
                            </div>
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
           تقرير ملخص الاختبار الختامي
        </h4>
        <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;">
          ملخص إنجاز الأوجه والسور قبيل دخول الاختبار:
        </p>

        

        <div style="display:flex;align-items:center;justify-content:space-between;font-size:0.78rem;color:var(--text-main);padding-top:6px;border-top:1px solid var(--border-light);">
          <span>نسبة إنجاز الأوجه: <strong>${percent}%</strong></span>
          <span>الحالة: <strong>${percent === 100 ? 'مكتملة جاهزة للإختبار ' : 'جارية للمراجعة '}</strong></span>
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

    const fromId = parseInt(plan.fromSurahId) || 1;
    const toId = parseInt(plan.toSurahId) || 114;
    const surahKeys = Object.keys(plan.surahs)
      .map(k => parseInt(k, 10))
      .filter(id => id >= fromId && id <= toId)
      .sort((a, b) => a - b)
      .map(String);

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

    const hardListHtml = hardSurahs.length > 0 ? hardSurahs.map(k => {
      const s = plan.surahs[k];
      return `<li style="margin-bottom:4px;color:#991b1b;font-weight:bold;">سورة ${esc(s.name)}: ${s.hardPages ? esc(s.hardPages) : 'صعبة (تحتاج إعادة نظر)'}</li>`;
    }).join('') : '<li style="color:#15803d;">لا توجد أوجه أو سور صعبة محددة.</li>';

    const surahRowsHtml = surahKeys.map(k => {
      const s = plan.surahs[k];
      const diffText = s.difficulty === 'easy' ? 'سهلة' : (s.difficulty === 'hard' ? 'صعبة ️' : 'عادي');
      const donePages = s.pages ? Object.values(s.pages).filter(v => v === true).length : 0;
      const totalPages = s.pagesCount || 1;
      return `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${s.id}</td>
          <td style="padding:8px;border:1px solid #ddd;font-weight:bold;text-align:center;">سورة ${esc(s.name)}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${s.verses} آية</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${donePages} من ${totalPages} وجه ${s.checked ? '' : ''}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${diffText}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${esc(s.hardPages || '-')}</td>
        </tr>
      `;
    }).join('');

    const reportHtml = `
      <div style="font-family:'IBM Plex Sans Arabic', Arial, sans-serif;direction:rtl;color:#13241e;padding:10px;">
        <div style="text-align: center; border-bottom: 2px solid #0f3d2e; padding-bottom: 12px; margin-bottom: 20px;">
          <h1 style="color: #0d3829; font-size: 22px; margin-bottom: 4px;">منصة سراج | نظام متابعة المحفوظ القرآني</h1>
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
          <h3 style="color:#991b1b;font-size:14px;margin-top:0;margin-bottom:8px;">️ الأوجه والسور الصعبة المحددة لمراجعتها قبل الاختبار:</h3>
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
          تم استخراج هذا التقرير تلقائياً من منصة سراج الرقمية للمحفوظ القرآني | تاريخ التصدير: ${new Date().toLocaleDateString('ar-SA')}
        </div>
      </div>
    `;

    generatePdfFromHtml(reportHtml, `تقرير_المراجعة_المستعجلة_${getTodayDateString()}.pdf`, `من سورة ${plan.fromSurahName} إلى ${plan.toSurahName}`);
  }

  window.populateExamSurahSelects = populateExamSurahSelects;
  window.renderUrgentExamModal = renderUrgentExamModal;
  window.openUrgentExamModal = openUrgentExamModal;
  window.closeUrgentExamModal = closeUrgentExamModal;
  window.renderTenDayScheduleTable = renderTenDayScheduleTable;
  window.renderWeeklyScheduleView = renderWeeklyScheduleView;

  // ---------- تسجيل الدخول / التسجيل ----------
  function setAuthState(st) {
    document.body.classList.remove('auth-loading', 'auth-out', 'auth-in');
    document.body.classList.add('auth-' + st);
  }
  function showAuthError(msg) { const el = $('authError'); el.hidden = !msg; el.textContent = msg || ''; }
  function authMessage(err) {
    if (!err) return 'تعذر تسجيل الدخول، يرجى المحاولة لاحقاً.';
    if (typeof err === 'string') return err;
    const map = {
      'auth/network-request-failed': 'تعذر الاتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.',
      'auth/unauthorized-domain': 'هذا النطاق غير مصرح به في إعدادات فايربيس. يرجى إضافة النطاق في Authorized Domains.',
      'auth/operation-not-allowed': 'تسجيل الدخول عبر جوجل غير مفعّل في لوحة تحكم فايربيس.',
      'auth/account-exists-with-different-credential': 'يوجد حساب بهذا البريد بطريقة دخول مختلفة.',
      'auth/too-many-requests': 'محاولات كثيرة مؤخراً، يرجى الانتظار قليلاً ثم المحاولة.',
      'auth/cancelled-popup-request': '',
      'auth/popup-closed-by-user': ''
    };
    if (err.code && map[err.code] !== undefined) {
      return map[err.code];
    }
    const rawMsg = err.message || err.code || '';
    if (rawMsg.startsWith('تعذر') || rawMsg.startsWith('مكتبة') || rawMsg.startsWith('خطأ')) {
      return rawMsg;
    }
    return `تعذر تسجيل الدخول: ${rawMsg}`;
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
      localStorage.removeItem('quran_explicit_sign_out');
      const r = await window.quranStorage.signInWithGoogle();
      if (r.redirecting) return;
      localStorage.setItem('quran_auth_cached', 'true');
      if (r.isNewUser) {
        sessionStorage.setItem('seraj_is_new_signup', 'true');
        localStorage.setItem('seraj_is_new_user_login', 'true');
      } else {
        localStorage.setItem('seraj_onboarding_completed', 'true');
        if (r.user && r.user.uid) {
          localStorage.setItem('seraj_onboarding_completed_' + r.user.uid, 'true');
        }
      }
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
    const manualSyncBtn = $('manualSyncBtn');
    if (manualSyncBtn) {
      manualSyncBtn.addEventListener('click', async () => {
        triggerHaptic(15);
        const icon = $('manualSyncIcon');
        const text = $('manualSyncBtnText');
        if (icon) icon.classList.add('spinning');
        if (text) text.textContent = 'جاري المزامنة...';
        showToast('جاري مزامنة بياناتك مع السحابة واسترجاع أي تحديثات...');
        if (window.quranStorage && typeof window.quranStorage.syncWithCloud === 'function') {
          const res = await window.quranStorage.syncWithCloud(true);
          if (icon) icon.classList.remove('spinning');
          if (text) text.textContent = 'مزامنة الآن';
          if (res.success) {
            showToast(res.message || 'تمت المزامنة السحابية بنجاح');
          } else {
            showToast(res.message || 'تعذر المزامنة السحابية');
          }
        }
      });
    }

    const loginPromptBtn = $('accountLoginPromptBtn');
    if (loginPromptBtn) {
      loginPromptBtn.addEventListener('click', () => {
        triggerHaptic(20);
        setAuthState('out');
      });
    }

    window.addEventListener('seraj:sync-status', (e) => {
      const { status } = e.detail || {};
      const textEl = $('syncStatusText');
      const dotEl = $('syncStatusIndicator');
      if (!textEl || !dotEl) return;
      if (status === 'syncing') {
        dotEl.style.background = '#3b82f6';
        textEl.textContent = 'المزامنة: جاري الاتصال والمزامنة...';
      } else if (status === 'synced') {
        dotEl.style.background = '#10b981';
        textEl.textContent = 'المزامنة السحابية: متصل ومحدث تلقائياً';
      } else if (status === 'offline') {
        dotEl.style.background = '#94a3b8';
        textEl.textContent = 'وضع زائر محلي (أوفلاين)';
      } else if (status === 'error') {
        dotEl.style.background = '#ef4444';
        textEl.textContent = 'تعذر الاتصال بالسحابة (تحقق من الإنترنت)';
      }
    });

    $('signOutBtn').addEventListener('click', async () => {
      triggerHaptic(20);
      const isGuest = localStorage.getItem('quran_is_guest') === 'true' || !window.quranStorage || !window.quranStorage.uid || window.quranStorage.uid === 'guest_user';
      localStorage.removeItem('quran_is_guest');
      localStorage.removeItem('quran_auth_cached');
      localStorage.removeItem('quran_cached_uid');
      if (!isGuest) {
        localStorage.setItem('quran_explicit_sign_out', 'true');
        await window.quranStorage.signOut();
      }
      resetState();
      renderAll();
      renderAccount(null);
      setAuthState('out');
    });
    document.querySelectorAll('.guest-login-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        triggerHaptic(20);
        localStorage.removeItem('quran_explicit_sign_out');
        localStorage.setItem('quran_is_guest', 'true');
        const svc = window.quranStorage || { getLocalData: () => null, saveToCloud: () => {}, uid: null };
        svc.uid = 'guest_user';
        resetState();
        const localData = svc.getLocalData();
        if (localData) applyPayload(localData);
        renderAll();
        populateSettingsForm();
        setAuthState('in');
        const isFirstGuestEver = !localStorage.getItem('quran_guest_has_visited') && !localStorage.getItem('seraj_onboarding_completed') && !localStorage.getItem('tibyan_user_profile') && !svc.getLocalData();
        localStorage.setItem('quran_guest_has_visited', 'true');
        if (isFirstGuestEver) {
          sessionStorage.setItem('seraj_is_new_signup', 'true');
          if (window.SerajOnboarding && typeof window.SerajOnboarding.checkAndLaunch === 'function') {
            setTimeout(() => window.SerajOnboarding.checkAndLaunch(true), 600);
          }
        } else {
          localStorage.setItem('seraj_onboarding_completed', 'true');
        }
        showToast('تم الدخول كزائر (تُحفظ بياناتك محلياً في جهازك)');
      });
    });
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
    ctx.fillText('منصة سراج | توثيق الإنجاز اليومي ', width / 2, 52 * scale);

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
    ctx.fillText(data.nearCheck ? '(تمت )' : '(لم تتم )', 40 * scale, 302 * scale);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.fillText(`المراجعة البعيدة: ${data.distantRev}`, width - 40 * scale, 332 * scale);

    ctx.fillStyle = data.distantCheck ? '#34d399' : '#f87171';
    ctx.font = `bold ${13 * scale}px 'IBM Plex Sans Arabic', Arial, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(data.distantCheck ? '(تمت )' : '(لم تتم )', 40 * scale, 332 * scale);

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
    ctx.fillText('تم التوثيق عبر منصة سراج الرقمية لتتبع المحفوظ القرآني', width / 2, 480 * scale);

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

    const shareText = `منصة سراج |  توثيق الإنجاز اليومي للقرآن الكريم
️ التاريخ: ${fmtDate(getTodayDateString())}
🟢 السورة المقررة: سورة ${surahName} (${verseCount} من ${totalVerses} آية)
 المراجعة القريبة: ${nearRev} (${todayLog.nearReviewCheck ? 'تمت ' : 'جارية'})
 المراجعة البعيدة: ${distantRev} (${todayLog.distantReviewCheck ? 'تمت ' : 'جارية'})
 تم استخراج التوثيق بنجاح من منصة سراج الرقمية`;

    if (currentSnapshotBlob && navigator.share && navigator.canShare) {
      try {
        const file = new File([currentSnapshotBlob], `توثيق_إنجاز_سراج_${getTodayDateString()}.png`, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: 'توثيق الإنجاز اليومي - منصة سراج',
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
          title: 'توثيق الإنجاز اليومي - منصة سراج',
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
    a.download = `توثيق_إنجاز_سراج_${getTodayDateString()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('تم حفظ صورة التوثيق بنجاح');
  }

  function renderAccount(user) {
    const greetingName = localStorage.getItem('tibyan_user_name') || (user && user.displayName ? user.displayName : 'يا حافظ القرآن');
    const accGreetingEl = $('accountGreetingNameText');
    if (accGreetingEl) accGreetingEl.textContent = greetingName;

    const accGreetingBtn = $('accountGreetingName');
    if (accGreetingBtn && !accGreetingBtn._hasClickListener) {
      accGreetingBtn._hasClickListener = true;
      accGreetingBtn.style.cursor = 'pointer';
      accGreetingBtn.addEventListener('click', () => {
        const cur = localStorage.getItem('tibyan_user_name') || '';
        const input = prompt('أدخل اسمك الكريم ليظهر بعد كلمة "أهلاً":', cur);
        if (input !== null) {
          const trimmed = input.trim();
          if (trimmed) {
            localStorage.setItem('tibyan_user_name', trimmed);
          } else {
            localStorage.removeItem('tibyan_user_name');
          }
          renderDateScroller();
          const curUser = window.quranStorage && window.quranStorage.auth ? window.quranStorage.auth.currentUser : null;
          renderAccount(curUser);
          showToast('تم تحديث الاسم بنجاح');
        }
      });
    }

    const accName = $('accountName');
    const accEmail = $('accountEmail');
    const img = $('accountPhoto');
    const defAvatar = $('accountDefaultAvatar');
    const initText = $('accountInitialText');

    const signOutBtn = $('signOutBtn');
    const loginPromptBtn = $('accountLoginPromptBtn');
    const manualSyncBtn = $('manualSyncBtn');
    const syncStatusText = $('syncStatusText');
    const syncStatusIndicator = $('syncStatusIndicator');

    if (!user) {
      if (accName) accName.textContent = 'حساب زائر محلي';
      if (accEmail) accEmail.textContent = 'وضع غير مسجل (لا تتم المزامنة بين الأجهزة)';
      if (img) img.hidden = true;
      if (defAvatar) {
        defAvatar.style.display = 'flex';
        if (initText) initText.textContent = greetingName ? greetingName.replace(/^يا\s+/, '').charAt(0) : 'ز';
      }
      if (signOutBtn) signOutBtn.textContent = 'تسجيل الدخول';
      if (loginPromptBtn) loginPromptBtn.style.display = 'inline-flex';
      if (manualSyncBtn) manualSyncBtn.style.display = 'none';
      if (syncStatusIndicator) syncStatusIndicator.style.background = '#f59e0b';
      if (syncStatusText) syncStatusText.textContent = 'وضع محلي (سجل الدخول بحسابك لمزامنة الأجهزة)';
      return;
    }

    if (signOutBtn) signOutBtn.textContent = 'تسجيل الخروج';
    if (loginPromptBtn) loginPromptBtn.style.display = 'none';
    if (manualSyncBtn) manualSyncBtn.style.display = 'inline-flex';
    if (syncStatusIndicator) syncStatusIndicator.style.background = '#10b981';
    if (syncStatusText) syncStatusText.textContent = 'المزامنة السحابية: متصل ومحدث تلقائياً';

    if (accName) accName.textContent = user.displayName || 'مستخدم سراج';
    if (accEmail) accEmail.textContent = user.email || '';

    if (user.photoURL && img) {
      img.src = user.photoURL;
      img.hidden = false;
      if (defAvatar) defAvatar.style.display = 'none';
    } else {
      if (img) img.hidden = true;
      if (defAvatar) {
        defAvatar.style.display = 'flex';
        if (initText) {
          const nameToUse = user.displayName || greetingName || 'S';
          initText.textContent = nameToUse.charAt(0).toUpperCase();
        }
      }
    }
  }

  async function handleAuth(user) {
    const svc = window.quranStorage || { getLocalData: () => null, saveToCloud: () => {}, uid: null };
    if (!user) {
      const isExplicitSignOut = localStorage.getItem('quran_explicit_sign_out') === 'true';
      const isGuest = localStorage.getItem('quran_is_guest') === 'true';
      const hasLocalData = !!svc.getLocalData() || !!localStorage.getItem('quran_memorization_data_v1') || !!localStorage.getItem('tibyan_mushaf_page') || !!localStorage.getItem('tibyan_user_name');

      if (!isExplicitSignOut && (isGuest || hasLocalData)) {
        svc.uid = 'guest_user';
        localStorage.setItem('quran_is_guest', 'true');
        resetState();
        const localData = svc.getLocalData();
        if (localData) applyPayload(localData);
        renderAll();
        populateSettingsForm();
        setAuthState('in');
    const isNewUserSignup = sessionStorage.getItem('seraj_is_new_signup') === 'true' || localStorage.getItem('seraj_is_new_user_login') === 'true';
    if (isNewUserSignup && window.SerajOnboarding && typeof window.SerajOnboarding.checkAndLaunch === 'function') {
      setTimeout(() => window.SerajOnboarding.checkAndLaunch(true), 600);
    }
        return;
      }
      svc.stopSync();
      resetState();
      renderAll();
      populateSettingsForm();
      setAuthState('out');
      return;
    }
    localStorage.removeItem('quran_explicit_sign_out');
    localStorage.removeItem('quran_is_guest');
    localStorage.setItem('quran_auth_cached', 'true');
    localStorage.setItem('quran_cached_uid', user.uid);
    svc.startSync(user);
    resetState();
    const localData = svc.getLocalData();
    if (localData) applyPayload(localData);
    svc.onCloudUpdateCallback = (payload) => {
      applyPayload(payload);
      renderAll();
      populateSettingsForm();
      // تمت المزامنة بهدوء في الخلفية دون إظهار إشعار للمستخدم
    };
    svc.beginRealtime();
    renderAccount(user);
    populateSettingsForm();
    renderAll();
    setAuthState('in');


    // جلب فوري من الخادم لضمان أحدث نسخة من الهاتف أو التابلت فوراً
    setTimeout(() => {
      if (svc && typeof svc.syncWithCloud === 'function') {
        svc.syncWithCloud();
      }
    }, 300);
  }


  function updateNetworkStatus() {
    const badge = document.getElementById('connectionStatusBadge');
    const textEl = document.getElementById('connectionStatusText');
    if (!badge || !textEl) return;

    const isOnline = navigator.onLine;
    const text = isOnline ? 'متصل بالإنترنت' : 'غير متصل (أوفلاين)';
    badge.className = isOnline ? 'network-status-badge online' : 'network-status-badge offline';
    badge.title = text;
    badge.setAttribute('aria-label', text);
    textEl.textContent = text;
  }

  window.addEventListener('online', async () => {
    updateNetworkStatus();
    showToast('تم إعادة الاتصال بالإنترنت، جاري فحص ومزامنة البيانات...');
    if (window.quranStorage && typeof window.quranStorage.syncWithCloud === 'function') {
      await window.quranStorage.syncWithCloud();
    }
  });

  // مزامنة تلقائية فورية عند فتح شاشة التابلت أو العودة للتطبيق
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && window.quranStorage && typeof window.quranStorage.syncWithCloud === 'function') {
      window.quranStorage.syncWithCloud();
    }
  });

  window.addEventListener('focus', () => {
    if (window.quranStorage && typeof window.quranStorage.syncWithCloud === 'function') {
      window.quranStorage.syncWithCloud();
    }
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    showToast('أنت الآن في وضع عدم الاتصال (أوفلاين)');
  });

  // --- INITIALIZATION ---
  window.addEventListener('DOMContentLoaded', async () => {
    populateSurahSelectDropdown();
    updateNetworkStatus();
    const connBtn = document.getElementById('connectionStatusBadge');
    if (connBtn) {
      connBtn.addEventListener('click', () => {
        triggerHaptic(15);
        updateNetworkStatus();
        if (navigator.onLine) {
          showToast('أنت متصل بالإنترنت، يتم حفظ ومزامنة البيانات تلقائياً');
        } else {
          showToast('أنت في وضع عدم الاتصال، يتم حفظ كافة البيانات محلياً في جهازك');
        }
      });
    }
    attachEventListeners();
    attachExtraListeners();
    attachAuthListeners();
    resetState();
    populateSettingsForm();
    if (typeof initUnifiedPlanSettings === 'function') initUnifiedPlanSettings();
    renderAll();

    const svc = window.quranStorage || { getLocalData: () => null, saveToCloud: () => {}, uid: null };
    const isExplicitSignOut = localStorage.getItem('quran_explicit_sign_out') === 'true';
    const isGuest = localStorage.getItem('quran_is_guest') === 'true';
    const cachedUid = localStorage.getItem('quran_cached_uid');
    const hasLocalData = !!svc.getLocalData() || !!localStorage.getItem('quran_memorization_data_v1') || !!localStorage.getItem('tibyan_mushaf_page') || !!localStorage.getItem('tibyan_user_name');
    const hasCachedAuth = localStorage.getItem('quran_auth_cached') === 'true';

    if (cachedUid && cachedUid !== 'guest_user') {
      svc.uid = cachedUid;
    }

    if (!isExplicitSignOut && (isGuest || hasLocalData || hasCachedAuth)) {
      if (isGuest || (!hasCachedAuth && hasLocalData)) {
        if (!svc.uid) svc.uid = 'guest_user';
      }
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
      if (!isExplicitSignOut && (isGuest || hasLocalData || hasCachedAuth)) {
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
    if (svc.auth && typeof svc.auth.getRedirectResult === 'function') {
      svc.auth.getRedirectResult().catch(e => showAuthError(authMessage(e)));
    }
    svc.onAuthChanged(handleAuth);
  });


  // --- UNIFIED PLAN & REVIEW SETTINGS MODULE ---
  const QURAN_JUZ_NAMES = [
    "الجزء الأول (الم - البقرة)",
    "الجزء الثاني (سيقول)",
    "الجزء الثالث (تلك الرسل)",
    "الجزء الرابع (لن تنالوا)",
    "الجزء الخامس (والمحصنات)",
    "الجزء السادس (لا يحب الله)",
    "الجزء السابع (وإذا سمعوا)",
    "الجزء الثامن (ولو أننا)",
    "الجزء التاسع (قال الملأ)",
    "الجزء العاشر (واعلموا)",
    "الجزء الحادي عشر (يعتذرون)",
    "الجزء الثاني عشر (وما من دابة)",
    "الجزء الثالث عشر (وما أبرئ)",
    "الجزء الرابع عشر (ربما)",
    "الجزء الخامس عشر (سبحان)",
    "الجزء السادس عشر (قال ألم)",
    "الجزء السابع عشر (اقترب)",
    "الجزء الثامن عشر (قد أفلح)",
    "الجزء التاسع عشر (وقال الذين)",
    "الجزء العشرون (أمن خلق)",
    "الجزء الحادي والعشرون (اتل ما أوحي)",
    "الجزء الثاني والعشرون (ومن يقنت)",
    "الجزء الثالث والعشرون (وما أنزلنا)",
    "الجزء الرابع والعشرون (فمن أظلم)",
    "الجزء الخامس والعشرون (إليه يرد)",
    "الجزء السادس والعشرون (حم - الأحقاف)",
    "الجزء السابع والعشرون (قال فما خطبكم)",
    "الجزء الثامن والعشرون (قد سمع)",
    "الجزء التاسع والعشرون (تبارك)",
    "الجزء الثلاثون (عمّ)"
  ];
  window.QURAN_JUZ_NAMES = QURAN_JUZ_NAMES;

  function initUnifiedPlanSettings() {
    const memTypeSelect = document.getElementById('unifMemTypeSelect');
    const juzContainer = document.getElementById('unifJuzContainer');
    const juzSelect = document.getElementById('unifJuzCount');
    const juzRangeContainer = document.getElementById('unifJuzRangeContainer');
    const rangeFromJuz = document.getElementById('unifRangeFromJuz');
    const rangeToJuz = document.getElementById('unifRangeToJuz');
    const rangeContainer = document.getElementById('unifSurahRangeContainer');
    const rangeFrom = document.getElementById('unifRangeFromSurah');
    const rangeTo = document.getElementById('unifRangeToSurah');
    const dirSelect = document.getElementById('unifDirectionSelect');
    const targetSurah = document.getElementById('unifTargetSurahSelect');
    const statusSelect = document.getElementById('unifSurahStatusSelect');
    const verseGroup = document.getElementById('unifCurrentVerseGroup');
    const verseInput = document.getElementById('unifCurrentVerseInput');
    const cycleDaysSelect = document.getElementById('unifCycleDaysSelect');
    const cycleChips = document.querySelectorAll('#unifReviewCycleChips .cycle-chip-btn');
    const calcReviewBox = document.getElementById('unifCalculatedReviewBox');
    const calcAmountText = document.getElementById('unifCalculatedAmountText');
    const calcDetailsText = document.getElementById('unifCalculatedDetailsText');
    const badgeAutoCalc = document.getElementById('badgeAutoCalc');
    const btnToggleManual = document.getElementById('btnToggleManualReview');
    const manualFieldsBox = document.getElementById('unifManualFieldsBox');
    const btnResetToAuto = document.getElementById('btnResetToAutoReview');
    const revAmountSelect = document.getElementById('unifRevisionAmountSelect');
    const btnPreviewSchedule = document.getElementById('btnPreviewReviewSchedule');
    const dailyNewSelect = document.getElementById('unifDailyNewSelect');
    const memoDayBtns = document.querySelectorAll('#unifMemoDaysGrid .unif-memo-day-btn');
    const revDayBtns = document.querySelectorAll('#unifRevisionDaysGrid .unif-rev-day-btn');
    const offDayBtns = document.querySelectorAll('#unifOffDaysGrid .unif-off-day-btn');
    const saveBtn = document.getElementById('saveUnifiedPlanBtn');

    let isManualOverride = false;

    function getSurahList() {
      return (typeof window !== 'undefined' && window.QURAN_SURAHS) || (typeof QURAN_SURAHS !== 'undefined' ? QURAN_SURAHS : []);
    }

    // تعبئة كافة القوائم المنسدلة: السور الـ 114 والأجزاء الـ 30 بالأسماء والأرقام
    function populateDropdowns() {
      const list = getSurahList();

      // 1. قائمة السورة المستهدفة
      if (targetSurah && targetSurah.children.length === 0 && list.length) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.id}. سورة ${s.name} (${s.verses} آية)`;
          targetSurah.appendChild(opt);
        });
      }

      // 2. قائمتي نطاق السور (من سورة إلى سورة) بالاسم الكامل
      if (rangeFrom && rangeFrom.children.length === 0 && list.length) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.id}. سورة ${s.name}`;
          rangeFrom.appendChild(opt);
        });
      }
      if (rangeTo && rangeTo.children.length === 0 && list.length) {
        list.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.id;
          opt.textContent = `${s.id}. سورة ${s.name}`;
          rangeTo.appendChild(opt);
        });
        if (rangeTo.options.length) {
          rangeTo.selectedIndex = rangeTo.options.length - 1;
        }
      }

      // 3. قوائم الأجزاء (1 إلى 30)
      if (juzSelect && juzSelect.children.length === 0) {
        for (let j = 1; j <= 30; j++) {
          const opt = document.createElement('option');
          opt.value = j;
          opt.textContent = j === 1 ? 'جزء واحد' : (j === 2 ? 'جزئين' : (j <= 10 ? `${j} أجزاء` : `${j} جزءاً`));
          juzSelect.appendChild(opt);
        }
        juzSelect.value = '10';
      }

      if (rangeFromJuz && rangeFromJuz.children.length === 0) {
        for (let j = 1; j <= 30; j++) {
          const opt = document.createElement('option');
          opt.value = j;
          opt.textContent = `الجزء ${j}`;
          rangeFromJuz.appendChild(opt);
        }
        rangeFromJuz.value = '1';
      }

      if (rangeToJuz && rangeToJuz.children.length === 0) {
        for (let j = 1; j <= 30; j++) {
          const opt = document.createElement('option');
          opt.value = j;
          opt.textContent = `الجزء ${j}`;
          rangeToJuz.appendChild(opt);
        }
        rangeToJuz.value = '30';
      }
    }

    // إظهار وإخفاء حقول المحفوظ السابق الشرطية
    function updateMemTypeVisibility() {
      const type = memTypeSelect ? memTypeSelect.value : 'khatim';
      if (juzContainer) juzContainer.style.display = (type === 'juz') ? 'block' : 'none';
      if (juzRangeContainer) juzRangeContainer.style.display = (type === 'juz_range') ? 'block' : 'none';
      if (rangeContainer) rangeContainer.style.display = (type === 'surah_range') ? 'block' : 'none';
      updateCalculatedReviewDisplay();
    }

    // إظهار وإخفاء حقل رقم الآية حسب حالة السورة
    function updateSurahStatusVisibility() {
      const status = statusSelect ? statusSelect.value : 'new';
      if (verseGroup) {
        verseGroup.style.display = (status === 'memorizing') ? 'block' : 'none';
      }
    }

    // دالة حساب المقدار اليومي المقترح بناءً على المحفوظ ودورة الأيام
    function calculateDailyReviewAmount(memType, cycleDays) {
      let totalAjzaa = 30;
      let totalPages = 604;
      const list = getSurahList();

      if (memType === 'khatim') {
        totalAjzaa = 30;
        totalPages = 604;
      } else if (memType === 'juz') {
        totalAjzaa = parseInt(juzSelect ? juzSelect.value : 10, 10) || 10;
        totalPages = totalAjzaa * 20;
      } else if (memType === 'juz_range') {
        const fj = parseInt(rangeFromJuz ? rangeFromJuz.value : 1, 10) || 1;
        const tj = parseInt(rangeToJuz ? rangeToJuz.value : 30, 10) || 30;
        totalAjzaa = Math.abs(tj - fj) + 1;
        totalPages = totalAjzaa * 20;
      } else if (memType === 'surah_range') {
        const fs = parseInt(rangeFrom ? rangeFrom.value : 1, 10) || 1;
        const ts = parseInt(rangeTo ? rangeTo.value : 114, 10) || 114;
        const minS = Math.min(fs, ts);
        const maxS = Math.max(fs, ts);
        const sStart = list.find(s => s.id === minS) || { startPage: 1 };
        const sEnd = list.find(s => s.id === maxS) || { endPage: 604 };
        totalPages = Math.max(1, Math.abs((sEnd.endPage || sEnd.startPage || 604) - (sStart.startPage || 1)) + 1);
        totalAjzaa = Math.max(0.5, Math.round((totalPages / 20) * 10) / 10);
      } else {
        totalAjzaa = 1;
        totalPages = 20;
      }

      const cDays = parseInt(cycleDays, 10) || 10;
      const dailyPages = Math.max(1, Math.round(totalPages / cDays));
      const dailyAjzaa = Math.max(0.25, Math.round((totalAjzaa / cDays) * 10) / 10);

      let amountLabel = '';
      if (dailyPages <= 3) {
        amountLabel = `ربع حزب (حوالي ${dailyPages} صفحات يومياً)`;
      } else if (dailyPages <= 6) {
        amountLabel = `نصف حزب (حوالي ${dailyPages} صفحات يومياً)`;
      } else if (dailyPages <= 12) {
        amountLabel = `نصف جزء (حزب كامل - ${dailyPages} صفحة يومياً)`;
      } else if (dailyPages <= 17) {
        amountLabel = `3 أرباع الجزء (حوالي ${dailyPages} صفحة يومياً)`;
      } else if (dailyPages <= 24) {
        amountLabel = `جزء كامل يومياً (${dailyPages} صفحة)`;
      } else if (dailyPages <= 34) {
        amountLabel = `جزء ونصف يومياً (${dailyPages} صفحة)`;
      } else if (dailyPages <= 45) {
        amountLabel = `جزئين يومياً (${dailyPages} صفحة)`;
      } else if (dailyPages <= 65) {
        amountLabel = `3 أجزاء يومياً (${dailyPages} صفحة)`;
      } else {
        const j = Math.round(dailyPages / 20);
        amountLabel = `${j} أجزاء يومياً (${dailyPages} صفحة)`;
      }

      const ajzaaText = totalAjzaa === 1 ? 'جزء واحد' : (totalAjzaa === 2 ? 'جزئين' : `${totalAjzaa} أجزاء`);
      const detailsLabel = `بناءً على ختم محفوظك السابق (${ajzaaText} / ${totalPages} صفحة) كل ${cDays} أيام`;

      return { amountLabel, detailsLabel, dailyPages, dailyAjzaa, totalAjzaa, totalPages };
    }

    // تحديث الشريحة التفاعلية الحية للمقدار المحسوب
    function updateCalculatedReviewDisplay() {
      const type = memTypeSelect ? memTypeSelect.value : 'khatim';
      const days = parseInt(cycleDaysSelect ? cycleDaysSelect.value : 10, 10) || 10;
      const calc = calculateDailyReviewAmount(type, days);

      if (calcAmountText) {
        if (isManualOverride && revAmountSelect) {
          const selectedText = revAmountSelect.options[revAmountSelect.selectedIndex] ? revAmountSelect.options[revAmountSelect.selectedIndex].text : '';
          calcAmountText.textContent = `تحديد يدوي: ${selectedText}`;
        } else {
          calcAmountText.textContent = calc.amountLabel;
        }
      }

      if (calcDetailsText) {
        if (isManualOverride) {
          calcDetailsText.textContent = `المقدار التلقائي المحسوب كان: ${calc.amountLabel} (${calc.detailsLabel})`;
        } else {
          calcDetailsText.textContent = calc.detailsLabel;
        }
      }

      if (badgeAutoCalc) {
        badgeAutoCalc.textContent = isManualOverride ? 'معدل يدوياً' : 'محسوب آلياً';
        badgeAutoCalc.className = `review-status-badge ${isManualOverride ? 'is-inactive' : 'is-active'}`;
      }
    }

    // تفاعل شرائح دورة المراجعة (7، 10، 15، 30 أيام)
    cycleChips.forEach(chip => {
      chip.addEventListener('click', () => {
        cycleChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const days = parseInt(chip.dataset.days, 10) || 10;
        if (cycleDaysSelect) cycleDaysSelect.value = String(days);
        updateCalculatedReviewDisplay();
        if (typeof triggerHaptic === 'function') triggerHaptic(15);
      });
    });

    // مسار التحديد اليدوي (Secondary Action)
    if (btnToggleManual) {
      btnToggleManual.addEventListener('click', () => {
        isManualOverride = true;
        if (manualFieldsBox) manualFieldsBox.style.display = 'block';
        if (btnToggleManual) btnToggleManual.style.display = 'none';
        updateCalculatedReviewDisplay();
        if (typeof triggerHaptic === 'function') triggerHaptic(15);
      });
    }

    if (btnResetToAuto) {
      btnResetToAuto.addEventListener('click', () => {
        isManualOverride = false;
        if (manualFieldsBox) manualFieldsBox.style.display = 'none';
        if (btnToggleManual) btnToggleManual.style.display = 'inline-flex';
        updateCalculatedReviewDisplay();
        if (typeof triggerHaptic === 'function') triggerHaptic(15);
      });
    }

    if (revAmountSelect) {
      revAmountSelect.addEventListener('change', () => {
        if (isManualOverride) updateCalculatedReviewDisplay();
      });
    }

    // ربط الأحداث للحساب الفوري عند تعديل أي حقل محفوظ
    if (memTypeSelect) memTypeSelect.addEventListener('change', updateMemTypeVisibility);
    if (juzSelect) juzSelect.addEventListener('change', updateCalculatedReviewDisplay);
    if (rangeFromJuz) rangeFromJuz.addEventListener('change', updateCalculatedReviewDisplay);
    if (rangeToJuz) rangeToJuz.addEventListener('change', updateCalculatedReviewDisplay);
    if (rangeFrom) rangeFrom.addEventListener('change', updateCalculatedReviewDisplay);
    if (rangeTo) rangeTo.addEventListener('change', updateCalculatedReviewDisplay);
    if (statusSelect) statusSelect.addEventListener('change', updateSurahStatusVisibility);

    // ==============================================================
    // نافذة منبثقة تفاعلية: معاينة جدول وتقسيم السور في المراجعة
    // ==============================================================
    const modalEl = document.getElementById('reviewScheduleModal');
    const closeBtn = document.getElementById('closeReviewScheduleModalBtn');
    const doneBtn = document.getElementById('btnDoneReviewScheduleModal');

    function openReviewScheduleModal() {
      if (!modalEl) return;
      if (typeof triggerHaptic === 'function') triggerHaptic(15);

      const memType = memTypeSelect ? memTypeSelect.value : 'khatim';
      let memVal = 30;
      if (memType === 'juz') {
        memVal = parseInt(juzSelect ? juzSelect.value : 10, 10) || 10;
      } else if (memType === 'juz_range') {
        const fj = parseInt(rangeFromJuz ? rangeFromJuz.value : 1, 10) || 1;
        const tj = parseInt(rangeToJuz ? rangeToJuz.value : 30, 10) || 30;
        memVal = { from: Math.min(fj, tj), to: Math.max(fj, tj) };
      } else if (memType === 'surah_range') {
        const f = parseInt(rangeFrom ? rangeFrom.value : 1, 10) || 1;
        const t = parseInt(rangeTo ? rangeTo.value : 114, 10) || 114;
        memVal = { from: Math.min(f, t), to: Math.max(f, t) };
      }

      const sId = targetSurah ? (parseInt(targetSurah.value, 10) || 1) : 1;
      const sStatus = statusSelect ? statusSelect.value : 'new';
      const cDays = parseInt(cycleDaysSelect ? cycleDaysSelect.value : 10, 10) || 10;

      const previewProfile = {
        memorization: {
          type: memType,
          value: memVal,
          direction: dirSelect ? dirSelect.value : 'fatihah_to_nas'
        },
        currentTarget: {
          surahId: sId,
          status: sStatus,
          currentVerse: 0
        },
        schedule: {
          revisionCycleDays: cDays
        }
      };

      let gen = null;
      if (typeof window.generateReviewSchedule === 'function') {
        gen = window.generateReviewSchedule(previewProfile);
      }

      // إذا لم يتوفر، نولد صفوفاً قياسية
      let scheduleRows = (gen && gen.scheduleRows) || [];
      if (!scheduleRows.length) {
        for (let i = 1; i <= cDays; i++) {
          scheduleRows.push({
            day: i,
            nearReview: `المقرر القريب لليوم ${i}`,
            distantReview: `المقرر البعيد لليوم ${i}`
          });
        }
      }

      renderReviewScheduleModalContent(cDays, scheduleRows, previewProfile);

      modalEl.removeAttribute('hidden');
      modalEl.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    }

    function closeReviewScheduleModal() {
      if (!modalEl) return;
      modalEl.setAttribute('hidden', '');
      modalEl.style.display = 'none';
      document.body.style.overflow = '';
    }

    function renderReviewScheduleModalContent(cDays, scheduleRows, profile) {
      const titleEl = document.getElementById('reviewScheduleModalTitle');
      const cycleDaysInfo = document.getElementById('modalCycleDaysInfo');
      const activeDayInfo = document.getElementById('modalActiveDayInfo');
      const totalSurahsInfo = document.getElementById('modalTotalSurahsInfo');
      const container = document.getElementById('modalScheduleDaysContainer');

      const currentActiveDay = AppState.activeCycleDay || 1;

      if (titleEl) titleEl.textContent = `جدول تقسيم السور لدورة المراجعة (${cDays} أيام)`;
      if (cycleDaysInfo) cycleDaysInfo.textContent = `دورة: ${cDays} أيام`;
      if (activeDayInfo) activeDayInfo.textContent = `اليوم النشط للبدء: اليوم ${currentActiveDay}`;
      if (totalSurahsInfo) {
        const calc = calculateDailyReviewAmount(profile.memorization.type, cDays);
        totalSurahsInfo.textContent = `المحفوظ: ${calc.totalAjzaa} أجزاء`;
      }

      if (!container) return;
      container.innerHTML = '';

      scheduleRows.forEach(item => {
        const isCurrentActive = (item.day === currentActiveDay);
        const card = document.createElement('div');
        card.className = `modal-day-card ${isCurrentActive ? 'is-active' : ''}`;

        card.innerHTML = `
          <div class="modal-day-card-header">
            <div class="modal-day-num">
              <span>اليوم ${item.day}</span>
              ${isCurrentActive ? '<span class="review-status-badge is-active" style="font-size:0.72rem;padding:2px 8px;">✓ النشط للبدء</span>' : ''}
            </div>
            <button type="button" class="btn-modal-day-active ${isCurrentActive ? 'is-active' : 'not-active'}" data-day="${item.day}" ${isCurrentActive ? 'disabled' : ''}>
              ${isCurrentActive ? '● نشط حالياً' : 'تحديد كيوم نشط'}
            </button>
          </div>
          <div class="modal-day-surahs">
            ${item.distantReview || item.singleReview || item.nearReview || 'مراجعة عامة'}
          </div>
          ${item.nearReview && item.distantReview ? `<div class="modal-day-near">المراجعة القريبة: ${item.nearReview}</div>` : ''}
        `;

        const btnAct = card.querySelector('.btn-modal-day-active.not-active');
        if (btnAct) {
          btnAct.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof triggerHaptic === 'function') triggerHaptic(20);
            AppState.activeCycleDay = item.day;
            const currentLog = getCurrentDailyLog();
            if (currentLog) currentLog.cycleDay = item.day;
            AppState.cycleAnchor = { date: AppState.selectedDate, cycleDay: item.day };
            persistState();
            renderAll();
            renderReviewScheduleModalContent(cDays, scheduleRows, profile);
            if (typeof renderTenDayScheduleTable === 'function') renderTenDayScheduleTable();
            showToast(`تم تعيين اليوم ${item.day} كيوم المراجعة النشط بنجاح ✓`);
          });
        }

        container.appendChild(card);
      });
    }

    if (btnPreviewSchedule) {
      btnPreviewSchedule.addEventListener('click', openReviewScheduleModal);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', closeReviewScheduleModal);
    }
    if (doneBtn) {
      doneBtn.addEventListener('click', closeReviewScheduleModal);
    }
    if (modalEl) {
      modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeReviewScheduleModal();
      });
    }

    // أيام الأسبوع (شرائح متعددة)
    memoDayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
      });
    });

    revDayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
      });
    });

    offDayBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
        if (typeof triggerHaptic === 'function') triggerHaptic(10);
      });
    });

    // تعبئة النموذج من الإعدادات المحفوظة
    function populateUnifiedPlanForm() {
      populateDropdowns();
      let profile = null;
      try {
        profile = JSON.parse(localStorage.getItem('tibyan_user_profile'));
      } catch (_) {}

      if (!profile) {
        profile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: 'khatim',
            value: 30,
            direction: AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas'
          },
          currentTarget: {
            surahId: 1,
            currentVerse: 0,
            page: 1,
            status: 'new'
          },
          schedule: {
            dailyNewAmount: 1,
            memoDays: [0, 1, 2, 3],
            revisionDays: [0, 1, 2, 3, 4],
            offDays: [5, 6],
            revisionCycleDays: AppState.totalCycleDays || 10,
            isManualOverride: false,
            manualReviewAmount: '1'
          }
        };
        const list = getSurahList();
        if (list.length && AppState.surahConfig && AppState.surahConfig.name) {
          const cleanName = AppState.surahConfig.name.replace(/^سورة\s+/, '').trim();
          const sFound = list.find(s => s.name === cleanName);
          if (sFound) {
            profile.currentTarget.surahId = sFound.id;
            profile.currentTarget.page = sFound.startPage || 1;
            profile.currentTarget.status = AppState.surahConfig.status || 'new';
            profile.currentTarget.currentVerse = AppState.surahConfig.currentVerse || 0;
          }
        }
      }

      // 1. رصيد المحفوظ
      if (memTypeSelect) memTypeSelect.value = profile.memorization.type || 'khatim';
      if (juzSelect && profile.memorization.type === 'juz') {
        juzSelect.value = String(profile.memorization.value || 10);
      }
      if (profile.memorization.type === 'juz_range' && profile.memorization.value) {
        if (rangeFromJuz) rangeFromJuz.value = String(profile.memorization.value.from || 1);
        if (rangeToJuz) rangeToJuz.value = String(profile.memorization.value.to || 30);
      }
      if (profile.memorization.type === 'surah_range' && profile.memorization.value) {
        if (rangeFrom) rangeFrom.value = String(profile.memorization.value.from || 1);
        if (rangeTo) rangeTo.value = String(profile.memorization.value.to || 114);
      }
      updateMemTypeVisibility();

      if (dirSelect) {
        dirSelect.value = profile.memorization.direction || (AppState.reverseMemorizationOrder ? 'nas_to_fatihah' : 'fatihah_to_nas');
      }

      // 2. السورة المستهدفة وحالتها
      if (targetSurah) targetSurah.value = String(profile.currentTarget.surahId || 1);
      if (statusSelect) statusSelect.value = profile.currentTarget.status || 'new';
      if (verseInput) {
        verseInput.value = (profile.currentTarget.currentVerse !== undefined)
          ? profile.currentTarget.currentVerse
          : ((AppState.surahConfig && AppState.surahConfig.currentVerse) || 0);
      }
      updateSurahStatusVisibility();

      // 3. المراجعة: دورة ختم المحفوظ بالأيام والحساب التلقائي واليدوي
      const savedCycleDays = parseInt((profile.schedule && profile.schedule.revisionCycleDays) || AppState.totalCycleDays || 10, 10);
      if (cycleDaysSelect) cycleDaysSelect.value = String(savedCycleDays);

      cycleChips.forEach(chip => {
        const d = parseInt(chip.dataset.days, 10);
        chip.classList.toggle('active', d === savedCycleDays);
      });

      isManualOverride = Boolean(profile.schedule && (profile.schedule.isManualOverride || profile.schedule.revisionMode === 'amount'));
      if (manualFieldsBox) manualFieldsBox.style.display = isManualOverride ? 'block' : 'none';
      if (btnToggleManual) btnToggleManual.style.display = isManualOverride ? 'none' : 'inline-flex';
      if (revAmountSelect && profile.schedule) {
        revAmountSelect.value = String(profile.schedule.manualReviewAmount || profile.schedule.revisionAmount || '1');
      }

      updateCalculatedReviewDisplay();

      // 4. الروتين اليومي
      if (dailyNewSelect && profile.schedule) {
        dailyNewSelect.value = String(profile.schedule.dailyNewAmount || 1);
      }

      // 5. أيام الأسبوع
      const mDays = (profile.schedule && profile.schedule.memoDays) || [0, 1, 2, 3];
      const rDays = (profile.schedule && profile.schedule.revisionDays) || [0, 1, 2, 3, 4];
      const oDays = (profile.schedule && profile.schedule.offDays) || [5, 6];

      memoDayBtns.forEach(btn => {
        const d = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', mDays.includes(d));
      });
      revDayBtns.forEach(btn => {
        const d = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', rDays.includes(d));
      });
      offDayBtns.forEach(btn => {
        const d = parseInt(btn.dataset.day, 10);
        btn.classList.toggle('active', oDays.includes(d));
      });
    }

    // حفظ النموذج وتطبيق التغييرات
    if (saveBtn) {
      saveBtn.onclick = () => {
        if (typeof triggerHaptic === 'function') triggerHaptic(25);
        const memType = memTypeSelect ? memTypeSelect.value : 'khatim';
        let memVal = 30;
        if (memType === 'juz') {
          memVal = parseInt(juzSelect ? juzSelect.value : 10, 10) || 10;
        } else if (memType === 'juz_range') {
          const fj = parseInt(rangeFromJuz ? rangeFromJuz.value : 1, 10) || 1;
          const tj = parseInt(rangeToJuz ? rangeToJuz.value : 30, 10) || 30;
          memVal = { from: Math.min(fj, tj), to: Math.max(fj, tj) };
        } else if (memType === 'surah_range') {
          const f = parseInt(rangeFrom ? rangeFrom.value : 1, 10) || 1;
          const t = parseInt(rangeTo ? rangeTo.value : 114, 10) || 114;
          memVal = { from: Math.min(f, t), to: Math.max(f, t) };
        } else if (memType === 'khatim') {
          memVal = 30;
        } else {
          memVal = 0;
        }

        const sId = targetSurah ? (parseInt(targetSurah.value, 10) || 1) : 1;
        const sStatus = statusSelect ? statusSelect.value : 'new';
        const sDir = dirSelect ? dirSelect.value : 'fatihah_to_nas';

        const list = getSurahList();
        const sObj = list.find(s => s.id === sId) || { id: sId, name: 'الفاتحة', verses: 7, startPage: 1 };

        let curVerse = 0;
        if (sStatus === 'memorizing') {
          curVerse = Math.min(sObj.verses, parseInt(verseInput ? verseInput.value : 0, 10) || 0);
        } else if (sStatus === 'ready_for_tathbeet') {
          curVerse = sObj.verses;
        }

        let calculatedPage = sObj.startPage || 1;
        if (typeof window.getAyahPageNumber === 'function' && curVerse > 0) {
          calculatedPage = window.getAyahPageNumber(sId, curVerse);
        }

        const memoDays = [];
        document.querySelectorAll('#unifMemoDaysGrid .unif-memo-day-btn.active').forEach(b => {
          memoDays.push(parseInt(b.dataset.day, 10));
        });

        const revDays = [];
        document.querySelectorAll('#unifRevisionDaysGrid .unif-rev-day-btn.active').forEach(b => {
          revDays.push(parseInt(b.dataset.day, 10));
        });

        const offDays = [];
        document.querySelectorAll('#unifOffDaysGrid .unif-off-day-btn.active').forEach(b => {
          offDays.push(parseInt(b.dataset.day, 10));
        });

        const chosenDays = parseInt(cycleDaysSelect ? cycleDaysSelect.value : 10, 10) || 10;
        const calcRes = calculateDailyReviewAmount(memType, chosenDays);

        const userProfile = {
          name: localStorage.getItem('tibyan_user_name') || 'يا حافظ القرآن',
          memorization: {
            type: memType,
            value: memVal,
            direction: sDir
          },
          currentTarget: {
            surahId: sId,
            page: calculatedPage,
            status: sStatus,
            currentVerse: curVerse
          },
          schedule: {
            dailyNewAmount: parseFloat(dailyNewSelect ? dailyNewSelect.value : 1) || 1,
            memoDays: memoDays.length ? memoDays : [0, 1, 2, 3],
            revisionDays: revDays.length ? revDays : [0, 1, 2, 3, 4],
            offDays: offDays.length ? offDays : [5, 6],
            activeDays: memoDays.length ? memoDays : [0, 1, 2, 3],
            revisionCycleDays: chosenDays,
            calculatedDailyReview: calcRes.amountLabel,
            isManualOverride: isManualOverride,
            manualReviewAmount: isManualOverride ? (revAmountSelect ? revAmountSelect.value : '1') : null,
            revisionMode: isManualOverride ? 'amount' : 'cycle',
            revisionAmount: isManualOverride ? (revAmountSelect ? revAmountSelect.value : '1') : 'auto'
          },
          completedAt: new Date().toISOString()
        };

        try {
          localStorage.setItem('tibyan_user_profile', JSON.stringify(userProfile));
          if (window.quranStorage && window.quranStorage.uid) {
            localStorage.setItem('tibyan_user_profile_' + window.quranStorage.uid, JSON.stringify(userProfile));
          }
          localStorage.setItem('tibyan_mushaf_page', String(calculatedPage));
          if (sStatus === 'ready_for_tathbeet') {
            localStorage.setItem('seraj_active_tathbeet_surah', sObj.name);
            localStorage.setItem('seraj_tathbeet_mode', 'true');
          } else {
            localStorage.removeItem('seraj_active_tathbeet_surah');
            localStorage.removeItem('seraj_tathbeet_mode');
          }
        } catch (e) {
          console.error(e);
        }

        if (typeof window.applyProfileToAppState === 'function') {
          window.applyProfileToAppState(userProfile);
        }

        showToast('تم حفظ الخطة وتحديث جدول المراجعة اليومية بنجاح 🌿');
        hideSettingsSubpages();
      };
    }

    window.populateUnifiedPlanForm = populateUnifiedPlanForm;
  }
  window.initUnifiedPlanSettings = initUnifiedPlanSettings;

  // تشغيل التهيئة تلقائياً عند تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUnifiedPlanSettings);
  } else {
    initUnifiedPlanSettings();
  }

})();
