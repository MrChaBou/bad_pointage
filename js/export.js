// ===================================================================================
// EXPORT & BACKEND
// ===================================================================================

/**
 * Vérifie la disponibilité du serveur backend
 * Met à jour l'interface avec le statut du serveur (OK ou indisponible)
 */
async function checkBackendStatus() {
    const statusDiv = document.getElementById('backendStatus');
    const icon = document.getElementById('backendIcon');
    const text = document.getElementById('backendText');

    try {
        const response = await fetch(`${BACKEND_URL}/health`);
        if (!response.ok) throw new Error('Status not OK');

        const data = await response.json();
        if (data.status === 'ok') {
            backendAvailable = true;
            statusDiv.className = 'flex items-center text-sm mb-4 p-3 rounded-lg bg-green-50 border-green-200';
            icon.textContent = '✅';
            text.textContent = 'Serveur OK. Les styles seront préservés.';
        } else {
            throw new Error('Invalid response');
        }
    } catch (error) {
        backendAvailable = false;
        statusDiv.className = 'flex items-center text-sm mb-4 p-3 rounded-lg bg-yellow-50 border-yellow-200';
        icon.textContent = '⚠️';
        text.textContent = 'Serveur indisponible. Les styles ne seront PAS préservés.';
    }
}

/**
 * Télécharge le planning Excel mis à jour avec les présences
 * Utilise le backend Python si disponible pour préserver les styles
 * Sinon, effectue une mise à jour locale (sans préservation des styles)
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
            const response = await fetch(`${BACKEND_URL}/update-planning`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: base64File,
                    sheet: sourceSession.sheet,
                    columnIndex: sourceSession.columnIndex,
                    presences,
                    filename: `maj_${sourceSession.planningFileName}`
                })
            });
            if (!isCurrent()) return;
            if (!response.ok) throw new Error('Erreur serveur');
            const data = await response.json();
            if (!isCurrent()) return;
            if (!data.success) throw new Error('Erreur export');
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
 * ⚠️ Les styles Excel ne sont PAS préservés avec cette méthode
 * @param {Array} presences - Liste des présents à marquer dans le fichier
 */
function downloadLocally(presences) {
    if (getPlanningExportError()) {
        updatePlanningExportUI();
        return;
    }
    alert("Traitement local, les styles seront perdus.");

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
    for (const [r, name] of participantRows) {
        const isPresent = presentRows.has(r) || legacyNames.has(name);
        const cellAddress = XLSX.utils.encode_cell({c: activeSession.columnIndex, r: r});

        if (isEssaiMarker(ws[cellAddress]?.v)) {
            XLSX.utils.sheet_add_aoa(ws, [[isPresent ? 'ESSAI PRESENT' : 'ESSAI ABSENT']], { origin: cellAddress });
        } else if (isPresent) {
            XLSX.utils.sheet_add_aoa(ws, [['V']], { origin: cellAddress });
        } else {
            delete ws[cellAddress]; // SheetJS ignore les valeurs null dans sheet_add_aoa.
        }
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {type: 'application/octet-stream'});
    triggerDownload(blob, `local_maj_${activeSession.planningFileName}`);
}

/**
 * Déclenche le téléchargement d'un fichier blob
 * @param {Blob} blob - Le contenu du fichier à télécharger
 * @param {string} filename - Le nom du fichier à télécharger
 */
function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
}
