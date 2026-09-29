const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { boot, file, fixture, deferred } = require('./harness.cjs');
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function response(bytes, changes = {}) {
    const metadata = { name: 'Créneaux été.xlsx', size: bytes.byteLength,
        sha256: createHash('sha256').update(Buffer.from(bytes)).digest('hex'),
        modifiedTime: '2026-09-28T10:00:00Z', driveVersion: '42', headRevisionId: null, md5Checksum: null, ...changes };
    return { ok: true, status: 200, headers: { get: key => key === 'Content-Type' ? mime : JSON.stringify(metadata) },
        arrayBuffer: async () => bytes.slice(0) };
}

test('Drive binaire, Bearer, source figée après F5 et export sans nouvelle lecture Drive', async () => {
    const bytes = fixture();
    let calls = 0;
    const driveFetch = async (url, request) => {
        calls++;
        assert.match(request.headers.Authorization, /^Bearer /);
        assert.equal(request.cache, 'no-store');
        return response(bytes);
    };
    const app = boot({ driveFetch });
    await app.run('loadCentralPlanning()');
    assert.equal(app.run('planningSource.origin'), 'drive');
    assert.deepEqual(Buffer.from(app.run('planningFileContent')), Buffer.from(bytes));
    await app.start();
    assert.equal(app.run('activeSession.sourceDrive.version'), '42');
    assert.equal(app.get('loadCentralPlanningButton').hidden, true);
    await app.run('loadCentralPlanning()');
    const restored = boot({ driveFetch, localStorage: app.localStorage, indexedDB: app.indexedDB });
    restored.run('loadDataFromStorage()');
    await restored.run('restorePlanningSource()');
    assert.equal(restored.run('planningSource.drive.version'), '42');
    await restored.run('loadCentralPlanning()');
    restored.run('backendAvailable = true');
    await restored.run('downloadPlanning()');
    assert.equal(Buffer.from(restored.posts[0].file, 'base64').compare(Buffer.from(bytes)), 0);
    restored.run('backendAvailable = false');
    await restored.run('downloadPlanning()');
    assert.equal(restored.downloads.length, 2);
    assert.equal(calls, 1);
});

test('échec Drive conserve la source utilisable et permet le secours manuel', async () => {
    const app = boot({ driveFetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'drive_unavailable' }) }) });
    const bytes = fixture();
    await app.load(file(bytes));
    const hash = app.run('planningSource.sha256');
    await app.run('loadCentralPlanning()');
    assert.equal(app.run('planningSource.sha256'), hash);
    assert.match(app.get('planningStorageStatus').textContent, /secours/);
    await app.load(file(fixture('AUTRE FICTIF')));
    assert.notEqual(app.run('planningSource.sha256'), hash);
});

test('source Drive altérée ou métadonnées invalides ne remplacent pas la source', async () => {
    for (const change of [{ sha256: '0'.repeat(64) }, { size: 1 }, { driveVersion: undefined }]) {
        const app = boot({ driveFetch: async () => response(fixture(), change) });
        await app.run('loadCentralPlanning()');
        assert.equal(app.run('planningSource'), null);
        assert.equal(app.run('planningBusy'), false);
    }
});

test('réponse tardive après logout ou import manuel ignorée', async () => {
    for (const action of ['logout', 'manual']) {
        const gate = deferred();
        const app = boot({ driveFetch: async () => { await gate.promise; return response(fixture()); } });
        const pending = app.run('loadCentralPlanning()');
        if (action === 'logout') app.run('lockAccess()');
        else await app.load(file(fixture('MANUEL FICTIF')));
        gate.resolve();
        await pending;
        if (action === 'logout') assert.equal(app.run('planningSource'), null);
        else assert.equal(app.run('planningSource.origin'), 'manual');
    }
});

test('aucun appel avant authentification et aucune double requête', async () => {
    let calls = 0;
    const gate = deferred();
    const driveFetch = async () => { calls++; await gate.promise; return response(fixture()); };
    const locked = boot({ authenticated: false, driveFetch });
    await locked.run('loadCentralPlanning()');
    assert.equal(calls, 0);
    const app = boot({ driveFetch });
    const pending = app.run('loadCentralPlanning()');
    await app.run('loadCentralPlanning()');
    assert.equal(calls, 1);
    gate.resolve();
    await pending;
});

test('réimport exact répare une source Drive absente sans perdre sa provenance', async () => {
    const bytes = fixture();
    const app = boot({ driveFetch: async () => response(bytes) });
    await app.run('loadCentralPlanning()');
    await app.start();
    app.run('planningSource = planningWorkbook = planningFileContent = null');
    await app.load(file(bytes));
    await app.run('planningStorage.read()');
    assert.equal(app.run('planningSource.origin'), 'drive');
    assert.equal(app.run('planningSource.drive.version'), '42');
    assert.equal(app.run('getPlanningExportError()'), '');
    assert.equal((await app.run('planningStorage.read()')).drive.version, '42');
});

test('401 verrouille ; panne Google et timeout ne déconnectent pas le responsable', async () => {
    for (const kind of ['401', 'credentials', 'timeout']) {
        const app = boot({ driveFetch: async () => {
            if (kind === 'timeout') throw Object.assign(new Error(), { name: 'AbortError' });
            return { ok: false, status: kind === '401' ? 401 : 503,
                json: async () => ({ error: kind === '401' ? 'unauthorized' : 'drive_credentials_invalid' }) };
        } });
        await app.run('loadCentralPlanning()');
        assert.equal(app.run('accessAllowed()'), kind !== '401');
        assert.equal(app.run('planningBusy'), false);
        assert.equal(app.run('planningSource'), null);
    }
});

