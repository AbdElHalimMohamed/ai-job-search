# Security Policy

## Reporting a vulnerability

Please report security findings privately via **[GitHub private vulnerability reporting](https://github.com/MadsLorentzen/ai-job-search/security/advisories/new)** rather than a public issue. You will get a response within a few days, credit in the fix unless you prefer otherwise, and public disclosure coordinated with the patch.

If the private form is unavailable, open a public issue that describes the *class* of problem without a working recipe, and note that you have details to share privately.

## Threat model, honestly stated

This is an agentic workflow: an LLM with file access reads untrusted web content (job postings) alongside your personal data (CV, profile, application history). That combination is the main risk surface, and it cannot be fully eliminated - only narrowed. A posting can carry hidden text written to steer the agent. The framework answers that on two levels: instruction-level rules that tell the agent how to treat postings, and permission-level rules that bound what the agent can do even if it is steered.

### Instruction level

`/apply`, `/rank`, `/scrape`, `/interview` and the skill's own `09-web-research.md` treat posting text as data, never instructions: agents are told not to follow directions embedded in postings and not to fetch URLs found inside posting text (the user-supplied posting URL is the one exception). Reviewer research starts from the company identity the user confirmed, never from links in the posting body. `/apply` Step 1 also classifies the posting's host (installed portal, known ATS apex, or unverified) before any drafting.

### Permission level

Every grant the template ships, where it lives, how long it lasts, and what checks it. "Guard" is `tools/security_guards.py`, which CI runs on every PR and which fails on any entry it does not know.

| Surface | What is granted | Lifetime | Guard |
|---|---|---|---|
| `opencode.json` `permission.shell` | Each shipped portal CLI by exact path, `salary_lookup.py`, the `tools/` scripts (`rank_state`, `job_key`, `scrape_state`, `verify_pdf`, `verify_layout`, `robots_check`, `fetch_page`, `posting_guard`), `pdftotext`, and `bun --version`. Everything else defaults to `ask`. | Whole session | Exact allowlist (`ALLOWED_SHELL`); any addition fails CI unless added in the same PR |
| `opencode.json` `permission.shell` deny rules | `curl`, `wget`, `scp`, `sftp`, `ssh`, `nc`, `ncat`, `netcat` are blocked outright, so the shell cannot be used as an upload or remote-shell channel | Whole session | Each deny rule is required; removal fails CI |
| `opencode.json` `permission.edit` | `allow` by default, with `ask` for `opencode.json`, `.opencode/**`, `.github/**`, `tools/security_guards.py`, and `AGENTS.md`; `.opencode/tmp/**` is allowed for the workflow scratchpad | Whole session | Each ask rule is required; removal fails CI |
| `opencode.json` `permission.read` | `allow` by default, with `deny` for `.env`, `.env.*`, `~/.ssh/**`, `~/.aws/**`, and `~/.gnupg/**` | Whole session | Each deny rule is required; removal fails CI |
| `opencode.json` `permission.skill` | Explicit allowlist: the three workflow skills plus the two portal skills. Everything else is denied. | Whole session | Exact allowlist (`REQUIRED_SKILL_ALLOW`) |
| `opencode.json` `permission.task` | Only `posting-fetcher`, `posting-scorer`, and `application-reviewer`; everything else is denied | Whole session | Exact allowlist (`REQUIRED_TASK_ALLOW`) |
| Skills (`.opencode/skills/*/SKILL.md`, `.agents/skills/*/SKILL.md`) | No `allowed-tools`: OpenCode has no per-skill, per-turn tool grant. Permissions come from `opencode.json` and the invoking agent. | - | Frontmatter lint, description limit, exact portal shell grants |
| Portal skills (`.agents/skills/<name>/SKILL.md`) | Exactly that portal's own `cli/src/cli.ts` entry in `permission.shell`; no other grant | Whole session | Checked by path, so a skill that lacks its own CLI grant or gains another portal's CLI fails CI |
| Slash commands (`.opencode/commands/*.md`) | No tool grants; they run under the session and agent rules above | - | Title and frontmatter lint |
| Subagents (`.opencode/agents/*.md`) | `posting-fetcher` (`/apply` Step 0), `posting-scorer` (`/rank` Step 2) and `application-reviewer` (`/apply` Step 3): read/glob/grep, webfetch, websearch, and only the reviewed fetch/guard shell commands. `edit`, `task`, `skill`, `question`, and `external_directory` are denied. | While the agent runs | Check 5: every read-only agent must be `mode: subagent` and deny those permissions; a `tools:` field fails CI |
| The posting integrity gate (`tools/posting_guard.py`) | Runs on every posting before `/apply` Step 1 (URL or pasted), inside each `/rank` scorer, and on the archived posting in `/interview`: removes hidden HTML and invisible characters, quotes instruction-shaped lines and hidden URLs, lists mixed-script words, prints a one-line verdict. Advises; the user decides. The archive keeps counts, never the removed excerpts. | - | Pinned by `tests/test_posting_guard.py` and `tests/test_posting_gate_wiring.py` |
| Plugins (`.opencode/plugin(s)/`) | None. OpenCode auto-loads plugin files, so a plugin runs with no prompt; the template ships none and the guard fails any unexpected plugin file or configured plugin. | - | Check 6: unexpected plugin files and `plugin` entries fail CI |
| Compiling (`lualatex`, `xelatex`, a custom template's command) | Not pre-approved: a `lualatex:*` grant would also approve `-shell-escape`. In default mode each compile prompts. | - | - |
| Portal CLI manifests (`.agents/**/package.json`) | No lifecycle scripts (`preinstall`, `postinstall`, ...) and no `trustedDependencies`, so `bun install` runs no code | - | Fails CI; `tools/install_portal_clis.py` also skips a manifest that carries one |
| The browser-header retry (`tools/fetch_page.py`) | A GET with a fixed argv, http(s) only, 45 s / 5 redirects / 10 MB, `robots.txt` enforced before each redirect target with no bypass flag, output refused inside the repo | - | Pinned by `tests/test_fetch_page.py`; the grant names the script, not `curl` |

### What this does not do

- **It is not a sandbox.** OpenCode's shell tool is not a security sandbox on any platform. It runs commands as your user. The permission rules bound which commands are pre-approved; they do not contain a process that is already running.
- **Shell patterns are tripwires, not walls.** OpenCode matches permission patterns against parsed commands. The shipped deny list blocks all `curl`/`wget`/remote-shell commands, not just upload-shaped variants, but a determined command can still evade pattern matching. Review what the agent fetched and wrote before sending anything out.
- **webfetch is unrestricted by domain.** Company research needs it, and a GET to an arbitrary host can carry data in the URL. The instruction-level rule (never fetch URLs from the posting body) is what stands between a hidden link and a fetch; the permission layer does not.
- **`/rank` scorers still hold the rubric and the posting in one context.** Each scoring agent fetches and scores a batch, so the candidate rubric and the untrusted posting share a context that also has webfetch. What the agent definition removes is edit, write, and unscoped shell. Fully separating fetch from scoring would route every posting through the orchestrator, which `/rank` is built to avoid.
- **The gate is deterministic, not an oracle.** `posting_guard.py` catches the payload classes that leave a trace: hidden markup, invisible characters, agent-addressed phrasing, hidden links, look-alike letters. A manipulation written to read naturally to a human and an agent alike leaves none, and the instruction-level rules remain the only defence for that.
- **Edit and write are what the skill does.** Tailoring a CV means editing files, so those permissions stay granted. What the `edit` ask rules guarantee is that an agent cannot silently widen its own permissions: `opencode.json`, the agent/skill definitions, and `.github/**` always prompt.
- **OpenCode has no per-skill tool grant.** Claude Code's `allowed-tools` frontmatter has no OpenCode equivalent, so the boundary is the global `permission` object plus the invoking agent. The read-only subagents get the narrowest shell allowlist; the primary `job-search` agent runs under the global allowlist.

Instruction-level defenses raise the bar; permission-level defenses bound the damage. Neither is a guarantee. If you run this workflow against job boards you do not trust at all, review what the agent fetched and wrote before sending anything out.

## Scope notes

- Portal CLI skills make live requests only when you run them; CI never does.
- Community fork skills listed in the [forks index](https://github.com/MadsLorentzen/ai-job-search/discussions/78) are **not** covered by this policy - review the code you copy, as the index itself says.
