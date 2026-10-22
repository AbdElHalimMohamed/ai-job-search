import {
  htmlFetch,
  parseJobCards,
  writeError,
  type JobCard,
} from "../helpers.js"
import type { Country } from "../countries.js"

export type Eligibility = "remote" | "visa" | "either"

export interface SearchOpts {
  query?: string
  location?: string
  countries: Country[]
  region: string
  eligibility: Eligibility
  visaQuery?: string
  visaStrict?: boolean
  jobage: number
  page: number
  limit?: number
  perCountryLimit?: number
  format: "json" | "table" | "plain"
}

const DEFAULT_VISA_QUERY = "visa sponsorship"
const DEFAULT_LIMIT = 30
const DEFAULT_PER_COUNTRY_LIMIT = 10

export function searchUrl(country: Country, opts: SearchOpts, mode: "remote" | "visa"): string {
  const params = new URLSearchParams()
  const baseQuery = opts.query?.trim() || ""
  const query =
    mode === "visa"
      ? `${baseQuery} ${opts.visaQuery || DEFAULT_VISA_QUERY}`.trim()
      : baseQuery
  if (query) params.set("q", query)
  if (opts.location) params.set("l", opts.location)
  if (opts.jobage && opts.jobage > 0 && opts.jobage < 9999) {
    params.set("fromage", String(opts.jobage))
  }
  if (mode === "remote") params.set("sc", "0kf:attr(DSQF7);")
  params.set("start", String((opts.page - 1) * 10))
  return `https://${country.domain}/jobs?${params.toString()}`
}

function mergeCards(cards: JobCard[]): JobCard[] {
  const merged = new Map<string, JobCard>()
  for (const card of cards) {
    const key = `${card.sourceHost}:${card.id}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...card })
      continue
    }
    existing.remote = existing.remote || card.remote
    if (card.sponsorshipSignal === "positive" && existing.sponsorshipSignal !== "positive") {
      existing.sponsorshipSignal = "positive"
      existing.sponsorshipEvidence = card.sponsorshipEvidence
    } else if (existing.sponsorshipSignal === "unknown" && card.sponsorshipSignal !== "unknown") {
      existing.sponsorshipSignal = card.sponsorshipSignal
      existing.sponsorshipEvidence = card.sponsorshipEvidence
    }
  }
  return [...merged.values()]
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const country = c.country.padEnd(3)
    const title = (c.title || "").slice(0, 36).padEnd(36)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 20).padEnd(20)
    const remote = (c.remote ? "remote" : "—").padEnd(6)
    const visa = (c.sponsorshipSignal === "positive" ? "yes" : c.sponsorshipSignal === "negative" ? "no" : "?").padEnd(3)
    const date = c.date || "—"
    return `${country} ${c.id.padEnd(18)} ${title} ${company} ${loc} ${remote} ${visa} ${date}`
  })
  const header =
    "CTY".padEnd(3) +
    " " +
    "ID".padEnd(18) +
    " " +
    "TITLE".padEnd(36) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(20) +
    " " +
    "REMOTE".padEnd(6) +
    " " +
    "VIS".padEnd(3) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const modes: Array<"remote" | "visa"> =
    opts.eligibility === "either" ? ["remote", "visa"] : [opts.eligibility]
  const perCountryLimit = opts.perCountryLimit && opts.perCountryLimit > 0
    ? opts.perCountryLimit
    : DEFAULT_PER_COUNTRY_LIMIT
  const totalLimit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT
  const warnings: Array<{ country: string; error: string }> = []
  const collected: JobCard[] = []
  let requests = 0
  let successes = 0

  for (const country of opts.countries) {
    const countryCards: JobCard[] = []
    for (const mode of modes) {
      requests++
      try {
        const html = await htmlFetch(searchUrl(country, opts, mode), country.language)
        successes++
        let cards = parseJobCards(html, country, mode)
        if (mode === "visa") {
          cards = cards.filter((card) =>
            opts.visaStrict
              ? card.sponsorshipSignal === "positive"
              : card.sponsorshipSignal !== "negative",
          )
        }
        countryCards.push(...cards)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        warnings.push({ country: country.code, error: message })
        process.stderr.write(
          JSON.stringify({
            warning: `${country.code}: ${message}`,
            code: "COUNTRY_FAILED",
            country: country.code,
          }) + "\n",
        )
      }
    }
    collected.push(...mergeCards(countryCards).slice(0, perCountryLimit))
  }

  if (requests > 0 && successes === 0) {
    writeError(
      `All country requests failed${warnings.length ? `: ${warnings[0].error}` : ""}`,
      "SEARCH_FAILED",
    )
    return 1
  }

  const cards = mergeCards(collected).slice(0, totalLimit)

  if (opts.format === "table") {
    process.stdout.write(renderTable(cards) + "\n")
  } else if (opts.format === "plain") {
    process.stdout.write(
      cards
        .map((c) => {
          const remote = c.remote ? " · remote" : ""
          const visa = c.sponsorshipSignal === "positive" ? " · visa sponsorship signal" : ""
          const evidence = c.sponsorshipEvidence ? `\n  evidence: ${c.sponsorshipEvidence}` : ""
          return `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.country}${remote}${visa}\n  id: ${c.id}\n  ${c.url}${evidence}`
        })
        .join("\n\n") + "\n",
    )
  } else {
    process.stdout.write(
      JSON.stringify(
        {
          meta: {
            count: cards.length,
            page: opts.page,
            region: opts.region,
            countries: opts.countries.map((country) => country.code),
            requests,
            errors: warnings,
          },
          results: cards,
        },
        null,
        2,
      ) + "\n",
    )
  }
  return 0
}
