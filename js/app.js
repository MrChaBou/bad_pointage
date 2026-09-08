
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
// INITIALISATION
// ===================================================================================
window.addEventListener('DOMContentLoaded', init);

function init() {
    loadDataFromStorage();
    document.getElementById('searchInput').addEventListener('input', searchPlayerDynamic);
    document.getElementById('planningFile').addEventListener('change', e => loadPlanning(e.target.files[0]));
    checkBackendStatus();
    updateUI();
}

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
}

// ===================================================================================
// NAVIGATION & UI
// ===================================================================================
function switchTab(tab) {
    // Masquer toutes les sections et réinitialiser les styles des boutons
    ['pointage', 'participants', 'journal', 'admin'].forEach(t => {
        document.getElementById(t + 'Section').classList.add('hidden');
        const tabBtn = document.getElementById(t + 'Tab');
        tabBtn.classList.remove('bg-purple-600', 'text-white');
        tabBtn.classList.add('text-gray-600');
    });
    
    // Afficher la section active et mettre à jour le style du bouton
    document.getElementById(tab + 'Section').classList.remove('hidden');
    const activeTabBtn = document.getElementById(tab + 'Tab');
    activeTabBtn.classList.add('bg-purple-600', 'text-white');
    activeTabBtn.classList.remove('text-gray-600');
    
    // Mettre à jour l'affichage selon l'onglet
    if (tab === 'participants') {
        updateParticipantsUI();
    }
    updateUI();
}

/**
 * Met à jour l'affichage de l'onglet Participants
 * Affiche tous les participants avec leur statut de pointage
 * Permet le pointage/dépointage direct en cliquant sur un participant
 */
