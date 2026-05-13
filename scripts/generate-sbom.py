#!/usr/bin/env python3
"""Generate a CycloneDX-1.5 SBOM aggregating all LETHE dependencies.

Walks the four dependency manifests this repo owns and emits one JSON
SBOM compatible with Syft / Grype / Dependency-Track:

  - p2p/go.sum            → Go modules
  - agent/Cargo.lock      → Rust crates
  - static/package-lock.json → npm packages
  - flake.lock            → Nix flake inputs

Run: ``scripts/generate-sbom.py > lethe-sbom.json``

The output goes alongside the OTA in CI per lethe#115. This script does
not consult the network; it parses what's already on disk so the SBOM is
deterministic relative to the lock files.
"""

from __future__ import annotations

import datetime as _dt
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any
from uuid import uuid4


def _purl(typ: str, name: str, version: str, **qualifiers) -> str:
    """Build a Package URL (purl) — the CycloneDX lookup key."""
    base = f"pkg:{typ}/{name}@{version}"
    if qualifiers:
        q = "&".join(f"{k}={v}" for k, v in qualifiers.items())
        base = f"{base}?{q}"
    return base


def parse_go_sum(path: Path) -> list[dict[str, Any]]:
    """One module per `<name> <version>/go.mod <hash>` block in go.sum."""
    if not path.exists():
        return []
    components: dict[tuple[str, str], dict[str, Any]] = {}
    pat = re.compile(r"^(\S+)\s+(\S+?)(?:/go\.mod)?\s+h1:(\S+)$")
    for line in path.read_text().splitlines():
        m = pat.match(line)
        if not m:
            continue
        name, version, h = m.group(1), m.group(2), m.group(3)
        components.setdefault(
            (name, version),
            {
                "type": "library",
                "name": name,
                "version": version,
                "purl": _purl("golang", name, version),
                "hashes": [{"alg": "SHA-256", "content": h}],
            },
        )
    return list(components.values())


def parse_cargo_lock(path: Path) -> list[dict[str, Any]]:
    """Walk Cargo.lock's [[package]] tables. TOML pure-Python parser."""
    if not path.exists():
        return []
    out = []
    text = path.read_text()
    blocks = re.split(r"\n\[\[package\]\]\n", text)
    for block in blocks[1:]:
        # Each block ends at the next [[package]] or section header.
        block = block.split("\n[", 1)[0]
        attrs = {}
        for line in block.splitlines():
            m = re.match(r'(\w+)\s*=\s*"([^"]*)"', line.strip())
            if m:
                attrs[m.group(1)] = m.group(2)
        if "name" in attrs and "version" in attrs:
            comp = {
                "type": "library",
                "name": attrs["name"],
                "version": attrs["version"],
                "purl": _purl("cargo", attrs["name"], attrs["version"]),
            }
            if "checksum" in attrs:
                comp["hashes"] = [{"alg": "SHA-256", "content": attrs["checksum"]}]
            out.append(comp)
    return out


def parse_npm_lock(path: Path) -> list[dict[str, Any]]:
    """package-lock.json v3 — packages are nested under "packages"."""
    if not path.exists():
        return []
    try:
        doc = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    out = []
    pkgs = doc.get("packages", {})
    for key, info in pkgs.items():
        if not key:
            continue  # the root entry has empty key
        # Path-shaped keys like "node_modules/foo" or "node_modules/@scope/bar".
        name = key.split("node_modules/", 1)[-1]
        version = info.get("version", "")
        if not version:
            continue
        comp = {
            "type": "library",
            "name": name,
            "version": version,
            "purl": _purl("npm", name, version),
        }
        integrity = info.get("integrity", "")
        if integrity.startswith("sha512-"):
            comp["hashes"] = [{"alg": "SHA-512", "content": integrity[7:]}]
        out.append(comp)
    return out


def parse_flake_lock(path: Path) -> list[dict[str, Any]]:
    """flake.lock nodes — each is a (locked) Nix flake input."""
    if not path.exists():
        return []
    try:
        doc = json.loads(path.read_text())
    except json.JSONDecodeError:
        return []
    out = []
    for name, node in (doc.get("nodes") or {}).items():
        if name == "root":
            continue
        locked = node.get("locked") or {}
        rev = locked.get("rev", "")
        if not rev:
            continue
        owner = locked.get("owner") or "unknown"
        repo = locked.get("repo") or name
        ref = locked.get("ref") or "main"
        out.append(
            {
                "type": "library",
                "name": f"{owner}/{repo}",
                "version": rev,
                "purl": _purl(
                    "github", f"{owner}/{repo}", rev, ref=ref, type="nix-flake"
                ),
                "hashes": [{"alg": "SHA-256", "content": rev}],
                "description": f"Nix flake input '{name}' from {locked.get('type', 'github')}",
            }
        )
    return out


def hash_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def build_sbom(repo_root: Path) -> dict[str, Any]:
    components: list[dict[str, Any]] = []
    components += parse_go_sum(repo_root / "p2p" / "go.sum")
    components += parse_cargo_lock(repo_root / "agent" / "Cargo.lock")
    components += parse_npm_lock(repo_root / "static" / "package-lock.json")
    components += parse_flake_lock(repo_root / "flake.lock")

    # Deterministic ordering — same input always produces the same SBOM.
    components.sort(key=lambda c: c.get("purl") or c["name"])

    metadata = {
        "timestamp": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tools": [{"vendor": "lethe", "name": "generate-sbom.py", "version": "1"}],
        "component": {
            "type": "operating-system",
            "name": "lethe",
            "version": _read_lethe_version(repo_root),
            "description": "LETHE — privacy-hardened Android overlay on LineageOS",
        },
    }

    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.5",
        "serialNumber": f"urn:uuid:{uuid4()}",
        "version": 1,
        "metadata": metadata,
        "components": components,
    }


def _read_lethe_version(repo_root: Path) -> str:
    """Pull the LETHE version out of manifest.yaml without yaml dep."""
    m = repo_root / "manifest.yaml"
    if not m.exists():
        return "unknown"
    for line in m.read_text().splitlines():
        s = line.strip()
        if s.startswith("version:"):
            return s.split(":", 1)[1].strip().strip('"').strip("'")
    return "unknown"


def main(argv: list[str]) -> int:
    repo_root = Path(__file__).resolve().parent.parent
    if len(argv) > 1:
        repo_root = Path(argv[1]).resolve()
    sbom = build_sbom(repo_root)
    json.dump(sbom, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    print(f"-> {len(sbom['components'])} components", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
