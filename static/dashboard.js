document.addEventListener("DOMContentLoaded", () => {
  const socket = io({
    transports: ["websocket"], // Force WebSocket pour éviter erreurs polling
  });

  // Logger tous les événements reçus
  const onevent = socket.onevent;
  socket.onevent = function (packet) {
    const args = packet.data || [];
    console.log("📡 Événement reçu:", args[0], "→", args.slice(1));
    onevent.call(this, packet); // Appel normal
  };

  // Éléments DOM
  const tempValue = document.getElementById("temp-value");
  const mercury = document.getElementById("mercury");
  const humValue = document.getElementById("hum-value");
  const humNeedle = document.getElementById("humidity-needle");
  const presValue = document.getElementById("pres-value");
  const presNeedle = document.getElementById("pressure-needle");
  const fanValue = document.getElementById("fan-value");
  const fanStatus = document.getElementById("fan-status");
  const fanVisual = document.getElementById("fan-visual");
  const ledStatus = document.getElementById("led-status");
  const ledIndicator = document.getElementById("led-indicator");
  const statusText = document.getElementById("status-text");
  const connectionStatus = document.getElementById("connection-status");

  // Gestion des seuils
  document.getElementById("set-thresholds").addEventListener("click", () => {
    const ledThreshold = parseFloat(document.getElementById("led-threshold").value);
    const fanThreshold = parseFloat(document.getElementById("fan-threshold").value);

    if (isNaN(ledThreshold) || isNaN(fanThreshold)) {
      console.error("Seuils invalides");
      return;
    }

    fetch("/api/set_threshold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature_led: ledThreshold,
        temperature_fan: fanThreshold
      })
    }).then(res => res.json())
      .then(data => console.log("Seuils mis à jour:", data))
      .catch(err => console.error("Erreur lors de la mise à jour des seuils:", err));
  });

  // État connexion
  socket.on("connect", () => {
    statusText.textContent = "Connecté";
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    console.log("SocketIO connected");
    socket.emit("get_state");
  });

  socket.on("connect_error", (error) => {
    console.error("SocketIO connection error:", error);
    statusText.textContent = "Déconnecté";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  socket.on("disconnect", () => {
    console.log("SocketIO disconnected");
    statusText.textContent = "Déconnecté";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  // Polling client : demande état toutes les secondes
  setInterval(() => {
    if (socket.connected) {
      console.log("📤 Demande get_state envoyée à", new Date().toISOString());
      socket.emit("get_state");
    } else {
      console.log("🚫 Socket déconnecté, pas de get_state envoyé");
    }
  }, 1000);

  // Mise à jour dynamique
  socket.on("state_update", (data) => {
    console.log("Update reçu:", data, "at", new Date().toISOString());

    // 🌡 Température
    if (data.temperature !== null && data.temperature !== undefined) {
      const temp = parseFloat(data.temperature);
      tempValue.textContent = temp.toFixed(1);
      let percent = Math.min(Math.max((temp / 100) * 100, 0), 100);
      mercury.style.height = percent + "%";
    }

    // 💧 Humidité
    if (data.humidity !== null && data.humidity !== undefined) {
      const hum = parseFloat(data.humidity);
      humValue.textContent = hum.toFixed(1);
      let angle = -90 + (hum / 100) * 180;
      humNeedle.style.transform = `rotate(${angle}deg)`;
    }

    // 🌪️ Pression (normalisée 900–1100 hPa → 0–100%)
    if (data.pressure !== null && data.pressure !== undefined) {
      const pres = parseFloat(data.pressure);
      presValue.textContent = pres.toFixed(1);
      let normalized = Math.max(Math.min((pres - 900) / 200, 1), 0);
      let angle = -90 + normalized * 180;
      presNeedle.style.transform = `rotate(${angle}deg)`;
    }

    // 🌪️ Ventilateur
    if (data.fan) {
      const speed = parseInt(data.fan.speed);
      fanValue.textContent = speed;
      fanStatus.textContent = data.fan_status || (speed > 0 ? "En marche" : "Arrêté");
      if (speed > 0) {
        fanVisual.classList.add("spinning");
        fanVisual.style.animationDuration = (1 / (speed / 100)) + "s";
      } else {
        fanVisual.classList.remove("spinning");
      }
    }

    // 💡 LED
    if (data.led) {
      const ledOn = data.led.value === "True" || data.led.value === true || data.led.value === "true";
      ledStatus.textContent = ledOn ? "ON" : "OFF";
      if (ledOn) {
        ledIndicator.classList.add("on");
      } else {
        ledIndicator.classList.remove("on");
      }
    }
  });
});