import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib'));
const downloader = builderRequire.resolve('@electron/get');

function runProxyChild(code) {
  return spawnSync(process.execPath, ['-e', code, downloader], {
    encoding: 'utf8', timeout: 30000,
    env: {
      ...process.env, ELECTRON_GET_USE_PROXY: '', ROARR_LOG: '',
      GLOBAL_AGENT_HTTP_PROXY: '', GLOBAL_AGENT_HTTPS_PROXY: '', GLOBAL_AGENT_NO_PROXY: ''
    }
  });
}

test('Electron downloader proxy bootstrap does not load the vulnerable sprintf formatter', () => {
  const result = runProxyChild(String.raw`
    const assert = require('node:assert/strict');
    require(process.argv[1]).initializeProxy();
    assert.ok(global.GLOBAL_AGENT, 'downloader proxy initialization must actually succeed');
    const vulnerable = Object.keys(require.cache).filter(name => /[\\/]sprintf-js[\\/]/.test(name));
    assert.deepEqual(vulnerable, [], 'proxy bootstrap must not load the vulnerable formatter');
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('Electron downloader proxy and NO_PROXY preserve local artifact request routing', () => {
  const result = runProxyChild(String.raw`
    const assert = require('node:assert/strict');
    const http = require('node:http');
    async function main() {
      const proxyRequests = [], directRequests = [];
      const proxy = http.createServer((request, response) => {
        proxyRequests.push(request.url);
        response.end('synthetic proxied artifact');
      });
      const direct = http.createServer((request, response) => {
        directRequests.push(request.url);
        response.end('synthetic direct artifact');
      });
      const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      await Promise.all([listen(proxy), listen(direct)]);
      try {
        process.env.GLOBAL_AGENT_HTTP_PROXY = 'http://127.0.0.1:' + proxy.address().port;
        process.env.GLOBAL_AGENT_NO_PROXY = '127.0.0.1';
        require(process.argv[1]).initializeProxy();
        assert.ok(global.GLOBAL_AGENT, 'downloader must not silently swallow a bootstrap failure');
        const read = url => new Promise((resolve, reject) => {
          const request = http.get(url, response => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { text += chunk; });
            response.on('end', () => resolve(text));
          });
          request.on('error', reject);
          request.setTimeout(5000, () => request.destroy(new Error('synthetic request timed out')));
        });
        assert.equal(await read('http://synthetic-artifact.invalid/archive.zip'), 'synthetic proxied artifact');
        assert.equal(await read('http://127.0.0.1:' + direct.address().port + '/local.zip'), 'synthetic direct artifact');
        assert.deepEqual(proxyRequests, ['http://synthetic-artifact.invalid/archive.zip']);
        assert.deepEqual(directRequests, ['/local.zip']);
      } finally {
        proxy.closeAllConnections(); direct.closeAllConnections();
        await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => direct.close(resolve))]);
      }
    }
    main().catch(error => { console.error(error); process.exitCode = 1; });
  `);
  assert.equal(result.status, 0, result.stderr);
});
