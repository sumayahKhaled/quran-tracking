const fs = require('fs');

fetch('https://qul.tarteel.ai/assets/tailwind-ff5fa01d21756e8ad09485fbdfec7ed107c8a40ca785bfe3514cbc14d032fe1b.css')
  .then(r => r.text())
  .then(css => {
    fs.writeFileSync('scratch/qul_tailwind.css', css);
    console.log('Saved qul_tailwind.css, length:', css.length);
    const regex = /\.surah-header[^{]*\{[^}]*\}/g;
    let m;
    while ((m = regex.exec(css)) !== null) {
      console.log(m[0]);
    }
    const regex2 = /\.surah-name-v4-icon[^{]*\{[^}]*\}/g;
    while ((m = regex2.exec(css)) !== null) {
      console.log(m[0]);
    }
  });

