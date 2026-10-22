// Indeed country sites used by this skill. Indeed publishes a country-specific
// board as https://<subdomain>.indeed.com; www.indeed.com is US-centric, so a
// region search has to fan out across these hosts.
//
// Coverage is EMENA (Europe, Middle East, North Africa) with Israel excluded by
// request. Indeed has no country site for Algeria, Tunisia, Libya, Sudan,
// Jordan, Lebanon, Syria, Iraq, Iran, Yemen, Palestine, Mauritania, Djibouti or
// Somalia; see SKILL.md for the fallback guidance.

export type CountryRegion = "europe" | "middle-east" | "north-africa" | "other"

export interface Country {
  code: string
  name: string
  domain: string
  region: CountryRegion
  language: string
  gcc?: boolean
}

export const COUNTRIES: Country[] = [
  // Europe
  { code: "GB", name: "United Kingdom", domain: "uk.indeed.com", region: "europe", language: "en-GB" },
  { code: "IE", name: "Ireland", domain: "ie.indeed.com", region: "europe", language: "en-IE" },
  { code: "DE", name: "Germany", domain: "de.indeed.com", region: "europe", language: "de-DE" },
  { code: "FR", name: "France", domain: "fr.indeed.com", region: "europe", language: "fr-FR" },
  { code: "NL", name: "Netherlands", domain: "nl.indeed.com", region: "europe", language: "nl-NL" },
  { code: "BE", name: "Belgium", domain: "be.indeed.com", region: "europe", language: "en-BE" },
  { code: "LU", name: "Luxembourg", domain: "lu.indeed.com", region: "europe", language: "en-GB" },
  { code: "CH", name: "Switzerland", domain: "ch.indeed.com", region: "europe", language: "de-CH" },
  { code: "AT", name: "Austria", domain: "at.indeed.com", region: "europe", language: "de-AT" },
  { code: "ES", name: "Spain", domain: "es.indeed.com", region: "europe", language: "es-ES" },
  { code: "PT", name: "Portugal", domain: "pt.indeed.com", region: "europe", language: "pt-PT" },
  { code: "IT", name: "Italy", domain: "it.indeed.com", region: "europe", language: "it-IT" },
  { code: "GR", name: "Greece", domain: "gr.indeed.com", region: "europe", language: "el-GR" },
  { code: "PL", name: "Poland", domain: "pl.indeed.com", region: "europe", language: "pl-PL" },
  { code: "CZ", name: "Czechia", domain: "cz.indeed.com", region: "europe", language: "cs-CZ" },
  { code: "RO", name: "Romania", domain: "ro.indeed.com", region: "europe", language: "ro-RO" },
  { code: "HU", name: "Hungary", domain: "hu.indeed.com", region: "europe", language: "hu-HU" },
  { code: "DK", name: "Denmark", domain: "dk.indeed.com", region: "europe", language: "da-DK" },
  { code: "SE", name: "Sweden", domain: "se.indeed.com", region: "europe", language: "sv-SE" },
  { code: "NO", name: "Norway", domain: "no.indeed.com", region: "europe", language: "nb-NO" },
  { code: "FI", name: "Finland", domain: "fi.indeed.com", region: "europe", language: "fi-FI" },
  { code: "UA", name: "Ukraine", domain: "ua.indeed.com", region: "europe", language: "uk-UA" },
  // Middle East (Israel excluded)
  { code: "AE", name: "United Arab Emirates", domain: "ae.indeed.com", region: "middle-east", language: "en-AE,ar;q=0.8", gcc: true },
  { code: "SA", name: "Saudi Arabia", domain: "sa.indeed.com", region: "middle-east", language: "en-SA,ar;q=0.8", gcc: true },
  { code: "QA", name: "Qatar", domain: "qa.indeed.com", region: "middle-east", language: "en-QA,ar;q=0.8", gcc: true },
  { code: "KW", name: "Kuwait", domain: "kw.indeed.com", region: "middle-east", language: "en-KW,ar;q=0.8", gcc: true },
  { code: "BH", name: "Bahrain", domain: "bh.indeed.com", region: "middle-east", language: "en-BH,ar;q=0.8", gcc: true },
  { code: "OM", name: "Oman", domain: "om.indeed.com", region: "middle-east", language: "en-OM,ar;q=0.8", gcc: true },
  { code: "TR", name: "Turkiye", domain: "tr.indeed.com", region: "middle-east", language: "tr-TR" },
  // North Africa
  { code: "EG", name: "Egypt", domain: "eg.indeed.com", region: "north-africa", language: "en-EG,ar;q=0.8" },
  { code: "MA", name: "Morocco", domain: "ma.indeed.com", region: "north-africa", language: "fr-MA,ar;q=0.7,en;q=0.5" },
]

/** The 13-country default agreed for this fork. */
export const CORE_EMENA_CODES = [
  "GB", "DE", "IE", "NL", "FR", "ES", "SE", "IT", "AE", "SA", "TR", "QA", "EG",
]

