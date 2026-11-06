const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');

// 1. Drawer blind button styling
const drawerPageStyle = '.drawer-surah-page {';
const drawerBtnCss = `.drawer-surah-blind-btn {
  background: transparent;
  border: none;
  outline: none;
  padding: 6px;
  border-radius: var(--radius-xs);
  color: var(--accent-gold-dark, #b5893a);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.drawer-surah-blind-btn:hover {
  background: var(--accent-gold-subtle, rgba(212, 160, 23, 0.12));
  color: var(--primary, #0f3d2e);
  transform: scale(1.1);
}

.drawer-surah-blind-btn.active {
  background: rgba(225, 29, 72, 0.12);
  color: #e11d48;
}

`;

if (!css.includes('drawer-surah-blind-btn')) {
  css = css.replace(drawerPageStyle, drawerBtnCss + drawerPageStyle);
}

// 2. Continuous Verse Highlighting
const oldHighlightBlock = `.qcf-word.selected-ayah-word {
  background-color: rgba(212, 160, 23, 0.18) !important;
  border-radius: 3px;
}

.qcf-word.reciting-ayah-word {
  background-color: rgba(13, 148, 136, 0.18) !important;
  border-radius: 3px;
}`;

const newHighlightBlock = `/* توحيد تظليل وتحديد الآية (Continuous Verse Highlighting) */
.ayah-container {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 4px;
  border-radius: 6px;
  transition: background-color 0.2s ease;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.ayah-container.active-verse-container {
  background-color: rgba(212, 160, 23, 0.16) !important;
}

.ayah-container.reciting-verse-container {
  background-color: rgba(13, 148, 136, 0.16) !important;
}

/* إلغاء التظليل المربع الفردي على الكلمات المفردة لمنع تقطيع التظليل */
.qcf-word.selected-ayah-word,
.qcf-word.reciting-ayah-word {
  background-color: transparent !important;
  border-radius: 0;
}`;

if (css.includes(oldHighlightBlock)) {
  css = css.replace(oldHighlightBlock, newHighlightBlock);
  fs.writeFileSync('css/style.css', css, 'utf8');
  console.log('Successfully updated css/style.css');
} else {
  console.error('Could not find oldHighlightBlock in css/style.css');
}
