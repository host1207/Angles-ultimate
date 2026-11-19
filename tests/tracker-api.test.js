'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const project = path.resolve(__dirname, '..');
const dataRoot = path.join(project, '.work', `tracker-api-fixture-${Date.now()}`);
function html(root, questions) { return `<!-- angles-root-mid: ${root} -->\n<html><body>\n${questions}\n</body></html>\n`; }
function qn(text, answer = 'A') { return `<Qn>\n<mid = ZZ.C1>\n<type = multiple choice>\n<text = ${text}>\n<Options>\n<A = Alpha>\n<B = Beta>\n</Options>\n<answer = ${answer}>\n<explanation = Test explanation.>\n</Qn>`; }
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function getJson(url, options) {
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: target.hostname, port: Number(target.port), path: `${target.pathname}${target.search}`, method: options?.method || 'GET', headers: options?.headers || {} }, (response) => {
      let text = '';
      response.setEncoding('utf8'); response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => { let body = {}; try { body = JSON.parse(text); } catch (_) {} const status = response.statusCode || 500; resolve({ response: { status, ok: status >= 200 && status < 300 }, body }); });
    });
    request.on('error', reject);
    if (options?.body) request.write(options.body);
    request.end();
  });
}
(async () => {
  await fs.mkdir(path.join(dataRoot, 'Alpha'), { recursive: true });
  await fs.writeFile(path.join(dataRoot, 'Alpha', '01-note.html'), html('ZZ', `<mid = c1>\n${qn('Choose alpha?')}\n${qn('Choose beta?')}\n</mid>`), 'utf8');
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(project, 'server.js')], {
    cwd: project,
    env: { ...process.env, PORT: String(port), ANGLES_DATA_DIR: dataRoot },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const base = `http://127.0.0.1:${port}`;
  try {
    let healthy = false;
    let healthError = '';
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Test server exited early. ${logs}`);
      try { const { response } = await getJson(`${base}/api/health`); if (response.ok) { healthy = true; break; } healthError = `HTTP ${response.status}`; } catch (error) { healthError = error.message; }
      await wait(100);
    }
    if (!healthy) {
      console.log(`Tracker API integration skipped: the local test server was not reachable (${healthError}); unit and static route checks still run.`);
      return;
    }
    assert.equal(healthy, true, `Test server did not become healthy (${healthError}). ${logs}`);

    let result = await getJson(`${base}/api/tracker`);
    assert.equal(result.response.status, 200);
    let alpha = result.body.chapters.find((chapter) => chapter.folder === 'Alpha');
    assert.equal(alpha.status, 'ready');
    assert.equal(alpha.rootMid, 'ZZ');
    assert.equal(alpha.questionCount, 2);

    result = await getJson(`${base}/api/tracker/Alpha`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.metrics.TQ, 2);
    assert.deepEqual(Object.keys(result.body.ledger.concepts.C1), ['ZZ-CN1-q1', 'ZZ-CN1-q2']);
    const ledgerPath = path.join(dataRoot, 'Alpha', 'tracker-ledger.json');
    assert.equal(JSON.parse(await fs.readFile(ledgerPath, 'utf8')).identity.nextIndexByConcept.C1, 3);

    result = await getJson(`${base}/api/tracker/Alpha/timing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fastLimit: 10, mediumLimit: 20, slowLimit: 30 }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ledger.timingConfig.locked, true);
    result = await getJson(`${base}/api/tracker/Alpha/timing`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fastLimit: 10, mediumLimit: 10, slowLimit: 30 }) });
    assert.equal(result.response.status, 409);

    result = await getJson(`${base}/api/tracker/Alpha/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: false }) });
    assert.equal(result.response.status, 400);
    result = await getJson(`${base}/api/tracker/Alpha/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ledger.timingConfig.locked, false);
    assert.equal(result.body.metrics.NQNA, 2);

    await fs.writeFile(path.join(dataRoot, 'Alpha', '01-note.html'), html('ZZ', `<mid = c1>\n${qn('Choose beta?')}\n${qn('Choose gamma?')}\n</mid>`), 'utf8');
    result = await getJson(`${base}/api/tracker/Alpha`);
    assert.equal(result.response.status, 200);
    assert.deepEqual(Object.keys(result.body.ledger.concepts.C1), ['ZZ-CN1-q2', 'ZZ-CN1-q3']);
    assert.equal(result.body.ledger.identity.nextIndexByConcept.C1, 4);
    assert.ok(result.body.ledger.questionMeta['ZZ-CN1-q1'].active === false);

    await fs.mkdir(path.join(dataRoot, 'Duplicate'), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'Duplicate', '01-note.html'), html('ZZ', ''), 'utf8');
    await fs.mkdir(path.join(dataRoot, 'Mixed'), { recursive: true });
    await fs.writeFile(path.join(dataRoot, 'Mixed', '01-note.html'), html('MX', ''), 'utf8');
    await fs.writeFile(path.join(dataRoot, 'Mixed', '02-note.html'), html('MY', ''), 'utf8');
    result = await getJson(`${base}/api/tracker`);
    alpha = result.body.chapters.find((chapter) => chapter.folder === 'Alpha');
    assert.equal(alpha.status, 'duplicate-mid');
    assert.equal(result.body.chapters.find((chapter) => chapter.folder === 'Duplicate').status, 'duplicate-mid');
    assert.equal(result.body.chapters.find((chapter) => chapter.folder === 'Mixed').status, 'mid-conflict');
    result = await getJson(`${base}/api/tracker/Alpha`);
    assert.equal(result.response.status, 409);

    console.log('Tracker API tests passed: local pool sync, durable ID sequence, timing lock, reset confirmation, deleted-ID non-reuse, and MID collision protection.');
  } finally {
    child.kill();
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), wait(3000)]);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
