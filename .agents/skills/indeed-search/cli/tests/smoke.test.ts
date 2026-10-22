import { describe, test, expect } from "bun:test";
import { runCLI, parseJSON } from "./helpers";

const LIVE = process.env.RUN_LIVE_PORTAL_TESTS === "1";

interface SearchResult {
  meta: { count: number; page: number; countries: string[] };
  results: Array<{
    id: string;
    title: string;
    company: string | null;
    location: string | null;
    date: string | null;
    url: string;
    country: string;
    sponsorshipSignal: string;
  }>;
}

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("indeed CLI flag validation", () => {
  test("search with no query and no location exits 1 with NO_CRITERIA", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_CRITERIA");
  });

  test("unknown country exits 1 with BAD_COUNTRY", async () => {
    const result = await runCLI(["search", "-q", "data", "--countries", "XX"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_COUNTRY");
  });

  test("unknown region exits 1 with BAD_REGION", async () => {
    const result = await runCLI(["search", "-q", "data", "--region", "asia"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_REGION");
  });

  test("invalid eligibility exits 1 with BAD_ELIGIBILITY", async () => {
    const result = await runCLI(["search", "-q", "data", "--eligibility", "sometimes"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ELIGIBILITY");
  });

  test("non-numeric --jobage exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-q", "data", "--jobage", "foo"]);
    expect(result.exitCode).not.toBe(0);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/jobage/);
  });

  test("non-numeric --limit exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-q", "data", "--limit", "xyz"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("detail with no id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("detail with a bare key requires a country", async () => {
    const result = await runCLI(["detail", "1758596463bc5d18"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("NO_COUNTRY");
  });

  test("detail with an unparseable id exits 1 with BAD_ID", async () => {
    const result = await runCLI(["detail", "not-a-key"]);
    expect(result.exitCode).not.toBe(0);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ID");
  });
});

describe.skipIf(!LIVE)("indeed CLI live smoke", () => {
  test("remote search returns complete results from the selected countries", async () => {
    const result = await runCLI([
      "search", "-q", "data engineer", "--countries", "GB,DE,AE,EG",
      "--eligibility", "remote", "--limit", "4",
    ]);
    const data = parseJSON<SearchResult>(result);
    expect(data.meta.countries).toEqual(["GB", "DE", "AE", "EG"]);
    expect(data.results.length).toBeGreaterThan(0);
    for (const job of data.results) {
      expect(job.id).toBeTruthy();
      expect(job.title).toBeTruthy();
      expect(job.url).toContain("indeed.com/viewjob");
      expect(job.country).toBeTruthy();
      expect(job).toHaveProperty("location");
      expect(job).toHaveProperty("date");
    }
  }, 120000);

  test("detail preserves the country host and returns a readable description", async () => {
    const search = await runCLI([
      "search", "-q", "data engineer", "--countries", "GB",
      "--eligibility", "remote", "--limit", "1",
    ]);
    const data = parseJSON<SearchResult>(search);
    const first = data.results[0];
    expect(first?.url).toBeTruthy();
    const detail = await runCLI(["detail", first.url]);
    const job = parseJSON<{ title: string; description: string | null; country: string }>(detail);
    expect(job.title).toBeTruthy();
    expect(job.description && job.description.length).toBeGreaterThan(20);
    expect(job.country).toBe("GB");
  }, 120000);
});
