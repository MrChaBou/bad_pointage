// Optional real-browser integration check. Synthetic workbook and private temp state only.
// BAD_POINTAGE_PLAYWRIGHT_MODULE points to an external Playwright installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { chromium } = require(process.env.BAD_POINTAGE_PLAYWRIGHT_MODULE || 'playwright');
const { fixture } = require('./harness.cjs');
const root = path.join(__dirname, '..');
const python = path.join(root, '.venv/bin/python');
const code = 'synthetic-browser-code-only';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    for (const port of [5000, 8000]) {
        try { await fetch(`http://127.0.0.1:${port}`); }
        catch { continue; }
        throw new Error(`Port ${port} occupé : aucun serveur existant ne sera arrêté.`);
    }
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bad-pointage-browser-'));
    const env = { ...process.env, PYTHONDONTWRITEBYTECODE: '1', BAD_POINTAGE_AUTH_FILE: path.join(directory, 'auth-state.json') };
    let backend, frontend, browser;
    try {
        execFileSync(python, ['-B', '-c', `import os; from auth import initialize; initialize(os.environ['BAD_POINTAGE_AUTH_FILE'], '${code}')`], { cwd: root, env });
        backend = spawn(python, ['-B', '-m', 'flask', '--app', 'flask_app:app', 'run', '--host', '127.0.0.1', '--port', '5000'], { cwd: root, env, stdio: 'ignore' });
        frontend = spawn(python, ['-B', '-m', 'http.server', '8000', '--bind', '127.0.0.1'], { cwd: root, env, stdio: 'ignore' });
        for (const url of ['http://127.0.0.1:5000/health', 'http://127.0.0.1:8000']) {
            let ready = false;
            for (let n = 0; n < 100; n++) {
                try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
                await delay(100);
            }
            assert.ok(ready, 'Serveur local prêt');
        }
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ acceptDownloads: true });
        // Deterministic resources; no visual approval is inferred from this check.
        await context.route('https://cdn.tailwindcss.com/**', route => route.fulfill({ contentType: 'text/javascript', body: "const s=document.createElement('style');s.textContent='.hidden{display:none}';document.head.appendChild(s);" }));
        await context.route('https://cdn.tailwindcss.com/', route => route.fulfill({ contentType: 'text/javascript', body: "const s=document.createElement('style');s.textContent='.hidden{display:none}';document.head.appendChild(s);" }));
        await context.route('https://cdn.jsdelivr.net/**', route => route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js')) }));
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('dialog', dialog => dialog.accept());
        await page.goto('http://127.0.0.1:8000');
        assert.equal(await page.locator('#application').isVisible(), false);
        await page.locator('#accessCode').fill('wrong');
        await page.locator('#accessButton').click();
        await page.waitForFunction(() => document.getElementById('accessMessage').textContent.includes('incorrect'));
        assert.equal(await page.locator('#application').isVisible(), false);
        async function login() {
            await page.locator('#accessCode').fill(code);
            await page.locator('#accessButton').click();
            await page.locator('#application').waitFor({ state: 'visible' });
        }
        await login();
        assert.equal(await page.locator('#startPointageButton').isEnabled(), false);
        await page.locator('#planningFile').setInputFiles({ name: 'synthetic.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(fixture()) });
        await page.locator('#planningConfig').waitFor({ state: 'visible' });
        await page.locator('#sheetSelect').selectOption('Créneau');
        await page.locator('#dateSelect').selectOption('');
        assert.equal(await page.locator('#startPointageButton').isEnabled(), false);
        await page.locator('#dateSelect').selectOption('3|0');
        assert.equal(await page.locator('#startPointageButton').isEnabled(), true);
        await page.getByRole('button', { name: 'Démarrer le pointage' }).click();
        await page.locator('[data-participant-id="P003"]').click();
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('badminton_journal')).length === 1);
        await page.locator('#creneauTab').click();
        const downloaded = page.waitForEvent('download');
        await page.locator('#downloadBtn').click();
        assert.match((await downloaded).suggestedFilename(), /^maj_/);

        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const heldSession = async route => { await gate; await route.continue(); };
        await page.route('**/auth/session', heldSession);
        await page.reload({ waitUntil: 'domcontentloaded' });
        assert.equal(await page.locator('#application').isVisible(), false);
        assert.equal(await page.locator('#journalList').textContent(), '');
        release();
        await page.locator('#application').waitFor({ state: 'visible' });
        await page.waitForFunction(() => !!planningFileContent);
        await page.unroute('**/auth/session', heldSession);
        assert.equal(await page.evaluate(() => journalEntries.length), 1);
        await page.locator('#logoutButton').click();
        await page.locator('#accessScreen').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#journalList').textContent(), '');
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('badminton_journal')).length), 1);
        await login();

        const offline = route => route.abort('connectionrefused');
        await page.route('http://127.0.0.1:5000/**', offline);
        await page.locator('#creneauTab').click();
        const localDownload = page.waitForEvent('download');
        await page.locator('#downloadBtn').click();
        assert.match((await localDownload).suggestedFilename(), /^local_maj_/);
        const original = await page.evaluate(() => localStorage.getItem('badminton_session'));
        await page.locator('#sheetSelect').selectOption('Créneau');
        await page.locator('#dateSelect').selectOption('4|0');
        assert.equal(await page.locator('#startPointageButton').isVisible(), false);
        // La validation serveur reste testée directement : ce bouton ne change plus de créneau.
        await page.evaluate(() => startSession());
        assert.equal(await page.evaluate(() => localStorage.getItem('badminton_session')), original);
        await page.reload();
        assert.equal(await page.locator('#application').isVisible(), false);
        await page.unroute('http://127.0.0.1:5000/**', offline);
        await login();
        await page.waitForFunction(() => !!planningFileContent);
        execFileSync(python, ['-B', '-c', "import os; from auth_store import AuthStore; s=AuthStore(os.environ['BAD_POINTAGE_AUTH_FILE'])\nwith s.locked():\n d=s.read(); d['generation']+=1; s.write(d)"], { cwd: root, env });
        await page.locator('#creneauTab').click();
        await page.locator('#downloadBtn').click();
        await page.locator('#accessScreen').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#application').isVisible(), false);
        assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('badminton_journal')).length), 1);
        assert.deepEqual(errors, []);
        console.log('Chromium + Flask réels : login, import, pointage, export, F5 verrouillé, logout, panne/fallback, nouveau créneau refusé, révocation OK.');
    } finally {
        if (browser) await browser.close();
        for (const child of [backend, frontend]) {
            if (child && child.exitCode === null) {
                const stopped = new Promise(resolve => child.once('exit', resolve));
                child.kill(); await stopped;
            }
        }
        fs.rmSync(directory, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
