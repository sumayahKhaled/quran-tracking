const fs = require('fs');

const indexPath = 'c:/Users/Byte/Desktop/quran-tracking/index.html';
const appPath = 'c:/Users/Byte/Desktop/quran-tracking/js/app.js';

let indexHtml = fs.readFileSync(indexPath, 'utf8');
let appJs = fs.readFileSync(appPath, 'utf8');

// 1. Replace "حفظ فوري" with Settings button in index.html
indexHtml = indexHtml.replace(/<span[^>]*>حفظ فوري<\/span>/, 
    `<button id="openScheduleSettingsBtn" type="button" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);" title="إعدادات الجدول">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
    </button>`);

// 2. Remove the old days input row inside body
indexHtml = indexHtml.replace(/<!-- خيار تحديد عدد أيام المراجعة حقل رقمي -->\s*<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;background:var\(--bg-subtle\);.*?<\/div>/s, '');

// 3. Add settings modal to the end of body
const settingsModalHtml = `
    <!-- Settings Modal -->
    <div id="scheduleSettingsModal" class="modal-overlay" hidden>
        <div class="modal-card" style="max-width:400px; width:90%;">
            <div class="modal-header">
                <h3>إعدادات جدول المراجعة</h3>
                <button type="button" class="btn-close-modal" id="closeScheduleSettingsBtn">×</button>
            </div>
            <div class="modal-body" style="padding:15px;">
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:8px;font-weight:600;color:var(--text-main);">عدد أيام دورة المراجعة:</label>
                    <input type="number" id="reviewDaysCountInputModal" min="1" max="365" value="10" class="field-input" style="width:100%;text-align:center;" />
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:8px;font-weight:600;color:var(--text-main);">نظام مسار المراجعة:</label>
                    <select id="reviewPathTypeSelect" class="field-input" style="width:100%;">
                        <option value="split">مراجعة قريبة وبعيدة (مسارين)</option>
                        <option value="continuous">مراجعة متصلة (مسار واحد)</option>
                    </select>
                </div>
                <button type="button" id="applyScheduleSettingsBtn" class="btn-primary" style="width:100%;font-weight:bold;padding:10px;">حفظ الإعدادات</button>
            </div>
        </div>
    </div>
`;
indexHtml = indexHtml.replace('</body>', settingsModalHtml + '\n</body>');


