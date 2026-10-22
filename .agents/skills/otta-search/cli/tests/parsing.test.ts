import { describe, test, expect } from "bun:test";
import { jobUrl, parseDetail, parseHit, remoteFacet } from "../src/helpers";

const HIT = {
  objectID: "4051077",
  name: "Data Analyst",
  organization: { name: "Acme", slug: "acme" },
  office: { city: "London", country_code: "GB" },
  remote: "partial",
  contract_type_names: { en: "Permanent" },
  published_at: "2026-10-21T08:00:00Z",
  slug: "data-analyst-london",
};

const DETAIL = {
  job: {
    name: "Data Analyst",
    organization: { name: "Acme", slug: "acme" },
    offices: [{ city: "London", country_code: "GB" }],
    remote: "partial",
    contract_type_names: { en: "Permanent" },
    published_at: "2026-10-21T08:00:00Z",
    slug: "data-analyst-london",
    description: "<p>Build dashboards.</p>",
    profile: "<p>Two years of SQL.</p>",
    salary_min: 50000,
    salary_max: 60000,
    salary_currency: "GBP",
    salary_period: "year",
    apply_url: "https://acme.example/apply",
  },
};

describe("otta parsing", () => {
  test("maps a search hit to the contract fields", () => {
    const card = parseHit(HIT);
    expect(card?.id).toBe("4051077");
    expect(card?.title).toBe("Data Analyst");
    expect(card?.company).toBe("Acme");
    expect(card?.location).toBe("London, GB");
    expect(card?.date).toBe("2026-10-21");
    expect(card?.url).toContain("welcometothejungle.com/en/companies/acme/jobs/");
  });

  test("maps detail and keeps the description readable", () => {
    const job = parseDetail(DETAIL, "4051077");
    expect(job.description).toContain("Build dashboards.");
    expect(job.salary).toContain("GBP");
    expect(job.applyUrl).toBe("https://acme.example/apply");
  });

  test("remote facet and canonical URL helpers", () => {
    expect(remoteFacet("remote")).toBe("fulltime");
    expect(remoteFacet("hybrid")).toBe("partial");
    expect(remoteFacet("onsite")).toBe("none");
    expect(jobUrl("acme", "data-analyst-london")).toContain("/companies/acme/jobs/data-analyst-london");
  });
});
