---
name: indeed-search
description: >
  Use this skill to search Indeed across EMENA (Europe, Middle East, North
  Africa) for remote jobs or roles with visa sponsorship. Covers country sites
  for the UK, Ireland, Germany, France, Netherlands, Belgium, Luxembourg,
  Switzerland, Austria, Spain, Portugal, Italy, Greece, Poland, Czechia,
  Romania, Hungary, Denmark, Sweden, Norway, Finland, Ukraine, the UAE, Saudi
  Arabia, Qatar, Kuwait, Bahrain, Oman, Turkey, Egypt, and Morocco. Trigger
  phrases: Indeed jobs, Indeed EMENA, remote jobs in Europe, remote jobs in the
  Middle East, remote jobs in North Africa, visa sponsorship jobs, jobs in
  <EMENA country>, "are there any X jobs in <EMENA country>", look up this
  Indeed job posting, de.indeed.com/uk.indeed.com/ae.indeed.com/eg.indeed.com
  postings. For a search across several job boards, use /scrape instead.
---

# Indeed EMENA Search Skill

Search live job listings from **Indeed across EMENA** — Europe, the Middle East,
and North Africa. The skill fans out to Indeed's country-specific sites and
supports two eligibility modes: **remote** and **visa sponsorship**.

No authentication and no API key. The CLI has zero runtime dependencies and runs
with just `bun`. Fetching shells out to the system `curl` binary because Indeed's
edge blocks Bun's TLS fingerprint.

## Personal use only

Indeed's `robots.txt` disallows `/viewjob` (the job-detail path this skill
fetches), along with `/rc/`, `/pagead/`, and localized listing paths, and
Indeed's Terms of Service restrict automated access. This skill is for
**personal use only**: keep request volume low, do not use it commercially or
for bulk data collection, and run it on your own responsibility. If you need
Indeed data at scale, use Indeed's official Publisher/Employer APIs instead.

The multi-country fan-out can be deliberately bounded: the default `emena`
region searches a 13-country core set, and `--all-countries` expands to all 31
EMENA sites. Prefer `--countries` for routine searches.

## When to use this skill

- Search for remote roles across EMENA
- Search for roles that mention visa sponsorship (a keyword heuristic, not an
  Indeed filter)
- Narrow to one country or a comma-separated set, e.g. `GB,DE,AE,EG`
- Filter by recency and paginate per country
- Fetch the full description of a specific Indeed posting from any country site

## Commands

### Search job listings

```bash
bun run .agents/skills/indeed-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

Key flags:
- `--query` / `-q <text>` — keyword search (title, skill, role). Required unless
  `--location` is supplied.
- `--location` / `-l <text>` — city or state passed to each selected site's `l`
  parameter, e.g. `"London"`, `"Berlin"`, `"Dubai"`.
- `--region <name>` — `emena` (default), `europe`, `mena`, `gcc`, or
  `north-africa`. `emena` means the 13-country core set unless
  `--all-countries` is passed.
- `--countries <list>` / `--country <code>` — comma-separated ISO codes or
  country names. Overrides `--region`. Example: `--countries GB,DE,AE,EG`.
- `--all-countries` — all 31 EMENA country sites (Israel excluded).
- `--eligibility <mode>` — `remote`, `visa`, or `either` (default `either`).
- `--remote` — shorthand for `--eligibility remote`. Adds Indeed's structured
  remote filter (`sc=0kf:attr(DSQF7);`).
- `--visa` / `--sponsorship` — shorthand for `--eligibility visa`. Indeed has
  **no native visa-sponsorship filter**, so this appends a phrase to the query
  and classifies the results.
- `--visa-query <text>` — override the appended phrase for local-language
  markets. Default `visa sponsorship`.
- `--visa-strict` — in visa mode, keep only results with a positive sponsorship
  signal.
- `--jobage <days>` — posted within `1`, `3`, `7`, or `14` days.
- `--page <n>` — 1-indexed page per country (10 results/page).
- `--limit` / `-n <n>` — cap total results emitted (default 30).
- `--per-country-limit <n>` — cap results per country before merging (default 10).
- `--format json|table|plain` — default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/indeed-search/cli/src/cli.ts detail <jobkey|url> [--country <code>] [--format json|plain]
```

