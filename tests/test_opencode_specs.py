"""Keep the runtime specs OpenCode-native.

The migration off Claude Code is easy to undo by accident: a copied paragraph
can reintroduce `WebFetch`, `${SCRATCHPAD}`, or a `.claude` path, and the
workflow then silently targets a file or tool that does not exist. This scans
the runtime specs, not the historical docs.
"""
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SPEC_DIRS = [REPO / ".opencode" / "commands", REPO / ".opencode" / "agents", REPO / ".opencode" / "skills"]
FORBIDDEN = {
    ".claude": "Claude runtime path",
    "CLAUDE.md": "Claude profile filename",
    "WebFetch": "Claude tool name (use webfetch)",
    "WebSearch": "Claude tool name (use websearch)",
    "AskUserQuestion": "Claude tool name (use question)",
    "subagent_type": "Claude subagent syntax (use the task tool)",
    "${SCRATCHPAD": "Claude scratchpad variable (use .opencode/tmp)",
    "allowed-tools": "Claude skill grant (use opencode.json permissions)",
    "context: fork": "Claude skill context mode",
}
FRONTMATTER = re.compile(r"^---\n(.*?)\n---", re.S)


def spec_files():
    for directory in SPEC_DIRS:
        for path in sorted(directory.rglob("*.md")):
            yield path


class OpenCodeSpecTests(unittest.TestCase):
    def test_no_claude_runtime_tokens(self):
        problems = []
        for path in spec_files():
            text = path.read_text(encoding="utf-8")
            for token, why in FORBIDDEN.items():
                if token in text:
                    problems.append(f"{path.relative_to(REPO)}: {token!r} ({why})")
        self.assertEqual(problems, [], "\n".join(problems))

    def test_commands_have_frontmatter_and_match_filenames(self):
        for path in (REPO / ".opencode" / "commands").glob("*.md"):
            text = path.read_text(encoding="utf-8")
            match = FRONTMATTER.match(text)
            self.assertIsNotNone(match, f"{path.name}: missing frontmatter")
            front = match.group(1)
            self.assertIn("description:", front, f"{path.name}: missing description")
            self.assertIn("agent: job-search", front, f"{path.name}: must run as job-search")
            heading = next((line for line in text.splitlines() if line.startswith("# /")), "")
            self.assertTrue(heading.startswith(f"# /{path.stem}"), f"{path.name}: wrong heading {heading!r}")

    def test_agents_declare_a_mode(self):
        for path in (REPO / ".opencode" / "agents").glob("*.md"):
            text = path.read_text(encoding="utf-8")
            self.assertIn("mode: ", text, f"{path.name}: missing mode")
            self.assertNotIn("tools:", text, f"{path.name}: use permission, not tools")

    def test_skill_descriptions_fit_opencode_limit(self):
        for path in spec_files():
            if path.name != "SKILL.md":
                continue
            match = FRONTMATTER.match(path.read_text(encoding="utf-8"))
            self.assertIsNotNone(match, f"{path}: missing frontmatter")
            description = re.search(r"^description:\s*(.*(?:\n[ \t]+.*)*)", match.group(1), re.M)
            self.assertIsNotNone(description, f"{path}: missing description")
            value = " ".join(line.strip() for line in description.group(1).splitlines())
            value = re.sub(r"^>\s*", "", value)
            self.assertLessEqual(len(value), 1024, f"{path}: description is {len(value)} characters")


if __name__ == "__main__":
    unittest.main()
