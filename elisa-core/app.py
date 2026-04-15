from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import uuid
from datetime import datetime
from dotenv import load_dotenv

from agents import AGENTS
from database.db import fetch_simulation_data

load_dotenv()

app = Flask(__name__)
CORS(app)

conversations = {}

# Pipeline
PIPELINE = [
    ('init',                    'central',      'init'),
    ('central_asked_data',      'data',         None),
    ('data_done',               'central',      'after_data'),
    ('central_asked_prospect',  'prospect',     None),
    ('prospect_done',           'central',      'after_prospect'),
    ('central_asked_scoring',   'scoring',      None),
    ('scoring_done',            'central',      'after_scoring'),
    ('central_asked_product',   'product',      None),
    ('product_done',            'central',      'after_product'),
    ('central_asked_marketing', 'marketing',    None),
    ('marketing_done',          'central',      'after_marketing'),
    ('central_asked_optim',     'optimization', None),
    ('optimization_done',       'central',      'conclusion'),
]

TRANSITIONS = {p[0]: p for p in PIPELINE}
NEXT_STATE = {PIPELINE[i][0]: (PIPELINE[i+1][0] if i+1 < len(PIPELINE) else 'done') for i in range(len(PIPELINE))}
TOTAL_STEPS = len(PIPELINE)

def last_from(messages, key):
    for m in reversed(messages):
        if m['agent_key'] == key:
            return m['message']
    return ""

@app.route('/')
def index():
    return render_template('chat.html')

@app.route('/api/start', methods=['POST'])
def start_conversation():
    sid = str(uuid.uuid4())
    body = request.json or {}
    sujet = body.get('sujet', '').strip()
    boutique = body.get('boutique_id')

    if not sujet:
        return jsonify({'error': 'Sujet requis'}), 400

    try:
        sim_data = fetch_simulation_data(boutique_id=boutique)
    except Exception as e:
        print(f"DB error: {e}")
        return jsonify({'error': f'Erreur base de données: {str(e)}'}), 500

    conversations[sid] = {
        'messages':       [],
        'sujet':          sujet,
        'boutique_id':    boutique,
        'data':           sim_data,
        'state':          'init',
        'last_central_q': '',
        'step_count':     0
    }
    return jsonify({'session_id': sid})

@app.route('/api/next', methods=['POST'])
def next_message():
    sid = request.json.get('session_id')
    if sid not in conversations:
        return jsonify({'error': 'Session invalide'}), 404

    conv = conversations[sid]
    state = conv['state']

    if state == 'done' or state not in TRANSITIONS:
        return jsonify({'finished': True})

    _, agent_key, phase = TRANSITIONS[state]
    agent_cfg = AGENTS.get(agent_key, {})
    
    sujet = conv['sujet']
    messages = conv['messages']
    data = conv['data']

    # Instancier l'agent et l'exécuter
    agent_class = agent_cfg.get('class')
    if not agent_class:
        text = f"[{agent_cfg.get('name','Agent')}] Agent non disponible"
    else:
        agent = agent_class()
        
        if agent_key == 'central':
            extra = ''
            if phase == 'after_data':       extra = last_from(messages, 'data')
            elif phase == 'after_prospect': extra = last_from(messages, 'prospect')
            elif phase == 'after_scoring':  extra = last_from(messages, 'scoring')
            elif phase == 'after_product':  extra = last_from(messages, 'product')
            elif phase == 'after_marketing':extra = last_from(messages, 'marketing')
            elif phase == 'conclusion':     
                extra = ''.join(f"[{m['agent_name']}]: {m['message'][:300]}\n" for m in messages[-12:])
            
            text = agent.run(sujet, phase, messages, data, extra)
            conv['last_central_q'] = text or ""
        else:
            text = agent.run(sujet, conv['last_central_q'], messages, data)

    text = text or f"[{agent_cfg.get('name','Agent')}] En traitement..."

    msg = {
        'agent_key':  agent_key,
        'agent_name': agent_cfg.get('name', agent_key),
        'icon':       agent_cfg.get('icon', '●'),
        'color':      agent_cfg.get('color', '#888'),
        'role':       agent_cfg.get('role', ''),
        'message':    text,
        'timestamp':  datetime.now().isoformat(),
        'is_central': agent_key == 'central',
        'phase':      phase
    }

    conv['messages'].append(msg)
    conv['step_count'] += 1
    conv['state'] = NEXT_STATE.get(state, 'done')
    finished = conv['state'] == 'done'

    return jsonify({
        'message':  msg,
        'finished': finished,
        'progress': min(conv['step_count'] / TOTAL_STEPS, 1.0),
        'state':    conv['state']
    })

if __name__ == '__main__':
    print("🧠 ELISA CORE — Multi-Agent System (PostgreSQL live)")
    print("🚀 http://localhost:5000")
    app.run(debug=True, port=5000)