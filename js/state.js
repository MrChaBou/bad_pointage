// ===================================================================================
// CONFIGURATION & ÉTAT GLOBAL
// ===================================================================================
const BACKEND_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:5000'
    : 'https://mrchabou.eu.pythonanywhere.com';

let players = [], allParticipants = [], journalEntries = [], currentPlayer = null, activeSession = null;
let planningWorkbook = null, planningFileContent = null;
let cancelTimeout = null, isPresenceBeingProcessed = false;
let backendAvailable = false;

// ===================================================================================
// STOCKAGE LOCAL
// ===================================================================================
function saveDataToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch(e) {
        console.error("Sauvegarde échouée", e);
    }
}

function loadDataFromStorage() {
    try {
        journalEntries = JSON.parse(localStorage.getItem('badminton_journal') || '[]');
        activeSession = JSON.parse(localStorage.getItem('badminton_session') || 'null');
        allParticipants = JSON.parse(localStorage.getItem('badminton_all_participants') || '[]');
    } catch(e) {
        journalEntries = [];
        activeSession = null;
        allParticipants = [];
    }
    players = allParticipants.filter(p => p.statut === 'Inscrit' || p.statut === 'ESSAI');
}


/**
 * Réinitialise complètement l'application
 * Supprime toutes les données du stockage local
 */
function resetAll() {
    if (confirm("Réinitialiser ? Le journal et la session seront perdus.")) {
        localStorage.removeItem('badminton_journal');
        localStorage.removeItem('badminton_session');
        localStorage.removeItem('badminton_all_participants');
        location.reload();
    }
}
