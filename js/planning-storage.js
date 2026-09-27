// Stockage des octets uniquement : aucune logique Excel ou de session ici.
const planningStorage = (() => {
    const databaseName = 'bad-pointage-source';
    const storeName = 'sources';
    let queue = Promise.resolve();

    function transaction(mode, action, isCurrent = () => true) {
        return new Promise((resolve, reject) => {
            let db, tx, finished = false, result;
            const finish = (error) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (db) db.close();
                if (error) reject(error);
                else resolve(result);
            };
            const timer = setTimeout(() => {
                if (tx) tx.abort();
                finish(new Error('Stockage local indisponible'));
            }, 5000);
            try {
                const request = indexedDB.open(databaseName, 1);
                request.onupgradeneeded = () => {
                    if (!request.result.objectStoreNames.contains(storeName)) {
                        request.result.createObjectStore(storeName);
                    }
                };
                request.onerror = () => finish(request.error);
                request.onblocked = () => finish(new Error('Stockage local occupé'));
                request.onsuccess = () => {
                    db = request.result;
                    db.onversionchange = () => db.close();
                    if (finished) { db.close(); return; }
                    if (!isCurrent()) { finish(); return; }
                    try {
                        tx = db.transaction(storeName, mode);
                        tx.oncomplete = () => finish();
                        tx.onerror = () => finish(tx.error || new Error('Erreur de stockage'));
                        tx.onabort = () => finish(tx.error || new Error('Stockage annulé'));
                        const operation = action(tx.objectStore(storeName));
                        operation.onsuccess = () => { result = operation.result; };
                    } catch (error) { finish(error); }
                };
            } catch (error) { finish(error); }
        });
    }

    // Sérialiser les accès : un Reset attend puis efface toute écriture antérieure.
    function run(mode, action, isCurrent) {
        const operation = queue.then(() => transaction(mode, action, isCurrent));
        queue = operation.catch(() => {});
        return operation;
    }
    return {
        read: () => run('readonly', store => store.get('active')),
        write: (record, isCurrent) => run('readwrite', store => store.put(record, 'active'), isCurrent),
        clear: () => run('readwrite', store => store.clear())
    };
})();
