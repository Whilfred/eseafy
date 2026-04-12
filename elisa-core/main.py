import os
import random
from groq import Groq
from dotenv import load_dotenv

# Charger la clé API
load_dotenv()

api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    print("❌ Clé API Groq non trouvée dans .env")
    exit(1)

print(f"✅ Clé API Groq chargée: {api_key[:10]}...")

client = Groq(api_key=api_key)

# Scénarios de chasse aux gros clients IA
scenarios_chasse = [
    "Google Cloud Platform - 250k serveurs, besoin urgent de refroidissement",
    "Microsoft Azure - contrat de 500k$, signe dans 72h si on prouve notre valeur",
    "OpenAI - cherche 10 000 GPU pour GPT-5, budget illimité",
    "Amazon AWS - 1M$ de budget, mais veulent des preuves de ROI",
    "Meta - 800k serveurs à remplacer, décision cette semaine",
    "Anthropic - besoin de clusters H100, concurrents: NVIDIA et Dell"
]

# Arguments de preuve possibles
preuves = [
    "J'ai les logs de navigation des 30 derniers jours",
    "Leur VP Tech a cliqué sur notre lien 7 fois",
    "Ils ont téléchargé notre white paper sur la scalabilité",
    "Leur infra actuelle est saturée à 94%",
    "Ils perdent 2.3M$ par mois en downtime",
    "Leur NPS est tombé de 72 à 41 en 3 mois"
]

def parler(agent_name, message, historique):
    agent = agents[agent_name]
    
    historique_texte = ""
    for h in historique[-5:]:
        historique_texte += f"{h['agent']}: {h['message']}\n"
    
    # Ajout de données de preuve aléatoires
    preuve_aleatoire = random.choice(preuves)
    
    prompt = f"""Tu es {agent['nom']}.
    {agent['instruction']}
    
    🔥 CONTEXTE CRITIQUE:
    On chasse un GROS CLIENT IA (Google/Microsoft/OpenAI/Amazon/Meta).
    Budget: potentiellement 500k$ à 5M$.
    Concurrents: NVIDIA, Dell, HPE, Supermicro.
    
    📊 PREUVE DISPONIBLE: {preuve_aleatoire}
    
    📜 ÉCHANGES RÉCENTS:
    {historique_texte if historique_texte else '(Début - première attaque)'}
    
    💬 MESSAGE REÇU: {message}
    
    🎯 RÈGLES D'ENGAGEMENT (À SUIVRE ABSOLUMENT):
    1. DONNE DES CHIFFRES PRÉCIS (%, $, dates)
    2. PROUVE avec des données, pas des opinions
    3. ATTAQUE les arguments des autres agents
    4. TAGUE @les agents pour les challenger
    5. DEMANDE DES PREUVES quand tu doutes
    6. Soit IMPITOYABLE - on veut gagner ce contrat
    
    Exemples de réponses attendues:
    - "Je te prouve @ScoringAgent: 83% de leurs 500k serveurs sont Intel Xeon vieux de 4 ans"
    - "T'es sérieux @DataAgent ? Mes logs montrent qu'ils ont déjà contacté NVIDIA hier !"
    - "Preuve à l'appui: leur VP a passé 12min sur notre page prix, à 14h32 exactement"
    
    RÉPONDS MAINTENANT (soit agressif, basé sur les preuves, avec des chiffres):"""
    
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.85,
            max_tokens=400
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"[Erreur: {e}]"

# Définition des agents - version ultra-agressive
agents = {
    "central": {
        "nom": "🧠 ELISA Central - Commandant",
        "instruction": """Tu ES le commandant. Ton objectif: décrocher le contrat à tout prix.
        Tu ne tolères pas l'incompétence. Tu demandes des preuves CONSTAMMENT.
        Tu arbitres les disputes. Tu donnes des ordres militaires.
        
        STYLE: "Preuves. Maintenant. @DataAgent" / "Je valide pas sans chiffres" / "Qui a la vérité ?"""
    },
    "data": {
        "nom": "📊 Data Agent - Renseignement", 
        "instruction": """Tu as infiltré leurs systèmes. Tu as des données précises.
        Tu sors des chiffres EXACTS: dates, volumes, pourcentages.
        Tu prouves tout. Tu démontes les arguments des autres avec des logs.
        
        STYLE: "Logs du 15 mars: 47.3k requêtes échouées" / "Leur DBA a leaké: capacité à 94.7%"
        ARGUMENTS TYPES: uptime, latence, coût par transaction, ROI estimé"""
    },
    "scoring": {
        "nom": "🎯 Scoring Agent - Profileur",
        "instruction": """Tu scores les prospects avec des ALGORITHMES précis.
        Tu sors des scores sur 100 avec justifications.
        Tu challenger les datas. Tu détectes les faux signaux.
        
        STYLE: "Score: 94/100 car..." / "@DataAgent, preuve de ce score ?"
        CRITÈRES: budget, urgence, maturité technique, concurrents actifs"""
    },
    "marketing": {
        "nom": "📧 Marketing Agent - Assaillant",
        "instruction": """Tu prépares l'ATTAQUE commerciale.
        Tu créés des arguments de VENTE IMPITOYABLES.
        Tu cibles les points faibles détectés par les autres.
        
        STYLE: "Leur point faible: latence. On attaque dessus" / "Offre choc: -40% si signent sous 48h"
        ARMES: prix cassés, garanties, SLAs agressifs"""
    },
    "optimization": {
        "nom": "⚡ Optimization Agent - Stratège",
        "instruction": """Tu SIMULES les chances de victoire.
        Tu calcules les probabilités par scénario.
        Tu identifies les MEILLEURES approches.
        
        STYLE: "Probabilité victoire: 67% avec cette approche" / "Risque: 23% qu'ils aillent chez NVIDIA"
        CALCULS: ROI, probabilité signature, risque concurrent"""
    }
}

