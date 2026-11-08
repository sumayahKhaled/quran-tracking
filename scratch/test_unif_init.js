const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
const document = window.document;

// Mock localStorage
const mockStorage = {
  'tibyan_user_profile': JSON.stringify({
    name: 'سُمية',
    memorization: { type: 'surah_range', value: { from: 9, to: 114 }, direction: 'nas_to_fatihah' },
    currentTarget: { surahId: 8, page: 177, status: 'ready_for_tathbeet' },
    schedule: { dailyNewAmount: 1, activeDays: [0, 1, 2, 3], consolidationDay: 4, revisionCycleDays: 10 }
  }),
  'tibyan_user_name': 'سُمية'
};

window.localStorage = {
  getItem: (k) => mockStorage[k] || null,
  setItem: (k, v) => { mockStorage[k] = v; }
};

window.AppState = {
  surahConfig: { name: 'الأنفال', totalVerses: 75, currentVerse: 75, status: 'ready_for_tathbeet' },
  reverseMemorizationOrder: true,
  totalCycleDays: 10
};

// Load quran-data.js
const qData = fs.readFileSync('js/quran-data.js', 'utf8');
window.eval(qData);

// Now test initUnifiedPlanSettings logic
try {
  // Extract function from app.js
  const appJs = fs.readFileSync('js/app.js', 'utf8');
  const start = appJs.indexOf('function initUnifiedPlanSettings()');
  const end = appJs.indexOf('// --- UNIFIED PLAN END ---');
  console.log('initUnifiedPlanSettings found?', start !== -1);
} catch (e) {
  console.error('Error:', e);
}
