const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('index.html', 'utf8');
const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
const document = dom.window.document;

const vs = document.getElementById('view-settings');
console.log('view-settings found:', !!vs);
const smp = document.getElementById('settingsMainPanel');
console.log('settingsMainPanel found:', !!smp);
console.log('settingsMainPanel hidden?', smp ? smp.hidden : 'N/A');
console.log('settingsMainPanel display:', smp ? smp.style.display : 'N/A');

const unifSub = document.getElementById('settingsUnifiedPlanSubpage');
console.log('settingsUnifiedPlanSubpage found:', !!unifSub);
console.log('settingsUnifiedPlanSubpage hidden?', unifSub ? unifSub.hidden : 'N/A');

// Check all direct children of view-settings
console.log('view-settings children count:', vs.children.length);
Array.from(vs.children).forEach((child, i) => {
  console.log(`Child ${i}: tag=${child.tagName}, id=${child.id}, class=${child.className}, hidden=${child.hidden}, display=${child.style.display}`);
});
