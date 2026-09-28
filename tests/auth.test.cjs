const { test } = require('node:test');
const assert = require('node:assert/strict');
const { boot, ready, file, fixture, deferred, storage } = require('./harness.cjs');
const fs = require('node:fs');
const path = require('node:path');
const token = 'A'.repeat(43);
const reply = (status, data = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => data });
const accessData = () => ({ token, role: 'responsible', expires_at: Math.floor(Date.now() / 1000) + 14400 });

async function pointed() {
    const result = await ready();
    result.app.run("toggleParticipantPresence('P003')");
    return result;
}

test('HTML verrouillé par défaut sans dépendance Tailwind ; Créneau sans entrée Admin', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /id="application" hidden/);
    assert.match(html, /\[hidden\]\s*\{\s*display:\s*none !important/);
    assert.match(html, />Créneau<\/button>/);
    assert.doesNotMatch(html, /admin\.html|>Admin</i);
});

test('avant auth : aucune lecture métier ni import, rendu ou pointage', async () => {
    let reads = 0;
    const local = { getItem() { reads++; throw new Error('must not read'); } };
    const app = boot({ authenticated: false, localStorage: local });
    await app.run('init()');
    await app.load(file(fixture()));
    app.run('loadDataFromStorage(); updateUI(); updateParticipantsUI(); toggleParticipantPresence("P003")');
    assert.equal(reads, 0);
    assert.equal(app.run('planningWorkbook'), null);
    assert.equal(app.get('application').hidden, true);
});

test('login : Bearer sessionStorage uniquement, code effacé, erreur ne déverrouille pas', async () => {
    const app = boot({ authenticated: false });
    app.get('accessCode').value = 'synthetic-code';
    await app.run('submitAccess()');
    assert.equal(app.get('accessCode').value, '');
    assert.equal(JSON.parse(app.sessionStorage.getItem('badminton_responsible_access')).token, token);
    assert.equal(app.localStorage.getItem('badminton_responsible_access'), null);
    assert.equal(app.get('application').hidden, false);
    for (const status of [401, 429, 503]) {
        const bad = boot({ authenticated: false, authFetch: async () => reply(status) });
        bad.get('accessCode').value = 'wrong';
        await bad.run('submitAccess()');
        assert.equal(bad.get('application').hidden, true);
        assert.equal(bad.run('accessToken'), null);
    }
});

test('F5 : validation serveur terminée avant toute lecture et affichage métier', async () => {
    const { app } = await pointed();
    const gate = deferred();
    const accessStorage = storage();
    accessStorage.setItem('badminton_responsible_access', JSON.stringify({ token }));
    let reads = 0;
    const next = boot({ authenticated: false, indexedDB: app.indexedDB, sessionStorage: accessStorage,
        localStorage: { ...app.localStorage, getItem(key) { reads++; return app.localStorage.getItem(key); } },
        authFetch: async () => { await gate.promise; return reply(200, accessData()); } });
    const restored = next.run('init()');
    assert.equal(reads, 0);
    assert.equal(next.get('application').hidden, true);
    gate.resolve(); await restored;
    assert.ok(reads > 0);
    assert.equal(next.run('journalEntries.length'), 1);
    assert.equal(next.run('getPlanningExportError()'), '');
    assert.equal(next.get('application').hidden, false);
});

test('F5 : refus ou panne ne restaure aucune donnée locale', async () => {
    for (const status of [401, 503]) {
        const sessionStorage = storage();
        sessionStorage.setItem('badminton_responsible_access', JSON.stringify({ token }));
        const app = boot({ authenticated: false, sessionStorage,
            localStorage: { getItem() { throw new Error('business read'); } },
            authFetch: async () => reply(status) });
        await app.run('init()');
        assert.equal(app.get('application').hidden, true);
        assert.equal(app.run('accessToken'), null);
    }
});

test('logout conserve source et pointage, vide le DOM ; reconnexion restaure le rendu', async () => {
    const { app } = await pointed();
    const stored = app.localStorage.getItem('badminton_journal');
    app.run('businessLoaded = true');
    await app.run('logoutAccess()');
    assert.equal(app.get('application').hidden, true);
    assert.equal(app.get('journalList').innerHTML, '');
    assert.equal(app.localStorage.getItem('badminton_journal'), stored);
    assert.equal(app.run('journalEntries.length'), 1);
    assert.ok(await app.run('planningStorage.read()'));
    app.get('accessCode').value = 'synthetic-code';
    await app.run('submitAccess()');
    assert.equal(app.run('journalEntries.length'), 1);
    assert.equal(app.run('getPlanningExportError()'), '');
    assert.match(app.get('journalList').innerHTML, /SYNTHETIQUE/);
});

test('expiration locale interdit pointage et export sans toucher au métier', async () => {
    const { app } = await pointed();
    app.run('accessExpiresAt = Date.now() - 1; toggleParticipantPresence("P003"); downloadLocally([])');
    assert.equal(app.run('journalEntries.length'), 1);
    assert.equal(app.get('application').hidden, true);
    assert.equal(app.downloads.length, 0);
});

test('400/401/403/429 : jamais de fallback ; 401 verrouille et conserve le journal', async () => {
    for (const status of [400, 401, 403, 429]) {
        const { app } = await pointed();
        app.run('backendAvailable = true');
        app.context.fetch = async () => reply(status);
        await app.run('downloadPlanning()');
        assert.equal(app.downloads.length, 0);
        assert.equal(app.run('journalEntries.length'), 1);
        if (status === 401) assert.equal(app.get('application').hidden, true);
    }
});

