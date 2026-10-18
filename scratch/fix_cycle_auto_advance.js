const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// 1. Add cycleAnchor to AppState
appJs = appJs.replace(
  "activeCycleDay: 1, // 1 to totalCycleDays",
  "activeCycleDay: 1, // 1 to totalCycleDays\n    cycleAnchor: null,"
);

// 2. getCycleDayForDate definition
const getCycleDayFunc = `
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
        const yStr = \`\${yDate.getFullYear()}-\${String(yDate.getMonth() + 1).padStart(2, '0')}-\${String(yDate.getDate()).padStart(2, '0')}\`;
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
        const curStr = \`\${curY}-\${curM}-\${curD}\`;

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
        const curStr = \`\${curY}-\${curM}-\${curD}\`;

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
`;

// Insert getCycleDayFunc before getCurrentDailyLog
appJs = appJs.replace(
  "  // Get active log for current selected date\n  function getCurrentDailyLog() {",
  getCycleDayFunc + "\n  // Get active log for current selected date\n  function getCurrentDailyLog() {"
);

// 3. Update getCurrentDailyLog to initialize log with getCycleDayForDate(date)
appJs = appJs.replace(
  "AppState.dailyLogs[date] = createEmptyDailyLog(AppState.activeCycleDay);",
  "AppState.dailyLogs[date] = createEmptyDailyLog(getCycleDayForDate(date));"
);

// 4. Update persistState to include cycleAnchor
appJs = appJs.replace(
  "activeCycleDay: AppState.activeCycleDay,",
  "activeCycleDay: AppState.activeCycleDay,\n      cycleAnchor: AppState.cycleAnchor,"
);

// 5. Update resetState to reset cycleAnchor
appJs = appJs.replace(
  "AppState.activeCycleDay = 1;",
  "AppState.activeCycleDay = 1;\n    AppState.cycleAnchor = null;"
);

// 6. Update applyPayload to load cycleAnchor
appJs = appJs.replace(
  "if (p.activeCycleDay) AppState.activeCycleDay = p.activeCycleDay;",
  "if (p.activeCycleDay) AppState.activeCycleDay = p.activeCycleDay;\n    if (p.cycleAnchor) AppState.cycleAnchor = p.cycleAnchor;"
);

// 7. Update renderDailyChecklist to use getCycleDayForDate
const oldChecklistCycle = `    // قسم المراجعة الدورية
    const totalDays = getCycleDaysCount();
    const activeCycleNum = Math.min(AppState.activeCycleDay || 1, totalDays);
    AppState.activeCycleDay = activeCycleNum;`;

const newChecklistCycle = `    // قسم المراجعة الدورية
    const totalDays = getCycleDaysCount();
    const activeCycleNum = getCycleDayForDate(AppState.selectedDate);
    AppState.activeCycleDay = activeCycleNum;
    if (log) log.cycleDay = activeCycleNum;`;

appJs = appJs.replace(oldChecklistCycle, newChecklistCycle);

// 8. Update set-active-day-btn click listener
const oldSetActive = `      card.querySelector('.set-active-day-btn').addEventListener('click', () => {
        triggerHaptic(20);
        AppState.activeCycleDay = item.day;
        const currentLog = getCurrentDailyLog();
        currentLog.cycleDay = item.day;
        persistState();
        renderAll();
        showToast(\`تم تعيين اليوم \${item.day} كيوم المراجعة النشط\`);
      });`;

const newSetActive = `      card.querySelector('.set-active-day-btn').addEventListener('click', () => {
        triggerHaptic(20);
        AppState.activeCycleDay = item.day;
        const currentLog = getCurrentDailyLog();
        currentLog.cycleDay = item.day;
        AppState.cycleAnchor = { date: AppState.selectedDate, cycleDay: item.day };
        persistState();
        renderAll();
        showToast(\`تم تعيين اليوم \${item.day} كيوم المراجعة النشط\`);
      });`;

appJs = appJs.replace(oldSetActive, newSetActive);

// 9. Update advanceCycleDayBtn click listener
const oldAdvance = `    const advanceCycleDayBtn = document.getElementById('advanceCycleDayBtn');
    if (advanceCycleDayBtn) {
      advanceCycleDayBtn.addEventListener('click', () => {
        triggerHaptic(20);
        const totalDays = getCycleDaysCount();
        AppState.activeCycleDay = (AppState.activeCycleDay % totalDays) + 1;
        const log = getCurrentDailyLog();
        log.cycleDay = AppState.activeCycleDay;
        persistState();
        renderAll();
        showToast(\`تم الانتقال إلى اليوم \${AppState.activeCycleDay} في دورة المراجعة\`);
      });
    }`;

const newAdvance = `    const advanceCycleDayBtn = document.getElementById('advanceCycleDayBtn');
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
        showToast(\`تم الانتقال إلى اليوم \${nextDay} في دورة المراجعة\`);
      });
    }`;

appJs = appJs.replace(oldAdvance, newAdvance);

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('app.js updated with automatic review cycle progression.');

// Bump sw.js to v20
const swJsPath = path.join(__dirname, '..', 'sw.js');
let swJs = fs.readFileSync(swJsPath, 'utf8');
swJs = swJs.replace(/tibyan-quran-cache-v19/g, 'tibyan-quran-cache-v20');
fs.writeFileSync(swJsPath, swJs, 'utf8');
console.log('sw.js updated to v20.');
