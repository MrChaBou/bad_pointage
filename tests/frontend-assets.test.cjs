const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('chaque asset CSS/JS local utilise la même version explicite de déploiement', () => {
    const urls = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)]
        .map(match => match[1])
        .filter(url => !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url));
    assert.ok(urls.length > 0);
    const versions = new Set();
    const assets = [];
    for (const value of urls) {
        const url = new URL(value, 'https://example.invalid/bad-pointage/');
        assert.match(url.search, /^\?v=\d{4}\.\d{2}\.\d{2}\.\d+$/, value);
        assert.equal(url.hash, '', value);
        versions.add(url.searchParams.get('v'));
        assets.push(value.split('?')[0]);
        assert.ok(fs.existsSync(path.join(root, value.split('?')[0])), value);
    }
    assert.equal(versions.size, 1, 'Version commune pour tous les assets locaux');
    assert.ok(assets.includes('css/app.css'));
    // Toute nouvelle feuille de style ou tout nouveau module doit être référencé et versionné.
    const expected = ['css', 'js'].flatMap(dir => fs.readdirSync(path.join(root, dir))
        .filter(name => /\.(css|js)$/.test(name)).map(name => `${dir}/${name}`));
    assert.deepEqual(assets.sort(), expected.sort());
});
