const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('js/quran-data.js', 'utf8');
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const QURAN_SURAHS = sandbox.window.QURAN_SURAHS;

function getSurahsChunked(surahs, cycleDays) {
  const total = surahs.length;
  if (total === 0) return Array.from({ length: cycleDays }, () => []);
  const chunkSize = total / cycleDays;
  const chunks = [];
  for (let i = 0; i < cycleDays; i++) {
    const start = Math.floor(i * chunkSize);
    const end = Math.floor((i + 1) * chunkSize);
    chunks.push(surahs.slice(start, end));
  }
  return chunks;
}

const surahs = QURAN_SURAHS.filter(s => s.id >= 105).sort((a,b) => b.id - a.id);
const chunks = getSurahsChunked(surahs, 5);
chunks.forEach((c, idx) => {
  console.log(`Day ${idx+1}:`, c.map(s => s.name).join(', '));
});

