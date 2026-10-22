# Indeed EMENA URL Reference

Indeed exposes a separate public job board per country at
`https://<country>.indeed.com`, plus the US-centric `https://www.indeed.com`.
There is no clean public JSON API; the data is embedded in the HTML responses
and parsed from there.

> **Access restriction.** Indeed's `robots.txt` disallows `/viewjob`, `/rc/`,
> `/pagead/`, and many localized listing paths, and Indeed's Terms of Service
> restrict automated access. The primary search path used here,
> `/jobs?q=...&l=...`, is not itself listed under `Disallow`, but the detail
> path `/viewjob?jk=...` **is**. This skill is for **personal use only** — keep
> volume low. See SKILL.md.

## Country hosts

| Country | Host | Accept-Language |
|---------|------|-----------------|
| United Kingdom | `uk.indeed.com` | `en-GB` |
| Ireland | `ie.indeed.com` | `en-IE` |
| Germany | `de.indeed.com` | `de-DE` |
| France | `fr.indeed.com` | `fr-FR` |
| Netherlands | `nl.indeed.com` | `nl-NL` |
| Belgium | `be.indeed.com` | `en-BE` |
| Luxembourg | `lu.indeed.com` | `en-GB` |
| Switzerland | `ch.indeed.com` | `de-CH` |
| Austria | `at.indeed.com` | `de-AT` |
| Spain | `es.indeed.com` | `es-ES` |
| Portugal | `pt.indeed.com` | `pt-PT` |
| Italy | `it.indeed.com` | `it-IT` |
| Greece | `gr.indeed.com` | `el-GR` |
| Poland | `pl.indeed.com` | `pl-PL` |
| Czechia | `cz.indeed.com` | `cs-CZ` |
| Romania | `ro.indeed.com` | `ro-RO` |
| Hungary | `hu.indeed.com` | `hu-HU` |
| Denmark | `dk.indeed.com` | `da-DK` |
| Sweden | `se.indeed.com` | `sv-SE` |
| Norway | `no.indeed.com` | `nb-NO` |
| Finland | `fi.indeed.com` | `fi-FI` |
| Ukraine | `ua.indeed.com` | `uk-UA` |
| UAE | `ae.indeed.com` | `en-AE,ar;q=0.8` |
| Saudi Arabia | `sa.indeed.com` | `en-SA,ar;q=0.8` |
| Qatar | `qa.indeed.com` | `en-QA,ar;q=0.8` |
| Kuwait | `kw.indeed.com` | `en-KW,ar;q=0.8` |
| Bahrain | `bh.indeed.com` | `en-BH,ar;q=0.8` |
| Oman | `om.indeed.com` | `en-OM,ar;q=0.8` |
| Turkiye | `tr.indeed.com` | `tr-TR` |
| Egypt | `eg.indeed.com` | `en-EG,ar;q=0.8` |
| Morocco | `ma.indeed.com` | `fr-MA,ar;q=0.7,en;q=0.5` |

Israel is deliberately excluded from the EMENA sweep. `www.indeed.com` is
supported for pasted URLs and is treated as a global/US host, but it is not part
of the EMENA country list.

## Search

```
GET https://<country>.indeed.com/jobs?q=<keywords>&l=<location>&fromage=<days>&start=<offset>&sc=0kf:attr(DSQF7);
```

Query params:

| Param | Meaning | Example |
|-------|---------|---------|
| `q` | Free-text query (title / skill / role) | `data engineer` |
| `l` | Location (city / state) | `London` · `Berlin` · `Dubai` |
| `fromage` | Posted-within window, in days | `1`, `3`, `7`, `14` |
| `start` | Pagination offset (steps of 10) | `0`, `10`, `20`, … |
| `sc` | Structured filter block. `0kf:attr(DSQF7);` is Indeed's Remote filter. The CLI URL-encodes it. | `sc=0kf%3Aattr%28DSQF7%29%3B` |

There is **no native visa-sponsorship filter**. The skill appends a phrase such
as `visa sponsorship` to `q` and classifies the result text. That is a keyword
heuristic, not a guarantee.

**Response structure.** The results page embeds the job list as a JSON object
assigned to:

```
window.mosaic.providerData["mosaic-provider-jobcards"] = { ... };
```

The assignment to look for is:

