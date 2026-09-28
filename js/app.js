window.addEventListener('DOMContentLoaded', init);

function init() {
    document.getElementById('accessForm').addEventListener('submit', submitAccess);
    document.getElementById('logoutButton').addEventListener('click', logoutAccess);
    document.getElementById('searchInput').addEventListener('input', searchPlayerDynamic);
    document.getElementById('planningFile').addEventListener('change', e => loadPlanning(e.target.files[0]));
    document.getElementById('participantsList').addEventListener('click', event => {
        const target = event.target.closest('[data-participant-id]');
        if (target) toggleParticipantPresence(target.dataset.participantId);
    });
    document.getElementById('searchResultsList').addEventListener('click', event => {
        const target = event.target.closest('[data-search-id]');
        if (target) selectPlayerFromSearch(target.dataset.searchId);
    });
    // Aucun appel serveur au simple retour au premier plan : contrôler l'expiration locale.
    document.addEventListener('visibilitychange', () => { accessAllowed(); });
    window.addEventListener('pagehide', () => lockAccess('', false));
    window.addEventListener('pageshow', event => { if (event.persisted) void restoreAccess(); });
    return restoreAccess();
}
