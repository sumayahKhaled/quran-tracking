const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const vsIdx = html.indexOf('id="view-settings"');
console.log('view-settings index:', vsIdx);
const nextMain = html.indexOf('</main>', vsIdx);
console.log('Next </main> index:', nextMain);
const slice = html.substring(vsIdx, nextMain + 7);
console.log('Length of view-settings:', slice.length);

// Check if settingsMainPanel is inside view-settings
console.log('settingsMainPanel in slice?', slice.includes('id="settingsMainPanel"'));
console.log('settingsUnifiedPlanSubpage in slice?', slice.includes('id="settingsUnifiedPlanSubpage"'));

// Let's inspect all children of view-settings
const mainEnd = html.indexOf('</main>', vsIdx);
console.log('Lines in view-settings:', slice.split('\n').length);
