"""Guards for the /add-portal command spec."""
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
COMMAND = REPO / ".opencode" / "commands" / "add-portal.md"


class TestAddPortalCommand(unittest.TestCase):
    def test_generated_skill_is_opencode_compatible(self):
        content = COMMAND.read_text(encoding="utf-8")
        self.assertIn("OpenCode's 1,024-character description limit", content)
        self.assertIn("Do not add tool-grant frontmatter", content)
        self.assertNotIn("allowed-tools: Bash(bun run .agents/skills/<name>/cli/src/cli.ts *)", content)

    def test_registration_updates_shell_permission_and_guard(self):
        content = COMMAND.read_text(encoding="utf-8")
        self.assertIn('"bun run .agents/skills/<name>/cli/src/cli.ts *": "allow"', content)
        self.assertIn("ALLOWED_SHELL", content)
        self.assertIn("permission.shell", content)
        self.assertNotIn("permissions.allow", content)


if __name__ == "__main__":
    unittest.main()
