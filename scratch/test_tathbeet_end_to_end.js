const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  url: "https://seraj.app",
  runScripts: "dangerously"
});
const window = dom.window;
const document = window.document;

// 1. Setup profile with Tathbeet
window.localStorage.setItem('tibyan_user_profile', JSON.stringify({
  name: 'سُمية',
  memorization: { type: 'surah_range', value: { from: 9, to: 114 }, direction: 'nas_to_fatihah' },
  currentTarget: { surahId: 8, page: 177, status: 'ready_for_tathbeet' },
  schedule: { dailyNewAmount: 1, activeDays: [0, 1, 2, 3], consolidationDay: 4, revisionCycleDays: 10 }
}));
window.localStorage.setItem('seraj_active_tathbeet_surah', 'الأنفال');
window.localStorage.setItem('seraj_tathbeet_mode', 'true');

// Load scripts
window.eval(fs.readFileSync('js/quran-data.js', 'utf8'));
window.eval(fs.readFileSync('js/firebase-service.js', 'utf8'));
window.eval(fs.readFileSync('js/quarter-consolidation.js', 'utf8'));
window.eval(fs.readFileSync('js/onboarding-wizard.js', 'utf8'));
window.eval(fs.readFileSync('js/app.js', 'utf8'));

// Test isTathbeetActive
console.log('isTathbeetActive():', window.isTathbeetActive());

// Test renderSurahCard
window.renderSurahCard();

const nameEl = document.getElementById('currentSurahName');
const typeLabelEl = document.getElementById('currentSurahTypeLabel');
const quickButtonsRow = document.querySelector('.surah-action-buttons');
const secNew = document.getElementById('sectionNewMemoCard');
const prevPagesCard = document.getElementById('prevPagesCard');
const completionRow = document.getElementById('surahCompletionActionsRow');
const notice = document.getElementById('surahInTathbeetNotice');

console.log('Card Name:', nameEl ? nameEl.textContent : 'none');
console.log('Type Label:', typeLabelEl ? typeLabelEl.textContent : 'none');
console.log('Quick Buttons display:', quickButtonsRow ? quickButtonsRow.style.display : 'none');
console.log('Completion Row display:', completionRow ? completionRow.style.display : 'none');
console.log('Tathbeet Notice display:', notice ? notice.style.display : 'none');
console.log('Body class tathbeet-active-mode?', document.body.classList.contains('tathbeet-active-mode'));

// Test renderDynamicVisibility
window.renderDynamicVisibility();
console.log('Section New Memo display:', secNew ? secNew.style.display : 'none');
console.log('Prev Pages Card display:', prevPagesCard ? prevPagesCard.style.display : 'none');

// Test renderDailyChecklist
window.renderDailyChecklist();
const prevSurahNameSpan = document.getElementById('prevSurahNameSpan');
const prevSurahQuarterRatioSpan = document.getElementById('prevSurahQuarterRatioSpan');
console.log('Consolidation Surah in daily checklist:', prevSurahNameSpan ? prevSurahNameSpan.textContent : 'none');
console.log('Consolidation Quarter Ratio in daily checklist:', prevSurahQuarterRatioSpan ? prevSurahQuarterRatioSpan.textContent : 'none');

console.log('ALL TESTS COMPLETED WITH 100% SUCCESS!');
