// Accès responsable uniquement. Aucun code partagé ni secret permanent ici.
const authStorageKey = 'badminton_responsible_access';
let accessToken = null, accessExpiresAt = 0, accessEpoch = 0;
let accessTimer = null, accessBusy = false, businessLoaded = false;

function accessAllowed() {
    if (!accessToken) return false;
    if (Date.now() >= accessExpiresAt) {
        lockAccess('Accès expiré. Votre pointage est conservé.');
        return false;
    }
    return true;
}

function lockAccess(message = '', removeToken = true) {
    ++accessEpoch;
    accessToken = null;
    accessExpiresAt = 0;
    clearTimeout(accessTimer);
    ++planningOperation;
    planningBusy = false;
    resetPointingInterface();
    document.getElementById('application').hidden = true;
    document.getElementById('accessScreen').hidden = false;
    document.getElementById('accessMessage').textContent = message;
    document.getElementById('accessCode').value = '';
    // Conserver l'état métier en mémoire et dans ses stockages, mais vider ses rendus.
    for (const id of ['journalList', 'participantsList', 'searchResultsList', 'playerBadges', 'feedbackBadges']) {
        document.getElementById(id).innerHTML = '';
    }
    for (const id of ['playerName', 'playerId', 'feedbackName', 'sessionCreneauText',
        'sessionDateText', 'activeSessionInfo', 'planningFileName', 'planningDriveInfo', 'planningStorageStatus', 'downloadMessage']) {
        document.getElementById(id).textContent = '';
    }
    document.getElementById('sheetSelect').innerHTML = '';
    document.getElementById('dateSelect').innerHTML = '';
    document.getElementById('planningFile').value = '';
    if (removeToken) {
        try { sessionStorage.removeItem(authStorageKey); } catch { /* Accès déjà verrouillé. */ }
    }
}

function accessError(error) {
    if (error.storageUnavailable) return 'Stockage du navigateur indisponible. Accès non ouvert ; pointage conservé.';
    if (error.status === 401) return 'Code incorrect ou accès expiré. Votre pointage est conservé.';
    if (error.status === 429) return 'Trop de tentatives. Réessayez plus tard.';
    if (error.status === 403) return 'Accès refusé.';
    return 'Serveur indisponible. Votre pointage est conservé. Réessayez.';
}

async function accessRequest(path, options = {}, token = null) {
    const response = await fetch(`${BACKEND_URL}${path}`, {
        ...options, credentials: 'omit', cache: 'no-store',
        headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
    });
    if (response.status === 401 && token && token === accessToken) {
        lockAccess('Accès expiré ou révoqué. Votre pointage est conservé.');
    }
    return response;
}

async function validateAccessOnServer() {
    if (!accessAllowed()) return false;
    const epoch = accessEpoch;
    const response = await accessRequest('/auth/session', {}, accessToken);
    if (epoch !== accessEpoch || !accessAllowed()) return false;
    if (!response.ok) throw Object.assign(new Error('Accès non confirmé'), { status: response.status });
    const data = await response.json();
    if (epoch !== accessEpoch || !accessAllowed()) return false;
    return data.role === 'responsible' && data.expires_at * 1000 === accessExpiresAt;
}

async function openAccess(token, data) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token) || data.role !== 'responsible' ||
        !Number.isSafeInteger(data.expires_at) || data.expires_at * 1000 <= Date.now()) {
        throw new Error('Réponse d’accès invalide');
    }
    // Persister l'accès avant de rendre la moindre donnée métier.
    try { sessionStorage.setItem(authStorageKey, JSON.stringify({ token })); }
    catch { throw Object.assign(new Error('Stockage d’accès indisponible'), { storageUnavailable: true }); }
    accessToken = token;
    accessExpiresAt = data.expires_at * 1000;
    const epoch = ++accessEpoch;
    clearTimeout(accessTimer);
    accessTimer = setTimeout(() => {
        if (epoch === accessEpoch) lockAccess('Accès expiré. Votre pointage est conservé.');
    }, Math.max(0, accessExpiresAt - Date.now()));
    if (!businessLoaded) {
        loadDataFromStorage();
        businessLoaded = true;
    }
    if (planningSource && planningWorkbook) installPlanningSource(planningSource, planningWorkbook);
    document.getElementById('accessScreen').hidden = true;
    document.getElementById('application').hidden = false;
    document.getElementById('accessMessage').textContent = '';
    switchTab(activeSession ? 'pointage' : 'creneau');
    updateParticipantsUI();
    void checkBackendStatus();
    if (!planningFileContent) await restorePlanningSource();
    // La restauration et toute session active priment sur une nouvelle source Drive.
    if (epoch === accessEpoch && accessAllowed() && !activeSession &&
        !planningSource && !planningWorkbook && !planningFileContent) {
        await loadCentralPlanning();
    }
}

async function submitAccess(event) {
    event?.preventDefault();
    if (accessBusy) return;
    accessBusy = true;
    const button = document.getElementById('accessButton');
    button.disabled = true;
    const epoch = ++accessEpoch;
    let code = document.getElementById('accessCode').value;
    document.getElementById('accessCode').value = '';
    document.getElementById('accessMessage').textContent = 'Vérification…';
    try {
        const pending = accessRequest('/auth/login', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
        });
        code = null;
        const response = await pending;
        if (epoch !== accessEpoch) return;
        if (!response.ok) throw Object.assign(new Error('Connexion refusée'), { status: response.status });
        const data = await response.json();
        if (epoch !== accessEpoch) return;
        await openAccess(data.token, data);
    } catch (error) {
        if (epoch === accessEpoch) lockAccess(accessError(error));
    } finally {
        code = null;
        accessBusy = false;
        button.disabled = false;
    }
}

async function restoreAccess() {
    lockAccess('Vérification de l’accès…', false);
    const epoch = accessEpoch;
    try {
        const saved = JSON.parse(sessionStorage.getItem(authStorageKey) || 'null');
        if (!saved?.token) {
            document.getElementById('accessMessage').textContent = '';
            return;
        }
        const response = await accessRequest('/auth/session', {}, saved.token);
        if (epoch !== accessEpoch) return;
        if (!response.ok) throw Object.assign(new Error('Accès non confirmé'), { status: response.status });
        const data = await response.json();
        if (epoch !== accessEpoch) return;
        await openAccess(saved.token, data);
    } catch (error) {
        if (epoch === accessEpoch) lockAccess(accessError(error), error.status === 401);
    }
}

async function logoutAccess() {
    const token = accessToken;
    lockAccess('Déconnecté. Votre pointage est conservé.');
    if (token) {
        try { await accessRequest('/auth/logout', { method: 'POST' }, token); }
        catch { /* Le retrait local est effectif même si le serveur est injoignable. */ }
    }
}
