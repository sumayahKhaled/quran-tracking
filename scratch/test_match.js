const https = require('https');
https.get('https://api.quran.com/api/v4/verses/by_page/1?words=true&word_fields=code_v1,text_qpc_hafs,text_imlaei,line_number,page_number,location&mushaf=2', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    function normalizeArabicText(str) {
      if (!str) return '';
      return str
        .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
        .replace(/\u0640/g, '')
        .replace(/[أإآٱ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[^\u0621-\u064A\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    const nonEndWords = [];
    json.verses.forEach(v => {
      v.words.forEach(w => {
        if (w.char_type_name !== 'end') {
          const norm = normalizeArabicText(w.text_imlaei || '');
          const locParts = (w.location || '').split(':');
          nonEndWords.push({ surah: parseInt(locParts[0]), ayah: parseInt(locParts[1]), pos: parseInt(locParts[2]), text: w.text_imlaei, normalized: norm, vk: locParts[0]+':'+locParts[1] });
        }
      });
    });
    console.log('Total nonEndWords on page 1:', nonEndWords.length);
    const spoken = normalizeArabicText('الحمد لله رب العالمين الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين').split(/\s+/).filter(Boolean);
    console.log('Spoken:', spoken);
    for (let i = 0; i < spoken.length; i++) {
      for (let pi = 0; pi < nonEndWords.length; pi++) {
        if (spoken[i] === nonEndWords[pi].normalized) {
          console.log(`Match spoken[${i}]="${spoken[i]}" with pi=${pi} (${nonEndWords[pi].vk} word ${nonEndWords[pi].pos})`);
        }
      }
    }
  });
});

