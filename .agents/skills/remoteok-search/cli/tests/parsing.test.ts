import { describe, test, expect } from "bun:test";
import { matchesLocation, matchesQuery, toJobCard, toJobDetail } from "../src/helpers";

const RAW = {
  id: "1134704",
  position: "Data Engineer",
  company: "Acme",
  location: "Europe",
  tags: ["data", "sql"],
  description: "<p>Build pipelines.</p><p>Remote role.</p>",
  date: "2026-10-21T09:15:00Z",
  salary_min: 80000,
  salary_max: 120000,
  url: "/remote-jobs/data-engineer-acme",
  apply_url: "https://acme.example/apply",
};

describe("remoteok parsing", () => {
  test("maps a search result to the contract fields", () => {
    const card = toJobCard(RAW);
    expect(card.id).toBe("1134704");
    expect(card.title).toBe("Data Engineer");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("Europe");
    expect(card.date).toBe("2026-10-21");
    expect(card.url).toBe("https://remoteok.com/remote-jobs/data-engineer-acme");
  });

  test("detail keeps the description readable and the apply link", () => {
    const job = toJobDetail(RAW);
    expect(job.description).toContain("Build pipelines.");
    expect(job.applyUrl).toBe("https://acme.example/apply");
  });

  test("query and location filters are client-side and case-insensitive", () => {
    expect(matchesQuery(RAW, "pipelines")).toBe(true);
    expect(matchesQuery(RAW, "rust")).toBe(false);
    expect(matchesLocation(RAW, "europe")).toBe(true);
    expect(matchesLocation(RAW, "remote")).toBe(true);
  });
});
