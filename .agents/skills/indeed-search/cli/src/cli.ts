#!/usr/bin/env bun
// Self-contained CLI for searching jobs on Indeed across EMENA
// (Europe, Middle East, North Africa). No external CLI framework, zero runtime
// dependencies — runs anywhere `bun` is.
//
// Personal use only. Indeed's robots.txt disallows /viewjob (and other listing
// paths) and its terms restrict automated access. Keep volume low, do not use it
// commercially or for bulk data collection. Run it on your own responsibility.

import { runSearch, type SearchOpts, type Eligibility } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { resolveCountries } from "./countries.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = {
    q: "query",
    l: "location",
    n: "limit",
    country: "countries",
    sponsorship: "visa",
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `indeed-cli — search Indeed across EMENA (Europe, Middle East, North Africa)

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <jobkey|url> [--country <code>] [--format json|plain]

SEARCH FLAGS
  --query, -q <text>       Keywords (job title, skill, or role). Required unless
                           --location is supplied.
  --location, -l <text>    City / state passed to each selected Indeed site.
  --region <name>          emena (default) | europe | mena | gcc | north-africa.
                           emena defaults to the 13-country core set.
  --countries <list>       Comma-separated ISO codes or country names, e.g.
                           "GB,DE,AE,EG". Overrides --region.
  --country <code>         Alias for a single --countries value.
  --all-countries          Use all 31 EMENA country sites (Israel excluded).
  --eligibility <mode>     remote | visa | either (default: either).
  --remote                 Shorthand for --eligibility remote (structured filter).
  --visa                   Shorthand for --eligibility visa (keyword heuristic).
  --visa-query <text>      Phrase appended in visa mode. Default: "visa sponsorship".
  --visa-strict            In visa mode, keep only positive sponsorship signals.
  --jobage <days>          Posted within N days: 1, 3, 7, 14. Default: all.
  --page <n>               1-indexed page per country (10 results/page).
  --limit, -n <n>          Cap total results emitted (default 30).
  --per-country-limit <n>  Cap results per country before merging (default 10).
  --format <fmt>           json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "data engineer" --format table
  bun run src/cli.ts search -q "product manager" --countries GB,DE,AE --format table
  bun run src/cli.ts search -q "python developer" --region gcc --visa --format table
  bun run src/cli.ts search -q "analyst" --all-countries --eligibility remote
  bun run src/cli.ts detail https://uk.indeed.com/viewjob?jk=1758596463bc5d18 --format plain

Personal use only — Indeed's robots.txt disallows /viewjob; keep volume low.
`

function parsePositiveInt(name: string, raw: string | boolean | string[]): number | null {
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be a positive integer, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    )
    return null
  }
  const value = parseInt(raw, 10)
  if (value <= 0) {
    process.stderr.write(
      JSON.stringify({ error: `--${name} must be greater than 0, got "${raw}"`, code: "BAD_ARG" }) + "\n",
    )
    return null
  }
  return value
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined
    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!query && !location) {
      process.stderr.write(
        JSON.stringify({
          error: 'provide at least --query/-q or --location/-l (e.g. -q "data engineer")',
          code: "NO_CRITERIA",
        }) + "\n",
      )
      return 1
    }

    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      process.stderr.write(
        JSON.stringify({ error: `--format must be json, table, or plain, got "${fmt}"`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }

    let eligibility: Eligibility
    if (typeof flags.eligibility === "string") {
      if (!["remote", "visa", "either"].includes(flags.eligibility)) {
        process.stderr.write(
          JSON.stringify({
            error: `--eligibility must be remote, visa, or either, got "${flags.eligibility}"`,
            code: "BAD_ELIGIBILITY",
          }) + "\n",
        )
        return 1
      }
      eligibility = flags.eligibility as Eligibility
    } else {
      eligibility = flags.remote && flags.visa ? "either" : flags.remote ? "remote" : flags.visa ? "visa" : "either"
    }

    let jobage = 9999
    if (flags.jobage !== undefined) {
      const value = parsePositiveInt("jobage", flags.jobage)
      if (value === null) return 1
      jobage = value
    }
    let page = 1
    if (flags.page !== undefined) {
      const value = parsePositiveInt("page", flags.page)
      if (value === null) return 1
      page = value
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const value = parsePositiveInt("limit", flags.limit)
      if (value === null) return 1
      limit = value
    }
    let perCountryLimit: number | undefined
    if (flags["per-country-limit"] !== undefined) {
      const value = parsePositiveInt("per-country-limit", flags["per-country-limit"])
      if (value === null) return 1
      perCountryLimit = value
    }

    const selection = resolveCountries({
      region: typeof flags.region === "string" ? flags.region : undefined,
      countries: typeof flags.countries === "string" ? flags.countries : undefined,
      allCountries: flags["all-countries"] === true,
    })
    if (!selection.ok) {
      process.stderr.write(JSON.stringify({ error: selection.error, code: selection.code }) + "\n")
      return 1
    }

    const opts: SearchOpts = {
      query,
      location,
      countries: selection.selection.countries,
      region: selection.selection.region,
      eligibility,
      visaQuery: typeof flags["visa-query"] === "string" ? flags["visa-query"] : undefined,
      visaStrict: flags["visa-strict"] === true,
      jobage,
      page,
      limit,
      perCountryLimit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires a <jobkey|url>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = typeof flags.format === "string" ? flags.format : "json"
    if (!["json", "plain"].includes(fmt)) {
      process.stderr.write(
        JSON.stringify({ error: `--format must be json or plain, got "${fmt}"`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }
    const opts: DetailOpts = {
      id,
      country: typeof flags.countries === "string" ? flags.countries : undefined,
      format: fmt as DetailOpts["format"],
    }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main().then((code) => process.exit(code))
