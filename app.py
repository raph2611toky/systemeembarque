import eventlet
eventlet.monkey_patch()  # Make telnetlib non-blocking for eventlet

from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from threading import Lock
import telnetlib
import json
import os
from utils.pont import load_state  # Assumé : lit state.json

app = Flask(__name__, template_folder="templates")
app.config['SECRET_KEY'] = 'change_this_secret'
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True,
                    ping_timeout=20, ping_interval=10)  # Reduced for faster detection
# thread_lock = Lock()

STATE_FILE = r"C:\RenodeProjects\RpiLike\state.json"

# État central
state = {
    "temperature": None,
    "humidity": None,
    "pressure": None,
    "led": {"id": "extraLed", "value": False},
    "fan": {"id": "fan0", "speed": 0}
}

thresholds = {
    "temperature_led": 30.0,
    "temperature_fan": 28.0
}

def load_thresholds():
    global thresholds
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, 'r') as f:
                data = json.load(f)
                if 'thresholds' in data:
                    for k, v in data['thresholds'].items():
                        if k in thresholds:
                            thresholds[k] = float(v)
            # print(f"🔍 Thresholds loaded: {thresholds}")
        except Exception as e:
            print(f"❌ Error loading thresholds: {e}")

def save_state_with_thresholds():
    # with thread_lock:
    full_state = state.copy()
    full_state['thresholds'] = thresholds
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(full_state, f)
        # print(f"💾 State saved to JSON: {full_state}")  # Log nouveau
    except Exception as e:
        print(f"❌ Error saving state: {e}")

def renode_command(command):
    try:
        with telnetlib.Telnet("localhost", 1234, timeout=5) as tn:  # Default Renode port
            tn.read_until(b"(raspberrypi3) ", timeout=5)
            tn.write((command + "\n").encode('ascii'))
            output = tn.read_until(b"(raspberrypi3) ", timeout=5).decode('ascii')
            print(f"🔌 Renode '{command}' → {output.strip()}")
            return output
    except Exception as e:
        print(f"❌ Telnet error: {e}")
        return None

def debug_load_state():
    try:
        # print("🔍 Calling load_state()...")
        result = load_state()
        # print(f"📥 load_state() returned: {result}")
        return result
    except Exception as e:
        print(f"❌ load_state() failed: {e}")
        return None

@app.route('/')
def index():
    load_thresholds()
    # with thread_lock:
    new_state = debug_load_state()  # Log ici
    # print(new_state)
    if new_state:
        for k, v in new_state.items():
            if k in state and isinstance(state[k], dict) and isinstance(v, dict):
                state[k].update(v)
            elif k != 'thresholds':
                state[k] = v
        state["fan_status"] = "En marche" if int(float(state["fan"]["speed"])) > 0 else "Arrêté"
    save_state_with_thresholds()
    # print(f"🌐 Rendering index: state={state}, thresholds={thresholds}")
    return render_template('index.html', state=state, thresholds=thresholds)

@app.route('/api/set_threshold', methods=['POST'])
def set_threshold():
    data = request.json
    for key in thresholds:
        if key in data:
            thresholds[key] = float(data[key])
    # print(f"⚙️ Seuils updated: {thresholds}")
    save_state_with_thresholds()
    return jsonify({"ok": True, "thresholds": thresholds}), 200

@socketio.on('get_state')
def handle_get_state():
    new_state = debug_load_state()
    if new_state:
        for k, v in new_state.items():
            if k in state and isinstance(state[k], dict) and isinstance(v, dict):
                state[k].update(v)
            elif k != 'thresholds':
                state[k] = v

        temp = state.get("temperature")
        if temp is not None:
            temp = float(temp)
            led_on = temp >= thresholds["temperature_led"]
            state["led"]["value"] = led_on
            renode_command(f'sysbus.gpio0 Write 17 {"true" if led_on else "false"}')

            fan_speed = 100 if temp >= thresholds["temperature_fan"] else 0
            state["fan"]["speed"] = fan_speed
            renode_command(f'sysbus.gpio0 Write 11 {"true" if fan_speed > 0 else "false"}')

        state["fan_status"] = "En marche" if int(float(state["fan"]["speed"])) > 0 else "Arrêté"
        save_state_with_thresholds()

    print(f"📤 Emitting 'state_update': {state}")
    emit('state_update', state)
    print("✅ 'state_update' emitted!")

if __name__ == '__main__':
    load_thresholds()
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)  # Enable debug for more logs