const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const vsIdx = html.indexOf('id="view-settings"');
const vsEnd = html.indexOf('</main>', vsIdx);
const lines = html.substring(vsIdx, vsEnd).split('\n');

let depth = 0;
lines.forEach((line, idx) => {
  const lineNum = html.substring(0, vsIdx).split('\n').length + idx;
  const opens = (line.match(/<div(\s|>)/gi) || []).length;
  const closes = (line.match(/<\/div>/gi) || []).length;
  depth += opens - closes;
  if (depth <= 0) {
    console.log(`Line ${lineNum}: depth=${depth} | ${line.trim()}`);
  }
});
console.log('Final depth at </main>:', depth);
