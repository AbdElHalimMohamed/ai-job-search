import {
  htmlFetch,
  parseJobDetail,
  parseJobDetailFromSearchPage,
  resolveDetailTarget,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  country?: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const target = resolveDetailTarget(opts.id, opts.country)
  if (!target.ok) {
    writeError(target.error, target.code)
    return 1
  }
  try {
    // Indeed's /viewjob path sits behind a Cloudflare challenge for non-browser
    // clients. The two-pane search page carries the same job detail in its
    // initialData blob and is reachable with curl --http1.1; use it first and
    // keep /viewjob's JSON-LD as a fallback.
    const searchPage = await htmlFetch(
      `https://${target.country.domain}/jobs?q=job&vjk=${encodeURIComponent(target.id)}`,
      target.country.language,
    )
    let job = searchPage ? parseJobDetailFromSearchPage(searchPage, target.id, target.country) : null
    if (!job) {
      const detailPage = await htmlFetch(
        `https://${target.country.domain}/viewjob?jk=${encodeURIComponent(target.id)}`,
        target.country.language,
        false,
      )
      if (!detailPage) {
        writeError(
          "Indeed did not return this job in its two-pane page; /viewjob is Cloudflare-challenged. Use the posting URL with webfetch or the employer's own careers site.",
          "DETAIL_BLOCKED",
        )
        return 1
      }
      job = parseJobDetail(detailPage, target.id, target.country)
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · ${job.country}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.sponsorshipSignal !== "unknown"
          ? `Visa sponsorship signal: ${job.sponsorshipSignal}${job.sponsorshipEvidence ? ` (${job.sponsorshipEvidence})` : ""}`
          : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
        job.applyUrl ? `Apply: ${job.applyUrl}` : "",
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
