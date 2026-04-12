import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        database=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD")
    )

def get_inactive_clients(days=90):
    """Récupère les clients inactifs depuis X jours"""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, nom, prenom, email, derniere_activite
        FROM users
        WHERE derniere_activite < NOW() - INTERVAL '%s days'
    """, (days,))
    results = cur.fetchall()
    cur.close()
    conn.close()
    return results