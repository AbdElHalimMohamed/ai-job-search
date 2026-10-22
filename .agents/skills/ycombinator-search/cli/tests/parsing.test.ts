import { describe, test, expect } from "bun:test";
import { extractPageProps, htmlToText, mapJobCard } from "../src/helpers";

const PAGE = `<!doctype html><div id="app" data-page="{&quot;props&quot;:{&quot;jobs&quot;:[{&quot;id&quot;:95705,&quot;title&quot;:&quot;Data Analyst&quot;,&quot;companyName&quot;:&quot;Acme&quot;,&quot;location&quot;:&quot;Remote (EU)&quot;,&quot;roleType&quot;:&quot;Data&quot;,&quot;jobType&quot;:&quot;Fulltime&quot;,&quot;salary&quot;:&quot;$90K - $120K&quot;}]}}"></div>`;

describe("ycombinator parsing", () => {
  test("extracts Inertia props from the data-page attribute", () => {
    const props = extractPageProps(PAGE);
    expect(props).not.toBeNull();
    expect(Array.isArray(props?.jobs)).toBe(true);
  });

  test("maps a raw listing to the contract fields", () => {
    const props = extractPageProps(PAGE);
    const raw = (props?.jobs as Record<string, unknown>[])[0];
    const card = mapJobCard(raw);
    expect(card?.id).toBe("95705");
    expect(card?.title).toBe("Data Analyst");
    expect(card?.company).toBe("Acme");
    expect(card?.location).toBe("Remote (EU)");
    expect(card?.date).toBeNull();
    expect(card?.url).toBe("https://www.workatastartup.com/jobs/95705");
  });

  test("htmlToText preserves paragraph breaks", () => {
    expect(htmlToText("<p>First.</p><p>Second.</p>")).toBe("First.\nSecond.");
  });
});
