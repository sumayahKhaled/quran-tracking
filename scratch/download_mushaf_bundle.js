const fs = require('fs');
const path = require('path');
const https = require('https');

const PAGES_DIR = path.resolve(__dirname, '../data/pages');
const FONTS_DIR = path.resolve(__dirname, '../assets/qcf');

if (!fs.existsSync(PAGES_DIR)) fs.mkdirSync(PAGES_DIR, { recursive: true });
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function downloadFont(pageNum) {
  const target = path.join(FONTS_DIR, `p${pageNum}.woff2`);
  if (fs.existsSync(target) && fs.statSync(target).size > 1000) {
    return true; // Already downloaded
  }
  const sources = [
    `https://verses.quran.foundation/fonts/quran/hafs/v1/woff2/p${pageNum}.woff2`,
    `https://static-cdn.tarteel.ai/qul/fonts/quran_fonts/v1-optimized/woff2/p${pageNum}.woff2?v=3.2`
  ];
  for (const src of sources) {
    try {
      const buf = await fetchBuffer(src);
      if (buf && buf.length > 500) {
        fs.writeFileSync(target, buf);
        return true;
      }
    } catch (_) {}
  }
  throw new Error(`Failed to download font for page ${pageNum}`);
}

async function downloadPageJson(pageNum) {
  const target = path.join(PAGES_DIR, `${pageNum}.json`);
  if (fs.existsSync(target) && fs.statSync(target).size > 200) {
    return true; // Already downloaded
  }
  const url = `https://api.quran.com/api/v4/verses/by_page/${pageNum}?words=true&word_fields=code_v1,text_qpc_hafs,text_imlaei,line_number,page_number,location&mushaf=2`;
  try {
    const buf = await fetchBuffer(url);
    const raw = JSON.parse(buf.toString('utf8'));
    if (!raw || !raw.verses) throw new Error(`Invalid JSON for page ${pageNum}`);
    
    // Clean and minify to keep bundle small & ultra-fast
    const cleanVerses = raw.verses.map(v => ({
      id: v.id,
      verse_key: v.verse_key,
      words: (v.words || []).map(w => ({
        id: w.id,
        position: w.position,
        char_type_name: w.char_type_name,
        code_v1: w.code_v1,
        text_qpc_hafs: w.text_qpc_hafs,
        text_imlaei: w.text_imlaei,
        line_number: w.line_number,
        page_number: w.page_number,
        location: w.location
      }))
    }));
    
    fs.writeFileSync(target, JSON.stringify({ verses: cleanVerses }), 'utf8');
    return true;
  } catch (e) {
    throw new Error(`Failed to download JSON for page ${pageNum}: ${e.message}`);
  }
}

async function downloadHeaderFonts() {
  console.log('Downloading surah header fonts...');
  const headerFont = path.join(FONTS_DIR, 'QCF_SurahHeader_COLOR-Regular.woff2');
  const nameFont = path.join(FONTS_DIR, 'surah-name-v4.woff2');

  if (!fs.existsSync(headerFont) || fs.statSync(headerFont).size < 1000) {
    const buf = await fetchBuffer('https://static-cdn.tarteel.ai/qul/fonts/surah-names/surah-header/QCF_SurahHeader_COLOR-Regular.woff2?v=3.4');
    fs.writeFileSync(headerFont, buf);
    console.log('Downloaded QCF_SurahHeader_COLOR-Regular.woff2');
  }
  if (!fs.existsSync(nameFont) || fs.statSync(nameFont).size < 1000) {
    const buf = await fetchBuffer('https://static-cdn.tarteel.ai/qul/fonts/surah-names/v4/surah-name-v4.woff2?v=3.4');
    fs.writeFileSync(nameFont, buf);
    console.log('Downloaded surah-name-v4.woff2');
  }
}

async function runPool(items, concurrency, fn) {
  let index = 0;
  let active = 0;
  let completed = 0;
  return new Promise((resolve, reject) => {
    function next() {
      if (completed >= items.length) return resolve();
      while (active < concurrency && index < items.length) {
        const item = items[index++];
        active++;
        fn(item).then(() => {
          completed++;
          active--;
          if (completed % 50 === 0 || completed === items.length) {
            console.log(`Progress: ${completed}/${items.length} (${Math.round(completed*100/items.length)}%)`);
          }
          next();
        }).catch(err => {
          console.error(`Error on item ${item}:`, err.message);
          // Retry once after 1s
          setTimeout(() => {
            fn(item).then(() => {
              completed++;
              active--;
              next();
            }).catch(e2 => {
              active--;
              reject(e2);
            });
          }, 1000);
        });
      }
    }
    next();
  });
}

async function main() {
  await downloadHeaderFonts();
  
  const pages = [];
  for (let p = 1; p <= 604; p++) pages.push(p);

  console.log('--- Step 1: Downloading 604 Font files (.woff2) ---');
  await runPool(pages, 12, (p) => downloadFont(p));

  console.log('--- Step 2: Downloading 604 Page JSON files ---');
  await runPool(pages, 12, (p) => downloadPageJson(p));

  console.log('ALL 604 PAGES & FONTS DOWNLOADED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Fatal error in bundle downloader:', err);
  process.exit(1);
});
