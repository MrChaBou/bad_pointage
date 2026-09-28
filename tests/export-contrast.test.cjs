const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('xlsx');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { boot, file } = require('./harness.cjs');
const xml = text => new DOMParser().parseFromString(text, 'application/xml');
const serialize = node => new XMLSerializer().serializeToString(node);
const nodes = (node, name) => Array.from(node.childNodes).filter(n => n.nodeType === 1 && (!name || n.localName === name));
const one = (node, name) => nodes(node, name)[0];
const entry = (zip, name) => XLSX.CFB.find(zip, '/' + name);
const read = (zip, name) => xml(Buffer.from(entry(zip, name).content).toString());

function fixture() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['', '', '', '', '', '', 46292]]);
    for (let row = 32; row <= 40; row++) {
        XLSX.utils.sheet_add_aoa(ws, [['', 'SYNTHETIQUE', 'Test', '', '', '', row >= 36 && row <= 38
            ? ['ESSAI', 'ESSAI PRESENT', 'ESSAI ABSENT'][row - 36] : 'V']], { origin: 'A' + row });
    }
    ws.A39 = { t: 's', v: "LISTE D'ATTENTE" };
    XLSX.utils.book_append_sheet(wb, ws, 'Créneau');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['INCHANGE']]), 'Autre');
    const zip = XLSX.CFB.read(XLSX.write(wb, {type: 'buffer', bookType: 'xlsx'}), {type: 'buffer'});
    const edit = (name, transform) => {
        const part = entry(zip, name);
        part.content = Buffer.from(transform(Buffer.from(part.content).toString()));
        part.size = part.content.length;
    };
    edit('xl/theme/theme1.xml', text => text.replace(/lastClr="000000"/, 'lastClr="FFFFFF"').replace(/val="window" lastClr="FFFFFF"/, 'val="window" lastClr="000000"'));
    edit('xl/styles.xml', text => text
        .replace(/<fonts[\s\S]*?<\/fonts>/, '<fonts count="3">' + [0, 1, 0].map((theme, i) =>
            `<font><name val="Arial"/><sz val="13"/><b/><i/><u val="single"/><color ${i === 2 ? 'rgb="FF111111"' : `theme="${theme}"`}/></font>`).join('') + '</fonts>')
        .replace(/<fills[\s\S]*?<\/fills>/, '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor theme="0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111111"/></patternFill></fill></fills>')
        .replace(/<borders[\s\S]*?<\/borders>/, '<borders count="1"><border><left style="thin"><color rgb="FFFF0000"/></left><right/><top/><bottom/><diagonal/></border></borders>')
        .replace(/<cellXfs[\s\S]*?<\/cellXfs>/, '<cellXfs count="4">' + [[1,0], [0,1], [1,1], [2,2]].map(([font,fill]) =>
            `<xf numFmtId="49" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/><protection locked="1"/></xf>`).join('') + '</cellXfs>'));
    edit('xl/worksheets/sheet1.xml', text => {
        for (let row = 32; row <= 40; row++) {
            text = text.replace(new RegExp(`<c r="G${row}"`), `<c r="G${row}" s="${row === 33 ? 2 : row === 34 ? 3 : 1}"`);
        }
        return text;
    });
    return Uint8Array.from(XLSX.CFB.write(zip, {type:'buffer', fileType:'zip'})).buffer;
}

function inspect(bytes) {
    const zip = XLSX.CFB.read(new Uint8Array(bytes), {type:'array'});
    const styles = read(zip, 'xl/styles.xml').documentElement;
    const sheet = read(zip, 'xl/worksheets/sheet1.xml');
    const fonts = nodes(one(styles, 'fonts'), 'font');
    const xfs = nodes(one(styles, 'cellXfs'), 'xf');
    const wb = XLSX.read(bytes, {type:'array', cellStyles:true});
    return { zip, styles, fonts, xfs, wb, style(address) {
        const cell = Array.from(sheet.getElementsByTagNameNS('*', 'c')).find(n => n.getAttribute('r') === address);
        const id = Number(cell?.getAttribute('s') || 0);
        const xf = xfs[id];
        return {cell, id, xf, font: fonts[Number(xf.getAttribute('fontId'))]};
    }};
}

