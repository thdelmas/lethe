/* ═══════════ SEND ═══════════ */
/* Called from native Android EditText via evaluateJavascript */
function nativeSend(text) {
  if (!text) return;
  inputEl.value = text;
  send();
}

function send() {
  var text = inputEl.value.trim();
  if (!text) return;

  /* Slash commands */
  if (text.charAt(0) === '/') {
    var cmd = text.toLowerCase().split(' ')[0];
    inputEl.value = ''; autoResize();
    switch (cmd) {
      case '/settings':
        addMessage(text, 'user');
        if (typeof settingsOpen === 'function') settingsOpen();
        return;
      case '/help':
        addMessage(text, 'user');
        addMessage('Available commands:', 'lethe');
        addMessage('/settings — open provider settings', 'lethe');
        addMessage('/clear — clear this conversation', 'lethe');
        addMessage('/help — show this list', 'lethe');
        return;
      case '/clear':
        addMessage(text, 'user');
        transcript.innerHTML = '';
        chatHistory = [{ role: 'system', content: buildSystemPrompt() }];
        turnCount = 0;
        addMessage('Fresh start.', 'lethe');
        return;
    }
  }

  /* Stability: block if idle-locked */
  if (isIdleLocked()) {
    showHomeNotice('wake me first');
    return;
  }

  /* Stability: check conversation limits */
  turnCount++;
  if (checkConversationLimits() === 'reset') return;

  /* Stability: reset chain depth on user input */
  chainDepth = 0;

  var p = getProvider();
  if (!p) {
    addMessage(text, 'user');
    addMessage('No thinking core. Connect a provider in Settings.', 'lethe');
    inputEl.value = ''; btnSend.disabled = true;
    return;
  }
  addMessage(text, 'user');
  chatHistory.push({ role: 'user', content: text });
  inputEl.value = ''; btnSend.disabled = true; autoResize();
  lastProvider = p.name;
  lastModel = p.model || '';
  setState('thinking'); showTyping(); showStatus(p.name);

  /* Refresh device state in system prompt before each send */
  chatHistory[0] = { role: 'system', content: buildSystemPrompt() };

  chainDepth++;
  chatRequest(p, chatHistory)
    .then(function(result) {
      hideTyping();

      /* Tool-call handling: execute tools, send results back to LLM */
      if (result.toolCalls) {
        setState('acting');
        if (result.text) addMessage(result.text, 'lethe');
        var toolResults = [];
        for (var i = 0; i < result.toolCalls.length; i++) {
          var tc = result.toolCalls[i];
          showStatus(tc.name.replace(/_/g, ' '));
          var output = executeTool(tc.name, tc.input);
          toolResults.push({ id: tc.id, name: tc.name, result: output });
        }
        /* Feed tool results back — Anthropic format */
        if (p.format === 'anthropic') {
          var acontent = [];
          if (result.text) acontent.push({ type: 'text', text: result.text });
          for (var a = 0; a < result.toolCalls.length; a++) {
            acontent.push({ type: 'tool_use', id: result.toolCalls[a].id,
              name: result.toolCalls[a].name, input: result.toolCalls[a].input });
          }
          chatHistory.push({ role: 'assistant', content: acontent });
          for (var b = 0; b < toolResults.length; b++) {
            chatHistory.push({ role: 'user', content: [{ type: 'tool_result',
              tool_use_id: toolResults[b].id, content: toolResults[b].result }] });
          }
        } else {
          /* OpenAI format */
          var amsg = { role: 'assistant', content: result.text || null, tool_calls: [] };
          for (var c = 0; c < result.toolCalls.length; c++) {
            amsg.tool_calls.push({ id: result.toolCalls[c].id, type: 'function',
              'function': { name: result.toolCalls[c].name,
                arguments: JSON.stringify(result.toolCalls[c].input) } });
          }
          chatHistory.push(amsg);
          for (var d = 0; d < toolResults.length; d++) {
            chatHistory.push({ role: 'tool', tool_call_id: toolResults[d].id,
              content: toolResults[d].result });
          }
        }
        /* Follow-up call so LLM can summarize what it did */
        if (chainDepth < CHAIN_DEPTH_MAX) {
          chainDepth++;
          showTyping(); setState('thinking');
          chatRequest(p, chatHistory).then(function(followUp) {
            hideTyping(); handleReply(followUp.text || 'Done.');
          }).catch(function() {
            hideTyping(); handleReply('Action completed.');
          });
        } else {
          handleReply('Done.');
        }
        return;
      }

      handleReply(result.text);
    })
    .catch(function(err) {
      hideTyping(); setState('alert');
      chainDepth = 0;
      console.log('LETHE chat error: ' + (err ? err.message || err : 'unknown'));
      addMessage(p.name === 'local'
        ? 'My local core is not running.'
        : 'Lost contact with ' + p.name + '. (' + (err ? err.message || '' : '') + ')', 'lethe');
      setTimeout(function() { setState('idle'); }, 3000);
    });
}

