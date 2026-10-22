// Data source: Indeed public job pages on the country-specific domain
// (`https://<country>.indeed.com` / `https://www.indeed.com`). Search results
// are embedded in a JSON blob on the results page
// (window.mosaic.providerData["mosaic-provider-jobcards"]); the detail page
// carries a JSON-LD <script type="application/ld+json"> JobPosting object.
// We parse both directly rather than scraping rendered markup, which is far
// more stable than Indeed's frequently-churned CSS class names.
//
// Personal use only — Indeed's robots.txt disallows /viewjob and its terms
// restrict automated access. Keep volume low; see SKILL.md.

import type { Country } from "./countries.js"
import { countryByCode, countryByHost } from "./countries.js"

// Board host for /apply's installed-portal classifier. The skill fans out to
// country subdomains, so the registrable host must be visible in cli/src.
export const BOARD_HOST = "https://www.indeed.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; indeed-search-cli/1.0)"

const STATUS_MARKER = "\nHTTPSTATUS:"

/**
 * Fetch a page through the system `curl` binary rather than `fetch`. Indeed's
 * edge blocks Bun's/Node's TLS fingerprint with a 403, but curl's is accepted;
 * curl ships by default on Windows 10+, macOS, and virtually every Linux, so
 * this keeps the skill dependency-free (no npm runtime deps). The body and a
 * trailing `HTTPSTATUS:<code>` are captured together and split off here.
 */
async function curlFetch(url: string, language: string): Promise<{ status: number; body: string }> {
  // Deliberately minimal: Indeed's edge 403s some header combinations
  // (notably `Accept` + `--compressed` together). UA + Accept-Language alone is
  // accepted reliably for both search and detail paths.
  const proc = Bun.spawn(
    [
      "curl",
      "-sSL",
      // HTTP/1.1 avoids the Cloudflare managed challenge Indeed serves to
      // HTTP/2 clients without a browser fingerprint (observed 2026-10-22).
      "--http1.1",
      "--max-time",
      "30",
      "-A",
      UA,
      "-H",
      `Accept-Language: ${language}`,
      "-w",
      `${STATUS_MARKER}%{http_code}`,
      url,
    ],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [out, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text()
    throw new Error(`curl failed (exit ${exitCode}): ${err.trim() || "unknown error"}`)
  }
  const at = out.lastIndexOf(STATUS_MARKER)
  if (at === -1) throw new Error("curl produced no status code")
  const status = parseInt(out.slice(at + STATUS_MARKER.length).trim(), 10)
  return { status, body: out.slice(0, at) }
}

/**
 * Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404.
 * `retryOn403` is false for the legacy /viewjob detail path, where a 403 is
 * Cloudflare's challenge rather than a transient rate limit.
 */
export async function htmlFetch(url: string, language = "en-US", retryOn403 = true): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { status, body } = await curlFetch(url, language)
    if (status === 429 || (status === 403 && retryOn403) || status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${status}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (status === 403 || status === 404) return ""
    if (status < 200 || status >= 300) {
      throw new Error(`Request failed: ${status}`)
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

export type SponsorshipSignal = "positive" | "negative" | "unknown"

export interface SponsorshipResult {
  signal: SponsorshipSignal
  evidence: string | null
}

const NEGATIVE_SPONSORSHIP = [
  /no visa sponsorship/i,
  /not (?:be )?able to sponsor/i,
  /unable to sponsor/i,
  /cannot sponsor/i,
  /can't sponsor/i,
  /does not sponsor/i,
  /sponsorship (?:is )?not (?:available|provided)/i,
  /without (?:visa )?sponsorship/i,
]

const POSITIVE_SPONSORSHIP = [
  /visa sponsorship/i,
  /sponsor(?:s|ing)? (?:a |your )?visa/i,
  /we (?:can |will )?sponsor/i,
  /relocation (?:support|package|assistance)/i,
  /work permit/i,
  /blue card/i,
  /skilled worker visa/i,
]

/** Classify sponsorship text. Negative wording wins over a bare "visa sponsorship". */
export function classifySponsorship(text: string | null | undefined): SponsorshipResult {
  if (!text) return { signal: "unknown", evidence: null }
  const normalized = text.replace(/\s+/g, " ").trim()
  if (!normalized) return { signal: "unknown", evidence: null }

  for (const pattern of NEGATIVE_SPONSORSHIP) {
    const match = normalized.match(pattern)
    if (match?.index !== undefined) {
      return { signal: "negative", evidence: excerpt(normalized, match.index, match[0].length) }
    }
  }
  for (const pattern of POSITIVE_SPONSORSHIP) {
    const match = normalized.match(pattern)
    if (match?.index !== undefined) {
      return { signal: "positive", evidence: excerpt(normalized, match.index, match[0].length) }
    }
  }
  return { signal: "unknown", evidence: null }
}

function excerpt(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 80)
  const end = Math.min(text.length, index + length + 120)
  return text.slice(start, end).trim()
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  country: string
  sourceHost: string
  remote: boolean | null
  sponsorshipSignal: SponsorshipSignal
  sponsorshipEvidence: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  salary: string | null
  applyUrl: string | null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html))
}

