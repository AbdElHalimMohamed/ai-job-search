#!/usr/bin/env python3
"""Lint the repo's OpenCode skill, command, and config files.

Run from anywhere: python tools/lint_skills.py

Checks:
- Every SKILL.md (.opencode/skills/*, .agents/skills/*) has YAML frontmatter
  that parses, with non-empty `name` and `description` keys
- The skill name matches its parent directory and the description is within
  OpenCode's 1,024-character limit
- Skills do not carry Claude-only `allowed-tools`, `context`, or `tools` keys
- Every .opencode/commands/*.md starts with a `# /<name>` title
- opencode.json is valid JSON with `$schema`, `instructions`, `default_agent`,
  and a `permission` object

Exit code 0 on success, 1 with a failure list otherwise.
"""

import json
import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("lint_skills.py requires PyYAML: pip install pyyaml")

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []
FORBIDDEN_SKILL_KEYS = {"allowed-tools", "context", "tools", "enabled"}
ALLOWED_SKILL_KEYS = {"name", "description", "license", "compatibility", "metadata", "framework_version"}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def check_skill(path: Path) -> None:
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        errors.append(f"{rel(path)}: not valid UTF-8: {exc}")
        return
    if not text.startswith("---\n"):
        errors.append(f"{rel(path)}: missing YAML frontmatter (file must start with ---)")
        return
    end = text.find("\n---", 4)
    if end == -1:
        errors.append(f"{rel(path)}: unterminated YAML frontmatter")
        return
    try:
        data = yaml.safe_load(text[4:end])
    except yaml.YAMLError as exc:
        errors.append(f"{rel(path)}: frontmatter is not valid YAML: {exc}")
        return
    if not isinstance(data, dict):
        errors.append(f"{rel(path)}: frontmatter did not parse to a mapping")
        return
    for key in ("name", "description"):
        if not data.get(key):
            errors.append(f"{rel(path)}: frontmatter missing required key '{key}'")
    name = data.get("name")
    if isinstance(name, str) and name != path.parent.name:
        errors.append(f"{rel(path)}: name '{name}' does not match directory '{path.parent.name}'")
    description = data.get("description")
    if isinstance(description, str):
        length = len(description)
        if length > 1024:
            errors.append(f"{rel(path)}: description is {length} characters (OpenCode limit is 1,024)")
    forbidden = FORBIDDEN_SKILL_KEYS & set(data)
    if forbidden:
        errors.append(f"{rel(path)}: Claude-only frontmatter key(s): {sorted(forbidden)}")
    unexpected = set(data) - ALLOWED_SKILL_KEYS
    if unexpected:
        errors.append(f"{rel(path)}: unsupported frontmatter key(s): {sorted(unexpected)}")


def check_command(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    first = next((line for line in lines if line.startswith("# /")), "")
    if not first:
        errors.append(f"{rel(path)}: command file must contain a '# /<name>' title")
        return
    title = first[3:].strip().split()[0]
    if title != path.stem:
        errors.append(f"{rel(path)}: title '{title}' does not match filename '{path.stem}'")


def check_config() -> None:
    path = ROOT / "opencode.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"opencode.json: {exc}")
        return
    if not isinstance(data, dict):
        errors.append("opencode.json: expected top-level JSON value to be an object")
        return
    if data.get("$schema") != "https://opencode.ai/config.json":
        errors.append("opencode.json: missing or unexpected '$schema'")
    if not isinstance(data.get("instructions"), list):
        errors.append("opencode.json: expected 'instructions' to be a list")
    if not isinstance(data.get("default_agent"), str):
        errors.append("opencode.json: expected 'default_agent' to be a string")
    if not isinstance(data.get("permission"), dict):
        errors.append("opencode.json: expected 'permission' to be an object")


def main() -> int:
    skills = sorted(ROOT.glob(".opencode/skills/*/SKILL.md")) + sorted(ROOT.glob(".agents/skills/*/SKILL.md"))
    commands = sorted((ROOT / ".opencode" / "commands").glob("*.md"))
    if not skills:
        errors.append("no SKILL.md files found - glob roots are wrong or the tree moved")
    if not commands:
        errors.append("no command files found under .opencode/commands/")

    for skill in skills:
        check_skill(skill)
    for command in commands:
        check_command(command)
    check_config()

    if errors:
        print(f"lint_skills: {len(errors)} failure(s)")
        for err in errors:
            print(f"  - {err}")
        return 1
    print(f"lint_skills: OK ({len(skills)} skills, {len(commands)} commands, opencode.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
