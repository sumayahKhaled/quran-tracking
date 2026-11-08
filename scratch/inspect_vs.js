const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Let's check all style elements or inline styles in view-settings
const vsIdx = html.indexOf('id="view-settings"');
const vsEnd = html.indexOf('</main>', vsIdx);
const vsHtml = html.substring(vsIdx, vsEnd + 7);

// Let's check if there are any unmatched tags or weird syntax in view-settings
console.log('view-settings starts at line:', html.substring(0, vsIdx).split('\n').length);
console.log('view-settings ends at line:', html.substring(0, vsEnd).split('\n').length);

// Check if any element in view-settings has invalid display
const m = vsHtml.match(/<([a-zA-Z0-9]+)[^>]*id="([^"]+)"[^>]*>/g);
if (m) {
  m.forEach(tag => {
    if (tag.includes('settings') || tag.includes('unif') || tag.includes('account')) {
      console.log(tag);
    }
  });
}
