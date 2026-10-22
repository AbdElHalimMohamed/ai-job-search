import { describe, test, expect } from "bun:test";
import { matchesLocation, matchesQuery, toJobCard, toJobDetail } from "../src/helpers";

const RAW = {
  title: "Senior Data Analyst",
  companyName: "Acme",
  companySlug: "acme",
  employmentType: "Full Time",
  minSalary: 70000,
  maxSalary: 90000,
  salaryPeriod: "annual",
  currency: "EUR",
  locationRestrictions: ["Europe", "United Kingdom"],
  categories: ["Data"],
  parentCategories: ["Data Science"],
  description: "<p>Analyse product data.</p>",
  pubDate: 1761100000, // 2026-10-22 (UTC)
  guid: "https://himalayas.app/companies/acme/jobs/senior-data-analyst",
};

describe("himalayas parsing", () => {
  test("maps a search result to the contract fields", () => {
    const card = toJobCard(RAW);
    expect(card.id).toBe("acme/senior-data-analyst");
    expect(card.title).toBe("Senior Data Analyst");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("Europe, United Kingdom");
    expect(card.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(card.url).toContain("himalayas.app/companies/acme/jobs/");
  });

  test("detail description is readable text", () => {
    const job = toJobDetail(RAW);
    expect(job.description).toContain("Analyse product data.");
  });

  test("query and location filters treat unrestricted jobs as matching", () => {
    expect(matchesQuery(RAW, "product data")).toBe(true);
    expect(matchesLocation(RAW, "europe")).toBe(true);
    expect(matchesLocation({ ...RAW, locationRestrictions: [] }, "canada")).toBe(true);
    expect(matchesLocation(RAW, "canada")).toBe(false);
  });
});