test('panne : pointage et secours existants permis, nouveau créneau interdit même après réimport', async () => {
    const { app, bytes } = await pointed();
    const original = app.localStorage.getItem('badminton_session');
    app.context.fetch = async () => { throw new TypeError('offline'); };
    app.run('backendAvailable = true');
    await app.run('downloadPlanning()');
    assert.equal(app.downloads.length, 1);
    await app.load(file(bytes));
    app.get('sheetSelect').value = 'Créneau';
    app.run('loadDates()');
    app.get('dateSelect').value = '4|0';
    await app.run('startSession()');
    assert.equal(app.localStorage.getItem('badminton_session'), original);
    assert.equal(app.run('journalEntries.length'), 1);
});

test('nouveau créneau : validation serveur, 401 conserve ancien métier et verrouille', async () => {
    const { app } = await pointed();
    const original = app.localStorage.getItem('badminton_session');
    app.context.fetch = async () => reply(401);
    await app.run('startSession()');
    assert.equal(app.get('application').hidden, true);
    assert.equal(app.localStorage.getItem('badminton_session'), original);
});

test('logout pendant export/import/validation : aucun résultat tardif réinstallé', async () => {
    const gate = deferred();
    const { app } = await ready({ exportGate: gate });
    app.run('backendAvailable = true');
    const exported = app.run('downloadPlanning()');
    await new Promise(resolve => setTimeout(resolve, 10));
    await app.run('logoutAccess()');
    gate.resolve(); await exported;
    assert.equal(app.downloads.length, 0);
    const second = await ready();
    const slow = deferred();
    const imported = second.app.load(file(fixture('OTHER'), 'other.xlsx', slow));
    await second.app.run('logoutAccess()');
    slow.resolve(); await imported;
    assert.equal(second.app.run('planningWorkbook'), null);
    assert.equal(second.app.get('planningFileName').textContent, '');
});

test('injections Excel/localStorage rendues inertes, aucun ID dans du JavaScript inline', async () => {
    const { app } = await pointed();
    app.run(`allParticipants[0].nom = '<img src=x onerror=alert(1)>'; allParticipants[0].id = '\" onclick=\"alert(1)';
        journalEntries[0].nom = '<svg onload=alert(2)>'; updateParticipantsUI(); updateUI();`);
    assert.doesNotMatch(app.get('participantsList').innerHTML, /<img|<div onclick=/);
    assert.match(app.get('participantsList').innerHTML, /&lt;img/);
    assert.doesNotMatch(app.get('journalList').innerHTML, /<svg/);
});

test('Reset reste destructif pour le métier et conserve le jeton responsable', async () => {
    const { app } = await pointed();
    await app.run('resetAll()');
    assert.equal(app.localStorage.getItem('badminton_session'), null);
    assert.equal(app.localStorage.getItem('badminton_journal'), null);
    assert.equal(await app.run('planningStorage.read()'), undefined);
    assert.equal(app.run('accessToken'), token);
});

test('sessionStorage indisponible : refus avant lecture métier', async () => {
    const app = boot({ authenticated: false,
        sessionStorage: { setItem() { throw new Error('blocked'); }, removeItem() {} },
        localStorage: { getItem() { throw new Error('must not read'); } } });
    app.get('accessCode').value = 'synthetic-code';
    await app.run('submitAccess()');
    assert.equal(app.run('accessToken'), null);
    assert.equal(app.get('application').hidden, true);
    assert.match(app.get('accessMessage').textContent, /Stockage/);
});

test('réponse tardive de démarrage après logout : aucune nouvelle session métier', async () => {
    const { app } = await pointed();
    const original = app.localStorage.getItem('badminton_session');
    const gate = deferred();
    app.context.fetch = async url => {
        if (url.endsWith('/auth/session')) await gate.promise;
        return reply(200, accessData());
    };
    const started = app.run('startSession()');
    await app.run('logoutAccess()');
    gate.resolve(); await started;
    assert.equal(app.localStorage.getItem('badminton_session'), original);
    assert.equal(app.get('application').hidden, true);
});

test('UI : chargement BACLY et démarrage masqué pendant le pointage, y compris après F5', async () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<button[^>]*class="[^"]*bacly-primary[^"]*"[^>]*>📊 Charger le planning<\/button>/);
    const { app, bytes } = await ready();
    app.run('updateUI()');
    assert.equal(app.get('startPointageButton').hidden, true);
    assert.equal(app.get('startPointageButton').disabled, true);
    assert.equal(app.get('sessionActiveCreneau').classList.contains('hidden'), false);
    assert.match(app.get('activeSessionInfo').textContent, /Créneau/);
    await app.load(file(bytes));
    assert.equal(app.get('startPointageButton').hidden, true);
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    next.run('loadDataFromStorage()');
    await next.run('restorePlanningSource()');
    next.run('updateUI()');
    assert.equal(next.get('startPointageButton').hidden, true);
    assert.equal(next.get('startPointageButton').disabled, true);
    await next.run('resetAll()');
    assert.equal(next.get('startPointageButton').hidden, false);
    assert.equal(next.get('startPointageButton').disabled, true);
});
