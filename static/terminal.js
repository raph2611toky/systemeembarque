document.addEventListener("DOMContentLoaded", () => {
  // Navigation
  const homeNav = document.getElementById("home-nav");
  const terminalNav = document.getElementById("terminal-nav");

  homeNav.addEventListener("click", () => {
    window.location.href = "/";
    homeNav.classList.add("active");
    terminalNav.classList.remove("active");
  });

  // Initialize xterm.js terminal
  const term = new Terminal({
    cursorBlink: true,
    theme: {
      background: '#000000',
      foreground: '#00FF00',
      cursor: '#00FF00'
    },
    fontFamily: '"Courier New", monospace',
    fontSize: 14
  });

  const terminalContainer = document.getElementById('terminal');
  term.open(terminalContainer);

  const socket = io('/terminal', {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });

  term.write('(raspberrypi3) ');

  let command = '';
  term.onData(data => {
    if (data === '\r') {  // Enter key
      term.write('\r\n');
      if (command.trim()) {
        socket.emit('terminal_command', { command: command.trim() });
      } else {
        term.write('(raspberrypi3) ');
      }
      command = '';
    } else if (data === '\u007F') {  // Backspace
      if (command.length > 0) {
        command = command.slice(0, -1);
        term.write('\b \b');
      }
    } else {
      command += data;
      term.write(data);
    }
  });

  socket.on('connect', () => {
    console.log('✅ Terminal SocketIO connected! ID:', socket.id);
    term.write('\r\nConnected to Renode terminal\r\n(raspberrypi3) ');
    command = '';  // Reset command on reconnect
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Terminal SocketIO connect_error:', error);
    term.write(`\r\nError: Connection failed (${error.message})\r\n(raspberrypi3) `);
  });

  socket.on('disconnect', (reason) => {
    console.error('🔌 Terminal SocketIO disconnected. Reason:', reason);
    term.write(`\r\nDisconnected: ${reason}\r\n(raspberrypi3) `);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔄 Terminal reconnect attempt #${attempt}`);
  });

  socket.on('terminal_output', (data) => {
    term.write(data);
    command = '';
  });
});