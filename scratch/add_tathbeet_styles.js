const fs = require('fs');

let css = fs.readFileSync('css/style.css', 'utf8');

const noticeStyles = `
/* إشعار مرحلة التثبيت داخل كرت السورة الحالية */
.surah-tathbeet-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: var(--radius-xs, 8px);
  animation: fadeInCompletion 0.3s ease-out;
}

.tathbeet-notice-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.tathbeet-notice-icon {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.25);
  color: #10b981;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tathbeet-notice-title {
  font-size: 0.88rem;
  font-weight: 700;
  color: #ffffff;
}

.tathbeet-notice-desc {
  font-size: 0.74rem;
  color: rgba(255, 255, 255, 0.75);
  margin-top: 2px;
}

.btn-tathbeet-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: #10b981;
  color: #ffffff;
  border: none;
  border-radius: var(--radius-xs, 6px);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.btn-tathbeet-open:hover {
  background: #059669;
  transform: translateY(-1px);
}
`;

css += '\n' + noticeStyles;
fs.writeFileSync('css/style.css', css, 'utf8');
console.log('Successfully added surah-tathbeet-notice styles!');

