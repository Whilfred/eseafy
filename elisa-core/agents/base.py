from abc import ABC, abstractmethod
from groq import Groq
import os
import json
from pathlib import Path

PARAMS_FILE = Path(__file__).parent / "params.json"

DEFAULT_PARAMS = {
    "central":      {"temperature": 0.8, "min_score_go": 60, "max_retries_data": 2},
    "data":         {"temperature": 0.6, "categorie_fallback": True},
    "prospect":     {"temperature": 0.7, "min_prospects": 5},
    "scoring":      {"temperature": 0.5, "seuil_chaud": 65, "seuil_churn_ok": 70},
    "product":      {"temperature": 0.7},
    "marketing":    {"temperature": 0.8},
    "optimization": {"temperature": 0.6, "roi_min_go": 2000, "roi_min_test": 500},
}

def load_params():
    if PARAMS_FILE.exists():
        with open(PARAMS_FILE, "r") as f:
            data = json.load(f)
        # Merge with defaults pour les clés manquantes
        for agent, defaults in DEFAULT_PARAMS.items():
            if agent not in data:
                data[agent] = defaults
            else:
                for k, v in defaults.items():
                    data[agent].setdefault(k, v)
        return data
    return {k: dict(v) for k, v in DEFAULT_PARAMS.items()}

def save_params(params):
    with open(PARAMS_FILE, "w") as f:
        json.dump(params, f, indent=2)

def adapt_params(verdict: str):
    """
    Self-learning : ajuste les seuils selon le verdict final.
    GO répété → on peut être plus exigeant.
    STOP répété → on assouplit pour ne pas rater des opportunités.
    """
    params = load_params()
    history_file = Path(__file__).parent / "verdict_history.json"
    
    history = []
    if history_file.exists():
        with open(history_file) as f:
            history = json.load(f)
    
    history.append(verdict)
    history = history[-20:]  # garder les 20 derniers
    
    with open(history_file, "w") as f:
        json.dump(history, f)
    
    recent = history[-5:]
    go_count   = recent.count("GO")
    stop_count = recent.count("STOP")
    
    # Trop de STOP → on abaisse les seuils pour être moins strict
    if stop_count >= 4:
        params["scoring"]["seuil_chaud"]        = max(50, params["scoring"]["seuil_chaud"] - 5)
        params["prospect"]["min_prospects"]      = max(3,  params["prospect"]["min_prospects"] - 2)
        params["optimization"]["roi_min_go"]     = max(1000, params["optimization"]["roi_min_go"] - 200)
        print(f"[ELISA LEARN] Trop de STOP — seuils abaissés: scoring={params['scoring']['seuil_chaud']}")
    
    # Trop de GO → on monte les exigences pour cibler plus précisément
    elif go_count >= 4:
        params["scoring"]["seuil_chaud"]        = min(80, params["scoring"]["seuil_chaud"] + 5)
        params["prospect"]["min_prospects"]      = min(20, params["prospect"]["min_prospects"] + 2)
        params["optimization"]["roi_min_go"]     = min(5000, params["optimization"]["roi_min_go"] + 300)
        print(f"[ELISA LEARN] Beaucoup de GO — seuils montés: scoring={params['scoring']['seuil_chaud']}")
    
    save_params(params)


class BaseAgent(ABC):
    def __init__(self, agent_key: str):
        self.agent_key = agent_key
        self.client    = Groq(api_key=os.getenv("GROQ_API_KEY"))
        self._params   = load_params().get(agent_key, {})
    
    @property
    def params(self):
        # Recharge les params à chaque accès (les autres agents peuvent les avoir mis à jour)
        return load_params().get(self.agent_key, self._params)
    
    @abstractmethod
    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        """
        Retourne un dict:
        {
          "message": str,           # ce que l'agent dit en langage naturel
          "data": dict,             # données structurées extraites (optionnel)
          "question": str | None,   # question que l'agent pose en retour (optionnel)
        }
        """
        pass
    
    def _call_llm(self, prompt: str, max_tokens: int = 400) -> str:
        try:
            r = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=self.params.get("temperature", 0.7),
                max_tokens=max_tokens
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            print(f"[{self.agent_key}] LLM error: {e}")
            return None
    
    def _ctx(self, messages: list, n: int = 5) -> str:
        """Extrait les N derniers messages comme contexte conversationnel."""
        recent = messages[-n:] if len(messages) > n else messages
        lines  = []
        for m in recent:
            name = m.get("agent_name", m.get("agent_key", "?"))
            msg  = m.get("message", "")[:400]
            lines.append(f"{name}: {msg}")
        return "\n".join(lines)
    
    def _format_data_summary(self, data: dict) -> str:
        """Résumé compact des données pour les prompts."""
        from utils.helpers import decimal_to_float
        c   = data.get("commandes", {})
        seg = data.get("segments", {})
        
        seg_lines = []
        for s in ["A", "B", "C", "D"]:
            d = seg.get(s, {})
            if d.get("nb_clients", 0) > 0:
                seg_lines.append(
                    f"Segment {s}: {d['nb_clients']} clients, "
                    f"panier {decimal_to_float(d.get('panier_moyen',0))} FCFA"
                )
        
        return (
            f"Commandes: {c.get('total_commandes',0)} total, "
            f"{c.get('commandes_payees',0)} payées, "
            f"CA={decimal_to_float(c.get('revenu_total',0))} FCFA, "
            f"panier moyen={decimal_to_float(c.get('panier_moyen',0))} FCFA\n"
            + "\n".join(seg_lines)
        )