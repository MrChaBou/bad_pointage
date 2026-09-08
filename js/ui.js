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
    } else {
        document.getElementById('sessionInfo').classList.add('hidden');
        document.getElementById('noSessionMessage').classList.remove('hidden');
        document.getElementById('searchInput').parentElement.classList.add('hidden');
        document.getElementById('playerCard').classList.add('hidden');
        document.getElementById('feedback').classList.add('hidden');
        document.getElementById('sessionActiveAdmin').classList.add('hidden');
    }
    updatePlanningExportUI();

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

function updatePlanningExportUI() {
    const error = getPlanningExportError();
    document.getElementById('downloadBtn').disabled = !!error;
    document.getElementById('downloadMessage').textContent = activeSession ? error : '';
}
