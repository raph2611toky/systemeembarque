from flask import Flask, request, jsonify, render_template
from flask_socketio import SocketIO, emit
from threading import Lock
import telnetlib
from utils.pont import load_state

app = Flask(__name__, template_folder="templates")
app.config['SECRET_KEY'] = 'change_this_secret'
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True,
                    ping_timeout=60, ping_interval=30)  # Stabilité SocketIO
thread_lock = Lock()

# État central
state = {
    "temperature": None,
    "humidity": None,
    "pressure": None,
    "led": {"id": "extraLed", "value": False},
    "fan": {"id": "fan0", "speed": 0}
}

# Seuils pour actions automatiques
thresholds = {
    "temperature_led": 30.0,   # °C au-dessus duquel la LED s'allume
    "temperature_fan": 28.0    # °C au-dessus duquel le ventilateur démarre
}

def renode_command(command):
    try:
        with telnetlib.Telnet("localhost", 4321, timeout=5) as tn:
            tn.read_until(b"(raspberrypi3) ", timeout=5)  # Ajusté pour votre machine
            tn.write((command + "\n").encode('ascii'))
            output = tn.read_until(b"(raspberrypi3) ", timeout=5).decode('ascii')
            return output
    except Exception as e:
        print(f"Telnet error: {e}")
        return None

@app.route('/')
def index():
    with thread_lock:
        new_state = load_state()
        if new_state:
            for k, v in new_state.items():
                if k in state and isinstance(state[k], dict) and isinstance(v, dict):
                    state[k].update(v)
                else:
                    state[k] = v
            # Pré-calculer l'état du ventilateur
            state["fan_status"] = "En marche" if int(float(state["fan"]["speed"])) > 0 else "Arrêté"
    print(f"Rendering index with state: {state}")
    return render_template('index.html', state=state)

@app.route('/api/set_threshold', methods=['POST'])
def set_threshold():
    data = request.json
    for key in thresholds:
        if key in data:
            thresholds[key] = float(data[key])
    print(f"Seuils mis à jour: {thresholds}")
    return jsonify({"ok": True, "thresholds": thresholds}), 200

@socketio.on('get_state')
def handle_get_state():
    with thread_lock:
        new_state = load_state()
        if new_state:
            for k, v in new_state.items():
                if k in state and isinstance(state[k], dict) and isinstance(v, dict):
                    state[k].update(v)
                else:
                    state[k] = v

            # ⚡ Logique automatique LED/Fan
            temp = state.get("temperature")
            if temp is not None:
                temp = float(temp)  # Convertir en float pour comparaison
                # LED
                led_on = temp >= thresholds["temperature_led"]
                state["led"]["value"] = led_on
                renode_command(f'sysbus.gpioA.extraLed {"Set" if led_on else "Reset"}')

                # Ventilateur
                fan_speed = 100 if temp >= thresholds["temperature_fan"] else 0
                state["fan"]["speed"] = fan_speed
                renode_command(f'sysbus.gpioA.fan0 {"Set" if fan_speed > 0 else "Reset"}')

            # Pré-calculer l'état du ventilateur
            state["fan_status"] = "En marche" if int(float(state["fan"]["speed"])) > 0 else "Arrêté"

        print(f"Received get_state, emitting: {state}")
        emit('state_update', state)

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=False)