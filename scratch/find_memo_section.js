const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');

const idx = c.indexOf('الحفظ الجديد');
if (idx !== -1) {
  console.log(c.substring(idx - 200, idx + 400));
}

