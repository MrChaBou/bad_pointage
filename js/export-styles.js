// Modifier le XLSX source sans réécrire ses styles avec le writer SheetJS CE.
// Seuls la feuille ciblée et, si nécessaire, les nouveaux styles sont sérialisés.
function exportStyledPlanning(source, sheetName, updates) {
    const zip = XLSX.CFB.read(new Uint8Array(source), { type: 'array' });
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const children = (node, name) => Array.from(node?.childNodes || [])
        .filter(child => child.nodeType === 1 && (!name || child.localName === name));
    const child = (node, name) => children(node, name)[0];
    const read = path => {
        const entry = XLSX.CFB.find(zip, '/' + path);
        if (!entry) throw new Error('Partie XLSX manquante');
        const doc = new DOMParser().parseFromString(decoder.decode(new Uint8Array(entry.content)), 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('XML XLSX invalide');
        return doc;
    };
    const write = (path, doc) => {
        const entry = XLSX.CFB.find(zip, '/' + path);
        entry.content = encoder.encode(new XMLSerializer().serializeToString(doc));
        entry.size = entry.content.length;
    };
    const resolve = (base, target) => new URL(target, 'https://xlsx.invalid/' + base).pathname.slice(1);
    const relationships = read('_rels/.rels');
    const office = children(relationships.documentElement).find(node => node.getAttribute('Type').endsWith('/officeDocument'));
    if (!office) throw new Error('Classeur XLSX manquant');
    const workbookPath = resolve('', office.getAttribute('Target'));
    const workbook = read(workbookPath);
    const slash = workbookPath.lastIndexOf('/') + 1;
    const rels = read(workbookPath.slice(0, slash) + '_rels/' + workbookPath.slice(slash) + '.rels');
    const related = (suffix, id) => {
        const relation = children(rels.documentElement).find(node => id
            ? node.getAttribute('Id') === id : node.getAttribute('Type').endsWith('/' + suffix));
        if (!relation || relation.getAttribute('TargetMode') === 'External') return null;
        return resolve(workbookPath, relation.getAttribute('Target'));
    };
    const sheet = children(child(workbook.documentElement, 'sheets'), 'sheet')
        .find(node => node.getAttribute('name') === sheetName);
    const sheetId = sheet && Array.from(sheet.attributes).find(attr => attr.localName === 'id')?.value;
    const sheetPath = related('worksheet', sheetId);
    const stylesPath = related('styles');
    if (!sheet || !sheetId || !sheetPath || !stylesPath) throw new Error('Feuille ou styles XLSX manquants');
    const worksheet = read(sheetPath), styles = read(stylesPath);
    const themePath = related('theme');
    const scheme = themePath ? read(themePath).getElementsByTagNameNS('*', 'clrScheme')[0] : null;
    const themeNames = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
    const themes = themeNames.map(name => {
        const color = children(child(scheme, name))[0];
        return color && (color.getAttribute('lastClr') || color.getAttribute('val'));
    });
    const indexed = children(child(child(styles.documentElement, 'colors'), 'indexedColors'), 'rgbColor')
        .map(node => node.getAttribute('rgb'));
    const palette = indexed.length ? indexed : PLANNING_INDEXED_COLORS;
    const rgb = color => {
        if (!color) return null;
        const value = color.hasAttribute('rgb') ? color.getAttribute('rgb')
            : color.hasAttribute('theme') ? themes[Number(color.getAttribute('theme'))]
            : color.hasAttribute('indexed') ? palette[Number(color.getAttribute('indexed'))] : null;
        if (!value || !/^(?:[a-f\d]{2})?[a-f\d]{6}$/i.test(value)) return null;
        const channels = value.slice(-6).match(/../g).map(v => parseInt(v, 16) / 255);
        return planningTint(channels, Number(color.getAttribute('tint') || 0));
    };
    const fonts = child(styles.documentElement, 'fonts');
    const fills = children(child(styles.documentElement, 'fills'), 'fill');
    const xfs = child(styles.documentElement, 'cellXfs');
    const corrected = new Map();
    const contrastingStyle = styleId => {
        if (corrected.has(styleId)) return corrected.get(styleId);
        const xf = children(xfs, 'xf')[styleId];
        if (!xf) throw new Error('Style XLSX invalide');
        const font = children(fonts, 'font')[Number(xf.getAttribute('fontId') || 0)];
        const fill = fills[Number(xf.getAttribute('fillId') || 0)];
        const pattern = child(fill, 'patternFill');
        const patternType = pattern?.getAttribute('patternType');
        const background = patternType === 'solid' ? rgb(child(pattern, 'fgColor'))
            : !child(fill, 'gradientFill') && (!patternType || patternType === 'none') ? [1, 1, 1] : null;
        const foreground = rgb(child(font, 'color'));
        if (!background || !foreground || planningContrast(background, foreground) >= 4.5) return styleId;
        const white = planningContrast(background, [1, 1, 1]) > planningContrast(background, [0, 0, 0]);
        const hex = white ? 'FFFFFF' : '000000';
        const newFont = font.cloneNode(true);
        const newColor = styles.createElementNS(styles.documentElement.namespaceURI, 'color');
        const theme = [0, 1].find(index => themes[index]?.toUpperCase() === hex);
        if (theme !== undefined) newColor.setAttribute('theme', String(theme));
        else newColor.setAttribute('rgb', 'FF' + hex);
        const oldColor = child(newFont, 'color');
        if (oldColor) newFont.replaceChild(newColor, oldColor);
        else newFont.appendChild(newColor);
        const fontId = children(fonts, 'font').length;
        fonts.appendChild(newFont);
        fonts.setAttribute('count', String(fontId + 1));
        const newXf = xf.cloneNode(true);
        newXf.setAttribute('fontId', String(fontId));
        newXf.setAttribute('applyFont', '1');
        const newStyleId = children(xfs, 'xf').length;
        xfs.appendChild(newXf);
        xfs.setAttribute('count', String(newStyleId + 1));
        corrected.set(styleId, newStyleId);
        return newStyleId;
    };
    const sheetData = child(worksheet.documentElement, 'sheetData');
    const rows = new Map(children(sheetData, 'row').map(row => [Number(row.getAttribute('r')), row]));
    for (const [address, marker] of updates) {
        const position = XLSX.utils.decode_cell(address);
        const row = rows.get(position.r + 1);
        if (!row) throw new Error('Ligne participant XLSX manquante');
        let cell = children(row, 'c').find(node => node.getAttribute('r') === address);
        if (!cell && marker === null) continue;
        if (!cell) {
            cell = worksheet.createElementNS(worksheet.documentElement.namespaceURI, 'c');
            cell.setAttribute('r', address);
            const next = children(row, 'c').find(node => XLSX.utils.decode_cell(node.getAttribute('r')).c > position.c);
            row.insertBefore(cell, next || null);
        }
        for (const node of children(cell)) {
            if (['f', 'v', 'is'].includes(node.localName)) cell.removeChild(node);
        }
        cell.removeAttribute('t');
        if (marker !== null) {
            const styleId = Number(cell.getAttribute('s') || 0);
            const newStyleId = contrastingStyle(styleId);
            if (newStyleId !== styleId) cell.setAttribute('s', String(newStyleId));
            cell.setAttribute('t', 'inlineStr');
            const inline = worksheet.createElementNS(worksheet.documentElement.namespaceURI, 'is');
            const text = worksheet.createElementNS(worksheet.documentElement.namespaceURI, 't');
            text.appendChild(worksheet.createTextNode(marker));
            inline.appendChild(text);
            cell.appendChild(inline);
        }
    }
    write(sheetPath, worksheet);
    if (corrected.size) write(stylesPath, styles);
    return Uint8Array.from(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true }));
}

