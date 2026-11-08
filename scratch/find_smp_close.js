const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const vsIdx = html.indexOf('id="settingsMainPanel"');
let pos = vsIdx;
let depth = 0;
while (pos < html.length) {
  const nextOpen = html.indexOf('<div', pos);
  const nextClose = html.indexOf('</div>', pos);

  if (nextClose === -1) break;
  if (nextOpen !== -1 && nextOpen < nextClose) {
    depth++;
    pos = nextOpen + 4;
  } else {
    depth--;
    pos = nextClose + 6;
    if (depth === 0) {
      console.log('settingsMainPanel closes at char:', pos);
      console.log('Line number:', html.substring(0, pos).split('\n').length);
      console.log('Next 100 chars:', JSON.stringify(html.substring(pos, pos + 100)));
      break;
    }
  }
}
