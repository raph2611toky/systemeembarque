document.addEventListener("DOMContentLoaded", () => {

  const socket = io({
    transports: ["websocket"],
    reconnection: true,  // Nouveau : auto-reconnexion
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  // Logger événements
  const onevent = socket.onevent;
  socket.onevent = function (packet) {
    const args = packet.data || [];
    console.log("📡 Événement reçu:", args[0], "→", args.slice(1));
    onevent.call(this, packet);
  };

  // Éléments DOM (inchangé)
  const tempValue = document.getElementById("temp-value");
  const statusText = document.getElementById("status-text");
  const connectionStatus = document.getElementById("connection-status");
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

  // Connexion
  socket.on("connect", () => {
    console.log("✅ SocketIO connected! ID:", socket.id);
    statusText.textContent = "Connecté";
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    socket.emit("get_state");
  });

  socket.on("connect_error", (error) => {
    console.error("❌ SocketIO connect_error:", error);  // Log détaillé
    statusText.textContent = "Erreur connexion";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  socket.on("disconnect", (reason) => {
    console.error("🔌 SocketIO disconnected. Reason:", reason);  // Log raison (ex: 'ping timeout')
    statusText.textContent = "Déconnecté";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  // Polling : log TOUJOURS, même si !connected
  const intervalId = setInterval(() => {
    console.log("⏰ Polling tick at", new Date().toISOString(), "| Connected:", socket.connected);  // Log systématique
    if (socket.connected) {
      console.log("📤 Sending get_state...");
      socket.emit("get_state");
    } else {
      console.log("🚫 Socket déconnecté, skip get_state. Reason from last disconnect?", socket.io.engine.closeReason || 'unknown');
    }
  }, 1000);

  // state_update : logs détaillés + try/catch pour éviter crash
  socket.on("state_update", (data) => {
    try {
      console.log("🔄 state_update reçu:", data, "at", new Date().toISOString());
      console.log("🔍 Capteurs:", { temp: data.temperature, hum: data.humidity, pres: data.pressure });

      // Température
      if (data.temperature !== null && data.temperature !== undefined) {
        const temp = parseFloat(data.temperature);
        if (isNaN(temp)) console.warn("⚠️ Temp non-numérique:", data.temperature);
        else {
          tempValue.textContent = temp.toFixed(1);
          let percent = Math.min(Math.max((temp / 100) * 100, 0), 100);
          mercury.style.height = percent + "%";
        }
      }

      // Humidité (similaire, avec check NaN)
      if (data.humidity !== null && data.humidity !== undefined) {
        const hum = parseFloat(data.humidity);
        if (isNaN(hum)) console.warn("⚠️ Hum non-numérique:", data.humidity);
        else {
          humValue.textContent = hum.toFixed(1);
          let angle = -90 + (hum / 100) * 180;
          humNeedle.style.transform = `rotate(${angle}deg)`;
        }
      }

      // Pression (similaire)
      if (data.pressure !== null && data.pressure !== undefined) {
        const pres = parseFloat(data.pressure);
        if (isNaN(pres)) console.warn("⚠️ Pres non-numérique:", data.pressure);
        else {
          presValue.textContent = pres.toFixed(1);
          let normalized = Math.max(Math.min((pres - 900) / 200, 1), 0);
          let angle = -90 + normalized * 180;
          presNeedle.style.transform = `rotate(${angle}deg)`;
        }
      }

      // Fan (similaire)
      if (data.fan) {
        const speed = parseInt(data.fan.speed);
        if (isNaN(speed)) console.warn("⚠️ Fan speed non-numérique:", data.fan.speed);
        else {
          fanValue.textContent = speed;
          fanStatus.textContent = data.fan_status || (speed > 0 ? "En marche" : "Arrêté");
          if (speed > 0) {
            fanVisual.classList.add("spinning");
            fanVisual.style.animationDuration = (1 / (speed / 100)) + "s";
          } else {
            fanVisual.classList.remove("spinning");
          }
        }
      }

      // LED
      if (data.led) {
        const ledOn = data.led.value === "True" || data.led.value === true || data.led.value === "true" || data.led.value === 1;
        ledStatus.textContent = ledOn ? "ON" : "OFF";
        if (ledOn) {
          ledIndicator.classList.add("on");
        } else {
          ledIndicator.classList.remove("on");
        }
      }

      console.log("✅ state_update appliqué sans erreur");
    } catch (err) {
      console.error("💥 Erreur dans state_update:", err, "Data:", data);
    }
  });

  // Cleanup interval sur unload (optionnel)
  window.addEventListener('beforeunload', () => clearInterval(intervalId));
});