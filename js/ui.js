// Données Excel/locales : échapper uniquement pour les emplacements texte/attribut HTML.
function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
}

// ===================================================================================
// NAVIGATION & UI
// ===================================================================================
function switchTab(tab) {
    if (!accessAllowed()) return;
    // Masquer toutes les sections et réinitialiser les styles des boutons
    ['pointage', 'participants', 'journal', 'creneau'].forEach(t => {
        document.getElementById(t + 'Section').classList.add('hidden');
        const tabBtn = document.getElementById(t + 'Tab');
        tabBtn.classList.remove('bacly-primary', 'text-white');
        tabBtn.classList.add('text-gray-600');
    });

    // Afficher la section active et mettre à jour le style du bouton
    document.getElementById(tab + 'Section').classList.remove('hidden');
    const activeTabBtn = document.getElementById(tab + 'Tab');
    activeTabBtn.classList.add('bacly-primary', 'text-white');
    activeTabBtn.classList.remove('text-gray-600');

    // Mettre à jour l'affichage selon l'onglet
    if (tab === 'participants') {
        updateParticipantsUI();
    }
    updateUI();
}
function updateUI() {
    if (!accessAllowed()) return;
    // Mise à jour de l'affichage de la session active
    if (activeSession) {
        document.getElementById('sessionInfo').classList.remove('hidden');
        document.getElementById('sessionCreneauText').textContent = activeSession.sheet;
        document.getElementById('sessionDateText').textContent = activeSession.dateLabel;
        document.getElementById('noSessionMessage').classList.add('hidden');
        document.getElementById('searchInput').parentElement.classList.remove('hidden');
        document.getElementById('sessionActiveCreneau').classList.remove('hidden');
        document.getElementById('activeSessionInfo').textContent = `${activeSession.sheet} - ${activeSession.dateLabel}`;
    } else {
        document.getElementById('sessionInfo').classList.add('hidden');
        document.getElementById('noSessionMessage').classList.remove('hidden');
        document.getElementById('searchInput').parentElement.classList.add('hidden');
        document.getElementById('playerCard').classList.add('hidden');
        document.getElementById('feedback').classList.add('hidden');
        document.getElementById('sessionActiveCreneau').classList.add('hidden');
    }
    updatePlanningExportUI();
    updateStartButton();

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
                    <h4 class="font-semibold text-lg">${escapeHTML(e.prenom)} ${escapeHTML(e.nom)}</h4>
                    <span class="text-xs text-gray-400">${new Date(e.timestamp).toLocaleTimeString('fr-FR')}</span>
                </div>
            </div>
        `).join('');
    }
}

function updatePlanningExportUI() {
    if (!accessAllowed()) return;
    updatePointageMailUI();
    const error = getPlanningExportError();
    document.getElementById('downloadBtn').disabled = !!error;
    document.getElementById('downloadMessage').textContent = activeSession ? error : '';
    document.getElementById('planningStorageStatus').textContent = planningStorageMessage;
}

// Disponibilité visuelle seulement : startSession conserve sa validation serveur.
function updateStartButton() {
    const driveButton = document.getElementById('loadCentralPlanningButton');
    driveButton.hidden = !!activeSession || planningBusy || planningResetting ||
        document.getElementById('planningFallback').hidden;
    driveButton.disabled = !accessAllowed() || !!activeSession || planningBusy || planningResetting;
    const button = document.getElementById('startPointageButton');
    button.hidden = !!activeSession;
    button.disabled = !!activeSession || !accessAllowed() || planningBusy || planningResetting ||
        !planningWorkbook || !planningSource ||
        !document.getElementById('sheetSelect').value || !document.getElementById('dateSelect').value;
}