export function detailUrl(country: Country, id: string): string {
  return `https://${country.domain}/viewjob?jk=${encodeURIComponent(id)}`
}

/**
 * Extract the first balanced `{...}` JSON object that follows `marker` in the
 * page source. Used to pull an assigned JS object literal (which itself
 * contains braces) out of an inline <script>, where a non-greedy regex would
 * stop at the first `}`.
 */
function extractBalancedJson(html: string, marker: string): string | null {
  const at = html.indexOf(marker)
  if (at === -1) return null
  let i = html.indexOf("{", at)
  if (i === -1) return null
  const start = i
  let depth = 0
  let inStr = false
  let quote = ""
  for (; i < html.length; i++) {
    const ch = html[i]
    if (inStr) {
      if (ch === "\\") {
        i++
        continue
      }
      if (ch === quote) inStr = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inStr = true
      quote = ch
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return html.slice(start, i + 1)
    }
  }
  return null
}

interface MosaicResult {
  jobkey?: string
  displayTitle?: string
  title?: string
  company?: string
  formattedLocation?: string
  formattedRelativeTime?: string
  pubDate?: number
  snippet?: string
  jobTypes?: string[]
  benefits?: unknown
}

function sponsorshipText(r: MosaicResult, title: string): string {
  const benefits = r.benefits == null ? "" : JSON.stringify(r.benefits).slice(0, 1000)
  return [title, r.snippet ? clean(r.snippet) : "", (r.jobTypes || []).join(" "), benefits].join(" ")
}

/**
 * Parse the search results out of the embedded mosaic-provider-jobcards JSON.
 * Each result is read independently so a single malformed entry cannot break
 * the rest.
 */
export function parseJobCards(html: string, country: Country, mode: "remote" | "visa"): JobCard[] {
  const blob = extractBalancedJson(
    html,
    'window.mosaic.providerData["mosaic-provider-jobcards"]',
  )
  if (!blob) return []
  let data: unknown
  try {
    data = JSON.parse(blob)
  } catch {
    return []
  }

  const results =
    (data as {
      metaData?: { mosaicProviderJobCardsModel?: { results?: MosaicResult[] } }
    })?.metaData?.mosaicProviderJobCardsModel?.results ?? []

  const cards: JobCard[] = []
  for (const r of results) {
    if (!r || typeof r !== "object") continue
    const id = r.jobkey
    if (!id) continue
    const title = (r.displayTitle || r.title || "").trim()
    if (!title) continue
    let date: string | null = null
    if (typeof r.pubDate === "number" && r.pubDate > 0) {
      date = new Date(r.pubDate).toISOString().slice(0, 10)
    } else if (r.formattedRelativeTime) {
      date = r.formattedRelativeTime
    }
    const sponsorship = classifySponsorship(sponsorshipText(r, title))
    cards.push({
      id,
      title: decodeHtmlEntities(title),
      company: r.company ? decodeHtmlEntities(r.company.trim()) : null,
      location: r.formattedLocation ? decodeHtmlEntities(r.formattedLocation.trim()) : null,
      date,
      url: detailUrl(country, id),
      country: country.code,
      sourceHost: country.domain,
      remote: mode === "remote" ? true : null,
      sponsorshipSignal: sponsorship.signal,
      sponsorshipEvidence: sponsorship.evidence,
    })
  }
  return cards
}

