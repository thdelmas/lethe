#!/usr/bin/env python3
"""Strip cloud provider code paths from a copy of the LETHE static/ tree.

LETHE_FIELD_BUILD=1 (issue #95) requires that no cloud-provider names,
endpoints, or key prompts ship in the field-build APK. This script edits
the post-overlay copy of static/settings.js and static/launcher.html to:

  - empty out the anthropic, openrouter entries from `modelCatalog`
  - delete those entries (and their settings sections) from `providerMeta`
  - remove the cloud `wizard-provider` cards from launcher.html

It is run by apply-overlays.sh against the in-tree copy that was already
written into the LineageOS source. Re-running is idempotent.

Usage:
    apply-field-build.py <static-dir>

Verifies post-strip with `grep -F`. Exits non-zero if any of
{anthropic, openrouter, sk-ant-, sk-or-, console.anthropic.com,
openrouter.ai} survives in the rewritten files.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

CLOUD_PROVIDERS = ("anthropic", "openrouter")
FORBIDDEN_TOKENS = (
    "anthropic",
    "openrouter",
    "sk-ant-",
    "sk-or-",
    "console.anthropic.com",
    "openrouter.ai",
    "claude",
    "gemini",
    "llama-4",
    "qwen3-72b",
)


def strip_settings_js(text: str) -> str:
    """Remove cloud entries from object/array literals + comments + strings."""
    # Drop comment lines mentioning the cloud names FIRST — otherwise the
    # in-array string-literal stripper can mangle a JSON example inside
    # a comment, leaving a syntactically odd (though harmless) leftover.
    text = _strip_comment_lines_referencing_cloud(text)
    for name in CLOUD_PROVIDERS:
        text = _delete_named_array_entry(text, name)
        text = _delete_named_object_entry(text, name)
        text = _delete_named_string_entry(text, name)
        # `order = ['local', 'anthropic', 'openrouter'];` style usage.
        text = _strip_string_literal_in_array(text, name)
    return text


def _strip_string_literal_in_array(text: str, name: str) -> str:
    """Remove `'name'` (single- or double-quoted) and any adjacent comma.

    Targets uses like `var order = ['local', 'anthropic', 'openrouter'];`
    leaving `var order = ['local'];`.
    """
    pattern = re.compile(r"(,\s*)?(['\"])" + re.escape(name) + r"\2(\s*,)?")

    def repl(m: re.Match) -> str:
        # Preserve a single comma if the literal sat between two others.
        if m.group(1) and m.group(3):
            return m.group(1)
        return ""

    return pattern.sub(repl, text)


def _strip_comment_lines_referencing_cloud(text: str) -> str:
    """Drop any line that's purely a comment and mentions a forbidden token."""
    out = []
    for line in text.splitlines(keepends=True):
        stripped = line.strip()
        is_comment = (
            stripped.startswith("/*")
            or stripped.startswith("*")
            or stripped.startswith("//")
        )
        if is_comment and any(t in line for t in FORBIDDEN_TOKENS):
            continue
        out.append(line)
    return "".join(out)


def _delete_named_array_entry(text: str, name: str) -> str:
    """Delete `<name>: [ ... ],` from a JS object literal (multi-line)."""
    pattern = re.compile(r"^\s*" + re.escape(name) + r"\s*:\s*\[", re.MULTILINE)
    m = pattern.search(text)
    if not m:
        return text
    start = m.start()
    i = m.end() - 1  # at the '['
    depth = 0
    while i < len(text):
        c = text[i]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                # Swallow the trailing comma + whitespace + newline.
                while end < len(text) and text[end] in ", ":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:start] + text[end:]
        i += 1
    return text


def _delete_named_string_entry(text: str, name: str) -> str:
    """Delete `<name>: '...string...',` from an object literal (single line).

    Targets entries like `cloudConsentMessages.anthropic: '...'`. The string
    literal can use ' or " quotes.
    """
    pattern = re.compile(
        r"^[ \t]*" + re.escape(name) + r"\s*:\s*(['\"])(?:\\.|(?!\1).)*\1\s*,?[ \t]*\n",
        re.MULTILINE,
    )
    return pattern.sub("", text)


def _delete_named_object_entry(text: str, name: str) -> str:
    """Delete `<name>: { ... },` from a JS object literal (multi-line)."""
    pattern = re.compile(r"^\s*" + re.escape(name) + r"\s*:\s*\{", re.MULTILINE)
    m = pattern.search(text)
    if not m:
        return text
    start = m.start()
    i = m.end() - 1
    depth = 0
    in_str = False
    str_ch = ""
    while i < len(text):
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == str_ch:
                in_str = False
        elif c in ("'", '"'):
            in_str = True
            str_ch = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                while end < len(text) and text[end] in ", ":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:start] + text[end:]
        i += 1
    return text


def strip_launcher_html(text: str) -> str:
    """Drop wizard-provider cards whose data-provider is a cloud name.

    Walks `<div .../>` open/close pairs to find the balanced closing tag
    rather than relying on a non-greedy regex (which over-matches when
    sibling cards follow the target).
    """
    for name in CLOUD_PROVIDERS:
        text = _drop_balanced_div(
            text, f'<div class="wizard-provider" data-provider="{name}">'
        )
    return text


def _drop_balanced_div(text: str, open_tag: str) -> str:
    """Remove `open_tag` and its balanced closing `</div>`, plus a leading newline."""
    while True:
        start = text.find(open_tag)
        if start == -1:
            return text
        i = start + len(open_tag)
        depth = 1
        while i < len(text) and depth > 0:
            nxt_open = text.find("<div", i)
            nxt_close = text.find("</div>", i)
            if nxt_close == -1:
                # Malformed; bail out without modifying further.
                return text
            if nxt_open != -1 and nxt_open < nxt_close:
                depth += 1
                i = nxt_open + 4
            else:
                depth -= 1
                i = nxt_close + len("</div>")
        end = i
        # Eat the leading newline + indent if present, plus a trailing newline.
        chop_start = start
        while chop_start > 0 and text[chop_start - 1] in " \t":
            chop_start -= 1
        if chop_start > 0 and text[chop_start - 1] == "\n":
            chop_start -= 1
        while end < len(text) and text[end] in " \t":
            end += 1
        text = text[:chop_start] + text[end:]


def verify_clean(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    return [t for t in FORBIDDEN_TOKENS if t in text]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    static_dir = Path(argv[1])
    if not static_dir.is_dir():
        print(f"not a directory: {static_dir}", file=sys.stderr)
        return 2

    settings_js = static_dir / "settings.js"
    launcher_html = static_dir / "launcher.html"
    for p in (settings_js, launcher_html):
        if not p.exists():
            print(f"missing: {p}", file=sys.stderr)
            return 2

    settings_js.write_text(
        strip_settings_js(settings_js.read_text(encoding="utf-8")),
        encoding="utf-8",
    )
    launcher_html.write_text(
        strip_launcher_html(launcher_html.read_text(encoding="utf-8")),
        encoding="utf-8",
    )

    survivors = []
    for p in (settings_js, launcher_html):
        leaks = verify_clean(p)
        if leaks:
            survivors.append((p, leaks))
    if survivors:
        for p, leaks in survivors:
            print(f"FAIL: {p} still contains {leaks}", file=sys.stderr)
        return 1

    print(
        f"  -> Field build: stripped cloud providers from {settings_js.name}, {launcher_html.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
