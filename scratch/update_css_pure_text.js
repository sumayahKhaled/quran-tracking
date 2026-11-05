const fs = require('fs');

let css = fs.readFileSync('css/style.css', 'utf8');

// Hide raster images completely and overlay polygons, prioritize pure digital text
const target1 = `.mushaf-image-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}`;

// Also check with \r\n
const target1CRLF = `.mushaf-image-container {\r\n  position: absolute;\r\n  top: 0;\r\n  left: 0;\r\n  width: 100%;\r\n  height: 100%;\r\n  display: flex;\r\n  align-items: center;\r\n  justify-content: center;\r\n}`;

const replacement1 = `/* إخفاء طبقة الصور تماماً - المصحف رقمي نصي حقيقي 100% بالخطوط العثمانية */
.mushaf-image-container {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.mushaf-overlay-svg {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}`;

if (css.includes(target1CRLF)) {
  css = css.replace(target1CRLF, replacement1);
  console.log('Replaced target1CRLF');
} else if (css.includes(target1)) {
  css = css.replace(target1, replacement1);
  console.log('Replaced target1');
} else {
  console.warn('target1 not found');
}

// Now replace QCF section with comprehensive styling matching QUL layout
const qcfSectionStart = '/* ===================================================\r\n   QCF V1 (1405 AH) 15-LINES DIGITAL LAYOUT & BLIND RECITATION';
const qcfSectionStartLF = '/* ===================================================\n   QCF V1 (1405 AH) 15-LINES DIGITAL LAYOUT & BLIND RECITATION';

