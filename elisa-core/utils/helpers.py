import json
from datetime import datetime, date
from decimal import Decimal

class SafeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal): return float(o)
        if isinstance(o, (datetime, date)): return o.isoformat()
        return super().default(o)

def safe_dumps(obj):
    return json.dumps(obj, cls=SafeEncoder, ensure_ascii=False, indent=2)

def decimal_to_float(value):
    """Convertit un Decimal PostgreSQL en float, retourne 0 si None"""
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0