const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('xlsx');
const { boot, file } = require('./harness.cjs');

// Opt-in local : jamais de copie du classeur, ni de valeurs personnelles dans les assertions.
// BAD_POINTAGE_REFERENCE=/chemin/prive.xlsx node --test tests/nouveau-local.test.cjs
const reference = process.env.BAD_POINTAGE_REFERENCE;
test('référence locale : parseur navigateur, témoins et ancienne session restaurée',
    { skip: !reference }, async () => {
    const browser = vm.createContext({ console });
    vm.runInContext(fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8'), browser);
    assert.equal(browser.XLSX.version, '0.18.5');
    const bytes = Uint8Array.from(fs.readFileSync(reference)).buffer;
    const sheetName = 'Vendredi 18h00 à 20h00';
    for (const parser of [XLSX, browser.XLSX]) {
        const app = boot();
        app.context.XLSX.read = parser.read;
        await app.load(file(bytes, 'reference-locale.xlsx'));
        app.get('sheetSelect').value = sheetName;
        app.run('loadDates()');
        app.get('dateSelect').value = app.get('dateSelect').options.find(o => o.value).value;
        app.get('dateSelect').options.forEach(o => { o.text = o.textContent; });
        await app.run('startSession()');
        await app.run('planningStorage.read()');
        app.context.witnessSheet = sheetName;
        assert.equal(app.run('isNouveauCreneau(planningWorkbook.Sheets[witnessSheet], 33)'), true);
        assert.equal(app.run('isNouveauCreneau(planningWorkbook.Sheets[witnessSheet], 5)'), false);
        for (const cell of ['B34', 'C34', 'D34']) {
            app.context.witnessCell = cell;
            assert.equal(app.run('planningWorkbook.Sheets[witnessSheet][witnessCell].s.patternType'), 'solid');
            assert.equal(app.run('planningWorkbook.Sheets[witnessSheet][witnessCell].s.fgColor.rgb'), '00FF00');
        }
        // Recréer les participants avec les options d'avant dfbca65, sans l'attribut.
        app.context.rawBytes = bytes;
        app.run(`oldWorkbook = XLSX.read(new Uint8Array(rawBytes.slice(0)), {type:'array', cellDates:false});
            allParticipants = extractPlanningParticipants(oldWorkbook.Sheets[witnessSheet], activeSession.columnIndex,
                getPlanningDates(oldWorkbook, witnessSheet).map(d => Number(d.value.split('|')[0])));
            allParticipants.forEach(p => delete p.nouveauCreneau);
            saveDataToStorage('badminton_all_participants', allParticipants);`);
        for (const persistedFalse of [false, true]) {
            if (persistedFalse) app.run(`allParticipants.forEach(p => p.nouveauCreneau = false);
                saveDataToStorage('badminton_all_participants', allParticipants)`);
            const next = boot({ localStorage: app.localStorage, indexedDB: app.indexedDB });
            next.context.XLSX.read = parser.read;
            next.run('loadDataFromStorage()');
            await next.run('restorePlanningSource()');
            assert.equal(next.run('getPlanningExportError()'), '');
            assert.equal(next.run('allParticipants.find(p => p.id === "P033")?.nouveauCreneau'), true, persistedFalse ? 'false persisté' : 'attribut absent');
            assert.equal(next.run('allParticipants.find(p => p.id === "P005")?.nouveauCreneau'), false);
            assert.equal(next.run('planningFileContent.byteLength'), bytes.byteLength);
        }
    }
});
