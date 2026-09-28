// ===================================================================================
// EXPORT & BACKEND
// ===================================================================================

/**
 * Vérifie la disponibilité du serveur backend
 * Met à jour l'interface avec le statut du serveur (OK ou indisponible)
 */
async function checkBackendStatus() {
    if (!accessAllowed()) return;
    const epoch = accessEpoch;
    const statusDiv = document.getElementById('backendStatus');
    const icon = document.getElementById('backendIcon');
    const text = document.getElementById('backendText');

    try {
        const response = await fetch(`${BACKEND_URL}/health`);
        if (!response.ok) throw new Error('Status not OK');

        const data = await response.json();
        if (epoch !== accessEpoch || !accessAllowed()) return;
        if (data.status === 'ok') {
            backendAvailable = true;
            statusDiv.className = 'flex items-center text-sm mb-4 p-3 rounded-lg bg-green-50 border-green-200';
            icon.textContent = '✅';
            text.textContent = 'Serveur OK. Les styles seront préservés.';
        } else {
            throw new Error('Invalid response');
        }
    } catch (error) {
        if (epoch !== accessEpoch || !accessAllowed()) return;
        backendAvailable = false;
        statusDiv.className = 'flex items-center text-sm mb-4 p-3 rounded-lg bg-yellow-50 border-yellow-200';
        icon.textContent = '⚠️';
        text.textContent = 'Serveur indisponible. Export local disponible.';
    }
}

/**
 * Télécharge le planning Excel mis à jour avec les présences
 * Utilise le backend Python si disponible pour préserver les styles
 * Sinon, effectue une mise à jour locale du XLSX source
 */
async function downloadPlanning() {
    if (getPlanningExportError()) {
        updatePlanningExportUI();
        return;
    }

    const downloadBtn = document.getElementById('downloadBtn');
    const messageP = document.getElementById('downloadMessage');
    downloadBtn.disabled = true;
    messageP.textContent = 'Préparation...';

    const sessionKey = `${activeSession.sheet}_${activeSession.dateLabel}`;
    const presences = journalEntries
        .filter(e => e.session === sessionKey)
        .map(p => ({ ...(p.id === undefined ? {} : { id: p.id }), nom: p.nom, prenom: p.prenom }));

    const sourceContent = planningFileContent;
    const sourceSession = activeSession;
    const operation = planningOperation;
    const isCurrent = () => operation === planningOperation &&
        sourceContent === planningFileContent && sourceSession === activeSession && !getPlanningExportError();
    try {
        if (backendAvailable) {
            messageP.textContent = 'Envoi au serveur...';
            const base64File = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = () => reject(new Error('Lecture impossible'));
                reader.onabort = () => reject(new Error('Lecture annulée'));
                reader.readAsDataURL(new Blob([sourceContent]));
            });
            if (!isCurrent()) return;
            const response = await accessRequest('/update-planning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: base64File,
                    sheet: sourceSession.sheet,
                    columnIndex: sourceSession.columnIndex,
                    presences,
                    filename: `maj_${sourceSession.planningFileName}`
                })
            }, accessToken);
            if (!isCurrent()) return;
            if (!response.ok) {
                if (response.status >= 400 && response.status < 500) {
                    messageP.textContent = response.status === 429
                        ? 'Trop de demandes. Réessayez plus tard.' : 'Export refusé par le serveur.';
                    return;
                }
                throw new Error('Panne du serveur');
            }
            const data = await response.json();
            if (!isCurrent()) return;
            if (!data.success) { messageP.textContent = 'Export refusé par le serveur.'; return; }
            const byteArray = Uint8Array.from(atob(data.file), char => char.charCodeAt(0));
            triggerDownload(new Blob([byteArray], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            }), data.filename);
            messageP.textContent = 'Téléchargement terminé !';
        } else {
            downloadLocally(presences);
        }
    } catch {
        if (isCurrent()) {
            alert('Erreur serveur. Tentative locale...');
            downloadLocally(presences);
        }
    } finally {
        setTimeout(updatePlanningExportUI, 3000);
    }
}

