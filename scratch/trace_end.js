const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');

const smpIdx = c.indexOf('id="settingsMainPanel"');
const downloadEnd = c.indexOf('تحميل المصحف والتفاسير والتلاوات</span>', smpIdx);
console.log('downloadEnd:', downloadEnd);
console.log(c.substring(downloadEnd, downloadEnd + 1200));