// 4. Update app.js
// State
appJs = appJs.replace(/totalCycleDays: 10, \/\/ Default 10 days/, `totalCycleDays: 10, \/\/ Default 10 days\n    reviewPathType: 'split',`);
appJs = appJs.replace(/urgentExamPlan: AppState.urgentExamPlan/, `urgentExamPlan: AppState.urgentExamPlan,\n      reviewPathType: AppState.reviewPathType`);
appJs = appJs.replace(/if \(savedState\) {/, `if (savedState) {\n          if (savedState.reviewPathType) AppState.reviewPathType = savedState.reviewPathType;`);

// Add listeners for Settings Modal in DOMContentLoaded
const settingsListener = `
  const settingsBtn = document.getElementById('openScheduleSettingsBtn');
  const settingsModal = document.getElementById('scheduleSettingsModal');
  const closeSettingsBtn = document.getElementById('closeScheduleSettingsBtn');
  const applySettingsBtn = document.getElementById('applyScheduleSettingsBtn');
  
  if (settingsBtn) {
      settingsBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // prevent accordion from toggling
          document.getElementById('reviewDaysCountInputModal').value = getCycleDaysCount();
          document.getElementById('reviewPathTypeSelect').value = AppState.reviewPathType || 'split';
          settingsModal.hidden = false;
      });
  }
  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', () => settingsModal.hidden = true);
  if (applySettingsBtn) {
      applySettingsBtn.addEventListener('click', () => {
          triggerHaptic(20);
          const newDays = parseInt(document.getElementById('reviewDaysCountInputModal').value) || 10;
          AppState.reviewPathType = document.getElementById('reviewPathTypeSelect').value;
          updateCycleDaysCount(newDays, false);
          persistState();
          
          // Re-render the cycle schedule table view
          renderTenDayScheduleTable();
          renderDailyChecklist();
          settingsModal.hidden = true;
          showToast('تم حفظ إعدادات دورة المراجعة بنجاح');
      });
  }
`;
appJs = appJs.replace(/(function setupEventListeners\(\) \{)/, `$1\n${settingsListener}\n`);

// Remove old days update logic
appJs = appJs.replace(/const inputEl = document\.getElementById\('reviewDaysCountInput'\);.*?if \(titleEl\)/s, 'const titleEl = document.getElementById(\'scheduleCycleTitle\');\n    if (titleEl)');
appJs = appJs.replace(/const daysInput = document\.getElementById\('reviewDaysCountInput'\);.*?persistState\(\);/s, 'persistState();');

// Update renderTenDayScheduleTable logic for reviewPathType
const tableRenderRegex = /<div class="inputs-grid-portions">.*?<\/div>\s*<\/div>/s;
const tableRenderReplacement = `
        <div class="inputs-grid-portions">
          \${AppState.reviewPathType === 'continuous' ? \`
          <div class="portion-field-col" style="grid-column: 1 / -1;">
            <label style="color:var(--text-main);font-weight:600;">المراجعة المتصلة:</label>
            <input type="text" class="continuous-input" data-day="\${item.day}" value="\${item.continuousReview || item.nearReview || ''}" placeholder="السور أو الأجزاء..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-light);background:#fff;" />
          </div>
          \` : \`
          <div class="portion-field-col">
            <label style="color:var(--text-main);font-weight:600;">المراجعة القريبة:</label>
            <input type="text" class="near-input" data-day="\${item.day}" value="\${item.nearReview || ''}" placeholder="السور أو الأوجه..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-light);background:#fff;" />
          </div>
          <div class="portion-field-col">
            <label style="color:var(--text-main);font-weight:600;">المراجعة البعيدة:</label>
            <input type="text" class="distant-input" data-day="\${item.day}" value="\${item.distantReview || ''}" placeholder="السور أو الأجزاء..." style="width:100%;padding:8px;border-radius:6px;border:1px solid var(--border-light);background:#fff;" />
          </div>
          \`}
        </div>
`;
appJs = appJs.replace(tableRenderRegex, tableRenderReplacement);

// Update event listeners in renderTenDayScheduleTable
const tableListenersRegex = /const nearInput = card\.querySelector\('\.near-input'\);.*?\}\);/s;
const tableListenersReplacement = `
      const nearInput = card.querySelector('.near-input');
      if (nearInput) {
        nearInput.addEventListener('change', (e) => {
          item.nearReview = e.target.value.trim();
          persistState();
          renderDailyChecklist();
        });
      }

      const distantInput = card.querySelector('.distant-input');
      if (distantInput) {
        distantInput.addEventListener('change', (e) => {
          item.distantReview = e.target.value.trim();
          persistState();
          renderDailyChecklist();
        });
      }

      const continuousInput = card.querySelector('.continuous-input');
      if (continuousInput) {
        continuousInput.addEventListener('change', (e) => {
          item.continuousReview = e.target.value.trim();
          item.nearReview = e.target.value.trim(); // sync fallback
          persistState();
          renderDailyChecklist();
        });
      }
`;
appJs = appJs.replace(tableListenersRegex, tableListenersReplacement);

// Fix cycle schedule saving inside saveCycleSchedule()
appJs = appJs.replace(/const nearInput = card\.querySelector\('\.near-input'\);\s*const distantInput = card\.querySelector\('\.distant-input'\);/g, 
`const nearInput = card.querySelector('.near-input');
      const distantInput = card.querySelector('.distant-input');
      const continuousInput = card.querySelector('.continuous-input');`);
appJs = appJs.replace(/if \(distantInput\) AppState\.tenDaySchedule\[index\]\.distantReview = distantInput\.value\.trim\(\);/g, 
`if (distantInput) AppState.tenDaySchedule[index].distantReview = distantInput.value.trim();
        if (continuousInput) {
            AppState.tenDaySchedule[index].continuousReview = continuousInput.value.trim();
            AppState.tenDaySchedule[index].nearReview = continuousInput.value.trim(); // Sync
        }`);


fs.writeFileSync(indexPath, indexHtml);
fs.writeFileSync(appPath, appJs);
console.log('Done!');
