# Walkthrough: Does the Privacy Actually Work?

LETHE promises privacy. This tests whether the user is actually protected — and whether they can tell.

---

## 5.1 — Is My Traffic Hidden? (Tor)

1. With Tor enabled, open a browser
2. Search "what is my IP" — the result should NOT be your real IP
3. Is it obvious to the user that Tor is working? (Status indicator, agent confirmation, etc.)
4. Are pages slower than normal? Is that expected and communicated?

**Pass:** IP is masked. User can verify Tor is working without opening a terminal. If browsing is slower, there's context for why.

**Fail examples:** Real IP leaks. No way for the user to know Tor is on. Pages time out with no explanation.

---

## 5.2 — Are Trackers Blocked?

1. Open a browser and visit a site known for heavy advertising (news site, recipe blog)
2. Compare to the same site on a normal phone — are ads and trackers visibly absent?
3. Does anything break? (Some sites don't work without certain trackers)

**Pass:** Visible ad/tracker reduction. Sites still function.

**Fail examples:** Ads load normally. Half of websites are broken because blocking is too aggressive.

---

## 5.3 — Is Google Gone?

1. Open the app drawer and look for Google apps (Play Store, Gmail, Maps, Chrome, etc.)
2. There should be none
3. Does the user know what to use instead? Is there a browser, a mail app, a map app pre-installed or suggested?

**Pass:** No Google apps. User isn't left stranded — alternatives are available or discoverable.

**Fail examples:** Google is gone but there's no browser at all. User can't install apps because there's no store and no guidance.

---

## 5.4 — Can the User Verify Their Privacy?

1. Ask the agent: "Am I protected right now?"
2. The answer should be specific to the current phone state:
   - Is Tor on or off?
   - Is burner mode on or off?
   - Is DMS enabled?
   - Are there any known risks right now?

**Pass:** The agent gives an honest, real-time privacy status. Not a generic "you're safe" — actual details.

**Fail examples:** "Yes, you are protected." (no specifics). Agent doesn't know the current state of its own features.
