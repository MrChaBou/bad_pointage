const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { boot, ready, file, fixture, deferred, IDBFactory } = require('./harness.cjs');
const sameBytes = (a, b) => assert.deepEqual(Buffer.from(a), Buffer.from(b));

async function refreshed(app) {
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    next.run('loadDataFromStorage()');
    await next.run('restorePlanningSource()');
    return next;
}

test('IndexedDB round-trip conserve exactement les octets, métadonnées et SHA-256', async () => {
    const { app, bytes } = await ready();
    const record = await app.run('planningStorage.read()');
    sameBytes(record.bytes, bytes);
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
    assert.equal(record.sha256, expected);
    assert.equal(app.run('activeSession.sourceHash'), expected);
    assert.equal(record.name, 'synthetique.xlsx');
    assert.equal(record.size, bytes.byteLength);
    assert.equal(record.lastModified, 1234);
});

test('F5 simulé restaure source, participants, pointages et autorise export', async () => {
    const { app, bytes } = await ready();
    app.run(`journalEntries = [{id:'P003', nom:'SYNTHETIQUE', prenom:'Alice',
        session: activeSession.sheet + '_' + activeSession.dateLabel}];
        saveDataToStorage('badminton_journal', journalEntries)`);
    const next = await refreshed(app);
    sameBytes(next.run('planningFileContent'), bytes);
    assert.equal(next.run('getPlanningExportError()'), '');
    assert.equal(next.run('players.length'), 2);
    assert.equal(next.run('journalEntries.length'), 1);
    assert.equal(next.get('planningFile').value, '');
    assert.match(next.get('planningStorageStatus').textContent, /restaurée/);
    next.run('backendAvailable = true');
    await next.run('downloadPlanning()');
    sameBytes(Buffer.from(next.posts[0].file, 'base64'), bytes);
    assert.equal(next.posts[0].presences.length, 1);
    assert.equal(next.downloads.length, 1);
    sameBytes(await next.downloads[0].blob.arrayBuffer(), bytes);
});

test('nouvelle session depuis source restaurée avec champ fichier vide', async () => {
    const { app } = await ready();
    const next = await refreshed(app);
    await next.start();
    assert.equal(next.run('getPlanningExportError()'), '');
    assert.equal(next.run('activeSession.planningFileName'), 'synthetique.xlsx');
});

test('autre fichier même nom/participants/date rejeté pour session et ne remplace pas le cache', async () => {
    const { app, bytes } = await ready();
    await app.load(file(fixture('SYNTHETIQUE', 'autre contenu')));
    assert.match(app.run('getPlanningExportError()'), /pas la source/);
    sameBytes((await app.run('planningStorage.read()')).bytes, bytes);
    sameBytes((await refreshed(app)).run('planningFileContent'), bytes);
});

test('nouvelle session remplace explicitement la source sauvegardée', async () => {
    const { app } = await ready();
    const other = fixture('AUTRE FICTIF');
    await app.load(file(other, 'nouveau.xlsx'));
    await app.start();
    const next = await refreshed(app);
    sameBytes(next.run('planningFileContent'), other);
    assert.equal(next.run('allParticipants[0].nom'), 'AUTRE FICTIF');
});

test('mêmes octets renommés réparent la source sans changer les pointages', async () => {
    const { app, bytes } = await ready();
    const session = app.localStorage.getItem('badminton_session');
    await app.load(file(bytes, 'renomme.xlsx'));
    assert.equal(app.run('getPlanningExportError()'), '');
    assert.equal(app.localStorage.getItem('badminton_session'), session);
});

