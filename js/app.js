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
