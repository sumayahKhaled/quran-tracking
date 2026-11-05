const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');

const target = '.word-mask-rect.revealed {\r\n  fill: transparent !important;\r\n  stroke: transparent !important;\r\n  pointer-events: none !important;\r\n  opacity: 0 !important;\r\n}';
const addition = `\r\n\r\n/* ===================================================\r\n   QCF V1 (1405 AH) 15-LINES DIGITAL LAYOUT & BLIND RECITATION\r\n   =================================================== */\r\n\r\n.qcf-page-container {\r\n  position: absolute;\r\n  top: 0;\r\n  left: 0;\r\n  width: 100%;\r\n  height: 100%;\r\n  display: flex;\r\n  flex-direction: column;\r\n  justify-content: space-between;\r\n  box-sizing: border-box;\r\n  padding: 5.6% 7.8% 5.2% 7.8%;\r\n  direction: rtl;\r\n  user-select: none;\r\n  z-index: 6;\r\n  opacity: 0;\r\n  pointer-events: none;\r\n  transition: opacity 0.25s ease;\r\n}\r\n\r\n.qcf-mode-active .qcf-page-container {\r\n  opacity: 1;\r\n  pointer-events: auto;\r\n}\r\n\r\n.qcf-line {\r\n  display: flex;\r\n  flex-direction: row;\r\n  justify-content: space-between;\r\n  align-items: center;\r\n  width: 100%;\r\n  height: calc(100% / 15);\r\n  line-height: 1;\r\n  text-align: justify;\r\n  text-align-last: justify;\r\n  box-sizing: border-box;\r\n  overflow: visible;\r\n}\r\n\r\n.qcf-line.qcf-line-center {\r\n  justify-content: center;\r\n  gap: 12px;\r\n}\r\n\r\n.qcf-surah-header-line {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 100%;\r\n  height: calc(100% / 15);\r\n  box-sizing: border-box;\r\n  padding: 2px 0;\r\n}\r\n\r\n.qcf-surah-header-frame {\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  width: 96%;\r\n  height: 86%;\r\n  border: 1.5px solid #b5893a;\r\n  border-radius: 4px;\r\n  background: rgba(212, 160, 23, 0.08);\r\n  color: #14532d;\r\n  font-weight: bold;\r\n  font-size: clamp(0.75rem, 2.4vw, 1.15rem);\r\n}\r\n\r\n.qcf-word {\r\n  display: inline-flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n  position: relative;\r\n  cursor: pointer;\r\n  white-space: nowrap;\r\n  font-size: clamp(1.1rem, 3.8vw, 1.95rem);\r\n  color: #111827;\r\n  transition: opacity 0.2s ease, background-color 0.2s ease;\r\n  line-height: 1;\r\n  padding: 0 1px;\r\n}\r\n\r\n[data-theme="dark"] .qcf-word {\r\n  color: #f3f4f6;\r\n}\r\n\r\n.qcf-word.qcf-ayah-end {\r\n  font-size: clamp(0.95rem, 3.4vw, 1.7rem);\r\n  color: #b5893a;\r\n  margin: 0 2px;\r\n}\r\n\r\n/* وضع الإخفاء التام بالكلمات (Blind Mode Word-by-Word) */\r\n.mask-mode-active .qcf-word:not(.revealed):not(.qcf-unmasked) {\r\n  opacity: 0 !important;\r\n  pointer-events: auto;\r\n}\r\n\r\n.mask-mode-active .qcf-word.revealed,\r\n.mask-mode-active .qcf-word.qcf-unmasked {\r\n  opacity: 1 !important;\r\n}\r\n\r\n.mask-mode-active .qcf-word.current-recite-word {\r\n  opacity: 0 !important;\r\n}\r\n\r\n.qcf-word.word-error {\r\n  opacity: 1 !important;\r\n  border-bottom: 2.5px solid #ef4444 !important;\r\n  background: rgba(239, 68, 68, 0.12) !important;\r\n  border-radius: 3px !important;\r\n}\r\n\r\n.qcf-word.active-selection {\r\n  background: rgba(212, 160, 23, 0.2) !important;\r\n  border-radius: 3px;\r\n}`;

if (css.includes(target)) {
  css = css.replace(target, target + addition);
  fs.writeFileSync('css/style.css', css, 'utf8');
  console.log('CSS updated successfully');
} else {
  // Try LF variant
  const targetLF = target.replace(/\r\n/g, '\n');
  if (css.includes(targetLF)) {
    css = css.replace(targetLF, targetLF + addition.replace(/\r\n/g, '\n'));
    fs.writeFileSync('css/style.css', css, 'utf8');
    console.log('CSS updated successfully (LF)');
  } else {
    console.error('Target not found');
  }
}

