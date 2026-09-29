const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ready, boot, deferred } = require('./harness.cjs');

function mailServer(app, handler) {
    const requests = [];
    app.context.fetch = async (url, options) => {
        if (url.endsWith('/mail-status')) return { ok: true, json: async () => ({ available: true, mode: 'test' }) };
        assert.ok(url.endsWith('/send-pointage'));
        assert.match(options.headers.Authorization, /^Bearer /);
        requests.push(JSON.parse(options.body));
        return handler ? handler() : { ok: true, json: async () => ({ state: 'sent' }) };
    };
    return requests;
}

test('explicit send snapshots note/current source; double click sends once; F5 restores outcome', async () => {
    const { app, bytes } = await ready();
    const gate = deferred();
    const requests = mailServer(app, async () => { await gate.promise; return { ok: true, json: async () => ({ state: 'sent' }) }; });
    app.get('pointageNote').value = 'Anomalie synthétique';
    app.run('savePointageNote()');
    const sending = app.run('sendPointage()');
    await app.run('sendPointage()');
    gate.resolve();
    await sending;
    assert.equal(requests.length, 1);
    assert.equal(requests[0].note, 'Anomalie synthétique');
    assert.equal(requests[0].participants, 2);
    assert.deepEqual(Buffer.from(requests[0].file, 'base64'), Buffer.from(bytes));
    assert.equal(app.run('activeSession.mail.state'), 'sent');
    const restored = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    restored.run('loadDataFromStorage()');
    await restored.run('restorePlanningSource()');
    assert.equal(restored.run('activeSession.note'), 'Anomalie synthétique');
    assert.equal(restored.run('activeSession.mail.state'), 'sent');
    assert.equal(restored.run('getPlanningExportError()'), '');
});

test('network uncertainty preserves state and download; resend needs confirmation', async () => {
    const { app } = await ready();
    const requests = mailServer(app, () => { throw new Error('network'); });
    await app.run('sendPointage()');
    assert.equal(app.run('activeSession.mail.state'), 'uncertain');
    app.context.confirm = () => false;
    await app.run('sendPointage()');
    assert.equal(requests.length, 1);
    app.run('backendAvailable = false');
    await app.run('downloadPlanning()');
    assert.equal(app.downloads.length, 1);
    assert.ok(app.localStorage.getItem('badminton_session'));
});

test('failed mail allows explicit retry without clearing pointage', async () => {
    const { app } = await ready();
    const requests = mailServer(app, () => ({ ok: true, json: async () => ({ state: 'not_sent' }) }));
    await app.run('sendPointage()');
    await app.run('sendPointage()');
    assert.equal(requests.length, 2);
    assert.notEqual(requests[0].attemptId, requests[1].attemptId);
    assert.equal(app.run('players.length'), 2);
});

test('storage failure prevents submission; reset cannot be resurrected by late response', async () => {
    const { app } = await ready();
    const requests = mailServer(app);
    const setItem = app.localStorage.setItem;
    app.context.console = { ...console, error() {} };
    app.localStorage.setItem = () => { throw new Error('storage'); };
    await app.run('sendPointage()');
    assert.equal(requests.length, 0);
    app.localStorage.setItem = setItem;
    const entered = deferred(), gate = deferred();
    mailServer(app, async () => { entered.resolve(); await gate.promise; return { ok: true, json: async () => ({ state: 'sent' }) }; });
    const sending = app.run('sendPointage()');
    await entered.promise;
    await app.run('resetPlanningApplication()');
    gate.resolve();
    await sending;
    assert.equal(app.run('activeSession'), null);
    assert.equal(app.localStorage.getItem('badminton_session'), null);
});

test('compatible reimport keeps note; reset and new session clear it', async () => {
    const { app, bytes } = await ready();
    app.get('pointageNote').value = 'Note synthétique';
    app.run('savePointageNote()');
    const { file } = require('./harness.cjs');
    await app.load(file(bytes));
    assert.equal(app.run('activeSession.note'), 'Note synthétique');
    await app.run('resetPlanningApplication()');
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    next.run('loadDataFromStorage()');
    await next.load(file(bytes));
    await next.start();
    assert.equal(next.run('activeSession.note'), undefined);
    assert.equal(next.get('pointageNote').value, '');
});

test('source persistence failure prevents mail and retains local export', async () => {
    const { app } = await ready();
    const requests = mailServer(app);
    app.run("planningStorage.write = async () => { throw new Error('storage unavailable'); }");
    await app.run('sendPointage()');
    assert.equal(requests.length, 0);
    assert.equal(app.run('activeSession.mail.state'), 'not_sent');
    app.run('backendAvailable = false');
    await app.run('downloadPlanning()');
    assert.equal(app.downloads.length, 1);
});
