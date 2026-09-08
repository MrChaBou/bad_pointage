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

function isEssaiMarker(value) {
    return ['ESSAI', 'ESSAI PRESENT', 'ESSAI ABSENT'].includes(String(value ?? '').trim().toUpperCase());
}

/**
 * Démarre une nouvelle session de pointage
 * Extrait les inscrits et essais admissibles avant LISTE D'ATTENTE
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
    const [col, row] = dateValue.split('|');
    const columnIndex = parseInt(col);
    const dateColumns = [...new Set(Array.from(document.getElementById('dateSelect').options)
        .filter(option => option.value)
        .map(option => parseInt(option.value.split('|')[0])))];

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
            const isEssai = dateColumns.some(c =>
                isEssaiMarker(worksheet[XLSX.utils.encode_cell({c, r})]?.v));
            if (isEssai && !isEssaiMarker(worksheet[XLSX.utils.encode_cell({c: columnIndex, r})]?.v)) continue;
            const statut = isEssai ? 'ESSAI' : 'Inscrit';

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
    players = allParticipants.filter(p => p.statut === 'Inscrit' || p.statut === 'ESSAI');
    saveDataToStorage('badminton_all_participants', allParticipants);

    const dateLabel = document.getElementById('dateSelect').options[document.getElementById('dateSelect').selectedIndex].text;

    activeSession = {
        sheet: sheet,
        dateLabel: dateLabel,
        columnIndex: columnIndex,
        headerRow: parseInt(row),
        planningFileName: document.getElementById('planningFile').files[0].name
    };

    saveDataToStorage('badminton_session', activeSession);
    resetPointingInterface();
    updateUI();
    alert(`Session démarrée. ${players.length} participants chargés. La liste d'attente a été ignorée.`);
    switchTab('participants');
}
