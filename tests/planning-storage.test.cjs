const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IDBObjectStore } = require('fake-indexeddb');
const { boot, ready, file, fixture, deferred } = require('./harness.cjs');

test('un succès put suivi d’un abort ne doit pas annoncer une sauvegarde réussie', async () => {
    const app = boot();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        const request = original.apply(this, args);
        request.addEventListener('success', () => this.transaction.abort());
        return request;
    };
    try {
        await assert.rejects(app.run('planningStorage.write({bytes: new ArrayBuffer(3)})'));
    } finally { IDBObjectStore.prototype.put = original; }
    assert.equal(await app.run('planningStorage.read()'), undefined);
    await app.run('planningStorage.write({bytes: new ArrayBuffer(4)})');
    assert.equal((await app.run('planningStorage.read()')).bytes.byteLength, 4);
});

test('quota dépassé : erreur de transaction récupérable, ancienne source conservée', async () => {
    const { app, bytes } = await ready();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
        throw new DOMException('Quota', 'QuotaExceededError');
    };
    try {
        await app.load(file(bytes));
        await app.run('planningStorage.read()');
        assert.equal(app.run('getPlanningExportError()'), '');
        assert.match(app.get('planningStorageStatus').textContent, /non sauvegardée/);
    } finally { IDBObjectStore.prototype.put = original; }
    assert.deepEqual(Buffer.from((await app.run('planningStorage.read()')).bytes), Buffer.from(bytes));
});

test('ouverture bloquée refuse proprement et ferme un succès tardif', async () => {
    const requests = [];
    const app = boot({ indexedDB: { open() {
        const request = {}; requests.push(request);
        queueMicrotask(() => request.onblocked());
        return request;
    } } });
    await assert.rejects(app.run('planningStorage.read()'), /occupé/);
    let closed = false;
    requests[0].result = { close() { closed = true; } };
    requests[0].onsuccess();
    assert.equal(closed, true);
});

test('ouverture sans réponse expire et permet le fallback manuel', async () => {
    const app = boot({ indexedDB: { open() { return {}; } }, fastStorageTimeout: true });
    await assert.rejects(app.run('planningStorage.read()'), /indisponible/);
    await app.load(file(fixture()));
    assert.equal(app.run('planningSource.name'), 'synthetique.xlsx');
    assert.equal(app.run('planningBusy'), false);
});

test('Reset après une écriture déjà lancée attend puis efface cette écriture', async () => {
    const { app } = await ready();
    const entered = deferred();
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
        const request = original.apply(this, args);
        entered.resolve();
        return request;
    };
    try {
        const writing = app.run('persistSessionSource(planningSource, activeSession)');
        await entered.promise;
        const resetting = app.run('resetAll()');
        await Promise.all([writing, resetting]);
        assert.equal(await app.run('planningStorage.read()'), undefined);
    } finally { IDBObjectStore.prototype.put = original; }
});
