import { describe, test, expect } from "bun:test";
import { matchesQuery, parseDescription, parseItems } from "../src/helpers";

const RSS = `<rss><channel><item>
  <title>Acme: Senior Product Manager</title>
  <link>https://weworkremotely.com/remote-jobs/acme-senior-product-manager</link>
  <region>Anywhere in the World</region>
  <category>Product</category>
  <type>Full-Time</type>
  <pubDate>Wed, 21 Oct 2026 10:00:00 +0000</pubDate>
  <description><![CDATA[<p>Own the roadmap.</p><p>Fully remote.</p>]]></description>
</item></channel></rss>`;

describe("weworkremotely parsing", () => {
  test("parses the search contract fields including location and ISO date", () => {
    const items = parseItems(RSS);
    expect(items).toHaveLength(1);
    const card = items[0].card;
    expect(card.id).toBe("acme-senior-product-manager");
    expect(card.title).toBe("Senior Product Manager");
    expect(card.company).toBe("Acme");
    expect(card.location).toBe("Anywhere in the World");
    expect(card.category).toBe("Product");
    expect(card.type).toBe("Full-Time");
    expect(card.date).toBe("2026-10-21");
    expect(card.url).toContain("weworkremotely.com/remote-jobs/");
  });

  test("description is readable text and query matching is case-insensitive", () => {
    const items = parseItems(RSS);
    expect(parseDescription(items[0].chunk)).toContain("Own the roadmap.");
    expect(matchesQuery(items[0].card, items[0].chunk, "roadmap")).toBe(true);
    expect(matchesQuery(items[0].card, items[0].chunk, "kubernetes")).toBe(false);
  });
});
