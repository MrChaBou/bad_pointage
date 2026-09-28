// Identité, import et restauration du fichier source. Le classeur est dérivé des octets.
let planningSource = null;
let planningOperation = 0;
let planningBusy = false;
let planningResetting = false;
let planningStorageMessage = '';
const planningResetKey = 'badminton_source_reset_pending';

async function hashPlanningBytes(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readPlanningFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.onabort = () => reject(new Error('Lecture annulée'));
        reader.readAsArrayBuffer(file);
    });
}

function planningSessionDate(workbook, session) {
    const cell = workbook.Sheets[session.sheet]?.[
        XLSX.utils.encode_cell({ c: session.columnIndex, r: session.headerRow })];
    const flag = workbook.Workbook?.WBProps?.date1904;
    return cell?.t === 'n' ? parseCellAsDate(cell.v,
        flag === true || flag === 1 || flag === '1' || flag === 'true') : null;
}

function planningCompatibilityError(workbook, session) {
    if (!workbook.Sheets[session.sheet] || !Number.isInteger(session.columnIndex) ||
        session.columnIndex < 0 || !Number.isInteger(session.headerRow) || session.headerRow < 0) {
        return 'Planning incompatible avec le créneau.';
    }
    const date = planningSessionDate(workbook, session);
    const label = date?.toLocaleDateString('fr-FR', {
        weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC'
    });
    if (!date || label !== session.dateLabel ||
        (session.dateISO && date.toISOString().slice(0, 10) !== session.dateISO)) {
        return 'Planning incompatible avec la date du créneau.';
    }
    return '';
}

function legacyPlanningMatches(workbook, session) {
    if (planningCompatibilityError(workbook, session)) return false;
    const worksheet = workbook.Sheets[session.sheet];
    const columns = new Set(getPlanningDates(workbook, session.sheet)
        .map(date => Number(date.value.split('|')[0])));
    const participants = extractPlanningParticipants(worksheet, session.columnIndex, [...columns]);
    return participants.length === allParticipants.length && participants.every((p, i) =>
        ['id', 'nom', 'prenom', 'statut'].every(key => p[key] === allParticipants[i][key]));
}

// Recalculer cet attribut dérivé, après validation de la source et des identités.
function enrichRestoredParticipants(workbook, session) {
    if (!legacyPlanningMatches(workbook, session)) return;
    const worksheet = workbook.Sheets[session.sheet];
    let changed = false;
    allParticipants.forEach(p => {
        const nouveau = isNouveauCreneau(worksheet, Number(p.id.slice(1)));
        if (p.nouveauCreneau === nouveau) return;
        p.nouveauCreneau = nouveau;
        changed = true;
    });
    if (!changed) return;
    saveDataToStorage('badminton_all_participants', allParticipants);
    updateParticipantsUI();
    const input = document.getElementById('searchInput');
    if (input.value.trim().length >= 2) searchPlayerDynamic({ target: input });
    if (currentPlayer) showPlayer(currentPlayer);
}

function getPlanningExportError() {
    if (!accessAllowed()) return "Authentification requise.";
    if (planningResetting) return 'Réinitialisation en cours…';
    if (!activeSession) return 'Démarrez le pointage avant d’exporter.';
    if (planningBusy) return 'Chargement du planning source…';
    const reload = `Rechargez le planning source « ${activeSession.planningFileName} » dans Créneau, sans redémarrer le pointage. Vos pointages sont conservés.`;
    if (!planningFileContent?.byteLength || !planningWorkbook || !planningSource) return reload;
    if (!activeSession.sourceHash || planningSource.sha256 !== activeSession.sourceHash) {
        return `Ce fichier n’est pas la source du pointage en cours. ${reload}`;
    }
    const error = planningCompatibilityError(planningWorkbook, activeSession);
    return error ? `${error} ${reload}` : '';
}

function installPlanningSource(source, workbook) {
    if (!accessAllowed()) return;
    planningSource = source;
    planningFileContent = new Uint8Array(source.bytes);
    planningWorkbook = workbook;
    document.getElementById('planningFileName').textContent = source.name;
    document.getElementById('planningConfig').classList.remove('hidden');
    loadSheets();
    const modified = source.drive?.modifiedTime;
    document.getElementById('planningDriveInfo').textContent = modified && !isNaN(Date.parse(modified))
        ? `Source Drive modifiée le ${new Date(modified).toLocaleString('fr-FR')}` : '';
}

async function persistSessionSource(source, session) {
    const isCurrent = () => !planningResetting && activeSession === session;
    if (!isCurrent()) return;
    planningStorageMessage = 'Sauvegarde locale du fichier source…';
    updatePlanningExportUI();
    try {
        await planningStorage.write(source, isCurrent);
        if (!isCurrent()) return;
        localStorage.removeItem(planningResetKey);
        if (planningSource !== source) return;
        planningStorageMessage = 'Source conservée dans ce navigateur.';
    } catch {
        if (!isCurrent() || planningSource !== source) return;
        planningStorageMessage = 'Source disponible pour cet export, mais non sauvegardée : réimport nécessaire après rechargement.';
    }
    updatePlanningExportUI();
}

