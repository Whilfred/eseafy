from abc import ABC, abstractmethod
from groq import Groq
import os
from utils.helpers import decimal_to_float

STYLE = """RÈGLES ABSOLUES:
- Tu es un consultant e-commerce qui pose des questions et propose des actions.
- INTERDIT: noms clients, emails, adresses, téléphones.
- AUTORISÉ: chiffres (panier moyen, CA, taux conversion, scores, segments).
- Propose des actions concrètes: "on pourrait augmenter le prix de X à Y", "tester une remise de Z%".
- Pose des questions pour affiner: "faudrait-il cibler aussi le segment B ?"
- Pas de salutations, pas de blabla. Direct et actionnable.
- Phrases courtes. Maximum 100 mots.
"""

class BaseAgent(ABC):
    def __init__(self):
        self.client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    
    @abstractmethod
    def run(self, sujet, question, messages, data, extra=""):
        pass
    
    def _call_llm(self, prompt, max_tokens=400):
        try:
            r = self.client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=max_tokens
            )
            return r.choices[0].message.content.strip()
        except Exception as e:
            print(f"LLM error: {e}")
            return None
    
    def _ctx(self, messages, n=4):
        return ''.join(f"[{m['agent_name']}]: {m['message'][:300]}\n" for m in messages[-n:])