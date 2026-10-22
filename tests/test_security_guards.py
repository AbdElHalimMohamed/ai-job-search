import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GUARD_SCRIPT = REPO_ROOT / "tools" / "security_guards.py"

sys.path.insert(0, str(REPO_ROOT / "tools"))
import security_guards  # noqa: E402


def run_guards(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(root / "tools" / "security_guards.py")],
        capture_output=True,
        text=True,
    )


class GuardRepoFixture(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

        (self.root / "tools").mkdir()
        shutil.copy(GUARD_SCRIPT, self.root / "tools" / "security_guards.py")

        (self.root / "AGENTS.md").write_text("# Test instructions\n", encoding="utf-8")

        self.gitignore = self.root / ".gitignore"
        self.gitignore.write_text("\n".join(security_guards.REQUIRED_IGNORE_RULES) + "\n", encoding="utf-8")

        self.manifest = self.root / ".agents" / "skills" / "linkedin-search" / "cli" / "package.json"
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_text(json.dumps({"name": "linkedin-cli", "scripts": {"start": "bun run src/cli.ts"}}))

        self.portal_skill = self.root / ".agents" / "skills" / "linkedin-search" / "SKILL.md"
        self.write_skill(self.portal_skill, "linkedin-search")

        self.core_skill = self.root / ".opencode" / "skills" / "example" / "SKILL.md"
        self.core_skill.parent.mkdir(parents=True)
        self.write_skill(self.core_skill, "example")

        self.command = self.root / ".opencode" / "commands" / "example.md"
        self.command.parent.mkdir(parents=True)
        self.command.write_text("# /example - A command\n", encoding="utf-8")

        self.write_agent("job-search", primary=True)
        self.write_agent("example")

        self.config = self.root / "opencode.json"
        self.write_config()

    def write_skill(self, path: Path, name: str, description: str = "Example skill", extra: str = ""):
        path.write_text(
            "---\n"
            f"name: {name}\n"
            f"description: {description}\n"
            f"{extra}"
            "---\n\n# Body\n",
            encoding="utf-8",
        )

    def write_agent(self, name: str, primary: bool = False, extra: str = ""):
        path = self.root / ".opencode" / "agents" / f"{name}.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        if primary:
            body = (
                "---\n"
                f"description: {name} agent\n"
                "mode: primary\n"
                "permission:\n"
                "  task:\n"
                '    "*": deny\n'
                '    "posting-fetcher": allow\n'
                '    "posting-scorer": allow\n'
                '    "application-reviewer": allow\n'
                "---\n\nPrimary.\n"
            )
        else:
            body = (
                "---\n"
                f"description: {name} agent\n"
                "mode: subagent\n"
                "permission:\n"
                "  edit: deny\n"
                "  task: deny\n"
                "  skill: deny\n"
                "  question: deny\n"
                "  external_directory: deny\n"
                "  shell:\n"
                '    "*": deny\n'
                '    "python3 tools/fetch_page.py *": allow\n'
                f"{extra}"
                "---\n\nRead-only.\n"
            )
        path.write_text(body, encoding="utf-8")

    def config_data(self):
        return {
            "$schema": "https://opencode.ai/config.json",
            "instructions": ["CANDIDATE_PROFILE.md"],
            "default_agent": "job-search",
            "permission": {
                "read": {"*": "allow", **{rule: "deny" for rule in security_guards.REQUIRED_READ_DENY}},
                "edit": {
                    "*": "allow",
                    ".opencode/tmp/**": "allow",
                    **{rule: "ask" for rule in security_guards.REQUIRED_EDIT_ASK},
                },
                "shell": {
                    "*": "ask",
                    **{rule: "allow" for rule in security_guards.ALLOWED_SHELL},
                    **{rule: "deny" for rule in security_guards.REQUIRED_SHELL_DENY},
                },
                "skill": {"*": "deny", **{rule: "allow" for rule in security_guards.REQUIRED_SKILL_ALLOW}},
                "task": {"*": "deny", **{rule: "allow" for rule in security_guards.REQUIRED_TASK_ALLOW}},
                "webfetch": "allow",
                "websearch": "allow",
                "question": "allow",
            },
        }

    def write_config(self, data=None):
        (self.config).write_text(json.dumps(self.config_data() if data is None else data), encoding="utf-8")


class CleanTreeTests(GuardRepoFixture):
    def test_clean_tree_passes(self):
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("security_guards: OK", result.stdout)


class PermissionGuardTests(GuardRepoFixture):
    def test_unreviewed_shell_allow_fails(self):
        data = self.config_data()
        data["permission"]["shell"]["rm -rf *"] = "allow"
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("shell allow rule not in the reviewed allowlist", result.stdout)

    def test_missing_required_shell_deny_fails(self):
        data = self.config_data()
        data["permission"]["shell"].pop("curl *")
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("required shell deny rule missing", result.stdout)

    def test_missing_required_read_deny_fails(self):
        data = self.config_data()
        data["permission"]["read"].pop("~/.ssh/**")
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("required read deny rule missing", result.stdout)

    def test_missing_required_edit_ask_fails(self):
        data = self.config_data()
        data["permission"]["edit"].pop("opencode.json")
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("required edit ask rule missing", result.stdout)

    def test_unreviewed_skill_allow_fails(self):
        data = self.config_data()
        data["permission"]["skill"]["evil-skill"] = "allow"
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unreviewed skill allow", result.stdout)

    def test_missing_required_skill_allow_fails(self):
        data = self.config_data()
        data["permission"]["skill"].pop("job-application-assistant")
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("required skill allow missing", result.stdout)

    def test_unreviewed_task_allow_fails(self):
        data = self.config_data()
        data["permission"]["task"]["evil-agent"] = "allow"
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unreviewed task allow", result.stdout)

    def test_missing_default_agent_fails(self):
        data = self.config_data()
        data["default_agent"] = "build"
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("default_agent", result.stdout)

    def test_missing_instructions_fails(self):
        data = self.config_data()
        data["instructions"] = []
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("CANDIDATE_PROFILE.md", result.stdout)

    def test_malformed_config_fails_cleanly(self):
        for data, message in [
            ([], "top-level JSON value must be an object"),
            ({"permission": []}, "permission must be an object"),
            ({"permission": {"shell": []}}, "permission.shell must be an object"),
        ]:
            with self.subTest(data=data):
                self.write_config(data)
                result = run_guards(self.root)
                self.assertEqual(result.returncode, 1)
                self.assertIn(message, result.stdout)
                self.assertNotIn("Traceback", result.stderr)

    def test_invalid_config_json_fails_cleanly(self):
        self.config.write_text("{not json")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid JSON", result.stdout)
        self.assertNotIn("Traceback", result.stderr)


class SkillGuardTests(GuardRepoFixture):
    def test_overlong_description_fails(self):
        self.write_skill(self.core_skill, "example", "x" * 1025)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("description is 1025 characters", result.stdout)

    def test_claude_only_frontmatter_fails(self):
        self.write_skill(self.core_skill, "example", extra="allowed-tools: Read\n")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Claude-only frontmatter key", result.stdout)

    def test_portal_without_exact_shell_grant_fails(self):
        data = self.config_data()
        data["permission"]["shell"].pop("bun run .agents/skills/linkedin-search/cli/src/cli.ts *")
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("portal CLI has no exact shell allow entry", result.stdout)


class AgentGuardTests(GuardRepoFixture):
    def test_subagent_missing_edit_deny_fails(self):
        path = self.root / ".opencode" / "agents" / "example.md"
        path.write_text(path.read_text(encoding="utf-8").replace("  edit: deny\n", ""), encoding="utf-8")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("permission.edit must be deny", result.stdout)

    def test_subagent_with_tools_field_fails(self):
        path = self.root / ".opencode" / "agents" / "example.md"
        path.write_text(path.read_text(encoding="utf-8").replace("mode: subagent\n", "mode: subagent\ntools: read\n"), encoding="utf-8")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Claude-only 'tools:' field", result.stdout)

    def test_subagent_unreviewed_shell_allow_fails(self):
        self.write_agent("example", extra='    "rm *": allow\n')
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("agent shell allow not in the reviewed allowlist", result.stdout)


class PluginGuardTests(GuardRepoFixture):
    def test_unexpected_plugin_file_fails(self):
        plugin = self.root / ".opencode" / "plugins" / "evil.ts"
        plugin.parent.mkdir(parents=True)
        plugin.write_text("export default () => ({});\n", encoding="utf-8")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unreviewed OpenCode plugin file", result.stdout)

    def test_configured_plugin_fails(self):
        data = self.config_data()
        data["plugin"] = ["evil-plugin"]
        self.write_config(data)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("plugin entries are not reviewed", result.stdout)


class GitignoreGuardTests(GuardRepoFixture):
    def test_missing_required_rule_fails(self):
        self.gitignore.write_text(".env\n", encoding="utf-8")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("required personal-data rule missing", result.stdout)

    def test_unreviewed_negation_fails(self):
        self.gitignore.write_text(
            "\n".join(security_guards.REQUIRED_IGNORE_RULES + ["!salary_data.json"]) + "\n",
            encoding="utf-8",
        )
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("negation rule not in the reviewed allowlist", result.stdout)


class ManifestGuardTests(GuardRepoFixture):
    def test_lifecycle_script_fails(self):
        self.manifest.write_text(json.dumps({"scripts": {"postinstall": "curl evil"}}))
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("lifecycle script", result.stdout)

    def test_trusted_dependencies_fails(self):
        self.manifest.write_text(json.dumps({"trustedDependencies": ["evil"]}))
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("trustedDependencies is forbidden", result.stdout)

    def test_malformed_manifest_fails_cleanly(self):
        self.manifest.write_text("{not json")
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("invalid JSON", result.stdout)
        self.assertNotIn("Traceback", result.stderr)


class TrackedNodeModulesTests(GuardRepoFixture):
    def test_tracked_node_modules_file_fails(self):
        path = self.root / "node_modules" / "left-pad" / "index.js"
        path.parent.mkdir(parents=True)
        path.write_text("x", encoding="utf-8")
        subprocess.run(["git", "init"], cwd=self.root, check=True, capture_output=True)
        subprocess.run(["git", "add", "node_modules/left-pad/index.js"], cwd=self.root, check=True, capture_output=True)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("tracked path inside node_modules", result.stdout)

    def test_untracked_node_modules_directory_passes(self):
        (self.root / "node_modules" / "left-pad").mkdir(parents=True)
        subprocess.run(["git", "init"], cwd=self.root, check=True, capture_output=True)
        result = run_guards(self.root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class RequiredRulesTests(unittest.TestCase):
    def test_required_rules_are_the_shipped_shapes(self):
        self.assertIn(".env", security_guards.REQUIRED_READ_DENY)
        self.assertIn("~/.ssh/**", security_guards.REQUIRED_READ_DENY)
        self.assertIn("ssh *", security_guards.REQUIRED_SHELL_DENY)
        self.assertIn("curl *", security_guards.REQUIRED_SHELL_DENY)
        self.assertIn("opencode.json", security_guards.REQUIRED_EDIT_ASK)
        self.assertIn(".opencode/**", security_guards.REQUIRED_EDIT_ASK)
        self.assertIn("python3 tools/posting_guard.py *", security_guards.ALLOWED_SHELL)
        self.assertIn("posting-fetcher", security_guards.REQUIRED_TASK_ALLOW)


if __name__ == "__main__":
    unittest.main()