- A full URL works for any Indeed country host, e.g.
  `https://de.indeed.com/viewjob?jk=...`.
- A bare job key requires `--country <ISO code>` so the CLI knows which country
  site to query.
- Returns the full description, company, location, posting date, employment
  type, salary (when listed), apply link, and the sponsorship signal with its
  evidence snippet.

## Default country set

`--region emena` uses this 13-country core:

`GB, DE, IE, NL, FR, ES, SE, IT, AE, SA, TR, QA, EG`

`--all-countries` uses all 31 Indeed country sites covered by this skill:

`GB, IE, DE, FR, NL, BE, LU, CH, AT, ES, PT, IT, GR, PL, CZ, RO, HU, DK, SE, NO,
FI, UA, AE, SA, QA, KW, BH, OM, TR, EG, MA`

Israel is excluded by request.

Indeed has no country site for Algeria, Tunisia, Libya, Sudan, Jordan, Lebanon,
Syria, Iraq, Iran, Yemen, Palestine, Mauritania, Djibouti, or Somalia. For those
markets, fall back to `linkedin-search`, `otta-search`, or the websearch path in
`/scrape`.

## Usage examples

```bash
# Bounded remote check (also the health-check-friendly invocation)
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "data engineer" --countries GB --eligibility remote --limit 5 --format table

# Remote data engineer roles across the default EMENA core
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "data engineer" --format table

# Remote product roles in the UK, Germany, and UAE
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "product manager" --countries GB,DE,AE --format table

# Visa-sponsorship search across the GCC (keyword heuristic)
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "python developer" --region gcc --visa --format table

# Full EMENA sweep, remote only, capped tightly
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "analyst" --all-countries --eligibility remote --limit 20

# Recent roles in Egypt
bun run .agents/skills/indeed-search/cli/src/cli.ts search -q "accountant" --countries EG --jobage 7 --format table

# Full details from a country URL
bun run .agents/skills/indeed-search/cli/src/cli.ts detail "https://uk.indeed.com/viewjob?jk=1758596463bc5d18" --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use, passing URLs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "region", "countries", "requests", "errors" }, "results": [...] }`.
Each result carries the normal search contract fields plus:

- `country` — ISO code of the country site
- `sourceHost` — the country domain, e.g. `de.indeed.com`
- `remote` — `true` when the structured remote filter produced the hit, else `null`
- `sponsorshipSignal` — `positive`, `negative`, or `unknown`
- `sponsorshipEvidence` — a short excerpt from the result text, or `null`

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and
the process exits with code `1`. A partial fan-out failure writes one
`COUNTRY_FAILED` warning per failed country to stderr but still returns the
successful results with exit code `0`.

## Notes

- Job keys are hex strings (e.g. `1758596463bc5d18`) — pass them with
  `--country`, or pass the full country URL.
- Search results come from the embedded `mosaic-provider-jobcards` JSON; a
  results page carries ~15 organic postings and `--page` advances by 10 per
  country.
- Detail data comes from the job data embedded in the two-pane
  `/jobs?q=job&vjk=<jobkey>` page, with the `/viewjob` JSON-LD block as a
  fallback. The CLI sends `curl --http1.1`; Indeed serves an HTTP/2 Cloudflare
  challenge to non-browser clients.
- **Visa sponsorship is a keyword heuristic.** Indeed has no structured filter.
  The CLI removes clear negative matches ("no visa sponsorship", "unable to
  sponsor") and marks the rest as positive or unknown. Always verify the
  posting before applying.
- Each country site may render in its local language. The parser reads
  structural JSON and JSON-LD anchors, not localized CSS labels.
- Indeed may rate-limit; the CLI retries 429/403/5xx with exponential backoff.
  Keep volume low and prefer `--countries` over `--all-countries` for routine
  runs.
- For a bounded health check, use
  `search -q "data engineer" --countries GB --eligibility remote --limit 3`.
  The default `either` mode across the 13-country core makes 26 requests.
- If results come back empty, Indeed may have changed the embedded blob key or
  JSON-LD — see `url-reference.md` for the parsing anchors to update.
