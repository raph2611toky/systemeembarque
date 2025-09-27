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

  let authenticated = false;
  let currentInput = '';
  let expectingLogin = true;  // Toggle between login and password

  // Auth function
  function startAuth() {
    term.write('\r\n');
    term.write('\x1b[31m');  // Red color for auth prompts
    term.write('login: ');
    term.write('\x1b[0m');  // Reset color
    expectingLogin = true;
    currentInput = '';
    term.showCursor();
  }

  // Handle input for auth
  term.onData(data => {
    if (!authenticated) {
      // Auth mode
      if (data === '\r') {  // Enter
        term.write('\r\n');
        if (expectingLogin) {
          if (currentInput.trim() === 'raspberry') {
            term.write('\x1b[32m');  // Green for success
            term.write('Password: ');
            term.write('\x1b[0m');
            expectingLogin = false;
            currentInput = '';
          } else {
            term.write('\x1b[31m');  // Red error
            term.write('Invalid login. Try again.\r\n');
            term.write('\x1b[0m');
            startAuth();
          }
        } else {
          if (currentInput.trim() === 'raspberry') {
            authenticated = true;
            term.write('\r\n\x1b[32mAuthentication successful!\r\n\x1b[0m');
            socket.connect();  // Connect to Socket.IO after auth
            term.write('(raspberrypi3) ');
          } else {
            term.write('\x1b[31mInvalid password. Try again.\r\n\x1b[0m');
            startAuth();
          }
        }
      } else if (data === '\u007F') {  // Backspace
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          term.write('\b \b');
        }
      } else if (data.length === 1 && data.charCodeAt(0) >= 32 && data.charCodeAt(0) <= 126) {  // Printable char
        currentInput += data;
        if (expectingLogin) {
          term.write(data);  // Echo for login
        } else {
          term.write('*');  // Mask password
        }
      }
    } else {
      // Authenticated: Handle Renode commands
      if (data === '\r') {  // Enter
        term.write('\r\n');
        if (currentInput.trim()) {
          socket.emit('terminal_command', { command: currentInput.trim() });
        } else {
          term.write('(raspberrypi3) ');
        }
        currentInput = '';
      } else if (data === '\u007F') {  // Backspace
        if (currentInput.length > 0) {
          currentInput = currentInput.slice(0, -1);
          term.write('\b \b');
        }
      } else {
        currentInput += data;
        term.write(data);
      }
    }
  });

  socket.on('connect', () => {
    console.log('✅ Terminal SocketIO connected! ID:', socket.id);
    if (authenticated) {
      term.write('\r\nConnected to Renode terminal\r\n(raspberrypi3) ');
      currentInput = '';  // Reset command on reconnect
    }
  });

  socket.on('connect_error', (error) => {
    console.error('❌ Terminal SocketIO connect_error:', error);
    if (authenticated) {
      term.write(`\r\nError: Connection failed (${error.message})\r\n(raspberrypi3) `);
    }
  });

  socket.on('disconnect', (reason) => {
    console.error('🔌 Terminal SocketIO disconnected. Reason:', reason);
    if (authenticated) {
      term.write(`\r\nDisconnected: ${reason}\r\n(raspberrypi3) `);
    }
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔄 Terminal reconnect attempt #${attempt}`);
  });

  socket.on('terminal_output', (data) => {
    if (authenticated) {
      term.write(data);
      currentInput = '';  
    }
  });

  startAuth();
});