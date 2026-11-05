const fs = require('fs');
const html = fs.readFileSync('scratch/qul_page.html', 'utf8');
const m = html.match(/<link[^>]+>/g);
(m || []).filter(x => x.includes('stylesheet')).forEach(x => console.log(x));