// Les transports manuel et Drive partagent l'analyse et l'identité des octets.
async function preparePlanningSource(bytes, metadata) {
    if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) throw new Error('Fichier vide');
    const sha256 = await hashPlanningBytes(bytes);
    if (metadata.origin === 'drive' && (metadata.size !== bytes.byteLength || metadata.sha256 !== sha256)) {
        throw new Error('Source altérée');
    }
    const workbook = XLSX.read(new Uint8Array(bytes.slice(0)), { type: 'array', cellDates: false, cellStyles: true });
    const source = { ...metadata, version: 1, bytes, sha256, size: bytes.byteLength };
    return { source, workbook };
}

const driveMessages = {
    drive_not_configured: 'Planning central non configuré.',
    drive_credentials_invalid: 'Connexion au planning central indisponible.',
    drive_access_denied: 'Accès au planning central refusé.',
    drive_file_unavailable: 'Planning central introuvable ou inaccessible.',
    drive_timeout: 'Le planning central met trop de temps à répondre.',
    drive_unavailable: 'Planning central temporairement indisponible.',
    planning_invalid: 'Le fichier central est invalide ou incompatible.',
    drive_source_changed: 'Le planning a changé pendant le chargement. Réessayez.'
};

async function loadCentralPlanning() {
    if (!accessAllowed() || activeSession || planningBusy || planningResetting) return;
    const operation = ++planningOperation, epoch = accessEpoch;
    const isCurrent = () => operation === planningOperation && epoch === accessEpoch &&
        accessAllowed() && !activeSession && !planningResetting;
    planningBusy = true;
    planningStorageMessage = 'Chargement du planning central…';
    updateStartButton();
    updatePlanningExportUI();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
        const response = await accessRequest('/planning-source', { signal: controller.signal }, accessToken);
        if (!isCurrent()) return;
        if (!response.ok) {
            const error = await response.json();
            throw new Error(driveMessages[error.error] || 'Chargement du planning central impossible.');
        }
        if (response.headers.get('Content-Type')?.split(';')[0] !==
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new Error(driveMessages.planning_invalid);
        const metadata = JSON.parse(response.headers.get('X-Planning-Metadata'));
        if (!metadata || typeof metadata.name !== 'string' || !Number.isSafeInteger(metadata.size) ||
            metadata.size <= 0 || !/^[a-f0-9]{64}$/.test(metadata.sha256) ||
            typeof metadata.driveVersion !== 'string' || !/^[0-9]+$/.test(metadata.driveVersion)) {
            throw new Error(driveMessages.planning_invalid);
        }
        const bytes = await response.arrayBuffer();
        const prepared = await preparePlanningSource(bytes, {
            name: metadata.name, type: response.headers.get('Content-Type').split(';')[0],
            origin: 'drive', size: metadata.size, sha256: metadata.sha256,
            lastModified: Date.parse(metadata.modifiedTime) || 0,
            drive: { modifiedTime: metadata.modifiedTime, version: metadata.driveVersion,
                headRevisionId: metadata.headRevisionId, md5Checksum: metadata.md5Checksum }
        });
        // Réutiliser l'interprétation métier existante, sans parseur Python concurrent.
        const usable = prepared.workbook.SheetNames.some(sheet => {
            const dates = getPlanningDates(prepared.workbook, sheet);
            const columns = dates.map(date => Number(date.value.split('|')[0]));
            return columns.some(column => {
                const participants = extractPlanningParticipants(prepared.workbook.Sheets[sheet], column, columns);
                return participants.length > 0 && participants.every(p => p.nom && p.prenom);
            });
        });
        if (!usable) {
            throw new Error(driveMessages.planning_invalid);
        }
        if (!isCurrent()) return;
        installPlanningSource(prepared.source, prepared.workbook);
        planningStorageMessage = 'Planning central chargé.';
    } catch (error) {
        if (!isCurrent()) return;
        planningStorageMessage = (error.name === 'AbortError' ? driveMessages.drive_timeout :
            (Object.values(driveMessages).includes(error.message) ? error.message : 'Chargement du planning central impossible.')) +
            ' Réessayez ou importez un fichier de secours.';
    } finally {
        clearTimeout(timer);
        if (isCurrent()) {
            planningBusy = false;
            updateStartButton();
            updatePlanningExportUI();
        }
    }
}

