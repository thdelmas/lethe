/* ═══════════ TOOL DEFINITIONS ═══════════ */
var LETHE_TOOLS = [
  { name: 'open_app_drawer', description: 'Open the app drawer to show installed apps',
    input_schema: { type: 'object', properties: {} } },
  { name: 'expand_notifications', description: 'Pull down the notification shade',
    input_schema: { type: 'object', properties: {} } },
  { name: 'screen_off', description: 'Turn off the screen and lock the device',
    input_schema: { type: 'object', properties: {} } },
  { name: 'open_settings', description: 'Open Android system settings',
    input_schema: { type: 'object', properties: {} } },
  { name: 'set_timer', description: 'Set a countdown timer',
    input_schema: { type: 'object', properties: {
      seconds: { type: 'integer', description: 'Timer duration in seconds' },
      label: { type: 'string', description: 'Optional timer label' }
    }, required: ['seconds'] } },
  { name: 'set_alarm', description: 'Set an alarm',
    input_schema: { type: 'object', properties: {
      hour: { type: 'integer', description: 'Hour (0-23)' },
      minute: { type: 'integer', description: 'Minute (0-59)' },
      label: { type: 'string', description: 'Optional alarm label' }
    }, required: ['hour', 'minute'] } },
  { name: 'toggle_flashlight', description: 'Toggle the flashlight on or off',
    input_schema: { type: 'object', properties: {} } },
  { name: 'open_app', description: 'Launch an app by package name or common name',
    input_schema: { type: 'object', properties: {
      app: { type: 'string', description: 'App package name or common name (e.g. "camera", "browser")' }
    }, required: ['app'] } },
  { name: 'get_privacy_status', description: 'Get current privacy and security status: Tor state, trackers blocked, connectivity, burner mode, dead man\'s switch',
    input_schema: { type: 'object', properties: {} } },
  /* ── System tools (routed to lethe-agent backend) ── */
  { name: 'run_shell', description: 'Execute a shell command on the device and return stdout/stderr. Use for any system task: check logs, manage services, inspect processes, configure the system.',
    input_schema: { type: 'object', properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      timeout_secs: { type: 'integer', description: 'Max seconds to wait (default 30, max 120)' }
    }, required: ['command'] } },
  { name: 'get_system_info', description: 'Get device info: battery, memory, storage, CPU, uptime, kernel, Android version',
    input_schema: { type: 'object', properties: {} } },
  { name: 'get_dms_status', description: 'Get dead man\'s switch status: armed/grace/locked/wiped/disabled, seconds until next check-in, interval, grace period, stage3 and duress PIN enabled',
    input_schema: { type: 'object', properties: {} } },
  { name: 'list_files', description: 'List files and directories at a path',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'Directory path to list' }
    }, required: ['path'] } },
  { name: 'read_file', description: 'Read the contents of a file (max 256KB)',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'File path to read' }
    }, required: ['path'] } },
  { name: 'write_file', description: 'Write content to a file (creates or overwrites)',
    input_schema: { type: 'object', properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' }
    }, required: ['path', 'content'] } },
  { name: 'manage_package', description: 'Install, remove, or get info about an Android package',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ['install', 'remove', 'info'], description: 'Action to perform' },
      package: { type: 'string', description: 'Package name or APK path' }
    }, required: ['action', 'package'] } },
  { name: 'list_packages', description: 'List all installed Android packages',
    input_schema: { type: 'object', properties: {} } },
  { name: 'network_action', description: 'Network operations: WiFi scan/connect/disconnect/status, airplane mode, Bluetooth toggle',
    input_schema: { type: 'object', properties: {
      action: { type: 'string', enum: ['wifi_scan', 'wifi_connect', 'wifi_disconnect', 'wifi_status', 'set_airplane_mode', 'bluetooth_toggle'], description: 'Network action' },
      ssid: { type: 'string', description: 'WiFi network name (for wifi_connect)' },
      password: { type: 'string', description: 'WiFi password (for wifi_connect, omit for open networks)' },
      enabled: { type: 'boolean', description: 'Enable/disable (for airplane_mode, bluetooth_toggle)' }
    }, required: ['action'] } },
  /* ── Phone tools (calls, SMS, contacts) ── */
  { name: 'make_call', description: 'Make a phone call. Use get_contacts first to resolve a name to a number.',
    input_schema: { type: 'object', properties: {
      number: { type: 'string', description: 'Phone number to call (E.164 or local format)' }
    }, required: ['number'] } },
  { name: 'send_sms', description: 'Send an SMS text message',
    input_schema: { type: 'object', properties: {
      number: { type: 'string', description: 'Recipient phone number' },
      message: { type: 'string', description: 'Message body' }
    }, required: ['number', 'message'] } },
  { name: 'read_sms', description: 'Read recent SMS messages from the inbox',
    input_schema: { type: 'object', properties: {
      count: { type: 'integer', description: 'Number of messages to return (default 10)' },
      from: { type: 'string', description: 'Filter by sender phone number' }
    } } },
  { name: 'get_contacts', description: 'Search contacts by name. Returns name and phone number. Use before make_call or send_sms when the user refers to someone by name.',
    input_schema: { type: 'object', properties: {
      query: { type: 'string', description: 'Name to search for (partial match). Omit to list all contacts.' }
    } } },
  { name: 'add_contact', description: 'Add a new contact to the address book',
    input_schema: { type: 'object', properties: {
      name: { type: 'string', description: 'Contact display name' },
      phone: { type: 'string', description: 'Phone number' },
      email: { type: 'string', description: 'Email address (optional)' }
    }, required: ['name', 'phone'] } }
];

