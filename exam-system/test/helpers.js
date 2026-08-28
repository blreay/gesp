'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}
async function startApp() {
  const { createApp } = require('../src/app');
  const app = createApp();
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: 'http://127.0.0.1:' + server.address().port });
    });
  });
}

module.exports = { tmpDir, rmrf, startApp };
