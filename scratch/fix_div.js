const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const faultyTarget = "                    </div>\r\n                </div>\r\n\r\n                \r\n                </div>\r\n            </div>";
const correctReplacement = "                    </div>\r\n                </div>\r\n            </div>";

if (!html.includes(faultyTarget)) {
  console.error('faultyTarget not found in CRLF form, trying generic whitespace');
  process.exit(1);
}

html = html.replace(faultyTarget, correctReplacement);
fs.writeFileSync('index.html', html, 'utf8');
console.log('Successfully fixed extra closing div in settingsMainPanel!');

