const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, {
  url: "https://seraj.app",
  runScripts: "dangerously"
});
const window = dom.window;
const document = window.document;

// Setup profile
window.localStorage.setItem('tibyan_user_profile', JSON.stringify({
  name: 'سُمية',
  memorization: { type: 'surah_range', value: { from: 9, to: 114 }, direction: 'nas_to_fatihah' },
  currentTarget: { surahId: 8, page: 177, status: 'ready_for_tathbeet' },
  schedule: { dailyNewAmount: 1, activeDays: [0, 1, 2, 3], consolidationDay: 4, revisionCycleDays: 10 }
}));
window.localStorage.setItem('tibyan_user_name', 'سُمية');

// Load scripts in order
const qData = fs.readFileSync('js/quran-data.js', 'utf8');
window.eval(qData);
const appJs = fs.readFileSync('js/app.js', 'utf8');
window.eval(appJs);

console.log('App loaded without errors!');

// Test clicking settings nav button
const navSettingsBtn = document.querySelector('.nav-item-btn[data-tab="view-settings"]');
console.log('navSettingsBtn found:', !!navSettingsBtn);
navSettingsBtn.click();

const vs = document.getElementById('view-settings');
console.log('view-settings active?', vs.classList.contains('active'));
const smp = document.getElementById('settingsMainPanel');
console.log('settingsMainPanel hidden?', smp.hidden, 'display:', smp.style.display);

// Test clicking openUnifiedPlanSettingsBtn
const openUnifiedBtn = document.getElementById('openUnifiedPlanSettingsBtn');
console.log('openUnifiedBtn found:', !!openUnifiedBtn);
openUnifiedBtn.click();

const unifSub = document.getElementById('settingsUnifiedPlanSubpage');
console.log('unifiedSubpage hidden?', unifSub.hidden, 'display:', unifSub.style.display);
console.log('settingsMainPanel after opening subpage:', smp.hidden, smp.style.display);

// Test clicking back button
const backBtn = document.getElementById('backFromUnifiedPlanBtn');
console.log('backBtn found:', !!backBtn);
backBtn.click();
console.log('settingsMainPanel after back:', smp.hidden, smp.style.display);