async function loadPlanning(file) {
    if (!accessAllowed()) return;
    if (!file || planningResetting) return;
    const operation = ++planningOperation;
    planningBusy = true;
    updateStartButton();
    planningStorageMessage = '';
    planningSource = planningWorkbook = planningFileContent = null;
    document.getElementById('planningConfig').classList.add('hidden');
    document.getElementById('planningFileName').textContent = file.name;
    updatePlanningExportUI();
    try {
        const bytes = await readPlanningFile(file);
        const { source, workbook } = await preparePlanningSource(bytes, {
            name: file.name, origin: 'manual', type: file.type || '', lastModified: file.lastModified || 0 });
        const sha256 = source.sha256;
        if (operation !== planningOperation) return;
        if (!accessAllowed()) return;
        installPlanningSource(source, workbook);
        const session = activeSession;
        if (session && !session.sourceHash && legacyPlanningMatches(workbook, session)) {
            activeSession = { ...session, sourceHash: sha256,
                dateISO: planningSessionDate(workbook, session).toISOString().slice(0, 10) };
            saveDataToStorage('badminton_session', activeSession);
        }
        if (activeSession?.sourceHash === sha256 && !planningCompatibilityError(workbook, activeSession)) {
            if (activeSession.sourceOrigin === 'drive' && activeSession.sourceDrive) {
                source.origin = 'drive';
                source.drive = { ...activeSession.sourceDrive };
                installPlanningSource(source, workbook);
            }
            enrichRestoredParticipants(workbook, activeSession);
            void persistSessionSource(source, activeSession);
        } else if (activeSession) {
            planningStorageMessage = 'Autre planning chargé : la source sauvegardée du pointage reste inchangée. Démarrez un nouveau pointage pour utiliser ce fichier.';
        }
    } catch {
        if (operation !== planningOperation) return;
        planningStorageMessage = 'Lecture du planning impossible. Réimportez le fichier source dans Créneau (HTTPS ou localhost requis).';
    } finally {
        if (operation === planningOperation) {
            planningBusy = false;
            updateStartButton();
            updatePlanningExportUI();
            // Permet de sélectionner à nouveau le même fichier après un échec.
            document.getElementById('planningFile').value = '';
        }
    }
}

async function restorePlanningSource() {
    if (!accessAllowed()) return;
    if (!activeSession || planningResetting) return;
    const session = activeSession;
    const operation = ++planningOperation;
    const isCurrent = () => operation === planningOperation && activeSession === session;
    planningBusy = true;
    updateStartButton();
    updatePlanningExportUI();
    try {
        if (localStorage.getItem(planningResetKey) || !session.sourceHash) {
            throw new Error('Réimport requis');
        }
        const source = await planningStorage.read();
        if (!isCurrent()) return;
        if (!source || source.version !== 1 || !(source.bytes instanceof ArrayBuffer) ||
            !source.bytes.byteLength || source.size !== source.bytes.byteLength ||
            source.sha256 !== session.sourceHash) throw new Error('Source absente ou incompatible');
        const hash = await hashPlanningBytes(source.bytes);
        if (!isCurrent()) return;
        if (hash !== session.sourceHash) throw new Error('Source altérée');
        const workbook = XLSX.read(new Uint8Array(source.bytes.slice(0)), { type: 'array', cellDates: false, cellStyles: true });
        if (planningCompatibilityError(workbook, session)) throw new Error('Cible incompatible');
        if (!accessAllowed()) return;
        installPlanningSource(source, workbook);
        enrichRestoredParticipants(workbook, session);
        planningStorageMessage = 'Source restaurée depuis ce navigateur.';
    } catch {
        if (!isCurrent()) return;
        planningSource = planningWorkbook = planningFileContent = null;
        planningStorageMessage = 'Restauration impossible : réimportez le fichier source. Les pointages sont conservés.';
    } finally {
        if (isCurrent()) {
            planningBusy = false;
            updateStartButton();
            updatePlanningExportUI();
        }
    }
}

async function resetPlanningApplication() {
    if (!accessAllowed()) return;
    if (planningResetting) return;
    planningResetting = true;
    ++planningOperation;
    planningBusy = false;
    planningSource = planningWorkbook = planningFileContent = null;
    activeSession = null;
    players = []; allParticipants = []; journalEntries = [];
    document.getElementById('planningConfig').classList.add('hidden');
    document.getElementById('planningFile').value = '';
    document.getElementById('planningFileName').textContent = '';
    document.getElementById('planningDriveInfo').textContent = '';
    resetPointingInterface();
    updateParticipantsUI();
    updateUI();
    try {
        localStorage.setItem(planningResetKey, '1');
        ['badminton_journal', 'badminton_session', 'badminton_all_participants']
            .forEach(key => localStorage.removeItem(key));
        await planningStorage.clear();
        localStorage.removeItem(planningResetKey);
        location.reload();
    } catch {
        planningResetting = false;
        planningStorageMessage = 'Effacement local incomplet. Réessayez Reset ou effacez les données du site dans le navigateur.';
        updatePlanningExportUI();
        alert(planningStorageMessage);
    }
}
