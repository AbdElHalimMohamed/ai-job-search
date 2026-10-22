import { describe, test, expect } from "bun:test";
import { countryByCode } from "../src/countries";
import {
  classifySponsorship,
  parseJobCards,
  parseJobDetail,
  parseJobDetailFromSearchPage,
  resolveDetailTarget,
} from "../src/helpers";

const GB = countryByCode("GB")!;

const SEARCH_HTML = `<script>
window.mosaic.providerData["mosaic-provider-jobcards"] = {
  "metaData": { "mosaicProviderJobCardsModel": { "results": [
    {
      "jobkey": "1758596463bc5d18",
      "displayTitle": "Data Engineer",
      "company": "Acme",
      "formattedLocation": "London",
      "pubDate": 1792550400000,
      "snippet": "Visa sponsorship available for the right candidate.",
      "jobTypes": ["Full-time"]
    }
  ] } } };
</script>`;

const DETAIL_HTML = `<html><body>
<div data-testid="inlineHeader-companyLocation">London, United Kingdom</div>
<script type="application/ld+json">
{
  "@type": "JobPosting",
  "title": "Data Engineer",
  "description": "<p>Build pipelines.</p><p>We offer visa sponsorship.</p>",
  "hiringOrganization": { "name": "Acme" },
  "datePosted": "2026-10-21",
  "employmentType": "FULL_TIME",
  "jobLocation": { "address": { "addressLocality": "London", "addressCountry": "GB" } }
}
</script>
</body></html>`;

const TWO_PANE_HTML = `<script>initialData={"autoOpenTwoPaneViewjobResponse":{"body":{"jobTitle":"Data Engineer","jobLocation":"London","remoteLocation":false,"jobInfoWrapperModel":{"jobInfoModel":{"jobInfoHeaderModel":{"companyName":"Acme","formattedLocation":"London"},"jobMetadataHeaderModel":{"jobType":"Permanent"},"sanitizedJobDescription":"<p>Build pipelines.</p><p>Visa sponsorship available.</p>"}},"salaryInfoModel":{"salaryText":"GBP 50,000 - 60,000 a year"}}}};</script>`;

describe("indeed parsing", () => {
  test("search results carry the Step 2 contract fields plus EMENA metadata", () => {
    const cards = parseJobCards(SEARCH_HTML, GB, "remote");
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card.id).toBe("1758596463bc5d18");
    expect(card.title).toBe("Data Engineer");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("London");
    expect(card.date).toBe("2026-10-21");
    expect(card.url).toBe("https://uk.indeed.com/viewjob?jk=1758596463bc5d18");
    expect(card.country).toBe("GB");
    expect(card.sourceHost).toBe("uk.indeed.com");
    expect(card.remote).toBe(true);
    expect(card.sponsorshipSignal).toBe("positive");
  });

  test("detail parses the two-pane search page (the live-compatible path)", () => {
    const job = parseJobDetailFromSearchPage(TWO_PANE_HTML, "1758596463bc5d18", GB);
    expect(job).not.toBeNull();
    expect(job?.title).toBe("Data Engineer");
    expect(job?.company).toBe("Acme");
    expect(job?.location).toBe("London");
    expect(job?.employmentType).toBe("Permanent");
    expect(job?.salary).toContain("50,000");
    expect(job?.description).toContain("Build pipelines.");
    expect(job?.sponsorshipSignal).toBe("positive");
  });

  test("detail parses the JSON-LD JobPosting and classifies sponsorship", () => {
    const job = parseJobDetail(DETAIL_HTML, "1758596463bc5d18", GB);
    expect(job.title).toBe("Data Engineer");
    expect(job.company).toBe("Acme");
    expect(job.location).toBe("London, United Kingdom");
    expect(job.description).toContain("Build pipelines.");
    expect(job.sponsorshipSignal).toBe("positive");
    expect(job.url).toBe("https://uk.indeed.com/viewjob?jk=1758596463bc5d18");
  });

  test("sponsorship classifier is negative-first and honest about unknown", () => {
    expect(classifySponsorship("No visa sponsorship is available.").signal).toBe("negative");
    expect(classifySponsorship("Visa sponsorship available.").signal).toBe("positive");
    expect(classifySponsorship("Relocation support offered.").signal).toBe("positive");
    expect(classifySponsorship("A normal job description.").signal).toBe("unknown");
  });

  test("detail target resolution preserves the country host from a URL", () => {
    const target = resolveDetailTarget("https://de.indeed.com/viewjob?jk=1758596463bc5d18");
    expect(target.ok).toBe(true);
    if (target.ok) {
      expect(target.country.code).toBe("DE");
      expect(target.id).toBe("1758596463bc5d18");
    }
  });

  test("detail target resolution supports bare keys and rejects non-Indeed hosts", () => {
    const withCountry = resolveDetailTarget("1758596463bc5d18", "GB");
    expect(withCountry.ok).toBe(true);
    if (withCountry.ok) expect(withCountry.country.code).toBe("GB");

    const noCountry = resolveDetailTarget("1758596463bc5d18");
    expect(noCountry.ok).toBe(false);
    if (!noCountry.ok) expect(noCountry.code).toBe("NO_COUNTRY");

    const otherHost = resolveDetailTarget("https://example.com/viewjob?jk=1758596463bc5d18");
    expect(otherHost.ok).toBe(false);
    if (!otherHost.ok) expect(otherHost.code).toBe("BAD_ID");
  });
});
