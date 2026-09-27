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
    edit('xl/styles.xml', xml => {
        // Même structure que les cas témoins : fills 18/19, styles élevés et composites.
        const fills = Array.from({ length: 20 }, (_, i) => i < 18
            ? '<fill><patternFill patternType="solid"><fgColor theme="0"/><bgColor rgb="FF00FF00"/></patternFill></fill>'
            : `<fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/>${i === 18 ? '<bgColor rgb="FF00FF00"/>' : '<bgColor indexed="64"/>'}</patternFill></fill>`);
        const xfs = Array.from({ length: 550 }, (_, i) =>
            `<xf numFmtId="0" fontId="1" fillId="${i === 547 ? 18 : i >= 548 ? 19 : 0}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>`);
        return xml.replace(/<fills[\s\S]*?<\/fills>/, `<fills count="20">${fills.join('')}</fills>`)
            .replace(/<cellXfs[\s\S]*?<\/cellXfs>/, `<cellXfs count="550">${xfs.join('')}</cellXfs>`)
            .replace('<fonts count="1">', '<fonts count="2">')
            .replace('</fonts>', '<font><b/><sz val="11"/><name val="Arial"/></font></fonts>')
            .replace('<borders count="1">', '<borders count="2">')
            .replace('</borders>', '<border><left style="thin"><color indexed="64"/></left><right/><top/><bottom/><diagonal/></border></borders>');
    });
    edit('xl/worksheets/sheet1.xml', xml => {
        for (const [cell, style] of Object.entries({ B4: 547, C4: 548, D4: 549, E5: 547, B7: 547, C7: 548, D7: 549 })) {
            xml = xml.replace(new RegExp(`<c r="${cell}"`), `<c r="${cell}" s="${style}"`);
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


test('restauration recalcule les faux déjà persistés, sans perdre les pointages', async () => {
    const { app } = await setup();
    app.run(`allParticipants.forEach(p => p.nouveauCreneau = false);
        saveDataToStorage('badminton_all_participants', allParticipants);
        journalEntries = [{id:'P003',session:activeSession.sheet+'_'+activeSession.dateLabel}];
        saveDataToStorage('badminton_journal', journalEntries)`);
    const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
    next.run('loadDataFromStorage()');
    assert.equal(next.run('players[0].nouveauCreneau'), false);
    await next.run('restorePlanningSource()');
    assert.equal(next.run('players[0].nouveauCreneau'), true);
    assert.equal(next.run('players[1].nouveauCreneau'), false);
    assert.equal(next.run('players[3].nouveauCreneau'), true);
    assert.equal(next.run('journalEntries.length'), 1);
    assert.equal(JSON.parse(next.localStorage.getItem('badminton_all_participants'))[0].nouveauCreneau, true);
    assert.match(next.get('participantsList').innerHTML, /🆕 Nouveau/);
});

test('réimport compatible répare les booléens ; source différente ne les réécrit pas', async () => {
    const { app, bytes } = await setup();
    app.run(`allParticipants.forEach(p => p.nouveauCreneau = false);
        saveDataToStorage('badminton_all_participants', allParticipants)`);
    // Ajouter un octet change le hash mais laisse le ZIP lisible par SheetJS.
    const other = new Uint8Array(bytes.byteLength + 1);
    other.set(new Uint8Array(bytes));
    await app.load(file(other.buffer));
    assert.match(app.run('getPlanningExportError()'), /pas la source/);
    assert.equal(app.run('players[0].nouveauCreneau'), false);
    await app.load(file(bytes));
    assert.equal(app.run('players[0].nouveauCreneau'), true);
    assert.equal(app.run('players[1].nouveauCreneau'), false);
    assert.equal(app.run('getPlanningExportError()'), '');
    assert.equal(JSON.parse(app.localStorage.getItem('badminton_all_participants'))[0].nouveauCreneau, true);
});
