import { describe, test, expect } from "bun:test";
import { countryByCode, resolveCountries } from "../src/countries";
import { searchUrl, type SearchOpts } from "../src/commands/search";

const GB = countryByCode("GB")!;

function opts(overrides: Partial<SearchOpts> = {}): SearchOpts {
  return {
    query: "data engineer",
    countries: [GB],
    region: "emena",
    eligibility: "remote",
    jobage: 14,
    page: 2,
    format: "json",
    ...overrides,
  };
}

describe("indeed country selection", () => {
  test("emena defaults to the agreed 13-country core", () => {
    const result = resolveCountries({ region: "emena" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.countries.map((c) => c.code)).toEqual([
      "GB", "DE", "IE", "NL", "FR", "ES", "SE", "IT", "AE", "SA", "TR", "QA", "EG",
    ]);
    expect(result.selection.countries.map((c) => c.code)).not.toContain("IL");
  });

  test("--all-countries sweeps all 31 EMENA sites and excludes Israel", () => {
    const result = resolveCountries({ region: "emena", allCountries: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.countries).toHaveLength(31);
    expect(result.selection.countries.map((c) => c.code)).not.toContain("IL");
    expect(result.selection.countries.map((c) => c.code)).toContain("MA");
  });

  test("--all-countries wins over a narrower --region", () => {
    const result = resolveCountries({ region: "gcc", allCountries: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.selection.countries).toHaveLength(31);
  });

  test("explicit countries override the region and preserve order", () => {
    const result = resolveCountries({ countries: "GB,AE,EG" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.selection.countries.map((c) => c.code)).toEqual(["GB", "AE", "EG"]);
  });

  test("region groups are supported", () => {
    const gcc = resolveCountries({ region: "gcc" });
    expect(gcc.ok).toBe(true);
    if (gcc.ok) expect(gcc.selection.countries.map((c) => c.code).sort()).toEqual(["AE", "BH", "KW", "OM", "QA", "SA"]);

    const mena = resolveCountries({ region: "mena" });
    expect(mena.ok).toBe(true);
    if (mena.ok) expect(mena.selection.countries.map((c) => c.code)).not.toContain("IL");
  });

  test("unknown country and region fail loudly", () => {
    const badCountry = resolveCountries({ countries: "XX" });
    expect(badCountry.ok).toBe(false);
    if (!badCountry.ok) expect(badCountry.code).toBe("BAD_COUNTRY");

    const badRegion = resolveCountries({ region: "asia" });
    expect(badRegion.ok).toBe(false);
    if (!badRegion.ok) expect(badRegion.code).toBe("BAD_REGION");
  });
});

describe("indeed URL building", () => {
  test("remote mode uses the country host, remote filter, age, and page offset", () => {
    const url = searchUrl(GB, opts(), "remote");
    expect(url).toContain("https://uk.indeed.com/jobs?");
    expect(url).toContain("q=data+engineer");
    expect(url).toContain("fromage=14");
    expect(url).toContain("sc=0kf%3Aattr%28DSQF7%29%3B");
    expect(url).toContain("start=10");
  });

  test("visa mode appends the sponsorship phrase and omits the remote filter", () => {
    const url = searchUrl(GB, opts({ eligibility: "visa" }), "visa");
    expect(url).toContain("q=data+engineer+visa+sponsorship");
    expect(url).not.toContain("sc=");
  });

  test("a custom visa query is honoured", () => {
    const url = searchUrl(GB, opts({ visaQuery: "Visa-Sponsoring" }), "visa");
    expect(url).toContain("Visa-Sponsoring");
  });
});
