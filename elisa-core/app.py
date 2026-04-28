from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

from agents import AGENTS
from database.db import fetch_simulation_data

load_dotenv()

app   = Flask(__name__)
CORS(app)

conversations = {}

# Ordre logique par défaut que Central suit sauf s'il dévie
DEFAULT_FLOW = ["data", "prospect", "scoring", "product", "marketing", "optimization"]

# ===========================================================================
# ROUTES
# ===========================================================================

@app.route("/")
def index():
    return render_template("chat.html")

@app.route("/api/start", methods=["POST"])
def start_conversation():
    body    = request.json or {}
    sujet   = body.get("sujet", "").strip()
    boutique = body.get("boutique_id")

    if not sujet:
        return jsonify({"error": "Sujet requis"}), 400

    try:
        sim_data = fetch_simulation_data(boutique_id=boutique)
    except Exception as e:
        return jsonify({"error": f"Erreur base de données: {e}"}), 500

    sid = str(uuid.uuid4())
    conversations[sid] = {
        "messages":       [],
        "sujet":          sujet,
        "boutique_id":    boutique,
        "data":           sim_data,
        "next_agent":     "central",         # Central parle toujours en premier
        "central_phase":  "START",           # Signal de démarrage
        "step_count":     0,
        "finished":       False,
        "data_retries":   0,                 # Nombre de fois qu'on a retappé Data
    }
    return jsonify({"session_id": sid})


@app.route("/api/next", methods=["POST"])
def next_message():
    sid = (request.json or {}).get("session_id")
    if sid not in conversations:
        return jsonify({"error": "Session invalide"}), 404

    conv = conversations[sid]

    if conv["finished"]:
        return jsonify({"finished": True})

    # ---------- Quel agent parle maintenant ? ----------
    agent_key = conv["next_agent"]

    if agent_key not in AGENTS:
        conv["finished"] = True
        return jsonify({"finished": True})

    agent_cfg   = AGENTS[agent_key]
    agent_class = agent_cfg["class"]
    agent       = agent_class()

    sujet    = conv["sujet"]
    messages = conv["messages"]
    data     = conv["data"]

    # ---------- Construire la "question" passée à l'agent ----------
    if agent_key == "central":
        # Central reçoit le dernier message d'un agent spécialiste
        last_specialist_msg = _last_from(messages, exclude_key="central")
        question = conv.get("central_phase", last_specialist_msg)
    else:
        # Spécialiste reçoit le dernier message de Central
        question = _last_from(messages, only_key="central")

    # ---------- Appel agent ----------
    result = agent.run(sujet, question, messages, data)

    message_text = result.get("message", "...")
    next_agent   = result.get("next_agent") if agent_key == "central" else None

    # ---------- Construire le message ----------
    msg = {
        "agent_key":  agent_key,
        "agent_name": agent_cfg["name"],
        "icon":       agent_cfg["icon"],
        "color":      agent_cfg["color"],
        "role":       agent_cfg["role"],
        "message":    message_text,
        "timestamp":  datetime.now().isoformat(),
        "is_central": agent_key == "central",
    }

    conv["messages"].append(msg)
    conv["step_count"] += 1

    # ---------- Déterminer le prochain tour ----------
    if agent_key == "central":
        # Central a décidé explicitement
        _route_from_central(conv, next_agent)
    else:
        # Spécialiste vient de parler → retour à Central
        conv["next_agent"]    = "central"
        conv["central_phase"] = None   # Central lira le dernier message

    # ---------- Sécurité anti-boucle infinie ----------
    if conv["step_count"] >= 30:
        conv["finished"] = True

    finished = conv["finished"]
    total    = 14   # max théorique de tours

    return jsonify({
        "message":  msg,
        "finished": finished,
        "progress": min(conv["step_count"] / total, 1.0),
        "state":    conv["next_agent"],
    })


# ===========================================================================
# ROUTING LOGIC
# ===========================================================================

def _route_from_central(conv: dict, next_agent: str):
    """
    Interprète la décision de Central et configure le prochain tour.
    """
    if not next_agent:
        # Central n'a pas indiqué de prochain agent → on devine
        conv["next_agent"] = _guess_next(conv)
        return

    na = next_agent.upper()

    if na in ("STOP", "FIN"):
        conv["finished"]   = True
        conv["next_agent"] = "central"
        return

    if next_agent == "data":
        conv["data_retries"] += 1
        if conv["data_retries"] > 3:
            # Trop de retries Data → on arrête
            conv["finished"] = True
            return

    if next_agent in AGENTS:
        conv["next_agent"]    = next_agent
        conv["central_phase"] = None
    else:
        # Nom d'agent non reconnu → essayer de matcher
        matched = _fuzzy_match_agent(next_agent)
        if matched:
            conv["next_agent"] = matched
        else:
            conv["finished"] = True


def _guess_next(conv: dict) -> str:
    """
    Si Central n'a pas indiqué d'agent, devine le prochain selon le flow par défaut.
    """
    agents_used = {m["agent_key"] for m in conv["messages"] if m["agent_key"] != "central"}
    for agent in DEFAULT_FLOW:
        if agent not in agents_used:
            return agent
    return "central"  # tous faits → Central fait la conclusion


def _fuzzy_match_agent(name: str) -> str | None:
    name = name.lower()
    for key in AGENTS:
        if key in name or name in key:
            return key
    aliases = {
        "données": "data", "donnees": "data", "analys": "data",
        "prosp":   "prospect", "lead": "prospect",
        "scor":    "scoring", "score": "scoring",
        "produit": "product", "offre": "product",
        "market":  "marketing", "email": "marketing",
        "optim":   "optimization", "roi": "optimization", "verdict": "optimization",
    }
    for kw, agent in aliases.items():
        if kw in name:
            return agent
    return None


def _last_from(messages: list, exclude_key: str = None, only_key: str = None) -> str:
    for m in reversed(messages):
        key = m.get("agent_key", "")
        if exclude_key and key == exclude_key:
            continue
        if only_key and key != only_key:
            continue
        return m.get("message", "")
    return ""


# ===========================================================================
# MAIN
# ===========================================================================
if __name__ == "__main__":
    print("🧠 ELISA — Multi-Agent Intelligence (Pipeline Dynamique)")
    print("🚀 http://localhost:5000")
    app.run(debug=True, port=5000)