const newQcfSection = `/* ===================================================
   QCF V1 (1405 AH) 15-LINES PURE TEXT MUSHAF (TARTEEL QUL LAYOUT)
   =================================================== */

/* خطوط العناوين والرموز القرآنية المرجعية من ترتيل */
@font-face {
  font-family: 'surah-header';
  src: url('https://static-cdn.tarteel.ai/qul/fonts/surah-names/surah-header/QCF_SurahHeader_COLOR-Regular.woff2?v=3.4') format('woff2');
  font-display: swap;
}

@font-face {
  font-family: 'surah-name-v4';
  src: url('https://static-cdn.tarteel.ai/qul/fonts/surah-names/v4/surah-name-v4.woff2?v=3.4') format('woff2');
  font-display: swap;
}

@font-face {
  font-family: 'quran-common';
  src: url('https://static-cdn.tarteel.ai/qul/fonts/common/quran-common.woff2?v=3.4') format('woff2');
  font-display: swap;
}

/* حاوية صفحة المصحف النصية الكاملة */
.qcf-page-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex !important;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
  padding: 4.8% 7% 4.4% 7%;
  direction: rtl;
  user-select: none;
  z-index: 10;
  opacity: 1 !important;
  pointer-events: auto;
  background-color: var(--mushaf-paper, #fff);
  box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.02);
  transition: background-color 0.25s ease;
}

[data-theme="dark"] .qcf-page-container {
  background-color: #1a1e24;
}

/* الأسطر الخمسة عشر - 15 سطراً متطابقة تماماً مع طبعة 1405هـ */
.qcf-line {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: calc(100% / 15);
  box-sizing: border-box;
  overflow: visible;
  line-height: 1;
  text-align: justify;
  text-align-last: justify;
}

.qcf-line.qcf-line-center {
  justify-content: center !important;
  text-align: center !important;
  text-align-last: center !important;
  gap: 12px;
}

/* تصميم برواز السورة الكلاسيكي الملكي المطابق للمصحف */
.qcf-surah-header-line {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(100% / 15);
  box-sizing: border-box;
  padding: 2px 0;
  position: relative;
}

.qcf-surah-header-box {
  position: relative;
  width: 100%;
  height: 94%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.8px solid #b5893a;
  border-radius: 6px;
  background: linear-gradient(180deg, #fdfbf7 0%, #f7f0e1 50%, #fdfbf7 100%);
  box-shadow: 0 1px 3px rgba(181, 137, 58, 0.15), inset 0 0 0 1px rgba(181, 137, 58, 0.3);
  color: #14532d;
  overflow: hidden;
}

[data-theme="dark"] .qcf-surah-header-box {
  background: linear-gradient(180deg, #252b33 0%, #1c2127 50%, #252b33 100%);
  border-color: #93712b;
  color: #86efac;
}

.qcf-surah-header-box::before,
.qcf-surah-header-box::after {
  content: "۞";
  position: absolute;
  font-size: clamp(0.9rem, 2.8vw, 1.35rem);
  color: #b5893a;
  opacity: 0.85;
}

.qcf-surah-header-box::before {
  right: 12px;
}

.qcf-surah-header-box::after {
  left: 12px;
}

.qcf-surah-title-text {
  font-family: 'surah-name-v4', 'IBM Plex Sans Arabic', serif;
  font-size: clamp(1rem, 3.2vw, 1.45rem);
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #14532d;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

[data-theme="dark"] .qcf-surah-title-text {
  color: #86efac;
}

/* سطر البسملة */
.qcf-bismillah-line {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: calc(100% / 15);
  font-family: 'quran-common', 'p1-v1', serif;
  font-size: clamp(1.15rem, 3.8vw, 1.95rem);
  color: #14532d;
}

[data-theme="dark"] .qcf-bismillah-line {
  color: #86efac;
}

/* الكلمات القرآنية النصية بنقاء 100% */
.qcf-word {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: pointer;
  white-space: nowrap;
  font-size: clamp(1.18rem, 3.85vw, 2.05rem);
  color: #0f172a;
  transition: opacity 0.2s ease, background-color 0.2s ease, color 0.2s ease;
  line-height: 1;
  padding: 0 1px;
}

[data-theme="dark"] .qcf-word {
  color: #f1f5f9;
}

/* رقم وفصل الآية المنقوش في الخط */
.qcf-word.qcf-ayah-end {
  font-size: clamp(1rem, 3.5vw, 1.75rem);
  color: #b5893a;
  margin: 0 2px;
}

/* تظليل الآية المحددة أو قيد القراءة بلون ذهبي هادئ */
.qcf-word.selected-ayah-word {
  background-color: rgba(212, 160, 23, 0.18) !important;
  border-radius: 3px;
}

.qcf-word.reciting-ayah-word {
  background-color: rgba(13, 148, 136, 0.18) !important;
  border-radius: 3px;
}

/* وضع الإخفاء التام والتسميع التفاعلي (Blind Mode Word-by-Word) */
.mask-mode-active .qcf-word:not(.revealed):not(.qcf-unmasked) {
  opacity: 0 !important;
  pointer-events: auto;
}

.mask-mode-active .qcf-word.revealed,
.mask-mode-active .qcf-word.qcf-unmasked {
  opacity: 1 !important;
}

/* الكلمة المنتظرة حالياً في التسميع الصوتي */
.mask-mode-active .qcf-word.current-recite-word {
  opacity: 0 !important;
}

/* تسجيل موضع الخطأ / التعثر بخط أحمر تحتي وتمييز */
.qcf-word.word-error {
  opacity: 1 !important;
  border-bottom: 2.5px solid #ef4444 !important;
  background: rgba(239, 68, 68, 0.14) !important;
  border-radius: 3px !important;
}
`;

const idxStart = css.indexOf(qcfSectionStart);
if (idxStart !== -1) {
  css = css.substring(0, idxStart) + newQcfSection;
  console.log('Replaced QCF section (CRLF)');
} else {
  const idxStartLF = css.indexOf(qcfSectionStartLF);
  if (idxStartLF !== -1) {
    css = css.substring(0, idxStartLF) + newQcfSection;
    console.log('Replaced QCF section (LF)');
  } else {
    css += '\n\n' + newQcfSection;
    console.log('Appended QCF section');
  }
}

fs.writeFileSync('css/style.css', css, 'utf8');
console.log('Updated css/style.css successfully');