```
window.mosaic.providerData["mosaic-provider-jobcards"] = { ... };
```

The postings live at `metaData.mosaicProviderJobCardsModel.results[]`. Per-result
fields used by this skill:

| Field | Maps to |
|-------|---------|
| `jobkey` | `id` (also builds the country-specific detail URL) |
| `displayTitle` / `title` | `title` |
| `company` | `company` |
| `formattedLocation` | `location` |
| `pubDate` (epoch ms) / `formattedRelativeTime` | `date` |
| `snippet` / `jobTypes` / `benefits` | sponsorship signal text |

The CLI extracts the balanced `{...}` object after the marker (a non-greedy
regex would stop at the first `}`), then reads `results[]`. A results page
carries ~15 organic cards; `start` advances by 10.

## Detail

**Primary route.** Indeed's `/viewjob` path is behind a Cloudflare managed
challenge for non-browser HTTP/2 clients. The two-pane search page carries the
same selected job's data and is reachable with HTTP/1.1:

```
GET https://<country>.indeed.com/jobs?q=job&vjk=<jobkey>
```

The page embeds a large `initialData=` JSON blob. The job lives at:

```
initialData.autoOpenTwoPaneViewjobResponse.body
  .jobInfoWrapperModel.jobInfoModel
```

Fields used:

| Path | Maps to |
|------|---------|
| `body.jobTitle` / `jobInfoHeaderModel.jobTitle` | `title` |
| `jobInfoHeaderModel.companyName` | `company` |
| `jobInfoHeaderModel.formattedLocation` / `body.jobLocation` | `location` |
| `jobInfoModel.sanitizedJobDescription` (HTML) | `description` |
| `jobInfoModel.jobMetadataHeaderModel.jobType` | `employmentType` |
| `structuredDataJobSummaryModel.salary` / `body.salaryInfoModel.salaryText` | `salary` |
| `body.remoteLocation` | `remote` |

The sponsorship signal is classified from the title and description.

**Fallback route.**

```
GET https://<country>.indeed.com/viewjob?jk=<jobkey>
```

When the two-pane page does not yield a job, the detail page's JSON-LD block is
tried. A 403 on this fallback is reported as `DETAIL_BLOCKED` (rather than
retried) because it is Cloudflare's challenge, not a transient rate limit:

```
<script type="application/ld+json"> { "@type": "JobPosting", ... } </script>
```

Fields used:

| JSON-LD path | Maps to |
|--------------|---------|
| `title` | `title` |
| `hiringOrganization.name` | `company` |
| `jobLocation.address` (`addressLocality`, `addressRegion`, `addressCountry`) | `location` |
| `datePosted` | `date` |
| `employmentType` | `employmentType` |
| `baseSalary` | `salary` |
| `description` (HTML) | `description` (tags stripped, entities decoded) |

Fallbacks when JSON-LD is missing/sparse: location from
`data-testid="inlineHeader-companyLocation"`, description from
`<div id="jobDescriptionText">`, title from
`data-testid="jobsearch-JobInfoHeader-title"`. Apply URL, when present, from the
`data-indeed-apply-joburl` attribute.

## Notes

- No authentication required for either endpoint (as of build).
- Browser `User-Agent` and an `Accept-Language` header are required; requests
  without them may be blocked or localized unexpectedly.
- **Transport quirk:** Indeed's edge 403s Bun's/Node's `fetch` (TLS fingerprint)
  but accepts the system `curl` binary, so `htmlFetch` shells out to `curl`. It
  also 403s HTTP/2 requests from a non-browser client and some header
  combinations — notably `Accept` + `--compressed` together — so the CLI sends
  `curl --http1.1` with only `User-Agent` + `Accept-Language`.
- The `/viewjob` path remains Cloudflare-challenged even over HTTP/1.1; the
  two-pane `/jobs?q=job&vjk=<jobkey>` route is the reliable detail source.
- The CLI backs off on 429/403/5xx and returns `""` on 404.
- A country host may change its legal/robots rules independently. Re-check
  `https://<country>.indeed.com/robots.txt` before adding a country.
- If Indeed migrates the results blob key or removes the JSON-LD block, update
  the markers in `cli/src/helpers.ts` (`mosaic-provider-jobcards"]=` and the
  `application/ld+json` / `JobPosting` selectors).
