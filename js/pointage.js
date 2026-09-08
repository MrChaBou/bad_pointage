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
