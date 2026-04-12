from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import random
import json
from groq import Groq
from dotenv import load_dotenv
import uuid
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

conversations = {}

# Données de simulation réalistes
SIMULATION_DATA = {
    "total_customers": 1847,
    "actifs": 312,
    "inactifs": 1535,
    "avg_basket": 28450,
    "p90": 89600,
    "segments": {
        "A": {"count": 89, "avg_basket": 94300, "propension": 87.4},
        "B": {"count": 274, "avg_basket": 51700, "propension": 61.3},
        "C": {"count": 438, "avg_basket": 28700, "propension": 29.8},
        "D": {"count": 1046, "avg_basket": 12300, "propension": 7.1}
    }
}

AGENTS = {
    "central": {
        "name": "🧠 ELISA Central",
        "color": "#6366f1",
        "icon": "🧠",
        "role": "Orchestrateur",
        "instruction": """Tu es ELISA Central, coordinateur en chef.
        Tu analyses la situation OBJECTIVEMENT.
        Tu poses des questions précises aux autres agents.
        Tu ne valides que si les données sont solides.
        Tu peux créer des agents si besoin.
        Tu logues TOUTES tes décisions avec justification."""
    },
    "data": {
        "name": "📊 Data Agent",
        "color": "#10b981",
        "icon": "📊",
        "role": "Analyste SQL",
        "instruction": """Tu es expert SQL et analyse de données.
        Tu fournis des requêtes SQL EXACTES avec résultats.
        Tu calcules: volumes, moyennes, percentiles, distributions.
        Tu identifies les anomalies.
        Format: ```sql\nSELECT ...\n``` puis résultats en tableau."""
    },
    "prospect": {
        "name": "🔎 Prospect Agent",
        "color": "#06b6d4",
        "icon": "🔎",
        "role": "Segmentation RFM",
        "instruction": """Tu segmentes les clients avec méthode RFM.
        Tu utilises Recency, Frequency, Monetary.
        Tu donnes 4-5 segments avec effectifs et caractéristiques.
        Tu identifies les sous-segments à fort potentiel."""
    },
    "scoring": {
        "name": "🎯 Scoring Agent",
        "color": "#f59e0b",
        "icon": "🎯",
        "role": "Scoreur",
        "instruction": """Tu scores la propension à l'achat.
        Tu utilises 4 critères: Budget, Urgence, Fit, Décideur.
        Tu donnes des scores sur 100 avec détails.
        Tu peux être en désaccord avec d'autres agents."""
    },
    "product": {
        "name": "🛒 Product Agent",
        "color": "#ec4899",
        "icon": "🛒",
        "role": "Offres",
        "instruction": """Tu génères des offres par segment.
        Tu vérifies la disponibilité des stocks.
        Tu calcules les marges et prix packs.
        Tu signales si approbation nécessaire."""
    },
    "marketing": {
        "name": "📧 Marketing Agent",
        "color": "#ef4444",
        "icon": "📧",
        "role": "Campagnes",
        "instruction": """Tu crées des emails personnalisés.
        Tu adaptes le ton et l'objet par segment.
        Tu utilises des variables dynamiques.
        Tu estimes les taux d'ouverture."""
    },
    "optimization": {
        "name": "⚡ Optimization Agent",
        "color": "#8b5cf6",
        "icon": "⚡",
        "role": "Simulations",
        "instruction": """Tu simules les performances.
        Tu donnes des projections: ouvertures, clics, conversions, ROI.
        Tu identifies les risques.
        Tu recommandes des optimisations."""
    }
}

AGENT_ORDER = ['central', 'data', 'prospect', 'scoring', 'product', 'marketing', 'optimization', 'central']