async function setup(bytes, sheetName = 'Créneau', parser) {
    const app = boot();
    if (parser) app.context.XLSX = parser;
    await app.load(file(bytes));
    app.get('sheetSelect').value = sheetName;
    app.run('loadDates()');
    const date = app.get('dateSelect').options.find(o => o.value.startsWith('6|'));
    assert.ok(date, 'Date en colonne G');
    app.get('dateSelect').value = date.value;
    app.get('dateSelect').options.forEach(o => { o.text = o.textContent; });
    await app.run('startSession()');
    await app.run('planningStorage.read()');
    return app;
}

test('fallback XLSX : V et ESSAI contrastés, styles lisibles et autres parties intacts', async () => {
    const bytes = fixture(), source = inspect(bytes);
    const app = await setup(bytes);
    for (const trialPresent of [true, false]) {
        app.context.testIds = ['P032','P033','P034', ...(trialPresent ? ['P035','P036','P037'] : [])];
        app.run(`downloadLocally(allParticipants.filter(p => testIds.includes(p.id)))`);
        assert.equal(app.downloads.length, trialPresent ? 1 : 2);
        const exported = inspect(await app.downloads.at(-1).blob.arrayBuffer());
        const ws = exported.wb.Sheets['Créneau'];
        assert.deepEqual([ws.G33.v, ws.G34.v, ws.G35.v], ['V','V','V']);
        for (const row of [36,37,38]) assert.equal(ws['G' + row].v, trialPresent ? 'ESSAI PRESENT' : 'ESSAI ABSENT');
        assert.equal(ws.G32?.v, undefined);
        for (const address of ['G32', 'G33', 'G39', 'G40']) {
            assert.equal(exported.style(address).id, source.style(address).id);
            assert.equal(serialize(exported.style(address).font), serialize(source.style(address).font));
        }
        for (const address of ['G34', 'G35', 'G36', 'G37', 'G38']) {
            const before = source.style(address), after = exported.style(address);
            assert.equal(one(after.font, 'color').getAttribute('theme'), '1');
            const expectedFont = before.font.cloneNode(true);
            expectedFont.replaceChild(one(after.font, 'color').cloneNode(true), one(expectedFont, 'color'));
            assert.equal(serialize(after.font), serialize(expectedFont), 'Seule la couleur de police change');
            const expectedXf = before.xf.cloneNode(true);
            expectedXf.setAttribute('fontId', after.xf.getAttribute('fontId'));
            assert.equal(serialize(after.xf), serialize(expectedXf), 'Fill, bordures, format, protection, alignement intacts');
        }
        for (const name of ['fills','borders','cellStyleXfs']) assert.equal(serialize(one(exported.styles, name)), serialize(one(source.styles, name)));
        for (const path of source.zip.FullPaths) {
            const name = path.slice(path.indexOf('/') + 1);
            if (!name || name.endsWith('/') || ['xl/styles.xml','xl/worksheets/sheet1.xml'].includes(name)) continue;
            assert.deepEqual(Buffer.from(entry(exported.zip,name).content), Buffer.from(entry(source.zip,name).content), name);
        }
        assert.equal(exported.xfs.length, source.xfs.length + 2, 'Un style dérivé par style source peu contrasté');
    }
});