function planningContrast(a, b) {
    const luminance = rgb => rgb.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const first = luminance(a), second = luminance(b);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

// Tint Excel : ajuster la luminosité HSL, sans modifier teinte ni saturation.
function planningTint(rgb, tint) {
    if (!tint) return rgb;
    const max = Math.max(...rgb), min = Math.min(...rgb), delta = max - min;
    const light = (max + min) / 2;
    const adjusted = tint < 0 ? light * (1 + tint) : light * (1 - tint) + tint;
    if (!delta) return [adjusted, adjusted, adjusted];
    const saturation = delta / (1 - Math.abs(2 * light - 1));
    let hue = max === rgb[0] ? (rgb[1] - rgb[2]) / delta
        : max === rgb[1] ? (rgb[2] - rgb[0]) / delta + 2 : (rgb[0] - rgb[1]) / delta + 4;
    hue = (hue + 6) % 6;
    const chroma = (1 - Math.abs(2 * adjusted - 1)) * saturation;
    const x = chroma * (1 - Math.abs(hue % 2 - 1)), offset = adjusted - chroma / 2;
    return (hue < 1 ? [chroma, x, 0] : hue < 2 ? [x, chroma, 0] : hue < 3 ? [0, chroma, x]
        : hue < 4 ? [0, x, chroma] : hue < 5 ? [x, 0, chroma] : [chroma, 0, x]).map(v => v + offset);
}

const PLANNING_INDEXED_COLORS = ["00000000", "00FFFFFF", "00FF0000", "0000FF00", "000000FF", "00FFFF00", "00FF00FF", "0000FFFF", "00000000", "00FFFFFF", "00FF0000", "0000FF00", "000000FF", "00FFFF00", "00FF00FF", "0000FFFF", "00800000", "00008000", "00000080", "00808000", "00800080", "00008080", "00C0C0C0", "00808080", "009999FF", "00993366", "00FFFFCC", "00CCFFFF", "00660066", "00FF8080", "000066CC", "00CCCCFF", "00000080", "00FF00FF", "00FFFF00", "0000FFFF", "00800080", "00800000", "00008080", "000000FF", "0000CCFF", "00CCFFFF", "00CCFFCC", "00FFFF99", "0099CCFF", "00FF99CC", "00CC99FF", "00FFCC99", "003366FF", "0033CCCC", "0099CC00", "00FFCC00", "00FF9900", "00FF6600", "00666699", "00969696", "00003366", "00339966", "00003300", "00333300", "00993300", "00993366", "00333399", "00333333"];
