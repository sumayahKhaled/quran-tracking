const fs = require('fs');

fetch('https://qul.tarteel.ai/assets/application-2f21d176fa820705563a68a010d2f33e461edac9b86d47a07823b95ad59fdd48.css')
  .then(r => r.text())
  .then(css => {
    fs.writeFileSync('scratch/qul_app.css', css);
    console.log('Saved qul_app.css, length:', css.length);
    const lines = css.split('\n');
    lines.forEach(l => {
      if (l.includes('.line') || l.includes('.page') || l.includes('mushaf') || l.includes('.ayah')) {
        console.log(l.substring(0, 150));
      }
    });
  });

