import json

def load_state():
    try:
        with open(r"C:\RenodeProjects\RpiLike\state.json", 'r') as f:
            return json.load(f)
    except Exception:
        return None