"""Where the posting integrity gate (tools/posting_guard.py) is wired beyond /apply
Step 0 and /rank Step 2: the archive, /interview, and the trust-boundary rules.

Why this test exists: a gate that only runs in one place is bypassed the moment
a posting reaches the workflow another way - from the archive in /interview, or
pasted by hand. These pins keep each entry point naming the gate, and keep the
archive free of the excerpts the gate removed (counts only), so a stripped
payload is never re-read by a later session.
"""
import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APPLY = REPO / ".opencode" / "commands" / "apply.md"
INTERVIEW = REPO / ".opencode" / "commands" / "interview.md"
RESEARCH = REPO / ".opencode" / "skills" / "job-application-assistant" / "09-web-research.md"


class ArchiveWiring(unittest.TestCase):
    def setUp(self):
        text = APPLY.read_text(encoding="utf-8")
        self.step6b = re.search(r"### Step 6b: Record the Application(.*?)(?=### Application-Form Fields)", text, re.DOTALL).group(1)

    def test_archive_stores_cleaned_text_with_counts_only(self):
        item7 = re.search(r"7\. \*\*Archive the posting now\.\*\*(.*?)(?=\n\n|\Z)", self.step6b, re.DOTALL).group(1)
        self.assertIn("verbatim", item7)  # still never a summary (test_apply_records_application pins it too)
        self.assertIn("posting_guard", item7)
        self.assertIn("counts", item7)
        self.assertRegex(item7, r"never .*excerpt", "removed content must not be re-archived as quotes")


class InterviewWiring(unittest.TestCase):
    def test_step1_gates_the_archived_posting_in_text_mode(self):
        text = INTERVIEW.read_text(encoding="utf-8")
        step1 = re.search(r"## Step 1: Load the Application Context(.*?)(?=\n## Step 2)", text, re.DOTALL).group(1)
        self.assertIn("posting_guard", step1)
        self.assertIn("--text", step1)


class OtherFrontDoors(unittest.TestCase):
    """The skill's own Step 1, /outcome's fresh-fetch archive and /interview's
    fetch fallback are the other places a posting enters; each names the gate."""

    def test_skill_step1_names_the_gate(self):
        text = (REPO / ".opencode" / "skills" / "job-application-assistant" / "SKILL.md").read_text(encoding="utf-8")
        step1 = re.search(r"### Step 1: Research & Evaluate Fit(.*?)(?=### Step 2)", text, re.DOTALL).group(1)
        self.assertIn("posting_guard", step1)
        self.assertIn("framework_version: 1.3.6", text)

    def test_outcome_fresh_fetch_is_gated(self):
        text = (REPO / ".opencode" / "commands" / "outcome.md").read_text(encoding="utf-8")
        self.assertIn("posting_guard", text)

    def test_interview_fetch_fallback_is_gated(self):
        text = INTERVIEW.read_text(encoding="utf-8")
        step1 = re.search(r"## Step 1: Load the Application Context(.*?)(?=\n## Step 2)", text, re.DOTALL).group(1)
        fallback = re.search(r"2\. \*\*Fallbacks\*\*(.*?)(?=\n3\. )", step1, re.DOTALL).group(1)
        self.assertIn("posting_guard", fallback)

    def test_posting_files_use_the_opencode_scratchpad_or_stdout(self):
        cases = [
            (APPLY, ".opencode/tmp/"),
            (REPO / ".opencode" / "agents" / "posting-fetcher.md", "--guard"),
            (REPO / ".opencode" / "agents" / "posting-scorer.md", "--guard"),
        ]
        for path, needle in cases:
            text = path.read_text(encoding="utf-8")
            with self.subTest(path=path.name):
                self.assertNotIn("$SCRATCHPAD", text, "Claude's SCRATCHPAD variable does not exist in OpenCode")
                self.assertIn(needle, text)

    def test_fetch_agents_can_discover_installed_portals(self):
        for name in ("posting-fetcher.md", "posting-scorer.md"):
            text = (REPO / ".opencode" / "agents" / name).read_text(encoding="utf-8")
            with self.subTest(agent=name):
                self.assertIn("glob", text, "rung 1 needs to find .agents/skills/*/SKILL.md")
                self.assertIn(".agents/skills/*/SKILL.md", text)


class TrustBoundaryWiring(unittest.TestCase):
    def test_09_trust_boundary_names_the_gate(self):
        text = RESEARCH.read_text(encoding="utf-8")
        boundary = re.search(r"## Trust boundary(.*?)(?=\n## )", text, re.DOTALL).group(1)
        self.assertIn("posting_guard", boundary)
        self.assertIn("framework_version: 1.1.7", text)


if __name__ == "__main__":
    unittest.main()
