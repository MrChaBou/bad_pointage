const { test } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const { boot, file } = require('./harness.cjs');

// Construire un vrai XLSX synthétique : CE n'écrit pas les remplissages personnalisés.
function styledFixture() {
    const wb = XLSX.utils.book_new();
    const day = Math.floor(Date.UTC(2026, 8, 27) / 86400000) + 25569;
    const ws = XLSX.utils.aoa_to_sheet([
        ['', '', '', '', day, day + 7], [], [],
        ['', 'FICTIF NOUVEAU', 'Alpha', 'alpha@example.invalid'],
        ['', 'FICTIF DATE', 'Beta', 'beta@example.invalid', 'V'],
        ['', 'FICTIF NORMAL', 'Gamma'],
        ['', 'FICTIF ESSAI', 'Delta', '', 'ESSAI PRESENT'],
        ['', 'FICTIF AUTRE JOUR', 'Epsilon', '', '', 'ESSAI'],
        ["LISTE D’ATTENTE"], ['', 'FICTIF ATTENTE', 'Zeta']
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Créneau');
    const zip = XLSX.CFB.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    function edit(name, transform) {
        const entry = XLSX.CFB.find(zip, '/' + name);
        entry.content = Buffer.from(transform(Buffer.from(entry.content).toString()));
        entry.size = entry.content.length;
    }
    edit('xl/styles.xml', xml => xml.replace('<fills count="2">', '<fills count="3">')
        .replace('</fills>', '<fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/></patternFill></fill></fills>')
        .replace('<cellXfs count="1">', '<cellXfs count="2">')
        .replace('</cellXfs>', '<xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/></cellXfs>'));
    edit('xl/worksheets/sheet1.xml', xml => {
        for (const cell of ['B4', 'C4', 'D4', 'E5', 'B7', 'C7', 'D7']) {
            xml = xml.replace(new RegExp(`<c r="${cell}"`), `<c r="${cell}" s="1"`);
        }
        return xml;
    });
    const bytes = XLSX.CFB.write(zip, { type: 'buffer', fileType: 'zip' });
    return Uint8Array.from(bytes).buffer;
}
async function setup() {
    const app = boot(), bytes = styledFixture();
    await app.load(file(bytes));
    app.get('sheetSelect').value = 'Créneau';
    app.run('loadDates()');
    app.get('dateSelect').value = '4|0';
    app.get('dateSelect').options.forEach(o => { o.text = o.textContent; });
    app.run('startSession()');
    await app.run('planningStorage.read()');
    return { app, bytes };
}

test('SheetJS 0.18.5 : styles réels, B/C/D verts, dates seules, normal, ESSAI et attente', async () => {
    assert.equal(XLSX.version, '0.18.5');
    const { app, bytes } = await setup();
    assert.equal(XLSX.read(bytes).Sheets['Créneau'].B4.s, undefined);
    assert.equal(app.run('planningWorkbook.Sheets["Créneau"].B4.s.fgColor.rgb'), '00FF00');
    assert.deepEqual(JSON.parse(app.run('JSON.stringify(allParticipants.map(p => [p.statut, p.nouveauCreneau]))')),
        [['Inscrit', true], ['Inscrit', false], ['Inscrit', false], ['ESSAI', true]]);
    assert.deepEqual(Buffer.from(app.run('planningFileContent')), Buffer.from(bytes));
});

test('détection stricte : trois cellules, remplissage uni, couleur exacte et RGB explicite', () => {
    const app = boot();
    app.run(`ws = {}; for (const c of ['B4', 'C4', 'D4']) ws[c] = {s: {patternType:'solid', fgColor:{rgb:'00FF00'}}};`);
    assert.equal(app.run('isNouveauCreneau(ws, 3)'), true);
    for (const change of ["delete ws.D4", "ws.D4.s.patternType = 'darkGrid'", "ws.D4.s.fgColor.rgb = '00FE00'", "ws.D4.s.fgColor.theme = 3", "ws.D4.s.fgColor.tint = 0.5"]) {
        app.run("ws.D4 = {s:{patternType:'solid',fgColor:{rgb:'00FF00'}}}");
        app.run(change);
        assert.equal(app.run('isNouveauCreneau(ws, 3)'), false);
    }
});

test('F5 conserve les booléens et enrichit seulement les anciennes identités identiques', async () => {
    const { app } = await setup();
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    next.run('loadDataFromStorage()');
    assert.equal(next.run('players[0].nouveauCreneau'), true);
    assert.equal(next.run('players[1].nouveauCreneau'), false);
    next.run(`allParticipants.forEach(p => delete p.nouveauCreneau); saveDataToStorage('badminton_all_participants', allParticipants)`);
    await next.run('restorePlanningSource()');
    assert.equal(next.run('players[0].nouveauCreneau'), true);
    assert.equal(JSON.parse(next.localStorage.getItem('badminton_all_participants'))[3].nouveauCreneau, true);
    next.run(`delete allParticipants[0].nouveauCreneau; allParticipants[0].nom = 'DIVERGENT'`);
    await next.run('restorePlanningSource()');
    assert.equal(next.run('allParticipants[0].nouveauCreneau'), undefined);
});

test('badge dans liste, résultats, sélection et feedback, indépendant de présence et ESSAI', async () => {
    const { app } = await setup();
    app.run('updateParticipantsUI(); searchPlayerDynamic({target:{value:"FICTIF"}}); selectPlayerFromSearch("P006")');
    assert.match(app.get('participantsList').innerHTML, /🆕 Nouveau/);
    assert.match(app.get('participantsList').innerHTML, /ESSAI/);
    assert.match(app.get('searchResultsList').innerHTML, /🆕 Nouveau/);
    assert.match(app.get('playerBadges').innerHTML, /bg-blue-100/);
    app.run('showFeedback("Présence enregistrée !", "green", "✅")');
    assert.match(app.get('feedbackBadges').innerHTML, /🆕 Nouveau/);
    app.run('selectPlayerFromSearch("P005")');
    assert.equal(app.get('playerBadges').innerHTML, '');
});

test('export serveur conserve les octets stylés ; export local conserve ESSAI et attente', async () => {
    const { app, bytes } = await setup();
    app.run(`backendAvailable = true; journalEntries = [{id:'P006', nom:'FICTIF ESSAI', prenom:'Delta', session:activeSession.sheet+'_'+activeSession.dateLabel}]`);
    await app.run('downloadPlanning()');
    assert.deepEqual(Buffer.from(app.posts[0].file, 'base64'), Buffer.from(bytes));
    assert.equal(app.posts[0].presences.length, 1);
    // Autoriser la sérialisation uniquement pour tester le repli local existant.
    app.context.XLSX.write = XLSX.write;
    app.run('downloadLocally([{nom:"FICTIF ESSAI", prenom:"Delta"}])');
    let ws = XLSX.read(await app.downloads.at(-1).blob.arrayBuffer()).Sheets['Créneau'];
    assert.equal(ws.E7.v, 'ESSAI PRESENT');
    assert.equal(ws.F8.v, 'ESSAI');
    assert.equal(ws.B10.v, 'FICTIF ATTENTE');
    app.run('downloadLocally([])');
    ws = XLSX.read(await app.downloads.at(-1).blob.arrayBuffer()).Sheets['Créneau'];
    assert.equal(ws.E7.v, 'ESSAI ABSENT');
});
