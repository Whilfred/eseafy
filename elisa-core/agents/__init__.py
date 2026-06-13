from .central          import CentralAgent
from .data_agent       import DataAgent
from .prospect_agent   import ProspectAgent
from .scoring_agent    import ScoringAgent
from .specialists      import ProductAgent, MarketingAgent, OptimizationAgent

AGENTS = {
    "central":      {"name": "Central",        "icon": "🧠", "color": "#1a1a1a", "role": "Orchestrateur",    "class": CentralAgent},
    "data":         {"name": "Data Agent",      "icon": "📊", "color": "#10b981", "role": "Analyste données", "class": DataAgent},
    "prospect":     {"name": "Prospect Agent",  "icon": "🔎", "color": "#06b6d4", "role": "Qualification",    "class": ProspectAgent},
    "scoring":      {"name": "Scoring Agent",   "icon": "🎯", "color": "#f59e0b", "role": "Propension achat", "class": ScoringAgent},
    "product":      {"name": "Product Agent",   "icon": "🛒", "color": "#ec4899", "role": "Offres",           "class": ProductAgent},
    "marketing":    {"name": "Marketing Agent", "icon": "📧", "color": "#ef4444", "role": "Campagnes",        "class": MarketingAgent},
    "optimization": {"name": "Optim Agent",     "icon": "⚡", "color": "#8b5cf6", "role": "ROI & Verdict",    "class": OptimizationAgent},
}
