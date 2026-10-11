const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');

// Function to update network status
const networkFunc = `
  function updateNetworkStatus() {
    const badge = document.getElementById('connectionStatusBadge');
    const textEl = document.getElementById('connectionStatusText');
    if (!badge || !textEl) return;

    const isOnline = navigator.onLine;
    if (isOnline) {
      badge.className = 'network-status-badge online';
      textEl.textContent = 'متصل بالإنترنت';
    } else {
      badge.className = 'network-status-badge offline';
      textEl.textContent = 'غير متصل (أوفلاين)';
    }
  }

  window.addEventListener('online', () => {
    updateNetworkStatus();
    showToast('تم إعادة الاتصال بالإنترنت');
  });

  window.addEventListener('offline', () => {
    updateNetworkStatus();
    showToast('أنت الآن في وضع عدم الاتصال (أوفلاين)');
  });
`;

// Insert networkFunc right before INITIALIZATION
appJs = appJs.replace('  // --- INITIALIZATION ---', networkFunc + '\n  // --- INITIALIZATION ---');

// Insert updateNetworkStatus() and click listener in DOMContentLoaded
const initCallOld = `  window.addEventListener('DOMContentLoaded', async () => {
    populateSurahSelectDropdown();`;

const initCallNew = `  window.addEventListener('DOMContentLoaded', async () => {
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
    }`;

appJs = appJs.replace(initCallOld, initCallNew);

fs.writeFileSync(appJsPath, appJs, 'utf8');
console.log('app.js updated with network status logic.');

// Bump sw.js
const swJsPath = path.join(__dirname, '..', 'sw.js');
let swJs = fs.readFileSync(swJsPath, 'utf8');
swJs = swJs.replace(/tibyan-quran-cache-v17/g, 'tibyan-quran-cache-v18');
fs.writeFileSync(swJsPath, swJs, 'utf8');
console.log('sw.js updated to v18.');