test('classeur sans cible métier et réponse non XLSX refusés', async () => {
    const XLSX = require('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['Sans dates ni participants']]), 'Vide');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const app = boot({ driveFetch: async () => response(bytes) });
    await app.run('loadCentralPlanning()');
    assert.equal(app.run('planningSource'), null);
    assert.match(app.get('planningStorageStatus').textContent, /incompatible/);
    const html = boot({ driveFetch: async () => ({ ...response(bytes), headers: { get: () => 'text/html' } }) });
    await html.run('loadCentralPlanning()');
    assert.equal(html.run('planningSource'), null);
});

test('Reset pendant téléchargement ne réinstalle pas de source', async () => {
    const gate = deferred();
    const app = boot({ driveFetch: async () => { await gate.promise; return response(fixture()); } });
    const pending = app.run('loadCentralPlanning()');
    await app.run('resetPlanningApplication()');
    gate.resolve();
    await pending;
    assert.equal(app.run('planningSource'), null);
    assert.equal(await app.run('planningStorage.read()'), undefined);
});

test('auth réussie sans source : chargement automatique unique et configuration visible', async () => {
    let calls = 0;
    const app = boot({ authenticated: false, driveFetch: async () => { calls++; return response(fixture()); } });
    await app.run('init()');
    assert.equal(calls, 0);
    await app.run('submitAccess()');
    assert.equal(calls, 1);
    assert.equal(app.run('planningSource.origin'), 'drive');
    assert.equal(app.get('planningConfig').classList.contains('hidden'), false);
    assert.equal(app.run('activeSession'), null);
    await app.run('logoutAccess();');
    await app.run('submitAccess()');
    assert.equal(calls, 1, 'La source en mémoire avant démarrage est conservée à la reconnexion');
});

test('échec automatique : accès ouvert, relance centrale et secours manuel disponibles', async () => {
    let calls = 0;
    const app = boot({ authenticated: false, driveFetch: async () => {
        calls++;
        return calls === 1 ? { ok: false, status: 503, json: async () => ({ error: 'drive_unavailable' }) }
            : response(fixture());
    } });
    await app.run('init()');
    await app.run('submitAccess()');
    assert.equal(app.run('accessAllowed()'), true);
    assert.match(app.get('planningStorageStatus').textContent, /Réessayez ou importez un fichier de secours/);
    assert.equal(app.get('planningFallback').hidden, false);
    assert.equal(app.get('loadCentralPlanningButton').disabled, false);
    assert.equal(app.get('loadCentralPlanningButton').hidden, false);
    await app.get('loadCentralPlanningButton').events.click();
    assert.equal(calls, 2);
    assert.equal(app.get('planningFallback').hidden, true);
    assert.equal(app.run('planningSource.origin'), 'drive');
    await app.load(file(fixture('SECOURS FICTIF')));
    assert.equal(app.run('planningSource.origin'), 'manual');
});

test('F5 authentifié : restauration locale attendue, jamais de Drive même si source perdue', async () => {
    for (const missing of [false, true]) {
        let calls = 0;
        const driveFetch = async () => { calls++; return response(fixture()); };
        const app = boot({ authenticated: false, driveFetch });
        await app.run('submitAccess()');
        await app.start();
        if (missing) await app.run('planningStorage.clear()');
        const next = boot({ authenticated: false, driveFetch, localStorage: app.localStorage,
            indexedDB: app.indexedDB, sessionStorage: app.sessionStorage });
        const gate = deferred();
        next.context.restoreGate = gate;
        next.run('originalRead = planningStorage.read; planningStorage.read = async () => { await restoreGate.promise; return originalRead(); }');
        const pending = next.run('init()');
        // Laisser la validation auth atteindre la restauration suspendue.
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(calls, 1);
        gate.resolve();
        await pending;
        assert.equal(calls, 1);
        assert.equal(!!next.run('planningSource'), !missing);
        assert.ok(next.run('activeSession.sourceHash'));
    }
});

test('auth refusée et logout pendant restauration ne déclenchent pas Drive', async () => {
    let calls = 0;
    const driveFetch = async () => { calls++; return response(fixture()); };
    const denied = boot({ authenticated: false, driveFetch,
        authFetch: async () => ({ ok: false, status: 401 }) });
    await denied.run('submitAccess()');
    assert.equal(calls, 0);
    const app = boot({ authenticated: false, driveFetch });
    const gate = deferred();
    app.context.restoreGate = gate;
    app.run('restorePlanningSource = async () => { await restoreGate.promise; }');
    const pending = app.run('submitAccess()');
    await new Promise(resolve => setImmediate(resolve));
    app.run('lockAccess()');
    gate.resolve();
    await pending;
    assert.equal(calls, 0);
});

test('secours : aide native au survol et action centrale de relance', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<button[^>]*title="En cas de problème avec le planning central,[^"]*ne modifie pas le fichier officiel du Drive\."[^>]*>Importer un fichier — secours<\/button>/);
    assert.match(html, /id="loadCentralPlanningButton"[^>]*>Recharger le planning central<\/button>/);
});


test('secours masqué dans le HTML et pendant le premier chargement central', async () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /<div id="planningFallback" hidden>\s*<input[\s\S]*?Importer un fichier — secours[\s\S]*?À utiliser seulement si le planning central[\s\S]*?<\/div>/);
    const gate = deferred();
    const app = boot({ driveFetch: async () => { await gate.promise; return response(fixture()); } });
    const pending = app.run('loadCentralPlanning()');
    assert.equal(app.get('planningFallback').hidden, true);
    gate.resolve();
    await pending;
    assert.equal(app.get('planningFallback').hidden, true);
});
