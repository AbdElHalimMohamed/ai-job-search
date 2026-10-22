# indeed-cli

CLI for searching jobs on **Indeed across EMENA** (Europe, Middle East, North
Africa), with remote and visa-sponsorship modes.

**Data source**: Indeed country sites — the search results JSON blob
(`mosaic-provider-jobcards`) and the detail page's JSON-LD `JobPosting`.
**Authentication**: None required.
**Dependencies**: No npm runtime deps (`bun install` only pulls dev type defs).
Fetching shells out to the system **`curl`** binary with `--http1.1` — Indeed's
edge blocks Bun's TLS fingerprint and serves an HTTP/2 Cloudflare challenge to
non-browser clients, but HTTP/1.1 curl is accepted. `curl` ships by default on
Windows 10+, macOS, and virtually every Linux.

> **Personal use only.** Indeed's `robots.txt` disallows `/viewjob` (the detail
> path) and Indeed's Terms of Service restrict automated access. Keep volume
> low, don't use it commercially or for bulk data collection, and run it on your
> own responsibility.

## Installation

```bash
cd .agents/skills/indeed-search/cli
bun install   # optional — only installs TypeScript dev types
```

The CLI runs without any install because it has zero runtime dependencies.

## Commands

| Command | Description |
|---------|-------------|
| `search` | Search for job listings across selected EMENA countries |
| `detail` | Fetch full detail for a single job listing |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts
`--format json|plain`. All errors are written to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
# Remote data engineer roles across the default 13-country EMENA core
bun run src/cli.ts search -q "data engineer" --format table

# Remote product roles in the UK, Germany, and UAE
bun run src/cli.ts search -q "product manager" --countries GB,DE,AE --format table

# Visa-sponsorship keyword search across the GCC
bun run src/cli.ts search -q "python developer" --region gcc --visa --format table

# Full detail for a UK posting
bun run src/cli.ts detail "https://uk.indeed.com/viewjob?jk=1758596463bc5d18" --format plain
```

See `../SKILL.md` for the full flag reference and the Terms-of-Service note.

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title / skill / role). Required unless `--location`. |
| `--location` | `-l` | City / state passed to each selected site. |
| `--region` | | `emena` (default core), `europe`, `mena`, `gcc`, `north-africa`. |
| `--countries` | `--country` | Comma-separated ISO codes or names; overrides `--region`. |
| `--all-countries` | | All 31 EMENA sites (Israel excluded). |
| `--eligibility` | | `remote`, `visa`, or `either` (default `either`). |
| `--remote` | | Structured remote filter. |
| `--visa` / `--sponsorship` | | Keyword-based sponsorship search. |
| `--visa-query` | | Override the appended phrase for local-language markets. |
| `--visa-strict` | | Keep only positive sponsorship signals. |
| `--jobage` | | Posted within `1`, `3`, `7`, or `14` days. |
| `--page` | | 1-indexed page per country (offset steps of 10). |
| `--limit` | `-n` | Cap total results emitted (default 30). |
| `--per-country-limit` | | Cap results per country before merging (default 10). |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run typecheck
bun test
```

Tests run offline. Live portal tests are opt-in and keep request volume low:

```bash
RUN_LIVE_PORTAL_TESTS=1 bun test
```
