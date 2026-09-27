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
        return 'Planning incompatible avec la session.';
    }
    const date = planningSessionDate(workbook, session);
    const label = date?.toLocaleDateString('fr-FR', {
        weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC'
    });
    if (!date || label !== session.dateLabel ||
        (session.dateISO && date.toISOString().slice(0, 10) !== session.dateISO)) {
        return 'Planning incompatible avec la date de la session.';
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
    if (planningResetting) return 'Réinitialisation en cours…';
    if (!activeSession) return 'Démarrez une session avant d’exporter.';
    if (planningBusy) return 'Chargement du planning source…';
    const reload = `Rechargez le planning source « ${activeSession.planningFileName} » dans Admin, sans redémarrer la session. Vos pointages sont conservés.`;
    if (!planningFileContent?.byteLength || !planningWorkbook || !planningSource) return reload;
    if (!activeSession.sourceHash || planningSource.sha256 !== activeSession.sourceHash) {
        return `Ce fichier n’est pas la source de la session active. ${reload}`;
    }
    const error = planningCompatibilityError(planningWorkbook, activeSession);
    return error ? `${error} ${reload}` : '';
}

function installPlanningSource(source, workbook) {
    planningSource = source;
    planningFileContent = new Uint8Array(source.bytes);
    planningWorkbook = workbook;
    document.getElementById('planningFileName').textContent = source.name;
    document.getElementById('planningConfig').classList.remove('hidden');
    loadSheets();
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

async function loadPlanning(file) {
    if (!file || planningResetting) return;
    const operation = ++planningOperation;
    planningBusy = true;
    planningStorageMessage = '';
    planningSource = planningWorkbook = planningFileContent = null;
    document.getElementById('planningConfig').classList.add('hidden');
    document.getElementById('planningFileName').textContent = file.name;
    updatePlanningExportUI();
    try {
        const bytes = await readPlanningFile(file);
        const sha256 = await hashPlanningBytes(bytes);
        if (operation !== planningOperation) return;
        if (!bytes.byteLength) throw new Error('Fichier vide');
        // Donner au parseur une copie : les octets conservés restent intacts.
        const workbook = XLSX.read(new Uint8Array(bytes.slice(0)), { type: 'array', cellDates: false, cellStyles: true });
        const source = { version: 1, bytes, sha256, name: file.name,
            size: bytes.byteLength, type: file.type || '', lastModified: file.lastModified || 0 };
        installPlanningSource(source, workbook);
        const session = activeSession;
        if (session && !session.sourceHash && legacyPlanningMatches(workbook, session)) {
            activeSession = { ...session, sourceHash: sha256,
                dateISO: planningSessionDate(workbook, session).toISOString().slice(0, 10) };
            saveDataToStorage('badminton_session', activeSession);
        }
        if (activeSession?.sourceHash === sha256 && !planningCompatibilityError(workbook, activeSession)) {
            enrichRestoredParticipants(workbook, activeSession);
            void persistSessionSource(source, activeSession);
        } else if (activeSession) {
            planningStorageMessage = 'Autre planning chargé : la source sauvegardée de la session reste inchangée. Démarrez une nouvelle session pour utiliser ce fichier.';
        }
    } catch {
        if (operation !== planningOperation) return;
        planningStorageMessage = 'Lecture du planning impossible. Réimportez le fichier source dans Admin (HTTPS ou localhost requis).';
    } finally {
        if (operation === planningOperation) {
            planningBusy = false;
            updatePlanningExportUI();
            // Permet de sélectionner à nouveau le même fichier après un échec.
            document.getElementById('planningFile').value = '';
        }
    }
}

async function restorePlanningSource() {
    if (!activeSession || planningResetting) return;
    const session = activeSession;
    const operation = ++planningOperation;
    const isCurrent = () => operation === planningOperation && activeSession === session;
    planningBusy = true;
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
            updatePlanningExportUI();
        }
    }
}

async function resetPlanningApplication() {
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
