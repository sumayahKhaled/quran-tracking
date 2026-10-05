const fs = require('fs');
const { JSDOM } = require('jsdom');

async function run() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="docSnapshotModal"></div><img id="docSnapshotImg"/></body></html>', {
    url: "http://localhost/",
    runScripts: "dangerously"
  });
  
  const window = dom.window;
  const document = window.document;
  
  // mock variables
  window.triggerHaptic = () => {};
  window.showToast = console.log;
  window.fmtDate = (d) => d;
  window.getTodayDateString = () => '2026-10-05';
  window.esc = (s) => s;
  window.AppState = { surahConfig: { name: 'Test', currentVerse: 10, totalVerses: 20 }, activeCycleDay: 1, tenDaySchedule: [] };
  window.getCurrentDailyLog = () => ({});
  window.getSelectedDayRoutine = () => 'test';
  window.calcDailyMilestone = () => ({ percent: 50 });
  
  // load app.js
  const code = fs.readFileSync('js/app.js', 'utf8');
  
  try {
    const script = new window.Function(code);
    script();
    console.log("App.js parsed and ran successfully.");
  } catch (e) {
    console.error("Error evaluating app.js:", e);
  }
}

run();
