const fs = require('fs');
const c = fs.readFileSync('index.html', 'utf8');

const targetStr = `                    </div>
                </div>

                
                </div>
            </div>`;

console.log('Matches:', c.indexOf(targetStr));
console.log(JSON.stringify(c.substring(77800, 78150)));

