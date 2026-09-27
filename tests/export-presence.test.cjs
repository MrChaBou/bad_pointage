const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { boot, file } = require('./harness.cjs');

async function setup() {
    const app = boot();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['', '', '', 46292]]);
    for (let r = 31; r <= 34; r++) XLSX.utils.sheet_add_aoa(ws, [['', 'Nom', 'Prénom', 'V']], {origin: {r, c: 0}});
    XLSX.utils.sheet_add_aoa(ws, [["LISTE D'ATTENTE"], ['', 'Nom', 'Prénom', 'attente']], {origin: 'A36'});
    XLSX.utils.book_append_sheet(wb, ws, 'Créneau');
    await app.load(file(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    await app.start();
    app.run(`journalEntries = players.filter(p => ['P032','P033','P034'].includes(p.id)).map(p => ({...p, session:activeSession.sheet+'_'+activeSession.dateLabel})); backendAvailable = true;`);
    return app;
}

test('payload transmet les IDs extraits P032/P033/P034 et filtre la session', async () => {
    const app = await setup();
    app.run(`journalEntries.push({id:'P031', nom:'Nom', prenom:'Prénom', session:'autre'})`);
    for (let i = 0; i < 2; i++) {
        await app.run('downloadPlanning()');
        assert.deepEqual(app.posts[i].presences, ['P032', 'P033', 'P034'].map(id => ({id, nom:'Nom', prenom:'Prénom'})));
    }
});

test('repli local après erreur serveur : trois lignes exactes, absent effacé, attente intacte', async () => {
    const app = await setup();
    app.context.fetch = async () => { throw new Error('offline'); };
    app.context.XLSX.write = XLSX.write;
    await app.run('downloadPlanning()');
    const ws = XLSX.read(await app.downloads[0].blob.arrayBuffer()).Sheets['Créneau'];
    assert.deepEqual(['D33','D34','D35'].map(cell => ws[cell].v), ['V','V','V']);
    assert.equal(ws.D32, undefined);
    assert.equal(ws.D37.v, 'attente');
});

test('ID invalide ou incompatible : le repli local ne produit aucun fichier', async () => {
    const app = await setup();
    app.context.XLSX.write = XLSX.write;
    for (const id of ['P34', 'P034\n', 'P0034', 'P035', 'P036', 'P999', null]) {
        app.context.badId = id;
        app.run(`downloadLocally([{id:badId, nom:'Nom', prenom:'Prénom'}])`);
    }
    app.run(`downloadLocally([{id:'P034', nom:'Autre', prenom:'Prénom'}])`);
    assert.equal(app.downloads.length, 0);
});
