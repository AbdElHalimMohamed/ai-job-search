import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
LINTER_SCRIPT = REPO_ROOT / "tools" / "lint_skills.py"


def run_linter(root: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(root / "tools" / "lint_skills.py")],
        capture_output=True,
        text=True,
    )


class LinterRepoFixture(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

        tools = self.root / "tools"
        tools.mkdir()
        shutil.copy(LINTER_SCRIPT, tools / "lint_skills.py")
        (tools / "yaml.py").write_text(
            "class YAMLError(Exception):\n"
            "    pass\n\n"
            "def safe_load(text):\n"
            "    result = {}\n"
            "    key = None\n"
            "    for line in (text or '').splitlines():\n"
            "        if line[:1] in (' ', '\\t'):\n"
            "            if key is not None:\n"
            "                result[key] = (result[key] + ' ' + line.strip()).strip()\n"
            "            continue\n"
            "        if ':' in line:\n"
            "            key, _, value = line.partition(':')\n"
            "            key = key.strip()\n"
            "            result[key] = value.strip()\n"
            "    return result\n",
            encoding="utf-8",
        )

        command = self.root / ".opencode" / "commands" / "setup.md"
        command.parent.mkdir(parents=True)
        command.write_text("# /setup - Test setup command\n", encoding="utf-8")

        self.skill = self.root / ".opencode" / "skills" / "example" / "SKILL.md"
        self.skill.parent.mkdir(parents=True)
        self.write_skill(self.skill, "example")

        portal = self.root / ".agents" / "skills" / "example-search" / "SKILL.md"
        portal.parent.mkdir(parents=True)
        self.write_skill(portal, "example-search")

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

    def write_config(self, **overrides):
        data = {
            "$schema": "https://opencode.ai/config.json",
            "instructions": ["CANDIDATE_PROFILE.md"],
            "default_agent": "job-search",
            "permission": {},
        }
        data.update(overrides)
        self.config.write_text(json.dumps(data), encoding="utf-8")


class CleanTreeTests(LinterRepoFixture):
    def test_clean_tree_passes(self):
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("lint_skills: OK", result.stdout)


class SkillTests(LinterRepoFixture):
    def test_missing_frontmatter_fails_cleanly(self):
        self.skill.write_text("# no frontmatter\n", encoding="utf-8")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing YAML frontmatter", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_missing_name_or_description_fails(self):
        self.skill.write_text("---\nname: example\n---\n", encoding="utf-8")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("missing required key 'description'", result.stdout)

    def test_name_must_match_directory(self):
        self.write_skill(self.skill, "other")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not match directory", result.stdout)

    def test_description_over_1024_fails(self):
        self.write_skill(self.skill, "example", "x" * 1025)
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("limit is 1,024", result.stdout)

    def test_claude_only_frontmatter_fails(self):
        self.write_skill(self.skill, "example", extra="allowed-tools: Read\n")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("Claude-only frontmatter", result.stdout)

    def test_unsupported_frontmatter_fails(self):
        self.write_skill(self.skill, "example", extra="version: 1.0.0\n")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("unsupported frontmatter key", result.stdout)

    def test_agents_skill_is_linted_too(self):
        portal = self.root / ".agents" / "skills" / "example-search" / "SKILL.md"
        self.write_skill(portal, "wrong-name")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn(".agents/skills/example-search", result.stdout)

    def test_non_utf8_skill_fails_cleanly(self):
        self.skill.write_bytes(b"---\nname: example\nallowed-tools: Read\ndescription: caf\xe9\n---\n")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Traceback", result.stderr)


class CommandTests(LinterRepoFixture):
    def test_missing_title_fails(self):
        path = self.root / ".opencode" / "commands" / "setup.md"
        path.write_text("No title\n", encoding="utf-8")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("must contain a '# /<name>' title", result.stdout)

    def test_filename_must_match_title(self):
        path = self.root / ".opencode" / "commands" / "setup.md"
        path.write_text("# /other - Wrong name\n", encoding="utf-8")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("does not match filename", result.stdout)


class ConfigTests(LinterRepoFixture):
    def test_invalid_json_fails_cleanly(self):
        self.config.write_text("{not json", encoding="utf-8")
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("opencode.json", result.stdout)
        self.assertNotIn("Traceback", result.stderr)

    def test_missing_schema_fails(self):
        self.write_config(**{"$schema": ""})
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("$schema", result.stdout)

    def test_missing_default_agent_fails(self):
        self.write_config(default_agent=None)
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("default_agent", result.stdout)

    def test_missing_permission_fails(self):
        self.write_config(permission=None)
        result = run_linter(self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("permission", result.stdout)


if __name__ == "__main__":
    unittest.main()