interface JsonLdJob {
  "@type"?: string
  title?: string
  description?: string
  datePosted?: string
  employmentType?: string | string[]
  hiringOrganization?: { name?: string }
  jobLocation?: unknown
  baseSalary?: {
    currency?: string
    value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string }
  }
}

function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks))
    // The two-pane page payload can carry double-escaped JSON sequences.
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function formatLocation(loc: unknown): string | null {
  const place = Array.isArray(loc) ? loc[0] : loc
  const addr = (place as { address?: Record<string, string> })?.address
  if (!addr) return null
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .map((p) => (p || "").trim())
    .filter(Boolean)
  return parts.length ? parts.join(", ") : null
}

function formatSalary(b: JsonLdJob["baseSalary"]): string | null {
  if (!b || !b.value) return null
  const { minValue, maxValue, value, unitText } = b.value
  const cur = b.currency || ""
  const unit = unitText ? ` / ${unitText.toLowerCase()}` : ""
  if (value) return `${cur} ${value}${unit}`.trim()
  if (minValue != null && maxValue) return `${cur} ${minValue}–${maxValue}${unit}`.trim()
  if (maxValue) return `${cur} up to ${maxValue}${unit}`.trim()
  return null
}

/** Parse the single-job detail page, primarily from its JSON-LD JobPosting. */
export function parseJobDetail(html: string, id: string, country: Country): JobDetail {
  let ld: JsonLdJob | null = null
  const blocks = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
  )
  if (blocks) {
    for (const b of blocks) {
      const body = b.replace(/^[\s\S]*?>/, "").replace(/<\/script>$/i, "")
      try {
        const parsed = JSON.parse(body) as JsonLdJob
        if (parsed && parsed["@type"] === "JobPosting") {
          ld = parsed
          break
        }
      } catch {
        // ignore malformed block, try the next
      }
    }
  }

  // Location: the on-page header is usually the richest ("Chennai, Tamil Nadu");
  // JSON-LD's address is often sparse (empty locality). Prefer the header.
  let location: string | null = null
  const locMatch = html.match(
    /data-testid="inlineHeader-companyLocation"[^>]*>([\s\S]*?)<\/div>/i,
  )
  if (locMatch) location = clean(locMatch[1]) || null
  if (!location && ld) location = formatLocation(ld.jobLocation)

  // Description: JSON-LD carries HTML; fall back to the on-page block.
  let description: string | null = null
  if (ld?.description) {
    description = htmlToText(ld.description) || null
  }
  if (!description) {
    const dm = html.match(/<div[^>]*id="jobDescriptionText"[^>]*>([\s\S]*?)<\/div>/i)
    if (dm) description = htmlToText(dm[1]) || null
  }

  let title = ld?.title ? decodeHtmlEntities(ld.title.trim()) : null
  if (!title) {
    const tm = html.match(
      /data-testid="jobsearch-JobInfoHeader-title"[^>]*>([\s\S]*?)<\/h/i,
    )
    if (tm) title = clean(tm[1])
  }

  const employmentType = ld?.employmentType
    ? (Array.isArray(ld.employmentType) ? ld.employmentType.join(", ") : ld.employmentType)
        .replace(/_/g, "-")
        .toLowerCase()
    : null

  const applyMatch = html.match(/data-indeed-apply-joburl="([^"]+)"/i)
  const applyUrl = applyMatch ? decodeHtmlEntities(applyMatch[1]) : null
  const sponsorship = classifySponsorship([title || "", description || ""].join(" "))

  return {
    id,
    title: title || "(untitled)",
    company: ld?.hiringOrganization?.name
      ? decodeHtmlEntities(ld.hiringOrganization.name.trim())
      : null,
    location,
    date: ld?.datePosted ? ld.datePosted.slice(0, 10) : null,
    url: detailUrl(country, id),
    country: country.code,
    sourceHost: country.domain,
    remote: null,
    sponsorshipSignal: sponsorship.signal,
    sponsorshipEvidence: sponsorship.evidence,
    description,
    employmentType,
    salary: formatSalary(ld?.baseSalary),
    applyUrl,
  }
}