test('ancienne session sans hash réparée par réimport, journal conservé', async () => {
    const { app, bytes } = await ready();
    app.run(`delete activeSession.sourceHash; delete activeSession.dateISO;
        journalEntries = [{id:'P003'}]; saveDataToStorage('badminton_journal', journalEntries);
        saveDataToStorage('badminton_session', activeSession)`);
    const next = await refreshed(app);
    assert.match(next.run('getPlanningExportError()'), /Rechargez/);
    await next.load(file(bytes));
    assert.equal(next.run('getPlanningExportError()'), '');
    assert.equal(next.run('journalEntries.length'), 1);
    assert.equal(next.run('activeSession.dateISO'), '2026-09-27');
    await next.run('planningStorage.read()');
    assert.equal((await refreshed(next)).run('getPlanningExportError()'), '');
});

test('ancienne session refuse des participants différents', async () => {
    const { app } = await ready();
    app.run('delete activeSession.sourceHash');
    await app.load(file(fixture('AUTRE FICTIF')));
    assert.equal(app.run('activeSession.sourceHash'), undefined);
    assert.notEqual(app.run('getPlanningExportError()'), '');
});

test('cache absent : données métier conservées et fallback manuel', async () => {
    const { app, bytes } = await ready();
    await app.run('planningStorage.clear()');
    const next = await refreshed(app);
    assert.match(next.run('getPlanningExportError()'), /Rechargez/);
    assert.equal(next.run('allParticipants.length'), 2);
    await next.load(file(bytes));
    assert.equal(next.run('getPlanningExportError()'), '');
});

test('IndexedDB absent : import et export en mémoire restent disponibles', async () => {
    const app = boot({ indexedDB: undefined });
    await app.load(file(fixture()));
    app.get('sheetSelect').value = 'Créneau'; app.run('loadDates()');
    app.get('dateSelect').value = '3|0';
    app.get('dateSelect').options.forEach(o => { o.text = o.textContent; });
    app.run('startSession()');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(app.run('getPlanningExportError()'), '');
    assert.match(app.get('planningStorageStatus').textContent, /non sauvegardée/);
    app.run('backendAvailable = true'); await app.run('downloadPlanning()');
    assert.equal(app.posts.length, 1);
    const next = await refreshed(app);
    assert.match(next.run('getPlanningExportError()'), /Rechargez/);
});

test('erreur IndexedDB : lecture échoue et réimport garde export utilisable', async () => {
    const { app, bytes } = await ready();
    const broken = boot({ localStorage: app.localStorage,
        indexedDB: { open() { throw new DOMException('Denied', 'SecurityError'); } } });
    broken.run('loadDataFromStorage()');
    await broken.run('restorePlanningSource()');
    assert.match(broken.run('getPlanningExportError()'), /Rechargez/);
    await broken.load(file(bytes));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(broken.run('getPlanningExportError()'), '');
    assert.match(broken.get('planningStorageStatus').textContent, /non sauvegardée/);
});

test('corruption des octets détectée par SHA-256 malgré métadonnées inchangées', async () => {
    const { app } = await ready();
    await app.run(`(async () => { const r = await planningStorage.read();
        new Uint8Array(r.bytes)[10] ^= 1; await planningStorage.write(r); })()`);
    const next = await refreshed(app);
    assert.equal(next.run('planningFileContent'), null);
    assert.match(next.run('getPlanningExportError()'), /Rechargez/);
});

test('source correcte mais cible session incorrecte refusée', async () => {
    const { app } = await ready();
    app.run("activeSession.dateISO = '2025-09-27'; saveDataToStorage('badminton_session', activeSession)");
    assert.equal((await refreshed(app)).run('planningFileContent'), null);
});

test('Reset efface source et données métier avant reload', async () => {
    const { app } = await ready();
    await app.run('resetAll()');
    assert.equal(await app.run('planningStorage.read()'), undefined);
    assert.equal(app.localStorage.getItem('badminton_session'), null);
    assert.equal(app.localStorage.getItem('badminton_all_participants'), null);
    assert.equal(app.reloads, 1);
    assert.equal((await refreshed(app)).run('planningFileContent'), null);
});

