import json
import os

STATE_FILE = r"C:\RenodeProjects\RpiLike\state.json"

def load_state():
    if not os.path.exists(STATE_FILE):
        print("⚠️ state.json n'existe pas encore")
        return None
    try:
        with open(STATE_FILE, 'r') as f:
            data = json.load(f)
        print(f"📦 pont.load_state: Loaded {len(data)} keys from JSON")
        return data
    except json.JSONDecodeError as e:
        print(f"❌ JSON invalide: {e}")
        return None
    except Exception as e:
        print(f"❌ Erreur load_state: {e}")
        return None