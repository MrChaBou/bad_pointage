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
    if (!activeSession) return;

    const downloadBtn = document.getElementById('downloadBtn');
    const messageP = document.getElementById('downloadMessage');
    downloadBtn.disabled = true;
    messageP.textContent = 'Préparation...';

    const sessionKey = `${activeSession.sheet}_${activeSession.dateLabel}`;
    const presences = journalEntries
        .filter(e => e.session === sessionKey)
        .map(p => ({ nom: p.nom, prenom: p.prenom }));

    if (backendAvailable) {
        messageP.textContent = 'Envoi au serveur...';
        try {
            // Convertir le fichier en base64 pour l'envoi
            const fileReader = new FileReader();
            fileReader.readAsDataURL(new Blob([planningFileContent]));
            fileReader.onload = async () => {
                const base64File = fileReader.result.split(',')[1];

                // Envoyer au backend Python
                const response = await fetch(`${BACKEND_URL}/update-planning`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: base64File,
                        sheet: activeSession.sheet,
                        columnIndex: activeSession.columnIndex,
                        presences: presences,
                        filename: `maj_${activeSession.planningFileName}`
                    })
                });

                if (!response.ok) throw new Error(`Erreur serveur: ${response.statusText}`);

                const data = await response.json();
                if (!data.success) throw new Error(data.error);

                // Décoder le fichier base64 reçu et déclencher le téléchargement
                const byteCharacters = atob(data.file);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], {
                    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                });

                triggerDownload(blob, data.filename);
                messageP.textContent = 'Téléchargement terminé !';
            };
        } catch (error) {
            alert('Erreur serveur. Tentative locale...');
            console.error(error);
            downloadLocally(presences);
        }
    } else {
        downloadLocally(presences);
    }

    setTimeout(() => {
        downloadBtn.disabled = false;
        messageP.textContent = '';
    }, 3000);
}

/**
 * Effectue une mise à jour locale du fichier Excel (sans backend)
 * ⚠️ Les styles Excel ne sont PAS préservés avec cette méthode
 * @param {Array} presences - Liste des présents à marquer dans le fichier
 */
function downloadLocally(presences) {
    alert("Traitement local, les styles seront perdus.");

    const wb = XLSX.read(planningFileContent, { type: 'array', cellDates: true });
    const ws = wb.Sheets[activeSession.sheet];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Parcourir les lignes et marquer les présences avec 'V'
    for (let r = 3; r < data.length; r++) {
        const stopText = [0, 1, 2, 3].map(c => String(data[r][c] ?? ''))
            .join(' ').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').trim();
        if (stopText.includes("liste d'attente")) break;

        const nom = data[r][1];
        const prenom = data[r][2];
        if (!nom || !prenom) continue;

        const isPresent = presences.some(p => p.nom === nom && p.prenom === prenom);
        const cellAddress = XLSX.utils.encode_cell({c: activeSession.columnIndex, r: r});

        if (isEssaiMarker(ws[cellAddress]?.v)) {
            XLSX.utils.sheet_add_aoa(ws, [[isPresent ? 'ESSAI PRESENT' : 'ESSAI ABSENT']], { origin: cellAddress });
        } else if (isPresent) {
            XLSX.utils.sheet_add_aoa(ws, [['V']], { origin: cellAddress });
        } else {
            XLSX.utils.sheet_add_aoa(ws, [[null]], { origin: cellAddress });
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
