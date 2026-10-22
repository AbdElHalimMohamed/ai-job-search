#!/usr/bin/env python3
"""Supply-chain guards for the OpenCode runtime and the template's riskiest surfaces.

Run from anywhere: python tools/security_guards.py

Checks:
1. opencode.json — schema, required instructions/default agent, and the exact
   reviewed permission allowlists for shell, skills, tasks, reads, and edits.
   Catches permission widening: a new shell command, a broad skill grant, or a
   removed credential-read deny is a failure until this file is updated too.
2. .gitignore — the personal-data ignore rules must still be present, and no
   un-allowlisted negation may re-include them.
3. .agents/**/package.json — no npm/bun lifecycle scripts (preinstall, install,
   postinstall, prepare, prepack) and no trustedDependencies.
4. Skills — every SKILL.md has a name matching its directory, a description
   within OpenCode's 1,024-character limit, no Claude-only frontmatter, and
   every portal skill has an exact shell grant for its own CLI and a permission.skill allow entry.
5. Agents — every .opencode/agents/*.md declares its mode; read-only subagents
   must deny edit/task/skill/question/external-directory access and allow only
   the reviewed fetch/guard shell commands. No `tools:` compatibility field.
6. Plugins — no unexpected OpenCode plugin files or configured plugins.

Stdlib only. Exit 0 on success, 1 with a failure list otherwise.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []

ALLOWED_SHELL = {
    "bun --version",
    "bun run .agents/skills/linkedin-search/cli/src/cli.ts *",
    "bun run .agents/skills/freehire-search/cli/src/cli.ts *",
    "bun run .agents/skills/ycombinator-search/cli/src/cli.ts *",
    "bun run .agents/skills/weworkremotely-search/cli/src/cli.ts *",
    "bun run .agents/skills/remoteok-search/cli/src/cli.ts *",
    "bun run .agents/skills/otta-search/cli/src/cli.ts *",
    "bun run .agents/skills/himalayas-search/cli/src/cli.ts *",
    "bun run .agents/skills/indeed-search/cli/src/cli.ts *",
    "python3 tools/rank_state.py *",
    "python3 tools/job_key.py *",
    "python3 tools/scrape_state.py *",
    "python3 tools/verify_pdf.py *",
    "python3 tools/verify_layout.py *",
    "python3 tools/robots_check.py *",
    "python3 tools/fetch_page.py *",
    "python3 tools/posting_guard.py *",
    "python3 salary_lookup.py *",
    "python salary_lookup.py *",
    "pdftotext *",
}

REQUIRED_SHELL_DENY = {
    "curl *",
    "wget *",
    "scp *",
    "sftp *",
    "ssh *",
    "nc *",
    "ncat *",
    "netcat *",
}

REQUIRED_READ_DENY = {
    ".env",
    ".env.*",
    "~/.ssh/**",
    "~/.aws/**",
    "~/.gnupg/**",
}

REQUIRED_EDIT_ASK = {
    "opencode.json",
    ".opencode/**",
    ".github/**",
    "tools/security_guards.py",
    "AGENTS.md",
}

REQUIRED_SKILL_ALLOW = {
    "job-application-assistant",
    "scrape",
    "upskill",
    "linkedin-search",
    "freehire-search",
    "ycombinator-search",
    "weworkremotely-search",
    "remoteok-search",
    "otta-search",
    "himalayas-search",
    "indeed-search",
}

REQUIRED_TASK_ALLOW = {
    "posting-fetcher",
    "posting-scorer",
    "application-reviewer",
}

ALLOWED_AGENT_SHELL = {
    "bun run .agents/skills/linkedin-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/freehire-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/ycombinator-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/weworkremotely-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/remoteok-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/otta-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/himalayas-search/cli/src/cli.ts detail *",
    "bun run .agents/skills/indeed-search/cli/src/cli.ts detail *",
    "python3 tools/fetch_page.py *",
    "python3 tools/robots_check.py *",
    "python3 tools/posting_guard.py *",
}

FORBIDDEN_SKILL_KEYS = {"allowed-tools", "context", "tools", "enabled"}
REQUIRED_IGNORE_RULES = [
    "salary_data.json",
    "**/job_scraper/seen_jobs.json",
    "**/job_scraper/notion_sync.json",
    "**/job_scraper/*.md",
    "*_BehavioralReport.pdf",
    "linkedin_Profile.pdf",
    "cv/main_*.*",
    "!cv/main_example.tex",
    "cv/*.txt",
    "cover_letters/cover_*.*",
    "cover_letters/Cover_*.*",
    "documents/cv/**",
    "documents/linkedin/**",
    "documents/diplomas/**",
    "documents/references/**",
    "documents/projects/**",
    "documents/applications/**",
    "documents/postings/**",
    "documents/interview/**",
    "job_search_tracker.csv",
    "gmail_sync/",
    "reports/",
    "upskill/*.md",
    "**/upskill/report-*.md",
    ".env",
    ".env.*",
    "company_research/*.json",
    ".opencode/tmp/*",
]
ALLOWED_IGNORE_NEGATIONS = {
    "!cover_letters/OpenFonts/fonts/**",
    "!cv/main_example.tex",
    "!cover_letters/cover_example.tex",
    "!documents/**/.gitkeep",
    "!.opencode/tmp/.gitkeep",
}
FORBIDDEN_SCRIPTS = {"preinstall", "install", "postinstall", "prepare", "prepack"}

_FRONTMATTER_KEY = re.compile(r"^([A-Za-z0-9_-]+):\s*(.*)$")


def _frontmatter(text: str):
    text = text.lstrip("\ufeff")
    if not text.startswith("---"):
        return None
    lines = text.splitlines()
    end = next((i for i in range(1, len(lines)) if lines[i].strip() == "---"), None)
    if end is None:
        return None
    data: dict = {}
    key = None
    for raw in lines[1:end]:
        if raw[:1] in (" ", "\t"):
            if key is None:
                continue
            stripped = raw.strip()
            if stripped.startswith("- "):
                if not isinstance(data[key], list):
                    data[key] = []
                data[key].append(stripped[2:].strip())
            elif isinstance(data[key], str):
                data[key] = (data[key] + " " + stripped).strip()
            continue
        match = _FRONTMATTER_KEY.match(raw)
        if not match:
            key = None
            continue
        key, value = match.group(1), match.group(2).strip()
        data[key] = "" if value in (">", "|", ">-", "|-") else value
    return data


def _frontmatter_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    end = text.find("\n---", 4)
    return text[4:end] if text.startswith("---\n") and end != -1 else ""


def _check_mapping(permission: dict, key: str):
    value = permission.get(key)
    if not isinstance(value, dict):
        errors.append(f"opencode.json: permission.{key} must be an object")
        return None
    return value


def check_opencode_config() -> None:
    path = ROOT / "opencode.json"
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"opencode.json: unreadable or invalid JSON: {exc}")
        return
    if not isinstance(data, dict):
        errors.append("opencode.json: top-level JSON value must be an object")
        return
    if data.get("$schema") != "https://opencode.ai/config.json":
        errors.append("opencode.json: missing or unexpected '$schema'")
    instructions = data.get("instructions")
    if not isinstance(instructions, list) or "CANDIDATE_PROFILE.md" not in instructions:
        errors.append("opencode.json: instructions must include CANDIDATE_PROFILE.md")
    if not (ROOT / "AGENTS.md").is_file():
        errors.append("AGENTS.md is missing; OpenCode loads it automatically")
    if data.get("default_agent") != "job-search":
        errors.append("opencode.json: default_agent must be 'job-search'")
    if not (ROOT / ".opencode" / "agents" / "job-search.md").is_file():
        errors.append("opencode.json: default agent file .opencode/agents/job-search.md is missing")
    if "hooks" in data:
        errors.append("opencode.json: hooks are not supported; use a reviewed plugin instead")
    plugin = data.get("plugin", [])
    if plugin not in ([], None):
        errors.append(f"opencode.json: plugin entries are not reviewed: {plugin!r}")

    permission = data.get("permission")
    if not isinstance(permission, dict):
        errors.append("opencode.json: permission must be an object")
        return

    read = _check_mapping(permission, "read")
    if read is not None:
        if read.get("*") != "allow":
            errors.append("opencode.json: permission.read['*'] must be 'allow'")
        for rule in REQUIRED_READ_DENY:
            if read.get(rule) != "deny":
                errors.append(f"opencode.json: required read deny rule missing: {rule!r}")
        for rule, action in read.items():
            if rule != "*" and rule not in REQUIRED_READ_DENY and action == "allow":
                errors.append(f"opencode.json: unreviewed read allow rule: {rule!r}")

    edit = _check_mapping(permission, "edit")
    if edit is not None:
        if edit.get("*") != "allow":
            errors.append("opencode.json: permission.edit['*'] must be 'allow'")
        if edit.get(".opencode/tmp/**") != "allow":
            errors.append("opencode.json: permission.edit['.opencode/tmp/**'] must be 'allow'")
        for rule in REQUIRED_EDIT_ASK:
            if edit.get(rule) != "ask":
                errors.append(f"opencode.json: required edit ask rule missing: {rule!r}")
        for rule, action in edit.items():
            if rule not in {"*", ".opencode/tmp/**"} and action == "allow" and rule not in REQUIRED_EDIT_ASK:
                errors.append(f"opencode.json: unreviewed edit allow rule: {rule!r}")

    shell = _check_mapping(permission, "shell")
    if shell is not None:
        if shell.get("*") != "ask":
            errors.append("opencode.json: permission.shell['*'] must be 'ask'")
        allows = {rule for rule, action in shell.items() if action == "allow"}
        for rule in sorted(allows - ALLOWED_SHELL):
            errors.append(f"opencode.json: shell allow rule not in the reviewed allowlist: {rule!r}")
        for rule in sorted(REQUIRED_SHELL_DENY):
            if shell.get(rule) != "deny":
                errors.append(f"opencode.json: required shell deny rule missing: {rule!r}")
        for rule, action in shell.items():
            if action == "allow" and rule not in ALLOWED_SHELL:
                errors.append(f"opencode.json: unreviewed shell allow rule: {rule!r}")

    skill = _check_mapping(permission, "skill")
    if skill is not None:
        if skill.get("*") != "deny":
            errors.append("opencode.json: permission.skill['*'] must be 'deny'")
        for name in sorted(REQUIRED_SKILL_ALLOW):
            if skill.get(name) != "allow":
                errors.append(f"opencode.json: required skill allow missing: {name!r}")
        for name, action in skill.items():
            if action == "allow" and name not in REQUIRED_SKILL_ALLOW:
                errors.append(f"opencode.json: unreviewed skill allow: {name!r}")

    task = _check_mapping(permission, "task")
    if task is not None:
        if task.get("*") != "deny":
            errors.append("opencode.json: permission.task['*'] must be 'deny'")
        for name in sorted(REQUIRED_TASK_ALLOW):
            if task.get(name) != "allow":
                errors.append(f"opencode.json: required task allow missing: {name!r}")
        for name, action in task.items():
            if action == "allow" and name not in REQUIRED_TASK_ALLOW:
                errors.append(f"opencode.json: unreviewed task allow: {name!r}")

    for key in ("webfetch", "websearch", "question"):
        if permission.get(key) != "allow":
            errors.append(f"opencode.json: permission.{key} must be 'allow'")


def check_skills() -> None:
    shell = {}
    skill_permissions = {}
    try:
        config = json.loads((ROOT / "opencode.json").read_text(encoding="utf-8"))
        permission = config.get("permission", {}) if isinstance(config, dict) else {}
        shell = permission.get("shell", {}) if isinstance(permission, dict) else {}
        skill_permissions = permission.get("skill", {}) if isinstance(permission, dict) else {}
        if not isinstance(shell, dict):
            shell = {}
        if not isinstance(skill_permissions, dict):
            skill_permissions = {}
    except (OSError, json.JSONDecodeError):
        pass

    skills = sorted(ROOT.glob(".opencode/skills/*/SKILL.md")) + sorted(ROOT.glob(".agents/skills/*/SKILL.md"))
    if not skills:
        errors.append("no SKILL.md files found - glob roots are wrong or the tree moved")
    for path in skills:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        data = _frontmatter(text)
        if data is None:
            errors.append(f"{rel}: missing or unterminated frontmatter (expected --- ... ---)")
            continue
        if not data.get("name") or not data.get("description"):
            errors.append(f"{rel}: frontmatter must include name and description")
            continue
        if data["name"] != path.parent.name:
            errors.append(f"{rel}: name {data['name']!r} does not match directory {path.parent.name!r}")
        description = data.get("description", "")
        if len(description) > 1024:
            errors.append(f"{rel}: description is {len(description)} characters (limit is 1,024)")
        for key in FORBIDDEN_SKILL_KEYS & set(data):
            errors.append(f"{rel}: Claude-only frontmatter key: {key!r}")
        if path.parent.parent == ROOT / ".agents" / "skills":
            rule = f"bun run .agents/skills/{path.parent.name}/cli/src/cli.ts *"
            if shell.get(rule) != "allow":
                errors.append(f"{rel}: portal CLI has no exact shell allow entry: {rule!r}")
            if skill_permissions.get(path.parent.name) != "allow":
                errors.append(f"{rel}: portal skill has no permission.skill allow entry")


def check_agents() -> None:
    agents = sorted((ROOT / ".opencode" / "agents").glob("*.md"))
    if not agents:
        errors.append("no agent files found under .opencode/agents/")
    for path in agents:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        fm = _frontmatter_text(path)
        data = _frontmatter(text)
        if data is None:
            errors.append(f"{rel}: missing or unterminated frontmatter")
            continue
        if "tools" in data:
            errors.append(f"{rel}: Claude-only 'tools:' field; use permission blocks")
        mode = data.get("mode")
        if path.stem == "job-search":
            if mode != "primary":
                errors.append(f"{rel}: job-search must be mode: primary")
            for subagent in ("posting-fetcher", "posting-scorer", "application-reviewer"):
                if not re.search(rf'^\s{{4}}"??{subagent}"??\s*:\s*"?allow"?\s*$', fm, re.M):
                    errors.append(f"{rel}: job-search must allow the {subagent} subagent")
            continue
        if mode != "subagent":
            errors.append(f"{rel}: read-only agents must be mode: subagent")
        for key in ("edit", "task", "skill", "question", "external_directory"):
            if not re.search(rf"^\s{{2}}{key}:\s*deny\s*$", fm, re.M):
                errors.append(f"{rel}: permission.{key} must be deny")
        if not re.search(r"^\s{4}\"\*\":\s*deny\s*$", fm, re.M):
            errors.append(f"{rel}: shell permission must deny by default")
        allows = set(re.findall(r"^\s{4}\"([^\"]+)\":\s*allow\s*$", fm, re.M))
        for rule in sorted(allows - ALLOWED_AGENT_SHELL):
            errors.append(f"{rel}: agent shell allow not in the reviewed allowlist: {rule!r}")


def check_gitignore() -> None:
    path = ROOT / ".gitignore"
    try:
        lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
    except OSError as exc:
        errors.append(f".gitignore: unreadable: {exc}")
        return
    rules = set(lines)
    for rule in REQUIRED_IGNORE_RULES:
        if rule not in rules:
            errors.append(f".gitignore: required personal-data rule missing: {rule!r}")
    for line in lines:
        if line.startswith("!") and line not in ALLOWED_IGNORE_NEGATIONS:
            errors.append(f".gitignore: negation rule not in the reviewed allowlist: {line!r}")


def check_package_manifests() -> None:
    manifests = [p for p in ROOT.glob(".agents/**/package.json") if "node_modules" not in p.parts]
    if not manifests:
        errors.append(".agents: no package.json files found - glob roots are wrong or the tree moved")
    for manifest in manifests:
        relpath = manifest.relative_to(ROOT)
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{relpath}: unreadable or invalid JSON: {exc}")
            continue
        if not isinstance(data, dict):
            errors.append(f"{relpath}: top-level JSON value must be an object")
            continue
        scripts = data.get("scripts", {})
        if not isinstance(scripts, dict):
            errors.append(f"{relpath}: scripts must be an object")
            continue
        bad = FORBIDDEN_SCRIPTS & set(scripts)
        if bad:
            errors.append(f"{relpath}: lifecycle script(s) {sorted(bad)} are forbidden")
        if "trustedDependencies" in data:
            errors.append(f"{relpath}: trustedDependencies is forbidden")


def check_tracked_node_modules() -> None:
    try:
        proc = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=False)
    except OSError:
        return
    if proc.returncode != 0:
        return
    for rel in proc.stdout.decode("utf-8", errors="replace").split("\x00"):
        if rel and "node_modules" in rel.split("/"):
            errors.append(f"tracked path inside node_modules: {rel!r}")


def check_plugins() -> None:
    dirs = [ROOT / ".opencode" / "plugin", ROOT / ".opencode" / "plugins"]
    for directory in dirs:
        if not directory.exists():
            continue
        for path in sorted(directory.glob("*")):
            if path.name in {".gitkeep", ".DS_Store"}:
                continue
            if path.is_file():
                errors.append(f"unreviewed OpenCode plugin file: {path.relative_to(ROOT).as_posix()}")


def main() -> int:
    check_opencode_config()
    check_gitignore()
    check_package_manifests()
    check_tracked_node_modules()
    check_skills()
    check_agents()
    check_plugins()
    if errors:
        print(f"security_guards: {len(errors)} failure(s)")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("security_guards: OK (opencode.json permissions, gitignore rules, package manifests, no tracked node_modules, skill metadata, agent permissions, no plugins)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
