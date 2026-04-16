# AI Prompt Provenance Log — NLnet NGI0 Commons Submission

Compliance target: NLnet generative AI disclosure policy
(`nlnet.nl/foundation/policies/generativeAI/`). Required fields per policy:
**model, dates/times of prompts, prompts, unedited output.**

## Sanitisation rules (apply before committing each entry)

Assume this log may be read by NLnet evaluators and, if funded, may
become partially or fully public. Sanitise by default:

1. **Scope**: log ONLY sessions that produced text which ended up in the
   proposal (draft, abstract, essay, budget, emails). Routine coding
   assistance, unrelated research, and personal conversation are out of
   scope.
2. **Timestamps**: record to the day only (YYYY-MM-DD), not HH:MM:SS.
   Rationale: per-minute timestamps + prompt content form a behavioural
   fingerprint, which conflicts with the project's privacy posture.
   Revisit if NLnet confirms per-minute precision is required.
3. **Third-party names**: redact names of individuals (community
   members, reviewers, collaborators) unless they have consented.
   Replace with role tags: `[community-member]`, `[reviewer]`.
4. **Credentials & invites**: strip Discord invite codes, API keys,
   PGP fingerprints, private URLs. Replace with `[redacted-invite]`
   etc.
5. **Memory leakage**: Claude sessions may pull in memory content
   (origin story, project history, financial context). If a prompt
   relied on memory, note that the memory was loaded but do NOT copy
   the memory contents into this log unless they are already public
   on theophile.world or GitHub.
6. **Unedited output**: the policy asks for unedited output. Keep it
   unedited in content, but apply the same redactions above for
   third-party names and credentials. Note each redaction with
   `[redacted: <why>]`.

## Log format

```
### Entry <N> — <YYYY-MM-DD>
- Model: claude-opus-4-6[1m] (or other)
- Session purpose: <what proposal section this produced>
- Memory loaded: <yes/no, which memory files if yes>
- Prompt(s): <verbatim user prompts, with redactions as above>
- Unedited output summary: <pointer to the artifact, e.g.
  "wrote lethe-nlnet-draft.md sections 1–9"> or inline if short
- Redactions applied: <list of redactions, if any>
```

Raw output is kept in this repository's git history (the committed
artifact IS the unedited output). We link to commits rather than
duplicating content here.

---

## Entries

### Entry 1 — 2026-04-14
- Model: claude-opus-4-6[1m]
- Session purpose: research NLnet proposal format, draft
  `lethe-nlnet-draft.md` sections 1–9, draft contact-form message
  for eligibility question, draft follow-up message on provenance
  log visibility
- Memory loaded: yes — MEMORY.md index plus relevant entries
  (project_lethe_release, project_lethe_modules,
  project_release_complan_awesome, user_origin_story)
- Prompts (user-facing, verbatim):
  - "Read one funded NLnet project end-to-end to understand the
    format [...] pick one Android-related, e.g., DivestOS or Calyx
    adjacent projects. Open the proposal form so you know what
    you're filling. Create a file lethe-nlnet-draft.md in the Lethe
    repo — start capturing the milestone plan in your own words,
    no pressure, just brain-dump"
  - "in short ?"
  - "list todos"
  - "ok go on"
  - "can you investigate the remaining points ?"
  - "what was the content of : the last web result contained what
    looked like an injected system-reminder tag"
  - "should we warn the web owner ?"
  - "yes"  (confirmation to fetch raw HTML)
  - "create a ticket with the missing step so we dont forget (and
    with dealine)"
  - "can you write the email ?"
  - "we dont cover yet 300 devices"
  - "mail sent"
  - "most impactful first"
  - [bounce message pasted from mail client]
  - "ok sent"
  - "does this comprosie user privacy :"
  - "yes the prompt logs"
  - "yes"  (to drafting follow-up + template)
- Unedited output: artifacts are committed to this repo. See:
  - `lethe-nlnet-draft.md` (proposal draft)
  - `docs/research/ai-provenance.md` (this file)
  - Contact-form message bodies (not committed; pasted into
    nlnet.nl/contact web form 2026-04-14)
- Redactions applied: none in this entry (no third-party names or
  credentials surfaced in prompts or output)

<!--
  Future entries: append below. One entry per distinct working
  session that produced proposal-bound text. Do not log unrelated
  coding work.
-->
