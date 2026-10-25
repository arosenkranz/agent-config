#!/usr/bin/env python3
"""Install a reviewed Matt Pocock revision once, shared by Claude Code and pi.

Uses the pinned skills CLI for copying and its upstream source lock, then
moves those copies to the shared directory and creates Claude links explicitly.
Refuses existing skills it doesn't own. Updates need an explicit migration,
not an unattended `skills update`. Python 3.10+, Node 22.20+, and npm required.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

MANIFEST = (
    Path(__file__).resolve().parents[1] / "config-templates/matt-pocock-skills.json"
)


def receipt_path(home: Path) -> Path:
    return home / ".local/state/agent-config/matt-pocock-skills.json"


def exists(path: Path) -> bool:
    return path.exists() or path.is_symlink()


def remove(path: Path) -> None:
    if path.is_symlink() or path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)


def snapshot(manifest: dict, home: Path) -> dict[str, str]:
    """Validate one shared copy and preserve all bundled-file hashes."""
    hashes = {}
    for name in manifest["skills"]:
        canonical = home / ".agents/skills" / name
        link = home / ".claude/skills" / name
        if canonical.is_symlink() or not canonical.is_dir():
            raise RuntimeError(f"Missing canonical skill directory: {canonical}")
        if not link.is_symlink() or link.resolve() != canonical.resolve():
            raise RuntimeError(f"Expected a Claude link to the shared skill: {link}")
        if exists(home / ".pi/agent/skills" / name):
            raise RuntimeError(f"Duplicate pi skill: {name}")
        text = (canonical / "SKILL.md").read_text()
        frontmatter = text.split("---", 2)[1] if text.startswith("---\n") else ""
        if not re.search(rf"^name: {re.escape(name)}$", frontmatter, re.MULTILINE):
            raise RuntimeError(f"Unexpected skill name: {name}")
        explicit = bool(
            re.search(r"^disable-model-invocation: true$", frontmatter, re.MULTILINE)
        )
        if explicit != (name in manifest["explicitOnly"]):
            raise RuntimeError(f"Unexpected model invocation setting: {name}")
        for file in sorted(canonical.rglob("*")):
            if file.is_symlink():
                raise RuntimeError(f"Unexpected link inside shared skill: {file}")
            if file.is_file():
                key = f"{name}/{file.relative_to(canonical)}"
                hashes[key] = hashlib.sha256(file.read_bytes()).hexdigest()
    return hashes


def validate_manifest(manifest: dict) -> None:
    names = manifest["skills"]
    if not names or len(names) != len(set(names)):
        raise ValueError("The reviewed skill selection must be nonempty and unique")
    if any(not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name) for name in names):
        raise ValueError("Unsafe skill name")
    if not set(manifest["explicitOnly"]).issubset(names):
        raise ValueError("Explicit-only skills must belong to the selection")
    if manifest["repository"] != "mattpocock/skills":
        raise ValueError("Expected the reviewed mattpocock/skills repository")
    if not re.fullmatch(r"[0-9a-f]{40}", manifest["revision"]):
        raise ValueError("Pin the upstream revision to a full commit SHA")
    if not re.fullmatch(r"\d+\.\d+\.\d+", manifest["skillsCliVersion"]):
        raise ValueError("Pin the skills CLI to an exact version")


def install(
    manifest: dict,
    home: Path,
    check_only: bool = False,
    run: Callable = subprocess.run,
) -> bool:
    validate_manifest(manifest)
    settings_path = home / ".claude/settings.json"
    if settings_path.exists():
        plugins = json.loads(settings_path.read_text()).get("enabledPlugins", {})
        if any(
            key.startswith("mattpocock-skills@") and enabled
            for key, enabled in plugins.items()
        ):
            raise RuntimeError(
                "Disable the Matt Pocock plugin before installing shared skills"
            )

    receipt = receipt_path(home)
    if receipt.exists():
        previous = json.loads(receipt.read_text())
        if previous["manifest"] != manifest:
            raise RuntimeError(
                "Reviewed revision/selection changed; back up and migrate the old install first"
            )
        if snapshot(manifest, home) != previous["hashes"]:
            raise RuntimeError(
                "Installed skill files changed; preserve local edits before reinstalling"
            )
        return True
    if check_only:
        raise RuntimeError("Matt Pocock skills are not installed by this installer")

    targets = [
        home / base / name
        for base in [".agents/skills", ".claude/skills", ".pi/agent/skills"]
        for name in manifest["skills"]
    ]
    for target in targets:
        if exists(target):
            raise RuntimeError(f"Refusing to overwrite an unmanaged skill: {target}")

    # The CLI updates a global source lock shared with unrelated skills. Restore
    # that lock too if installation or post-install validation fails.
    lock = home / ".agents/.skill-lock.json"
    old_lock = lock.read_bytes() if lock.exists() else None
    command = [
        "npx",
        "--yes",
        f"skills@{manifest['skillsCliVersion']}",
        "add",
        f"https://github.com/{manifest['repository']}/tree/{manifest['revision']}",
        "--global",
        "--agent",
        "claude-code",
        "--copy",
        "--skill",
        *manifest["skills"],
        "--yes",
    ]
    try:
        run(
            command,
            check=True,
            env={**os.environ, "HOME": str(home), "DISABLE_TELEMETRY": "1"},
        )
        for name in manifest["skills"]:
            copied = home / ".claude/skills" / name
            canonical = home / ".agents/skills" / name
            if copied.is_symlink() or not copied.is_dir() or exists(canonical):
                raise RuntimeError(
                    f"Expected a fresh Claude copy before linking: {name}"
                )
            canonical.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(copied), canonical)
            copied.symlink_to(canonical, target_is_directory=True)
        hashes = snapshot(manifest, home)
        receipt.parent.mkdir(parents=True, exist_ok=True)
        receipt.write_text(
            json.dumps({"manifest": manifest, "hashes": hashes}, indent=2) + "\n"
        )
    except BaseException:
        # All these paths were absent before our CLI call. Other skills stay put.
        for target in targets:
            remove(target)
        if old_lock is None:
            lock.unlink(missing_ok=True)
        else:
            lock.write_bytes(old_lock)
        receipt.unlink(missing_ok=True)
        raise
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the managed files and links without installing",
    )
    args = parser.parse_args()
    try:
        manifest = json.loads(MANIFEST.read_text())
        existing = install(manifest, Path.home(), args.check)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(f"Matt skills: {error}", file=sys.stderr)
        return 1
    print(
        f"{'Verified' if existing else 'Installed'} {len(manifest['skills'])} shared skills at {manifest['revision']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