function handleReply(reply) {
  setState('speaking');

  if (hasSpiralRisk(reply)) {
    reply = 'I noticed myself going in circles. What were we working on?';
  }
  if (isRefusal(reply)) {
    microExpression('deny');
    if (window.letheEmotion) window.letheEmotion.setExpression('concerned');
  }

  chatHistory.push({ role: 'assistant', content: reply });
  addMessage(reply, 'lethe', { provider: lastProvider, model: lastModel });
  setState('idle');
  if (!isRefusal(reply) && viewState === 'home' && Math.random() > 0.5) {
    setTimeout(function() { playRandomAnim('replied'); }, 1500);
  }
}

/* ═══════════ INPUT ═══════════ */
inputEl.addEventListener('input', function() {
  btnSend.disabled = !inputEl.value.trim(); autoResize();
});
inputEl.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
btnSend.addEventListener('click', send);

function autoResize() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
}

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', function() {
    document.body.style.height = window.visualViewport.height + 'px';
  });
}

/* ═══════════ VOICE ═══════════ */
var mediaRecorder = null, recording = false;
btnMic.addEventListener('click', function() {
  if (typeof NativeSpeech !== 'undefined' && NativeSpeech.isAvailable()) {
    setState('listening'); btnMic.classList.add('recording');
    NativeSpeech.listen(); return;
  }
  if (recording) { mediaRecorder.stop(); return; }
  if (!navigator.mediaDevices) { inputEl.focus(); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
    mediaRecorder = new MediaRecorder(stream);
    var chunks = [];
    mediaRecorder.ondataavailable = function(e) { chunks.push(e.data); };
    mediaRecorder.onstart = function() {
      recording = true; btnMic.classList.add('recording');
      setState('listening');
      /* Feed voice amplitude to avatar */
      if (window.letheEmotion) {
        window.letheEmotion.startSpeechAmplitude(stream);
      }
    };
    mediaRecorder.onstop = function() {
      recording = false; btnMic.classList.remove('recording');
      if (window.letheEmotion) {
        window.letheEmotion.stopSpeechAmplitude();
      }
      stream.getTracks().forEach(function(t) { t.stop(); });
      var blob = new Blob(chunks, { type: 'audio/webm' });
      var form = new FormData();
      form.append('file', blob, 'voice.webm');
      form.append('model', 'whisper');

      function applyTranscription(text) {
        if (text) {
          inputEl.value = text.trim();
          btnSend.disabled = false; autoResize();
        }
        setState('idle');
      }

      function tryCloudTranscription() {
        /* Fall back to cloud provider if local Whisper is unavailable */
        var cp = getProvider();
        if (!cp || !cp.key) {
          showStatus('No transcription'); setState('idle'); return;
        }
        var cf = new FormData();
        cf.append('file', blob, 'voice.webm');
        cf.append('model', 'whisper-1');
        var cloudUrl, cloudHeaders = {};
        if (cp.name === 'openrouter' || cp.format === 'openai') {
          cloudUrl = cp.endpoint + '/audio/transcriptions';
          if (cp.key) cloudHeaders['Authorization'] = 'Bearer ' + cp.key;
        } else {
          showStatus('No transcription'); setState('idle'); return;
        }
        fetch(cloudUrl, { method: 'POST', headers: cloudHeaders, body: cf })
          .then(function(r) { return r.json(); })
          .then(function(d) { applyTranscription(d.text); })
          .catch(function() { showStatus('No transcription'); setState('idle'); });
      }

      fetch('http://127.0.0.1:8080/v1/audio/transcriptions',
        { method: 'POST', body: form })
        .then(function(r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function(d) {
          if (d.text) applyTranscription(d.text);
          else tryCloudTranscription();
        })
        .catch(function() { tryCloudTranscription(); });
    };
    mediaRecorder.start();
  }).catch(function() { inputEl.focus(); });
});

function onSpeechResult(text) {
  btnMic.classList.remove('recording');
  if (text && text !== 'cancelled') {
    inputEl.value = text; btnSend.disabled = false;
  }
  setState('idle');
}
function onSpeechError() {
  btnMic.classList.remove('recording'); setState('idle');
}

/* ═══════════ SSE ═══════════ */
if (location.protocol !== 'file:') {
  try {
    var sse = new EventSource('/api/agent/state');
    sse.onmessage = function(e) {
      try {
        var d = JSON.parse(e.data);
        if (d.state) setState(d.state);
        if (d.status) showStatus(d.status);
      } catch(_) {}
    };
    sse.onerror = function() { sse.close(); };
  } catch(_) {}
}
