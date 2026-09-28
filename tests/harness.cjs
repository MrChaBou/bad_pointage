const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const XLSX = require('xlsx');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const day = Math.floor(Date.UTC(2026, 8, 27) / 86400000) + 25569;

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}
function fixture(name = 'SYNTHETIQUE', marker = '') {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ['', '', '', day, day + 7], [], [],
        ['', name, 'Alice', '', ''],
        ['', 'ESSAI FICTIF', 'Bob', 'ESSAI', ''],
        ["LISTE D'ATTENTE"], ['', 'ATTENTE FICTIVE', 'Charlie']
    ]);
    ws.A2 = { t: 's', v: marker };
    XLSX.utils.book_append_sheet(wb, ws, 'Créneau');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
function file(bytes, name = 'synthetique.xlsx', gate) {
    return { name, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        lastModified: 1234, bytes, gate };
}
function storage() {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
function element() {
    const classes = new Set();
    const events = {};
    return {
        hidden: false, events,
        value: '', textContent: '', disabled: false, options: [], files: [],
        classList: { add(...items) { items.forEach(x => classes.add(x)); }, remove(...items) { items.forEach(x => classes.delete(x)); }, contains(x) { return classes.has(x); } }, parentElement: { classList: { add() {}, remove() {} } },
        addEventListener(type, fn) { events[type] = fn; }, appendChild(option) { this.options.push(option); },
        get innerHTML() { return this.html || ''; },
        set innerHTML(value) { this.html = value; this.options = value.includes('<option') ? [{ value: '', text: '' }] : []; },
        get selectedIndex() { return Math.max(0, this.options.findIndex(o => o.value === this.value)); }
    };
}
function boot(options = {}) {
    const elements = new Map();
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    const localStorage = options.localStorage || storage();
    const sessionStorage = options.sessionStorage || storage();
    const authCalls = [];
    const expiry = Math.floor(Date.now() / 1000) + 14400;
    const indexedDB = Object.hasOwn(options, 'indexedDB') ? options.indexedDB : new IDBFactory();
    const downloads = [], posts = [], alerts = [];
    let reloads = 0;
    class FileReader {
        readAsArrayBuffer(f) {
            Promise.resolve(f.gate?.promise).then(() => {
                this.result = f.bytes.slice(0); this.onload?.({ target: this });
            }).catch(() => this.onerror?.());
        }
        readAsDataURL(blob) {
            blob.arrayBuffer().then(bytes => {
                this.result = 'data:application/octet-stream;base64,' + Buffer.from(bytes).toString('base64');
                this.onload?.();
            });
        }
    }
    const context = vm.createContext({
        console, AbortController, ArrayBuffer, Uint8Array, Blob, FileReader, crypto: webcrypto,
        DOMParser, XMLSerializer, TextEncoder, TextDecoder, URL,
        indexedDB, localStorage, sessionStorage, setTimeout: (fn, ms) => {
            const timer = setTimeout(fn, ms === 3000 ? 0 : (ms === 5000 && options.fastStorageTimeout ? 20 : ms));
            if (ms > 60000) timer.unref();
            return timer;
        }, clearTimeout,
        alert: text => alerts.push(text), confirm: () => true,
        location: { reload: () => { reloads++; } },
        window: { location: { hostname: 'localhost' }, addEventListener() {} },
        document: { getElementById: get, createElement: element, addEventListener() {} },
        XLSX: { ...XLSX, write() { throw new Error('Production must not serialize the source'); } },
        atob: value => Buffer.from(value, 'base64').toString('binary'),
        fetch: async (url, request) => {
            if (url.endsWith('/planning-source')) return options.driveFetch(url, request);
            if (url.includes('/auth/')) {
                authCalls.push({ url, request });
                if (options.authFetch) return options.authFetch(url, request);
                return { ok: true, status: 200, json: async () => ({ role: 'responsible', expires_at: expiry, token: 'A'.repeat(43) }) };
            }
            if (!request) return { ok: true, json: async () => ({ status: 'ok' }) };
            posts.push(JSON.parse(request.body));
            if (options.exportGate) await options.exportGate.promise;
            return { ok: true, json: async () => ({ success: true, file: posts.at(-1).file, filename: 'export.xlsx' }) };
        }
    });
    const run = code => vm.runInContext(code, context);
    for (const module of ['state', 'auth', 'ui', 'pointage', 'planning-storage', 'planning-source', 'planning', 'export-styles', 'export', 'app']) {
        run(fs.readFileSync(path.join(__dirname, '..', 'js', module + '.js'), 'utf8'));
    }
    context.captureDownload = (blob, name) => downloads.push({ blob, name });
    run('triggerDownload = captureDownload;');
    if (options.authenticated !== false) {
        context.testExpiry = expiry;
        run("accessToken = 'A'.repeat(43); accessExpiresAt = testExpiry * 1000;");
    }
    return { context, run, get, localStorage, sessionStorage, indexedDB, authCalls, downloads, posts, alerts,
        get reloads() { return reloads; },
        load: f => { context.testFile = f; return run('loadPlanning(testFile)'); },
        async start() {
            get('sheetSelect').value = 'Créneau';
            run('loadDates()');
            get('dateSelect').value = '3|0';
            // Browser option.text aliases textContent; our minimal DOM mirrors it here.
            get('dateSelect').options.forEach(o => { o.text = o.textContent; });
            await run('startSession()');
            await run('planningStorage.read()');
        }
    };
}
async function ready(options = {}) {
    const app = boot(options);
    const bytes = fixture();
    await app.load(file(bytes));
    await app.start();
    return { app, bytes };
}
module.exports = { boot, ready, file, fixture, deferred, IDBFactory, storage };
