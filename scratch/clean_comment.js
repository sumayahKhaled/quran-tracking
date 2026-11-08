const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const target = "                <!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->\r\n                <!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->";
const repl = "                <!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->";

if (html.includes(target)) {
  html = html.replace(target, repl);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Removed duplicate comment in index.html!');
} else {
  console.log('Target not found directly, regex clean...');
  html = html.replace(/<!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->\s*<!-- زرّا إتمام السورة 100%: الانتقال للتثبيت أو الانتقال للسورة الجديدة -->/, repl);
  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Regex replaced successfully!');
}

