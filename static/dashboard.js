document.addEventListener("DOMContentLoaded", () => {
  const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  // Navigation
  const homeNav = document.getElementById("home-nav");
  const terminalNav = document.getElementById("terminal-nav");

  homeNav.addEventListener("click", () => {
    window.location.href = "/"; // Already on index.html
    homeNav.classList.add("active");
    terminalNav.classList.remove("active");
  });

  terminalNav.addEventListener("click", () => {
    window.location.href = "/terminal";
    homeNav.classList.remove("active");
    terminalNav.classList.add("active");
  });

  // Logger événements
  const onevent = socket.onevent;
  socket.onevent = function (packet) {
    const args = packet.data || [];
    console.log("📡 Événement reçu:", args[0], "→", args.slice(1));
    onevent.call(this, packet);
  };

  // Éléments DOM
  const tempValue = document.getElementById("temp-value");
  const statusText = document.getElementById("status-text");
  const connectionStatus = document.getElementById("connection-status");
  const mercury = document.getElementById("mercury");
  const fanValue = document.getElementById("fan-value");
  const fanStatus = document.getElementById("fan-status");
  const fanVisual = document.getElementById("fan-visual");
  const ledStatus = document.getElementById("led-status");
  const ledIndicator = document.getElementById("led-indicator");
  const ledThresholdInput = document.getElementById("led-threshold");
  const fanThresholdInput = document.getElementById("fan-threshold");
  const setThresholdsButton = document.getElementById("set-thresholds");

  // Connexion
  socket.on("connect", () => {
    console.log("✅ SocketIO connected! ID:", socket.id);
    statusText.textContent = "Connecté";
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    socket.emit("get_state");
  });

  socket.on("connect_error", (error) => {
    console.error("❌ SocketIO connect_error:", error);
    statusText.textContent = "Erreur connexion";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  socket.on("disconnect", (reason) => {
    console.error("🔌 SocketIO disconnected. Reason:", reason);
    statusText.textContent = "Déconnecté";
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔄 Reconnect attempt #${attempt}`);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !socket.connected) {
      console.log("🔄 Tab visible, attempting reconnect...");
      socket.connect();
    }
  });

  const intervalId = setInterval(() => {
    if (document.hidden) {
      console.log("⏰ Polling skipped (tab hidden)");
      return;
    }
    console.log("⏰ Polling tick at", new Date().toISOString(), "| Connected:", socket.connected);
    if (socket.connected) {
      console.log("📤 Sending get_state...");
      socket.emit("get_state");
    } else {
      console.log("🚫 Socket déconnecté, skip get_state. Reason from last disconnect?", socket.io.engine.closeReason || 'unknown');
    }
  }, 1000);

  socket.on("state_update", (data) => {
    try {
      console.log("🔄 state_update reçu:", data, "at", new Date().toISOString());
      console.log("🔍 Capteurs:", { temp: data.temperature });

      if (data.temperature !== null && data.temperature !== undefined) {
        const temp = parseFloat(data.temperature);
        if (isNaN(temp)) console.warn("⚠️ Temp non-numérique:", data.temperature);
        else {
          tempValue.textContent = temp.toFixed(1);
          let percent = Math.min(Math.max((temp / 100) * 100, 0), 100);
          mercury.style.height = percent + "%";
        }
      }

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

  setThresholdsButton.addEventListener("click", () => {
    const ledThreshold = parseFloat(ledThresholdInput.value);
    const fanThreshold = parseFloat(fanThresholdInput.value);

    if (isNaN(ledThreshold) || isNaN(fanThreshold)) {
      console.error("❌ Invalid threshold values:", { ledThreshold, fanThreshold });
      alert("Veuillez entrer des valeurs numériques valides pour les seuils.");
      return;
    }

    const data = {
      temperature_led: ledThreshold,
      temperature_fan: fanThreshold
    };

    fetch("/api/set_threshold", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(result => {
        console.log("✅ Thresholds updated successfully:", result.thresholds);
        alert("Seuils mis à jour avec succès !");
        socket.emit("get_state");
      })
      .catch(error => {
        console.error("❌ Error updating thresholds:", error);
        alert("Erreur lors de la mise à jour des seuils : " + error.message);
      });
  });

  window.addEventListener('beforeunload', () => clearInterval(intervalId));
});