var AGENT_URL = 'http://127.0.0.1:8080';

/* Convert tool definitions for OpenAI-compatible APIs */
function toolsForOpenAI() {
  return LETHE_TOOLS.map(function(t) {
    return { type: 'function', 'function': {
      name: t.name, description: t.description,
      parameters: t.input_schema
    }};
  });
}

/* Agent backend POST helper — returns Promise<string> */
function agentPost(path, body) {
  return fetch(AGENT_URL + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  }).then(function(r) { return r.json(); })
    .then(function(d) { return JSON.stringify(d); })
    .catch(function(e) { return 'Backend unreachable: ' + e.message; });
}

function agentGet(path) {
  return fetch(AGENT_URL + path)
    .then(function(r) { return r.json(); })
    .then(function(d) { return JSON.stringify(d); })
    .catch(function(e) { return 'Backend unreachable: ' + e.message; });
}

/* executeTool — always returns a Promise<string> */
function executeTool(name, input) {
  var nl = (typeof NativeLauncher !== 'undefined') ? NativeLauncher : null;

  /* ── UI tools (synchronous, via Java bridge) ── */
  switch (name) {
    case 'open_app_drawer':
      if (nl) nl.openAppDrawer();
      return Promise.resolve(nl ? 'App drawer opened.' : 'No system bridge.');
    case 'expand_notifications':
      if (nl) nl.expandNotifications();
      return Promise.resolve(nl ? 'Notifications expanded.' : 'No system bridge.');
    case 'screen_off':
      if (nl) nl.screenOff();
      return Promise.resolve(nl ? 'Screen turned off.' : 'No system bridge.');
    case 'open_settings':
      if (nl) nl.openSettings();
      return Promise.resolve(nl ? 'Settings opened.' : 'No system bridge.');
    case 'set_timer':
    case 'set_alarm':
    case 'toggle_flashlight':
    case 'open_app':
    case 'make_call':
    case 'send_sms':
    case 'add_contact':
      if (nl && nl.executeAction) {
        nl.executeAction(name, JSON.stringify(input || {}));
        var labels = {
          make_call: 'Calling ' + ((input && input.number) || '') + '.',
          send_sms: 'SMS sent to ' + ((input && input.number) || '') + '.',
          add_contact: 'Opening contact form for ' + ((input && input.name) || '') + '.'
        };
        return Promise.resolve(labels[name] || name.replace(/_/g, ' ') + ' done.');
      }
      return Promise.resolve('This action requires a newer system build.');
    case 'read_sms':
      if (nl && nl.readSms) {
        return Promise.resolve(nl.readSms(JSON.stringify(input || {})));
      }
      return Promise.resolve('[]');
    case 'get_contacts':
      if (nl && nl.getContacts) {
        return Promise.resolve(nl.getContacts((input && input.query) || ''));
      }
      return Promise.resolve('[]');
    case 'get_privacy_status':
      var s = deviceState || {};
      return Promise.resolve(JSON.stringify({
        tor: s.tor !== undefined ? (s.tor ? 'active' : 'offline') : 'unknown',
        trackers_blocked: s.trackers_blocked !== undefined ? s.trackers_blocked : 'unknown',
        connectivity: s.connectivity || 'unknown',
        burner_mode: s.burner_mode !== undefined ? (s.burner_mode ? 'ON' : 'off') : 'unknown',
        dead_mans_switch: s.dead_mans_switch !== undefined ? (s.dead_mans_switch ? 'ON' : 'off') : 'unknown',
        battery: s.battery !== undefined ? s.battery + '%' : 'unknown'
      }));
  }

  /* ── System tools (async, via lethe-agent backend) ── */
  switch (name) {
    case 'run_shell':
      return agentPost('/api/shell', input);
    case 'get_system_info':
      return agentGet('/api/sysinfo');
    case 'get_dms_status':
      return agentGet('/api/dms/status');
    case 'list_files':
      return agentPost('/api/files/list', input);
    case 'read_file':
      return agentPost('/api/files/read', input);
    case 'write_file':
      return agentPost('/api/files/write', input);
    case 'manage_package':
      return agentPost('/api/packages/manage', input);
    case 'list_packages':
      return agentGet('/api/packages/list');
    case 'network_action':
      return agentPost('/api/network', input);
    default:
      return Promise.resolve('Unknown action: ' + name);
  }
}
