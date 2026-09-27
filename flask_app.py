# flask_app.py (à mettre sur PythonAnywhere)

import base64
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
import openpyxl
from io import BytesIO

app = Flask(__name__)

# Origines autorisées : serveurs frontend locaux et GitHub Pages.
CORS(app, origins=[
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'https://mrchabou.github.io',
])

@app.route('/update-planning', methods=['POST'])
def update_planning():
    try:
        data = request.json
        
        # 1. Décoder le fichier Excel reçu en base64
        excel_data = base64.b64decode(data['file'])
        excel_file = BytesIO(excel_data)
        
        # 2. Charger le classeur avec openpyxl en préservant les styles
        wb = openpyxl.load_workbook(excel_file)
        ws = wb[data['sheet']]
        
        # 3. Récupérer les informations de la requête
        col_idx_target = data['columnIndex'] + 1  # openpyxl est base 1, JS est base 0
        presences = data.get('presences', [])
        
        # Recenser les seules lignes participants avant toute écriture.
        participant_rows = {}
        for row in range(4, ws.max_row + 1):
            stop_text = ' '.join(str(ws.cell(row=row, column=col).value or '') for col in range(1, 5))
            stop_text = stop_text.lower().replace('\u2018', "'").replace('\u2019', "'").replace('\u02bc', "'")
            if "liste d'attente" in ' '.join(stop_text.split()):
                break
            nom = ws.cell(row=row, column=2).value
            prenom = ws.cell(row=row, column=3).value
            if not nom or not prenom or not str(nom).strip() or not str(prenom).strip():
                continue
            participant_rows[row] = (str(nom).strip().lower(), str(prenom).strip().lower())

        present_rows = set()
        legacy_names = set()
        for presence in presences:
            if not isinstance(presence, dict) or not all(
                isinstance(presence.get(field), str) and presence[field].strip()
                for field in ('nom', 'prenom')
            ):
                return jsonify(success=False, error='Identité de présence invalide'), 400
            identity = (presence['nom'].strip().lower(), presence['prenom'].strip().lower())
            if 'id' not in presence:
                # Compatibilité avec les anciens frontends uniquement sans ID.
                legacy_names.add(identity)
                continue
            participant_id = presence['id']
            # padStart(3) : trois chiffres minimum, aucun zéro superflu au-delà.
            if not isinstance(participant_id, str) or not re.fullmatch(
                r'P(?:[0-9]{3}|[1-9][0-9]{3,6})', participant_id
            ):
                return jsonify(success=False, error='ID de présence invalide'), 400
            row = int(participant_id[1:]) + 1  # SheetJS base 0 -> openpyxl base 1
            if row not in participant_rows or participant_rows[row] != identity:
                return jsonify(success=False, error='ID de présence incompatible avec la ligne source'), 400
            present_rows.add(row)

        # Tous les IDs sont validés avant de modifier la moindre cellule.
        for row, identity in participant_rows.items():
            target_cell = ws.cell(row=row, column=col_idx_target)
            is_present = row in present_rows or identity in legacy_names
            is_essai = str(target_cell.value or '').strip().upper() in ('ESSAI', 'ESSAI PRESENT', 'ESSAI ABSENT')
            if is_essai:
                target_cell.value = 'ESSAI PRESENT' if is_present else 'ESSAI ABSENT'
            else:
                target_cell.value = 'V' if is_present else None

        # 6. Sauvegarder le fichier modifié en mémoire
        output = BytesIO()
        wb.save(output)
        output.seek(0)
        
        # 7. Renvoyer le fichier en base64 au frontend
        return jsonify({
            'success': True,
            'file': base64.b64encode(output.read()).decode('utf-8'),
            'filename': data.get('filename', 'planning_mis_a_jour.xlsx')
        })
        
    except Exception as e:
        # En cas d'erreur, renvoyer un message clair
        app.logger.error(f"Erreur lors du traitement: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health_check():
    """
    Un simple point de terminaison pour vérifier que le serveur est en ligne.
    Le frontend l'utilisera pour déterminer s'il peut préserver les styles.
    """
    return jsonify({'status': 'ok'})