test('échec Reset signalé, marqueur empêche restauration et nouvel essai possible', async () => {
    const { app } = await ready();
    app.run(`originalClear = planningStorage.clear; planningStorage.clear = async () => { throw Error('failure'); }`);
    await app.run('resetAll()');
    assert.equal(app.reloads, 0);
    assert.equal(app.localStorage.getItem('badminton_source_reset_pending'), '1');
    assert.match(app.alerts.at(-1), /incomplet/);
    app.run('planningStorage.clear = originalClear');
    await app.run('resetAll()');
    assert.equal(await app.run('planningStorage.read()'), undefined);
    assert.equal(app.reloads, 1);
});

test('import A lent puis B : B reste le planning sélectionné', async () => {
    const app = boot(), gate = deferred();
    const first = app.load(file(fixture(), 'A.xlsx', gate));
    await app.load(file(fixture('AUTRE FICTIF'), 'B.xlsx'));
    gate.resolve(); await first;
    assert.equal(app.run('planningSource.name'), 'B.xlsx');
});

test('restauration lente puis import : résultat ancien ignoré', async () => {
    const { app } = await ready();
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    const gate = deferred(); next.context.gate = gate;
    next.run('loadDataFromStorage(); originalRead = planningStorage.read; planningStorage.read = async () => { await gate.promise; return originalRead(); }');
    const restoring = next.run('restorePlanningSource()');
    await next.load(file(fixture('AUTRE FICTIF'), 'B.xlsx'));
    gate.resolve(); await restoring;
    assert.equal(next.run('planningSource.name'), 'B.xlsx');
    assert.match(next.run('getPlanningExportError()'), /pas la source/);
});

test('Reset pendant import empêche réinstallation tardive', async () => {
    const { app } = await ready(), gate = deferred();
    const importing = app.load(file(fixture(), 'lent.xlsx', gate));
    await app.run('resetAll()'); gate.resolve(); await importing;
    assert.equal(app.run('planningSource'), null);
    assert.equal(await app.run('planningStorage.read()'), undefined);
});

test('Reset pendant restauration empêche réinstallation tardive', async () => {
    const { app } = await ready(), gate = deferred();
    app.context.gate = gate;
    app.run('originalRead = planningStorage.read; planningStorage.read = async () => { await gate.promise; return originalRead(); }');
    const restoring = app.run('restorePlanningSource()');
    await app.run('resetAll()'); gate.resolve(); await restoring;
    assert.equal(app.run('planningSource'), null);
});

test('écriture déjà en attente puis Reset : aucune source ne ressuscite', async () => {
    const { app } = await ready();
    const writing = app.run('persistSessionSource(planningSource, activeSession)');
    const resetting = app.run('resetAll()');
    await Promise.all([writing, resetting]);
    assert.equal(await app.run('planningStorage.read()'), undefined);
});

test('sessions successives : seule la dernière source est persistée', async () => {
    const { app } = await ready();
    const oldWriting = app.run('persistSessionSource(planningSource, activeSession)');
    const other = fixture('AUTRE FICTIF');
    await app.load(file(other)); await app.start(); await oldWriting;
    sameBytes((await app.run('planningStorage.read()')).bytes, other);
});

test('Reset pendant export ignore la réponse et ne télécharge pas un résultat obsolète', async () => {
    const gate = deferred();
    const { app } = await ready({ exportGate: gate });
    app.run('backendAvailable = true');
    const exporting = app.run('downloadPlanning()');
    while (!app.posts.length) await new Promise(resolve => setImmediate(resolve));
    await app.run('resetAll()'); gate.resolve(); await exporting;
    assert.equal(app.downloads.length, 0);
});

test('garde IndexedDB ignore une écriture devenue obsolète', async () => {
    const app = boot();
    await app.run("planningStorage.write({bytes: new ArrayBuffer(1)}, () => false)");
    assert.equal(await app.run('planningStorage.read()'), undefined);
});