export const REGION_NAMES = ["emena", "europe", "mena", "gcc", "north-africa"] as const
export type RegionName = (typeof REGION_NAMES)[number]

export const DEFAULT_REGION: RegionName = "emena"

const BY_CODE = new Map(COUNTRIES.map((country) => [country.code, country]))
const BY_DOMAIN = new Map(COUNTRIES.map((country) => [country.domain, country]))

const NAME_ALIASES: Record<string, string> = {
  uk: "GB",
  "united kingdom": "GB",
  "great britain": "GB",
  england: "GB",
  ireland: "IE",
  germany: "DE",
  deutschland: "DE",
  france: "FR",
  netherlands: "NL",
  holland: "NL",
  belgium: "BE",
  luxembourg: "LU",
  switzerland: "CH",
  austria: "AT",
  spain: "ES",
  portugal: "PT",
  italy: "IT",
  greece: "GR",
  poland: "PL",
  czechia: "CZ",
  "czech republic": "CZ",
  romania: "RO",
  hungary: "HU",
  denmark: "DK",
  sweden: "SE",
  norway: "NO",
  finland: "FI",
  ukraine: "UA",
  uae: "AE",
  "united arab emirates": "AE",
  "saudi arabia": "SA",
  ksa: "SA",
  qatar: "QA",
  kuwait: "KW",
  bahrain: "BH",
  oman: "OM",
  turkey: "TR",
  turkiye: "TR",
  "türkiye": "TR",
  egypt: "EG",
  morocco: "MA",
}

export interface CountrySelection {
  countries: Country[]
  region: string
}

export type CountrySelectionResult =
  | { ok: true; selection: CountrySelection }
  | { ok: false; error: string; code: "BAD_REGION" | "BAD_COUNTRY" }

function normalizeCountryToken(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) return null
  if (/^[A-Za-z]{2}$/.test(trimmed)) {
    const code = trimmed.toUpperCase()
    return BY_CODE.has(code) ? code : null
  }
  return NAME_ALIASES[trimmed.toLowerCase()] ?? null
}

/** Parse a comma-separated country list, preserving the caller's order. */
export function parseCountryList(value: string): CountrySelectionResult {
  const codes: string[] = []
  for (const token of value.split(",")) {
    if (!token.trim()) continue
    const code = normalizeCountryToken(token)
    if (!code) {
      return {
        ok: false,
        error: `Unknown country "${token.trim()}". Use an EMENA ISO code or name, e.g. GB, DE, AE, EG.`,
        code: "BAD_COUNTRY",
      }
    }
    if (!codes.includes(code)) codes.push(code)
  }
  if (codes.length === 0) {
    return { ok: false, error: "No countries supplied.", code: "BAD_COUNTRY" }
  }
  return {
    ok: true,
    selection: { countries: codes.map((code) => BY_CODE.get(code)!), region: "custom" },
  }
}

export function resolveCountries(options: {
  region?: string
  countries?: string
  allCountries?: boolean
}): CountrySelectionResult {
  if (options.countries) return parseCountryList(options.countries)

  const region = (options.region || DEFAULT_REGION).toLowerCase()
  if (!(REGION_NAMES as readonly string[]).includes(region)) {
    return {
      ok: false,
      error: `Unknown region "${options.region}". Use ${REGION_NAMES.join(", ")}.`,
      code: "BAD_REGION",
    }
  }

  if (options.allCountries) {
    return { ok: true, selection: { countries: COUNTRIES, region } }
  }

  if (region === "emena") {
    return {
      ok: true,
      selection: {
        countries: CORE_EMENA_CODES.map((code) => BY_CODE.get(code)!),
        region,
      },
    }
  }
  if (region === "europe") {
    return {
      ok: true,
      selection: { countries: COUNTRIES.filter((c) => c.region === "europe"), region },
    }
  }
  if (region === "mena") {
    return {
      ok: true,
      selection: {
        countries: COUNTRIES.filter((c) => c.region === "middle-east" || c.region === "north-africa"),
        region,
      },
    }
  }
  if (region === "gcc") {
    return { ok: true, selection: { countries: COUNTRIES.filter((c) => c.gcc), region } }
  }
  return {
    ok: true,
    selection: { countries: COUNTRIES.filter((c) => c.region === "north-africa"), region },
  }
}

export function countryByCode(code: string): Country | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null
}

/** Resolve an Indeed hostname to a country, including hosts outside EMENA. */
export function countryByHost(host: string): Country | null {
  const normalized = host.toLowerCase()
  const known = BY_DOMAIN.get(normalized)
  if (known) return known
  if (normalized === "indeed.com" || normalized === "www.indeed.com") {
    return {
      code: "GLOBAL",
      name: "Indeed",
      domain: "www.indeed.com",
      region: "other",
      language: "en-US",
    }
  }
  if (normalized.endsWith(".indeed.com")) {
    return {
      code: normalized.split(".")[0].toUpperCase(),
      name: normalized,
      domain: normalized,
      region: "other",
      language: "en-US",
    }
  }
  return null
}
