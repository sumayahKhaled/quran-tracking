const fs = require('fs');

fetch('https://qul.tarteel.ai/resources/mushaf-layout/15?page=177')
  .then(r => r.text())
  .then(html => {
    fs.writeFileSync('scratch/qul_page.html', html);
    console.log('Saved HTML, length:', html.length);
  });