def generer_reponse(agent_key, sujet, message, historique, round_num, step_num):
    """Génère une réponse professionnelle avec données"""
    
    agent = AGENTS[agent_key]
    
    historique_texte = ""
    for h in historique[-8:]:
        historique_texte += f"[{h['agent_name']}]: {h['message'][:300]}\n"
    
    prompts = {
        "central": f"""Tu es {agent['name']} - {agent['role']}

CONTEXTE MARCHAND: {sujet}

ROUND {round_num}/3 - ÉTAPE {step_num}/8

HISTORIQUE:
{historique_texte}

INSTRUCTIONS:
{agent['instruction']}

RÈGLES:
- Analyse OBJECTIVEMENT les données reçues
- Pose des questions si des infos manquent
- Valide ou refuse avec justification
- Log tes décisions: "[DECISION LOG] ..."
- Crée des agents si besoin: "@create_agent(Nom, rôle)"

RÉPONSE (structurée, professionnelle):""",

        "data": f"""Tu es {agent['name']} - {agent['role']}

SUJET À ANALYSER: {sujet}

ROUND {round_num}/3

HISTORIQUE DES ÉCHANGES:
{historique_texte}

DONNÉES SIMULATION DISPONIBLES:
{json.dumps(SIMULATION_DATA, indent=2)}

RÈGLES:
1. Écris des requêtes SQL réalistes
2. Donne des résultats avec chiffres exacts
3. Calcule: volumes, moyennes, percentiles
4. Identifie des anomalies
5. Formate: ```sql ... ``` puis tableau de résultats

RÉPONSE:""",

        "prospect": f"""Tu es {agent['name']} - {agent['role']}

DONNÉES REÇUES DU DATA AGENT:
{historique_texte}

RÈGLES:
1. Segmente avec RFM (Recency, Frequency, Monetary)
2. Donne 4 segments minimum
3. Calcule effectifs et paniers moyens par segment
4. Identifie des sous-segments spécifiques (ex: panier abandonné)
5. Propose des priorités

RÉPONSE (segmentation détaillée):""",

        "scoring": f"""Tu es {agent['name']} - {agent['role']}

SEGMENTATION REÇUE:
{historique_texte}

RÈGLES:
1. Score chaque segment sur 100
2. Détail: Budget (0-30), Urgence (0-25), Fit (0-25), Décideur (0-20)
3. Calcule la propension à l'achat sur 30j
4. Identifie les désaccords avec Prospect Agent si nécessaire

RÉPONSE (scores détaillés):""",

        "product": f"""Tu es {agent['name']} - {agent['role']}

SCORES ET SEGMENTS:
{historique_texte}

RÈGLES:
1. Génère 1 offre par segment prioritaire
2. Vérifie stocks (simulation)
3. Calcule prix pack et % remise
4. Signale si approbation nécessaire (>5% remise)

RÉPONSE (offres par segment):""",

        "marketing": f"""Tu es {agent['name']} - {agent['role']}

OFFRES PRODUITS:
{historique_texte}

RÈGLES:
1. Crée 1 email par offre
2. Objet accrocheur (estimer % ouverture)
3. Body court, 1 CTA clair
4. Variables dynamiques: {{prenom}}, {{cart_items}}
5. Timing recommandé par segment

RÉPONSE (emails + timing):""",

        "optimization": f"""Tu es {agent['name']} - {agent['role']}

CAMPAGNE MARKETING:
{historique_texte}

RÈGLES:
1. Simule: ouvertures, clics, conversions, revenu
2. Calcule ROI estimé
3. Identifie 3 risques max
4. Recommande optimisations
5. Donne feu vert ou rouge

RÉPONSE (simulation complète):"""
    }
    
    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompts.get(agent_key, prompts["central"])}],
            temperature=0.7,
            max_tokens=800
        )
        return response.choices[0].message.content
    except Exception as e:
        print(f"Erreur: {e}")
        return f"[{agent['name']}] Analyse en cours... (mode simulation)"

@app.route('/')
def index():
    return render_template('chat.html')

@app.route('/api/start', methods=['POST'])
def start_conversation():
    session_id = str(uuid.uuid4())
    sujet = request.json.get('sujet', '')
    
    if not sujet:
        return jsonify({'error': 'Sujet requis'}), 400
    
    conversations[session_id] = {
        'messages': [],
        'sujet': sujet,
        'current_round': 0,
        'current_step': 0,
        'status': 'active'
    }
    
    return jsonify({'session_id': session_id, 'sujet': sujet})

@app.route('/api/next', methods=['POST'])
def next_message():
    session_id = request.json.get('session_id')
    
    if session_id not in conversations:
        return jsonify({'error': 'Session invalide'}), 404
    
    conv = conversations[session_id]
    current_round = conv['current_round']
    current_step = conv['current_step']
    
    if current_round >= 3:
        return jsonify({'finished': True})
    
    agent_key = AGENT_ORDER[current_step]
    agent = AGENTS[agent_key]
    
    message = f"Analyse du sujet: {conv['sujet']} - Étape {current_step + 1}"
    
    reponse = generer_reponse(agent_key, conv['sujet'], message, conv['messages'], current_round + 1, current_step + 1)
    
    message_data = {
        'agent_key': agent_key,
        'agent_name': agent['name'],
        'message': reponse,
        'timestamp': datetime.now().isoformat(),
        'color': agent['color'],
        'icon': agent['icon'],
        'round': current_round + 1,
        'step': current_step + 1
    }
    
    conv['messages'].append(message_data)
    
    next_step = current_step + 1
    if next_step >= len(AGENT_ORDER):
        conv['current_round'] = current_round + 1
        conv['current_step'] = 0
    else:
        conv['current_step'] = next_step
    
    total_steps = 3 * len(AGENT_ORDER)
    progress = len(conv['messages']) / total_steps
    
    return jsonify({
        'message': message_data,
        'finished': conv['current_round'] >= 3,
        'progress': progress,
        'round': conv['current_round'],
        'step': conv['current_step']
    })

if __name__ == '__main__':
    print("="*70)
    print("🔍 ELISA CORE - Analyse Objective de Prospects")
    print("="*70)
    print("📊 Agents: Central, Data, Prospect, Scoring, Product, Marketing, Optimization")
    print("🎯 Objectif: Identifier les VRAIS prospects dans la base")
    print("🚀 Serveur: http://localhost:5000")
    app.run(debug=True, port=5000)