function updateParticipantsUI() {
    const listDiv = document.getElementById('participantsList');
    const infoDiv = document.getElementById('participantsInfo');
    const countSpan = document.getElementById('participantsCount');
    const presentSpan = document.getElementById('participantsPresent');
    const noSessionDiv = document.getElementById('noSessionParticipants');

    // Si pas de session active, afficher le message
    if (!activeSession || allParticipants.length === 0) {
        listDiv.innerHTML = '';
        infoDiv.classList.add('hidden');
        noSessionDiv.classList.remove('hidden');
        return;
    }

    noSessionDiv.classList.add('hidden');
    infoDiv.classList.remove('hidden');
    
    // Récupérer la liste des IDs pointés pour cette session
    const sessionKey = `${activeSession.sheet}_${activeSession.dateLabel}`;
    const pointedIds = journalEntries
        .filter(e => e.session === sessionKey)
        .map(e => e.id);
    
    // Compter les présents
    const presentCount = pointedIds.length;
    countSpan.textContent = `${allParticipants.length} total`;
    presentSpan.textContent = `${presentCount} présents`;

    // Générer l'affichage de chaque participant
    listDiv.innerHTML = allParticipants.map(p => {
        const isInscrit = p.statut === 'Inscrit';
        const isPointed = pointedIds.includes(p.id);
        
        // Définir les styles selon le statut
        let bgColor = isInscrit ? 'bg-white' : 'bg-yellow-50';
        let borderColor = 'border-gray-200';
        let statusColor = isInscrit ? 'text-green-600 bg-green-100' : 'text-orange-600 bg-orange-100';
        let statusText = isInscrit ? 'Inscrit' : 'Attente';
        let pulseClass = '';
        let checkIcon = '';
        
        // Si le participant est pointé, appliquer les styles de présence
        if (isPointed) {
            bgColor = 'bg-green-50';
            borderColor = 'border-green-400';
            pulseClass = 'pulse-green';
            checkIcon = '<span class="text-2xl text-green-500">✓</span>';
        }

        return `
            <div onclick="toggleParticipantPresence('${p.id}')" 
                 class="${bgColor} ${pulseClass} rounded-xl p-4 shadow-sm border-2 ${borderColor} flex justify-between items-center cursor-pointer transition-all hover:shadow-md active:scale-95">
                <div class="flex items-center gap-3">
                    ${checkIcon}
                    <div>
                        <h4 class="font-semibold text-base">${p.prenom} ${p.nom}</h4>
                        ${isPointed ? '<p class="text-xs text-green-600 font-medium mt-1">Présent</p>' : ''}
                    </div>
                </div>
                <div>
                    <span class="text-xs font-bold px-2 py-1 rounded-full ${statusColor}">${statusText}</span>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Gère le pointage/dépointage d'un participant depuis l'onglet Participants
 * @param {string} playerId - L'ID du participant à pointer/dépointer
 */
function toggleParticipantPresence(playerId) {
    if (!activeSession) return;
    
    // Trouver le participant dans la liste
    const participant = allParticipants.find(p => p.id === playerId);
    if (!participant) return;
    
    const sessionKey = `${activeSession.sheet}_${activeSession.dateLabel}`;
    const existingEntry = journalEntries.find(e => e.session === sessionKey && e.id === playerId);
    
    if (existingEntry) {
        // DÉPOINTAGE : Retirer l'entrée du journal
        journalEntries = journalEntries.filter(e => !(e.id === playerId && e.session === sessionKey));
        showParticipantFeedback('Présence annulée', 'orange', '↩️');
    } else {
        // POINTAGE : Ajouter une nouvelle entrée
        const entry = {
            timestamp: new Date().toISOString(),
            nom: participant.nom,
            prenom: participant.prenom,
            id: participant.id,
            session: sessionKey
        };
        journalEntries.unshift(entry);
        showParticipantFeedback('Présence enregistrée !', 'green', '✅');
    }
    
    // Sauvegarder et mettre à jour l'affichage
    saveDataToStorage('badminton_journal', journalEntries);
    updateParticipantsUI();
    updateUI();
}

/**
 * Affiche un feedback visuel dans l'onglet Participants
 * @param {string} message - Le message à afficher
 * @param {string} color - La couleur du feedback (green, orange, etc.)
 * @param {string} icon - L'icône à afficher
 */
function showParticipantFeedback(message, color, icon) {
    const feedback = document.getElementById('participantFeedback');
    const feedbackBox = document.getElementById('participantFeedbackBox');
    const feedbackIcon = document.getElementById('participantFeedbackIcon');
    const feedbackText = document.getElementById('participantFeedbackText');
    
    feedbackIcon.textContent = icon;
    feedbackText.textContent = message;
    feedbackBox.className = `text-white rounded-xl p-4 text-center shadow-lg feedback-slide bg-${color}-500`;
    
    feedback.classList.remove('hidden');
    
    // Masquer le feedback après 2 secondes
    setTimeout(() => {
        feedback.classList.add('hidden');
    }, 2000);
}

function updateUI() {
    // Mise à jour de l'affichage de la session active
    if (activeSession) {
        document.getElementById('sessionInfo').classList.remove('hidden');
        document.getElementById('sessionCreneauText').textContent = activeSession.sheet;
        document.getElementById('sessionDateText').textContent = activeSession.dateLabel;
        document.getElementById('noSessionMessage').classList.add('hidden');
        document.getElementById('searchInput').parentElement.classList.remove('hidden');
        document.getElementById('sessionActiveAdmin').classList.remove('hidden');
        document.getElementById('activeSessionInfo').textContent = `${activeSession.sheet} - ${activeSession.dateLabel}`;
        document.getElementById('downloadBtn').disabled = false;
    } else {
        document.getElementById('sessionInfo').classList.add('hidden');
        document.getElementById('noSessionMessage').classList.remove('hidden');
        document.getElementById('searchInput').parentElement.classList.add('hidden');
        document.getElementById('playerCard').classList.add('hidden');
        document.getElementById('feedback').classList.add('hidden');
        document.getElementById('sessionActiveAdmin').classList.add('hidden');
        document.getElementById('downloadBtn').disabled = true;
    }
    
    // Mise à jour du journal
    const sessionKey = activeSession ? `${activeSession.sheet}_${activeSession.dateLabel}` : null;
    const entriesForSession = sessionKey ? journalEntries.filter(e => e.session === sessionKey) : [];
    
    if (entriesForSession.length === 0) {
        document.getElementById('emptyJournal').classList.remove('hidden');
        document.getElementById('journalList').innerHTML = '';
    } else {
        document.getElementById('emptyJournal').classList.add('hidden');
        document.getElementById('journalList').innerHTML = entriesForSession.map(e => `
            <div class="bg-white rounded-xl p-4 shadow-sm border">
                <div class="flex justify-between items-center">
                    <h4 class="font-semibold text-lg">${e.prenom} ${e.nom}</h4>
                    <span class="text-xs text-gray-400">${new Date(e.timestamp).toLocaleTimeString('fr-FR')}</span>
                </div>
            </div>
        `).join('');
    }
}

// ===================================================================================
// LOGIQUE DE RECHERCHE AMÉLIORÉE
// ===================================================================================

/**
 * Recherche dynamique avec affichage de la liste des résultats
 * Affiche une liste de participants correspondants dès 3 lettres tapées
 * La liste permet de sélectionner directement un participant
 */
function searchPlayerDynamic(e) {
    const query = e.target.value.toLowerCase().trim();
    const searchResults = document.getElementById('searchResults');
    const searchResultsList = document.getElementById('searchResultsList');
    
    // Si moins de 2 caractères, masquer les résultats et réinitialiser
    if (query.length < 2) {
        searchResults.classList.add('hidden');
        resetPlayerCard();
        return;
    }
    
    // Filtrer les joueurs correspondant à la recherche
    const sessionKey = activeSession ? `${activeSession.sheet}_${activeSession.dateLabel}` : null;
    const pointedIds = journalEntries.filter(j => j.session === sessionKey).map(j => j.id);
    
    const matchingPlayers = players.filter(p => 
        p.nom.toLowerCase().includes(query) || 
        p.prenom.toLowerCase().includes(query)
    );
    
    // Afficher la liste seulement s'il y a des résultats
    if (matchingPlayers.length === 0) {
        searchResults.classList.add('hidden');
        resetPlayerCard();
        return;
    }
    
    // Si un seul résultat exact, le sélectionner directement
    if (matchingPlayers.length === 1) {
        currentPlayer = matchingPlayers[0];
        showPlayer(matchingPlayers[0]);
        searchResults.classList.add('hidden');
        return;
    }
    
    // Afficher la liste des résultats
    searchResults.classList.remove('hidden');
    searchResultsList.innerHTML = matchingPlayers.map(p => {
        const isPointed = pointedIds.includes(p.id);
        const bgColor = isPointed ? 'bg-green-50' : 'bg-white';
        const checkIcon = isPointed ? '<span class="text-green-500 text-xl">✓</span>' : '<span class="text-gray-300 text-xl">○</span>';
        
        return `
            <div onclick="selectPlayerFromSearch('${p.id}')" 
                 class="${bgColor} p-4 cursor-pointer hover:bg-purple-50 active:bg-purple-100 transition-colors flex items-center gap-3">
                ${checkIcon}
                <div class="flex-1">
                    <p class="font-semibold text-base">${p.prenom} ${p.nom}</p>
                    ${isPointed ? '<p class="text-xs text-green-600 font-medium">Déjà pointé</p>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Sélectionne un joueur depuis la liste de recherche
 * @param {string} playerId - L'ID du joueur sélectionné
 */
function selectPlayerFromSearch(playerId) {
    const player = players.find(p => p.id === playerId);
    if (!player) return;
    
    currentPlayer = player;
    showPlayer(player);
    
    // Masquer la liste de résultats
    document.getElementById('searchResults').classList.add('hidden');
}

function showPlayer(player) {
    document.getElementById('playerName').textContent = `${player.prenom} ${player.nom}`;
    document.getElementById('playerId').textContent = `ID: ${player.id}`;
    document.getElementById('playerCard').classList.remove('hidden');
    document.getElementById('feedback').classList.add('hidden');
    
    // Vérifier si le joueur est déjà pointé
    const sessionKey = activeSession ? `${activeSession.sheet}_${activeSession.dateLabel}` : null;
    const isAlreadyPointed = journalEntries.some(e => e.session === sessionKey && e.id === player.id);
    updatePresenceButton(isAlreadyPointed);
}

function resetPlayerCard() { 
    currentPlayer = null; 
    document.getElementById('playerCard').classList.add('hidden');
    clearTimeout(cancelTimeout);
}

/**
 * Gère le pointage/dépointage depuis la carte joueur
 */
function togglePresence() {
    if (!currentPlayer || !activeSession) return;

    const sessionKey = `${activeSession.sheet}_${activeSession.dateLabel}`;
    const alreadyPointedEntry = journalEntries.find(e => e.session === sessionKey && e.id === currentPlayer.id);

    if (alreadyPointedEntry) {
        // ANNULATION DU POINTAGE
        journalEntries = journalEntries.filter(e => !(e.id === alreadyPointedEntry.id && e.session === sessionKey));
        showFeedback('Pointage annulé', 'orange', '↩️');
        clearTimeout(cancelTimeout);
        
        // Revenir à la carte du joueur après 1.5 secondes
        setTimeout(() => {
            document.getElementById('feedback').classList.add('hidden');
            document.getElementById('playerCard').classList.remove('hidden');
            updatePresenceButton(false);
        }, 1500);
    } else {
        // NOUVEAU POINTAGE
        const entry = { 
            timestamp: new Date().toISOString(), 
            nom: currentPlayer.nom, 
            prenom: currentPlayer.prenom, 
            id: currentPlayer.id, 
            session: sessionKey 
        };
        journalEntries.unshift(entry);
        showFeedback('Présence enregistrée !', 'green', '✅');
        
        // Revenir à la carte du joueur après 0.5 secondes
        setTimeout(() => {
            document.getElementById('feedback').classList.add('hidden');
            document.getElementById('playerCard').classList.remove('hidden');
            updatePresenceButton(true);
        }, 500);

        // Réinitialiser tout après 7 secondes si pas d'action
        cancelTimeout = setTimeout(() => {
            resetPointingInterface();
        }, 7000);
    }
    
    saveDataToStorage('badminton_journal', journalEntries);
    updateUI();
}

/**
 * Met à jour l'apparence du bouton de présence
 * @param {boolean} isPointed - Indique si le joueur est déjà pointé
 */
function updatePresenceButton(isPointed) {
    const content = document.getElementById('presenceButtonContent');
    const iconUnchecked = document.getElementById('iconUnchecked');
    const iconChecked = document.getElementById('iconChecked');
    const buttonText = document.getElementById('buttonText');
    const cancelMsg = document.getElementById('cancelMessage');
    
    if (isPointed) {
        content.classList.remove('bg-gray-100');
        content.classList.add('bg-green-500', 'pulse-green');
        iconUnchecked.classList.add('hidden');
        iconChecked.classList.remove('hidden');
        iconChecked.classList.add('text-white');
        buttonText.textContent = 'Présence confirmée';
        buttonText.classList.add('text-white');
        cancelMsg.classList.remove('hidden');
    } else {
        content.classList.add('bg-gray-100');
        content.classList.remove('bg-green-500', 'pulse-green');
        iconUnchecked.classList.remove('hidden');
        iconChecked.classList.add('hidden');
        buttonText.textContent = 'Touchez pour pointer';
        buttonText.classList.remove('text-white');
        cancelMsg.classList.add('hidden');
    }
}

function showFeedback(message, color, icon) {
    const feedback = document.getElementById('feedback');
    const feedbackBox = document.getElementById('feedbackBox');
    document.getElementById('feedbackIcon').textContent = icon;
    document.getElementById('feedbackText').textContent = message;
    document.getElementById('feedbackName').textContent = `${currentPlayer.prenom} ${currentPlayer.nom}`;
    feedbackBox.className = `text-white rounded-2xl p-6 text-center shadow-lg bg-${color}-500`;
    feedback.classList.remove('hidden');
    document.getElementById('playerCard').classList.add('hidden');
}

function resetPointingInterface() {
    clearTimeout(cancelTimeout);
    document.getElementById('searchInput').value = '';
    document.getElementById('playerCard').classList.add('hidden');
    document.getElementById('feedback').classList.add('hidden');
    document.getElementById('searchResults').classList.add('hidden');
    currentPlayer = null;
    isPresenceBeingProcessed = false;
}

// ===================================================================================
// GESTION DU PLANNING
// ===================================================================================
function loadPlanning(file) {
    if (!file) return;
    document.getElementById('planningFileName').textContent = file.name;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            planningFileContent = new Uint8Array(e.target.result);
            planningWorkbook = XLSX.read(planningFileContent, { type: 'array', cellDates: false });
            document.getElementById('planningConfig').classList.remove('hidden');
            loadSheets();
        } catch(error) { 
            alert('Erreur lecture planning'); 
        }
    };
    reader.readAsArrayBuffer(file);
}

function loadSheets() {
    const select = document.getElementById('sheetSelect');
    select.innerHTML = '<option value="">Sélectionnez un créneau...</option>';
    planningWorkbook.SheetNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    document.getElementById('dateSelect').innerHTML = '<option value="">Sélectionnez une date...</option>';
}

/**
 * Convertit un numéro de série Excel moderne en jour calendaire à minuit UTC.
 * Ignore la fraction horaire et tient compte du calendrier 1904.
 * @param {*} cellValue - La valeur brute de la cellule Excel
 * @param {boolean} date1904 - Le classeur utilise le calendrier 1904
 * @returns {Date|null} - L'objet Date correspondant ou null si invalide
 */
function parseCellAsDate(cellValue, date1904 = false) {
    if (typeof cellValue !== 'number' || !Number.isFinite(cellValue)) return null;

    const excelDay = Math.floor(cellValue) + (date1904 ? 1462 : 0);
    const date = new Date((excelDay - 25569) * 86400000);
    
    if (isNaN(date.getTime())) return null;
    
    return date;
}

/**
 * Charge les dates disponibles depuis l'onglet sélectionné
 * Parcourt les 10 premières lignes et 20 premières colonnes pour détecter les dates
 * Présélectionne automatiquement la date du jour si elle est trouvée
 */
function loadDates() {
    const sheetName = document.getElementById('sheetSelect').value;
    const dateSelect = document.getElementById('dateSelect');
    dateSelect.innerHTML = '<option value="">Sélectionnez une date...</option>';
    if (!sheetName) return;

    const worksheet = planningWorkbook.Sheets[sheetName];
    const date1904Flag = planningWorkbook.Workbook?.WBProps?.date1904;
    const date1904 = date1904Flag === true || date1904Flag === 1 || date1904Flag === '1' || date1904Flag === 'true';
    const datesFound = [];
    
    // Parcourir les cellules pour trouver les dates (zone de recherche : 10 lignes x 20 colonnes)
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 20; c++) {
            const cellAddress = XLSX.utils.encode_cell({c, r});
            const cell = worksheet[cellAddress];
            
            if (cell && cell.v != null) {
                let date = null;
                
                // Comparer les séries dans le calendrier 1900, quel que soit celui du classeur.
                const excelDay = Math.floor(cell.v) + (date1904 ? 1462 : 0);
                if (cell.t === 'n' && excelDay > 40000 && excelDay < 50000) {
                    date = parseCellAsDate(cell.v, date1904);
                }
                
                // Valider que la date est dans une plage raisonnable (2000-2030)
                if (date && !isNaN(date.getTime()) && date.getUTCFullYear() > 2000 && date.getUTCFullYear() < 2030) {
                    const options = { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' };
                    const label = date.toLocaleDateString('fr-FR', options);
                    
                    datesFound.push({
                        date: date,
                        label: label,
                        value: `${c}|${r}`
                    });
                }
            }
        }
    }
    
    // Éliminer les doublons (dates identiques à des positions différentes)
    const uniqueDates = Array.from(new Map(datesFound.map(d => [d.label, d])).values());
    
    // Trier par ordre chronologique
    uniqueDates.sort((a, b) => a.date - b.date);
    
    // Représenter le jour local courant à minuit UTC pour une comparaison calendaire.
    const today = new Date();
    const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Créer les options de sélection et présélectionner la date du jour
    uniqueDates.forEach(d => {
        const option = document.createElement('option');
        option.value = d.value;
        option.textContent = d.label;
        dateSelect.appendChild(option);
        
        // Sélectionner uniquement le même jour calendaire.
        if (d.date.getTime() === todayUTC) {
            option.selected = true;
        }
    });
}

/**
 * Démarre une nouvelle session de pointage
 * Extrait uniquement les inscrits avant le séparateur LISTE D'ATTENTE
 * Sauvegarde la session dans le stockage local
 */
function startSession() {
    const sheet = document.getElementById('sheetSelect').value;
    const dateValue = document.getElementById('dateSelect').value;
    if (!sheet || !dateValue) {
        alert('Sélectionnez un créneau et une date');
        return;
    }

    const worksheet = planningWorkbook.Sheets[sheet];
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const maxRow = range.e.r;

    const extractedAllParticipants = [];

    // Parcourir toutes les lignes à partir de la ligne 4 (index 3)
    for (let r = 3; r <= maxRow; r++) {
        const stopText = [0, 1, 2, 3].map(c => {
            const cell = worksheet[XLSX.utils.encode_cell({c, r})];
            return cell ? String(cell.v ?? '') : '';
        }).join(' ').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ').trim();
        if (stopText.includes("liste d'attente")) break;

        const cellB = worksheet[XLSX.utils.encode_cell({c: 1, r: r})]; // Colonne B = Nom
        const cellC = worksheet[XLSX.utils.encode_cell({c: 2, r: r})]; // Colonne C = Prénom

        const nomValue = cellB ? cellB.v : undefined;
        const prenomValue = cellC ? cellC.v : undefined;

        
        // Extraire le participant si la colonne NOM contient une valeur
        if (nomValue) { 
            const nom = String(nomValue).trim();
            const prenom = prenomValue ? String(prenomValue).trim() : '';
            const statut = "Inscrit";
            
            extractedAllParticipants.push({
                id: `P${String(r).padStart(3, '0')}`,
                nom: nom,
                prenom: prenom,
                statut: statut
            });
        }
    }

    if (extractedAllParticipants.length === 0) {
        alert("Aucun joueur trouvé. Vérifiez le format du fichier.");
        return;
    }
    
    // Sauvegarder les participants et créer la session
    allParticipants = extractedAllParticipants;
    players = allParticipants.filter(p => p.statut === 'Inscrit');
    saveDataToStorage('badminton_all_participants', allParticipants);

    const [col, row] = dateValue.split('|');
    const dateLabel = document.getElementById('dateSelect').options[document.getElementById('dateSelect').selectedIndex].text;
    
    activeSession = {
        sheet: sheet,
        dateLabel: dateLabel,
        columnIndex: parseInt(col),
        headerRow: parseInt(row),
        planningFileName: document.getElementById('planningFile').files[0].name
    };
    
    saveDataToStorage('badminton_session', activeSession);
    updateUI();
    alert(`Session démarrée. ${players.length} inscrits chargés. La liste d'attente a été ignorée.`);
    switchTab('participants');
}

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
        
        if (isPresent) {
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