test('fallback avec le bundle SheetJS navigateur 0.18.5 : archive et contraste conservés', async () => {
    const browser = vm.createContext({console});
    vm.runInContext(fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8'), browser);
    const app = await setup(fixture(), 'Créneau', browser.XLSX);
    app.run(`downloadLocally(allParticipants.filter(p => ['P032','P033','P034'].includes(p.id)))`);
    assert.equal(app.downloads.length, 1);
    const result = inspect(await app.downloads[0].blob.arrayBuffer());
    assert.equal(result.wb.Sheets['Créneau'].G35.v, 'V');
    assert.equal(one(result.style('G35').font, 'color').getAttribute('theme'), '1');
});

test('fallback : couleurs indexées et tint résolus, couleurs inconnues conservées', async () => {
    for (const color of ['indexed="0"', 'theme="0" tint="0.05"', 'auto="1"']) {
        const zip = XLSX.CFB.read(new Uint8Array(fixture()), {type:'array'});
        const styles = entry(zip, 'xl/styles.xml');
        styles.content = Buffer.from(Buffer.from(styles.content).toString().replace(/theme="0"/g, color));
        styles.size = styles.content.length;
        const bytes = Uint8Array.from(XLSX.CFB.write(zip, {type:'array',fileType:'zip'})).buffer;
        const app = await setup(bytes);
        app.run(`downloadLocally(allParticipants.filter(p => p.id === 'P034'))`);
        assert.equal(app.downloads.length, 1);
        const result = inspect(await app.downloads[0].blob.arrayBuffer());
        assert.equal(result.wb.Sheets['Créneau'].G35.v, 'V');
        assert.equal(one(result.style('G35').font, 'color').getAttribute('theme'), color.includes('auto') ? null : '1');
    }
});

test('cache commun incrémenté après 2026.09.27.1', () => {
    const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(!html.includes('2026.09.27.1'));
    assert.match(html, /js\/export-styles\.js\?v=2026\.09\.28\.2/);
    assert.match(html, /js\/export\.js\?v=2026\.09\.28\.2/);
});

test('référence locale facultative : marqueurs et contraste des trois témoins',
    {skip: !process.env.BAD_POINTAGE_REFERENCE}, async () => {
    const bytes = Uint8Array.from(fs.readFileSync(process.env.BAD_POINTAGE_REFERENCE)).buffer;
    const app = await setup(bytes, 'Vendredi 18h00 à 20h00');
    app.run(`downloadLocally(allParticipants.filter(p => ['P032','P033','P034'].includes(p.id)))`);
    assert.equal(app.downloads.length, 1);
    const output = await app.downloads[0].blob.arrayBuffer();
    const wb = XLSX.read(output, {type:'array', cellStyles:true});
    const zip = XLSX.CFB.read(new Uint8Array(output), {type:'array'});
    const styles = read(zip,'xl/styles.xml').documentElement;
    const fonts = nodes(one(styles, 'fonts'), 'font'), xfs = nodes(one(styles,'cellXfs'),'xf');
    const target = wb.Sheets['Vendredi 18h00 à 20h00'];
    // Trouver la feuille par son nom et sa relation, sans publier son contenu.
    const workbook = read(zip, 'xl/workbook.xml');
    const sheet = Array.from(workbook.getElementsByTagNameNS('*','sheet')).find(n => n.getAttribute('name') === 'Vendredi 18h00 à 20h00');
    const rels = read(zip, 'xl/_rels/workbook.xml.rels');
    const rel = nodes(rels.documentElement).find(n => n.getAttribute('Id') === sheet.getAttribute('r:id'));
    const path = new URL(rel.getAttribute('Target'),'https://xlsx.invalid/xl/workbook.xml').pathname.slice(1);
    const cells = Array.from(read(zip,path).getElementsByTagNameNS('*','c'));
    const resolve = node => {
        const value = node.hasAttribute('rgb') ? node.getAttribute('rgb') : wb.Themes.themeElements.clrScheme[Number(node.getAttribute('theme'))].rgb;
        return value.slice(-6).match(/../g).map(v => parseInt(v,16)/255);
    };
    const fills = nodes(one(styles,'fills'),'fill');
    for (const address of ['G33','G34','G35']) {
        assert.equal(target[address].v, 'V', 'Présence témoin écrite');
        const cell = cells.find(n => n.getAttribute('r') === address);
        const xf = xfs[Number(cell.getAttribute('s') || 0)];
        app.context.foreground = resolve(one(fonts[Number(xf.getAttribute('fontId'))], 'color'));
        app.context.background = resolve(one(one(fills[Number(xf.getAttribute('fillId'))], 'patternFill'), 'fgColor'));
        assert.ok(app.run('planningContrast(foreground, background) >= 4.5'), 'Contraste du témoin suffisant');
    }
});
