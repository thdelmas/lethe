# Walkthrough: Talking to LETHE

The agent is how the user controls their phone beyond basic taps and swipes. This tests whether it's actually helpful or just a gimmick.

---

## 4.1 — Basic Conversation

1. Tap the mascot and say: "Hello"
2. Does it respond? How fast?
3. Does the response feel like LETHE (calm, direct, no filler) or like a generic chatbot?
4. Ask: "What can you do?"
5. Does the answer actually help the user understand what to try next?

**Pass:** Response arrives within a few seconds. It sounds like a guardian, not a customer service bot. The "what can you do" answer gives concrete examples the user can try.

**Fail examples:** Response takes 30 seconds. Says "I'm an AI assistant, I can help with many things!" Gives a list of capabilities that reads like a spec sheet.

---

## 4.2 — Useful Everyday Tasks

Try things a normal person would ask their phone:

- [ ] "Set a timer for 10 minutes" — does it work?
- [ ] "Turn on the flashlight" — does it work?
- [ ] "Open the camera" — does it work?
- [ ] "What time is it in Tokyo?" — does it answer?
- [ ] "Connect to WiFi" — does it help or open settings?
- [ ] "Call mom" / "Text dad" — does it handle contacts?

**Pass:** At least basic phone tasks work through voice/text. If something can't be done, the agent says so plainly rather than hallucinating.

**Fail examples:** "Turn on the flashlight" returns a paragraph about how flashlights work. Agent says "done" but nothing happened. Agent crashes on a simple request.

---

## 4.3 — Privacy Questions

A user who chose LETHE probably has privacy questions. Test whether the agent can actually answer them:

- [ ] "Is my internet traffic private right now?"
- [ ] "What is burner mode?"
- [ ] "Who can see my messages?"
- [ ] "What happens if I lose this phone?"
- [ ] "How do I turn off Tor?"

**Pass:** Answers are honest, specific to this device's current config, and jargon-free. If Tor is off, it says so — it doesn't pretend you're protected.

**Fail examples:** Generic privacy advice not specific to LETHE. Agent doesn't know whether Tor is currently on or off. Uses words like "SOCKS5 proxy" or "nftables" in the answer.

---

## 4.4 — Offline / Local-Only Mode

1. Turn on airplane mode (or remove SIM + disconnect WiFi)
2. Talk to the agent
3. Does it respond at all?
4. Does it tell you it's running locally?
5. Is the response quality acceptable? (Simpler is fine, broken is not)

**Pass:** Agent responds offline. Acknowledges it's local. Response is coherent even if simpler.

**Fail examples:** Agent shows a spinner forever. Error message about network. Completely incoherent response. No indication that you're offline.

---

## 4.5 — Does It Feel Like LETHE?

This is subjective but important. After a few exchanges:

- [ ] Does the agent feel like a guardian (watchful, honest, calm)?
- [ ] Does it push back when you ask something risky? (Not rudely, but firmly)
- [ ] Does it avoid being sycophantic? (No "Great question!", no "I'd be happy to help!")
- [ ] Does it avoid emoji?
- [ ] Does it know it IS the phone, not an app running on the phone?

**Pass:** You'd trust this thing to watch your back. It feels intentional, not generic.
