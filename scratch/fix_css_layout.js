const fs = require('fs');
let css = fs.readFileSync('css/style.css', 'utf8');

const oldQcfLine = `.qcf-line {
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
}`;

const newQcfLine = `.qcf-line {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: calc(100% / 15);
  box-sizing: border-box;
  overflow: visible;
  line-height: 1;
  word-spacing: normal;
  text-align: center;
  text-align-last: center;
  gap: clamp(4px, 1.2vw, 10px);
}

.qcf-line.qcf-line-center {
  justify-content: center !important;
  text-align: center !important;
  text-align-last: center !important;
  gap: 12px;
}`;

const oldWordError = `.qcf-word.word-error {
  opacity: 1 !important;
  border-bottom: 2.5px solid #ef4444 !important;
  background: rgba(239, 68, 68, 0.14) !important;
  border-radius: 3px !important;
}`;

const newWordError = `.qcf-word.word-error {
  opacity: 1 !important;
  border-bottom: 2.5px solid #e53e3e !important;
  text-decoration: underline #e53e3e 2px !important;
  text-underline-offset: 4px !important;
  background: rgba(229, 62, 62, 0.16) !important;
  border-radius: 3px !important;
}`;

const oldNorm = oldQcfLine.replace(/\r\n/g, '\n');
const cssNorm = css.replace(/\r\n/g, '\n');

if (cssNorm.includes(oldNorm)) {
  css = cssNorm.replace(oldNorm, newQcfLine.replace(/\r\n/g, '\n'));
  console.log('Replaced qcf-line');
} else {
  console.warn('oldQcfLine not found directly');
}

const oldErrNorm = oldWordError.replace(/\r\n/g, '\n');
if (css.includes(oldErrNorm)) {
  css = css.replace(oldErrNorm, newWordError.replace(/\r\n/g, '\n'));
  console.log('Replaced word-error');
} else {
  console.warn('oldWordError not found directly');
}

fs.writeFileSync('css/style.css', css, 'utf8');
console.log('Finished updating style.css');