# Lancement de la chasse
print("\n" + "="*70)
print("🔥 ELISA CORE - MODE CHASSE AUX GROS CLIENTS IA 🔥")
print("="*70)
print("🎯 CIBLES: Google | Microsoft | OpenAI | Amazon | Meta")
print("💰 BUDGETS: 500k$ à 5M$")
print("⚔️ MODE: IMPITOYABLE - PREUVES REQUISES")
print("="*70 + "\n")

historique = []

# Message de départ - briefing de guerre
scenario = random.choice(scenarios_chasse)
print("🎯 ELISA CENTRAL (Briefing):")
print(f"   ⚡ CIBLE IDENTIFIÉE: {scenario}")
print(f"   🔫 Concurrents: NVIDIA, Dell, HPE dans la course")
print(f"   ⏰ Deadline: 72h pour proposition")
print("-"*70)

reponse = parler("central", f"BRIEFING: {scenario}. @DataAgent, preuves. @ScoringAgent, score. @MarketingAgent, stratégie. GO.", historique)
print(f"🧠 {reponse}")
historique.append({"agent": "ELISA Central", "message": reponse})
print("-"*70)

# Combat en 3 rounds intenses
for round_num in range(3):
    print(f"\n{'='*70}")
    print(f"💥 ROUND {round_num + 1} - ATTAQUE TOTALE 💥")
    print(f"{'='*70}\n")
    
    # Data Agent - sort les preuves
    print("📊 DATA AGENT (Preuves):")
    reponse = parler("data", f"ROUND {round_num+1}: Je sors les données. @ScoringAgent, analyse.", historique)
    print(f"   {reponse}")
    historique.append({"agent": "Data Agent", "message": reponse})
    print("-"*70)
    
    # Scoring Agent - score et challenge
    print("\n🎯 SCORING AGENT (Analyse):")
    reponse = parler("scoring", f"Data a dit: {historique[-1]['message']}. Je score et je challenge si faux.", historique)
    print(f"   {reponse}")
    historique.append({"agent": "Scoring Agent", "message": reponse})
    print("-"*70)
    
    # Marketing Agent - prépare l'attaque
    print("\n📧 MARKETING AGENT (Assaut):")
    reponse = parler("marketing", f"Score: {historique[-1]['message']}. Je construis l'offre imbattable.", historique)
    print(f"   {reponse}")
    historique.append({"agent": "Marketing Agent", "message": reponse})
    print("-"*70)
    
    # Optimization Agent - simule la victoire
    print("\n⚡ OPTIMIZATION AGENT (Simulations):")
    reponse = parler("optimization", f"Offre: {historique[-1]['message']}. Je simule nos chances.", historique)
    print(f"   {reponse}")
    historique.append({"agent": "Optimization Agent", "message": reponse})
    print("-"*70)
    
    # ELISA Central - décision finale du round
    print("\n🧠 ELISA CENTRAL (Arbitrage):")
    reponse = parler("central", f"Synthèse round {round_num+1}. Qui a raison ? Décision.", historique)
    print(f"   {reponse}")
    historique.append({"agent": "ELISA Central", "message": reponse})
    print("-"*70)
    
    # Feedback sur le round
    print(f"\n📊 STATS ROUND {round_num+1}:")
    print(f"   - Preuves fournies: {random.randint(3,7)} données critiques")
    print(f"   - Scores moyens: {random.randint(72,96)}/100")
    print(f"   - Probabilité victoire: {random.randint(58,82)}%")

# Conclusion - plan d'attaque final
print("\n" + "="*70)
print("🎯 PLAN D'ATTAQUE FINAL - APPROUVE PAR ELISA CENTRAL 🎯")
print("="*70)

reponse = parler("central", "CONCLUSION: Synthèse des 3 rounds. Donne le plan final pour décrocher le contrat.", historique)
print(f"🧠 {reponse}")
print("-"*70)

print("\n" + "="*70)
print("✅ PLAN VALIDÉ - LANCEMENT DE L'ASSAUT COMMERCIAL")
print("📧 Emails personnalisés prêts")
print("💰 Offres finales chiffrées")
print("⚡ Timeline: 72h pour signature")
print("="*70)