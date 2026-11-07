const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');
const vsIdx = c.indexOf('id="view-settings"');
const smpIdx = c.indexOf('id="settingsMainPanel"');

console.log('view-settings:', vsIdx);
console.log('settingsMainPanel:', smpIdx);

// Count tags inside settingsMainPanel
// settingsMainPanel starts with <div id="settingsMainPanel"...>
// Let us trace tag by tag
let depth = 0;
let pos = smpIdx;
const tagRegex = /<\/?([a-z0-9]+)[\s>]/gi;
tagRegex.lastIndex = smpIdx;
let m;
while ((m = tagRegex.exec(c)) !== null) {
  const full = m[0];
  const tag = m[1].toLowerCase();
  if (full.startsWith('</')) {
    depth--;
    if (depth === 0) {
      console.log('settingsMainPanel closes at pos:', m.index);
      console.log('Surrounding text:', JSON.stringify(c.substring(m.index - 80, m.index + 80)));
      break;
    }
  } else {
    // ignore self-closing tags
    if (!full.includes('/>') && tag !== 'input' && tag !== 'img' && tag !== 'hr' && tag !== 'br') {
      depth++;
    }
  }
}