/**
 * Effectue une mise à jour locale du fichier Excel (sans backend)
 * Préserve les styles XLSX et corrige uniquement les marqueurs peu contrastés.
 * @param {Array} presences - Liste des présents à marquer dans le fichier
 */
function downloadLocally(presences) {
    if (getPlanningExportError()) {
        updatePlanningExportUI();
        return;
    }

    const wb = XLSX.read(planningFileContent, { type: 'array', cellDates: true });
    const ws = wb.Sheets[activeSession.sheet];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0 });

    const participantRows = new Map();
    const identity = (nom, prenom) => JSON.stringify([String(nom).trim().toLowerCase(), String(prenom).trim().toLowerCase()]);
    // Valider les IDs avant toute écriture, y compris lors du repli serveur.
    // Parcourir les lignes et marquer les présences avec 'V'
    for (let r = 3; r < data.length; r++) {
        const stopText = [0, 1, 2, 3].map(c => String(data[r][c] ?? ''))
            .join(' ').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').trim();
        if (stopText.includes("liste d'attente")) break;

        const nom = data[r][1];
        const prenom = data[r][2];
        if (!nom || !prenom) continue;

        if (!String(nom).trim() || !String(prenom).trim()) continue;
        participantRows.set(r, identity(nom, prenom));
    }
    const presentRows = new Set(), legacyNames = new Set();
    for (const p of presences) {
        const validNames = p && ['nom', 'prenom'].every(key => typeof p[key] === 'string' && p[key].trim());
        const hasId = p && Object.prototype.hasOwnProperty.call(p, 'id');
        const row = hasId && typeof p.id === 'string' && /^P(?:[0-9]{3}|[1-9][0-9]{3,6})(?![\s\S])/.test(p.id)
            ? Number(p.id.slice(1)) : -1;
        if (!validNames || (hasId && (!participantRows.has(row) || participantRows.get(row) !== identity(p.nom, p.prenom)))) {
            const message = 'Export refusé : identité ou ID incompatible avec la ligne source.';
            document.getElementById('downloadMessage').textContent = message;
            alert(message);
            return;
        }
        if (hasId) presentRows.add(row);
        else legacyNames.add(identity(p.nom, p.prenom));
    }
    const updates = new Map();
    for (const [r, name] of participantRows) {
        const isPresent = presentRows.has(r) || legacyNames.has(name);
        const cellAddress = XLSX.utils.encode_cell({c: activeSession.columnIndex, r: r});

        const marker = isEssaiMarker(ws[cellAddress]?.v)
            ? (isPresent ? 'ESSAI PRESENT' : 'ESSAI ABSENT') : (isPresent ? 'V' : null);
        updates.set(cellAddress, marker);
    }

    let wbout;
    try {
        const bytes = new Uint8Array(planningFileContent);
        if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
            wbout = exportStyledPlanning(planningFileContent, activeSession.sheet, updates);
        } else {
            // Compatibilité .xls : SheetJS convertit vers un XLSX à styles simples.
            alert('Export local XLS : les styles seront perdus.');
            for (const [address, marker] of updates) {
                if (marker === null) delete ws[address];
                else XLSX.utils.sheet_add_aoa(ws, [[marker]], { origin: address });
            }
            wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        }
    } catch {
        const message = 'Export local impossible : le classeur ne peut pas être modifié en préservant ses styles.';
        document.getElementById('downloadMessage').textContent = message;
        alert(message);
        return;
    }
    const blob = new Blob([wbout], {type: 'application/octet-stream'});
    triggerDownload(blob, `local_maj_${activeSession.planningFileName}`);
}

/**
 * Déclenche le téléchargement d'un fichier blob
 * @param {Blob} blob - Le contenu du fichier à télécharger
 * @param {string} filename - Le nom du fichier à télécharger
 */
function triggerDownload(blob, filename) {
    if (!accessAllowed()) return;
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}