/**
 * Parse the two-pane search page (`/jobs?q=...&vjk=<id>`). Indeed serves the
 * selected job's detail in `initialData.autoOpenTwoPaneViewjobResponse.body`,
 * which -- unlike `/viewjob` -- is reachable without solving the Cloudflare
 * challenge. This is the primary detail path.
 */
export function parseJobDetailFromSearchPage(html: string, id: string, country: Country): JobDetail | null {
  const marker = "initialData="
  const at = html.indexOf(marker)
  if (at === -1) return null
  const blob = extractBalancedJson(html, marker)
  if (!blob) return null

  let payload: any
  try {
    payload = JSON.parse(blob)
  } catch {
    return null
  }
  const body = payload?.autoOpenTwoPaneViewjobResponse?.body
  const jobInfo = body?.jobInfoWrapperModel?.jobInfoModel
  if (!body || !jobInfo) return null

  const header = jobInfo.jobInfoHeaderModel ?? {}
  const summary = jobInfo.structuredDataJobSummaryModel ?? {}
  const salaryInfo = body.salaryInfoModel ?? {}
  const jobTypes = summary?.jobTypeAndShiftSectionApp?.jobType
  const employmentType = asString(jobInfo.jobMetadataHeaderModel?.jobType) ||
    asStringArray(jobTypes).join(", ") ||
    null

  const title = asString(body.jobTitle) || asString(header.jobTitle) || "(untitled)"
  const description = htmlToText(asString(jobInfo.sanitizedJobDescription) || "")
  const sponsorship = classifySponsorship([title, description || ""].join(" "))

  return {
    id,
    title,
    company: asString(header.companyName) || asString(body.companyName) || null,
    location: asString(header.formattedLocation) || asString(body.jobLocation) || null,
    date: null,
    url: detailUrl(country, id),
    country: country.code,
    sourceHost: country.domain,
    remote: typeof body.remoteLocation === "boolean"
      ? body.remoteLocation
      : typeof header.remoteLocation === "boolean"
        ? header.remoteLocation
        : null,
    sponsorshipSignal: sponsorship.signal,
    sponsorshipEvidence: sponsorship.evidence,
    description: description || null,
    employmentType,
    salary: asString(summary.salary) || asString(salaryInfo.salaryText) || null,
    applyUrl: null,
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
}

export type DetailTargetResult =
  | { ok: true; id: string; country: Country }
  | { ok: false; error: string; code: "BAD_ID" | "NO_COUNTRY" | "BAD_COUNTRY" }

/** Normalize a raw job key, a viewjob URL, or an rc/clk URL to a detail target. */
export function resolveDetailTarget(input: string, countryCode?: string): DetailTargetResult {
  const bare = input.trim().match(/^[0-9a-f]{10,}$/i)
  if (bare) {
    if (!countryCode) {
      return {
        ok: false,
        error: "detail with a bare job key requires --country <ISO code>",
        code: "NO_COUNTRY",
      }
    }
    const country = countryByCode(countryCode)
    if (!country) {
      return {
        ok: false,
        error: `Unknown country "${countryCode}". Use an EMENA ISO code.`,
        code: "BAD_COUNTRY",
      }
    }
    return { ok: true, id: input.trim(), country }
  }

  let url: URL
  try {
    url = new URL(input)
  } catch {
    try {
      url = new URL(`https://${input}`)
    } catch {
      return { ok: false, error: `Could not parse a job URL from "${input}"`, code: "BAD_ID" }
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `Unsupported URL scheme "${url.protocol}"`, code: "BAD_ID" }
  }
  const country = countryByHost(url.hostname)
  if (!country) {
    return { ok: false, error: `Not an Indeed URL: "${input}"`, code: "BAD_ID" }
  }
  const id =
    url.searchParams.get("jk") ||
    url.pathname.match(/\/viewjob\/([0-9a-f]{10,})/i)?.[1] ||
    input.match(/[?&]jk=([0-9a-f]{10,})/i)?.[1] ||
    ""
  if (!/^[0-9a-f]{10,}$/i.test(id)) {
    return { ok: false, error: `Could not parse a job key from "${input}"`, code: "BAD_ID" }
  }
  return { ok: true, id, country }
}
