document.addEventListener("DOMContentLoaded", () => {
  // Declare the io variable before using it
  const io = window.io

  const socket = io({
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  function showToast(title, message, type = "success") {
    const toastContainer = document.getElementById("toast-container")

    const toast = document.createElement("div")
    toast.className = "toast"

    const icon = type === "success" ? "✅" : "❌"

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
    `

    toastContainer.appendChild(toast)

    // Auto remove after 3 seconds
    setTimeout(() => {
      toast.classList.add("removing")
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast)
        }
      }, 300)
    }, 3000)
  }

  // Navigation
  const homeNav = document.getElementById("home-nav")
  const terminalNav = document.getElementById("terminal-nav")

  homeNav.addEventListener("click", () => {
    window.location.href = "/" // Already on index.html
    homeNav.classList.add("active")
    terminalNav.classList.remove("active")
  })

  terminalNav.addEventListener("click", () => {
    window.location.href = "/terminal"
    homeNav.classList.remove("active")
    terminalNav.classList.add("active")
  })

  // Logger événements
  const onevent = socket.onevent
  socket.onevent = function (packet) {
    const args = packet.data || []
    console.log("📡 Événement reçu:", args[0], "→", args.slice(1))
    onevent.call(this, packet)
  }

  // Éléments DOM
  const tempValue = document.getElementById("temp-value")
  const statusText = document.getElementById("status-text")
  const connectionStatus = document.getElementById("connection-status")
  const mercury = document.getElementById("mercury")
  const fanValue = document.getElementById("fan-value")
  const fanStatus = document.getElementById("fan-status")
  const fanVisual = document.getElementById("fan-visual")
  const ledStatus = document.getElementById("led-status")
  const ledIndicator = document.getElementById("led-indicator")
  const ledThresholdInput = document.getElementById("led-threshold")
  const fanThresholdInput = document.getElementById("fan-threshold")
  const setThresholdsButton = document.getElementById("set-thresholds")

  // Connexion
  socket.on("connect", () => {
    console.log("✅ SocketIO connected! ID:", socket.id)
    statusText.textContent = "Connecté"
    connectionStatus.classList.remove("disconnected")
    connectionStatus.classList.add("connected")
    socket.emit("get_state")
  })

  socket.on("connect_error", (error) => {
    console.error("❌ SocketIO connect_error:", error)
    statusText.textContent = "Erreur connexion"
    connectionStatus.classList.remove("connected")
    connectionStatus.classList.add("disconnected")
  })

  socket.on("disconnect", (reason) => {
    console.error("🔌 SocketIO disconnected. Reason:", reason)
    statusText.textContent = "Déconnecté"
    connectionStatus.classList.remove("connected")
    connectionStatus.classList.add("disconnected")
  })

  socket.on("reconnect_attempt", (attempt) => {
    console.log(`🔄 Reconnect attempt #${attempt}`)
  })

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !socket.connected) {
      console.log("🔄 Tab visible, attempting reconnect...")
      socket.connect()
    }
  })

  const intervalId = setInterval(() => {
    if (document.hidden) {
      console.log("⏰ Polling skipped (tab hidden)")
      return
    }
    console.log("⏰ Polling tick at", new Date().toISOString(), "| Connected:", socket.connected)
    if (socket.connected) {
      console.log("📤 Sending get_state...")
      socket.emit("get_state")
    } else {
      console.log(
        "🚫 Socket déconnecté, skip get_state. Reason from last disconnect?",
        socket.io.engine.closeReason || "unknown",
      )
    }
  }, 1000)

  socket.on("state_update", (data) => {
    try {
      console.log("🔄 state_update reçu:", data, "at", new Date().toISOString())
      console.log("🔍 Capteurs:", { temp: data.temperature })

      if (data.temperature !== null && data.temperature !== undefined) {
        const temp = Number.parseFloat(data.temperature)
        if (isNaN(temp)) console.warn("⚠️ Temp non-numérique:", data.temperature)
        else {
          tempValue.textContent = temp.toFixed(1)
          const percent = Math.min(Math.max((temp / 100) * 100, 0), 100)
          mercury.style.height = percent + "%"
        }
      }

      if (data.fan) {
        const speed = Number.parseInt(data.fan.speed)
        if (isNaN(speed)) console.warn("⚠️ Fan speed non-numérique:", data.fan.speed)
        else {
          fanValue.textContent = speed
          const isRunning = speed > 0
          fanStatus.textContent = isRunning ? "EN MARCHE" : "ARRÊTÉ"

          const fanStatusDisplay = document.getElementById("fan-status-display")
          if (isRunning) {
            fanStatusDisplay.classList.add("running")
            fanStatusDisplay.classList.remove("stopped")
          } else {
            fanStatusDisplay.classList.add("stopped")
            fanStatusDisplay.classList.remove("running")
          }

          if (speed > 0) {
            fanVisual.classList.add("spinning")
            fanVisual.style.animationDuration = 1 / (speed / 100) + "s"
          } else {
            fanVisual.classList.remove("spinning")
          }
        }
      }

      if (data.led) {
        const ledOn =
          data.led.value === "True" || data.led.value === true || data.led.value === "true" || data.led.value === 1
        ledStatus.textContent = ledOn ? "ALLUMÉE" : "ÉTEINTE"

        const ledStatusDisplay = document.getElementById("led-status-display")
        if (ledOn) {
          ledIndicator.classList.add("on")
          ledStatusDisplay.classList.add("on")
          ledStatusDisplay.classList.remove("off")
        } else {
          ledIndicator.classList.remove("on")
          ledStatusDisplay.classList.add("off")
          ledStatusDisplay.classList.remove("on")
        }
      }

      console.log("✅ state_update appliqué sans erreur")
    } catch (err) {
      console.error("💥 Erreur dans state_update:", err, "Data:", data)
    }
  })

  setThresholdsButton.addEventListener("click", () => {
    const ledThreshold = Number.parseFloat(ledThresholdInput.value)
    const fanThreshold = Number.parseFloat(fanThresholdInput.value)

    if (isNaN(ledThreshold) || isNaN(fanThreshold)) {
      console.error("❌ Invalid threshold values:", { ledThreshold, fanThreshold })
      showToast("Erreur", "Veuillez entrer des valeurs numériques valides pour les seuils.", "error")
      return
    }

    const data = {
      temperature_led: ledThreshold,
      temperature_fan: fanThreshold,
    }

    fetch("/api/set_threshold", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        return response.json()
      })
      .then((result) => {
        console.log("✅ Thresholds updated successfully:", result.thresholds)
        showToast("Succès", "Seuils mis à jour avec succès !", "success")
        socket.emit("get_state")
      })
      .catch((error) => {
        console.error("❌ Error updating thresholds:", error)
        showToast("Erreur", "Erreur lors de la mise à jour des seuils : " + error.message, "error")
      })
  })

  window.addEventListener("beforeunload", () => clearInterval(intervalId))
})
