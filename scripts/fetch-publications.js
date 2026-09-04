/**
 * Fetch publications from Crossref, ORCID and PubMed
 * Compares against existing publications and creates GitHub issues for new ones
 *
 * Crossref is the primary source: filtering by ORCID iD returns both journal
 * articles and bioRxiv/medRxiv preprints, with no name-collision false
 * positives (there are at least two other publishing "Rubin BE"s). ORCID and
 * PubMed are kept as secondary sources for anything Crossref hasn't indexed.
 */

const fs = require('fs');
const path = require('path');

const ORCID_ID = '0000-0001-8684-2417';
const PUBLICATIONS_FILE = path.join(__dirname, '..', 'data', 'publications.json');
const CROSSREF_UA = 'rubin-lab-website/1.0 (https://www.therubinlab.org; mailto:brubin@berkeley.edu)';

/**
 * Normalize a DOI so string comparisons are reliable.
 * DOIs are case-insensitive and are sometimes stored with a URL prefix.
 */
function normalizeDoi(doi) {
    if (!doi) return null;
    return doi
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
}

/**
 * Build an "Rubin BE" style author string from Crossref author objects
 */
function formatCrossrefAuthors(authors) {
    if (!Array.isArray(authors)) return '';
    return authors
        .map((a) => {
            if (a.name) return a.name; // consortium / group author
            const family = a.family || '';
            const initials = (a.given || '')
                .split(/[\s.\-]+/)
                .filter(Boolean)
                .map((part) => part[0].toUpperCase())
                .join('');
            return [family, initials].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join(', ');
}

function crossrefYear(item) {
    const candidates = [item.issued, item['published-print'], item['published-online'], item.posted, item.created];
    for (const c of candidates) {
        const year = c?.['date-parts']?.[0]?.[0];
        if (year) return parseInt(year, 10);
    }
    return null;
}

/**
 * Turn one Crossref work into our internal publication shape
 */
function crossrefToPublication(item) {
    const isPreprint = item.type === 'posted-content';
    const journal =
        item['container-title']?.[0] ||
        item.institution?.[0]?.name ||
        (isPreprint ? 'Preprint' : '');

    // Crossref links a preprint to its peer-reviewed version once it appears,
    // and the journal version back to the preprint. Neither relation is
    // deposited immediately, so we can't rely on either one alone.
    const supersededBy = (item.relation?.['is-preprint-of'] || [])
        .map((r) => normalizeDoi(r.id))
        .filter(Boolean);
    const hasPreprint = (item.relation?.['has-preprint'] || [])
        .map((r) => normalizeDoi(r.id))
        .filter(Boolean);

    return {
        title: (item.title?.[0] || '').replace(/<[^>]+>/g, '').trim(),
        authors: formatCrossrefAuthors(item.author),
        year: crossrefYear(item),
        journal,
        doi: normalizeDoi(item.DOI),
        pmid: null,
        preprint: isPreprint,
        supersededBy,
        hasPreprint,
        source: 'crossref'
    };
}

async function fetchCrossrefWork(doi) {
    const response = await fetch(`https://api.crossref.org/works/${encodeURI(doi)}`, {
        headers: { 'User-Agent': CROSSREF_UA }
    });
    if (!response.ok) {
        throw new Error(`Crossref work error for ${doi}: ${response.status}`);
    }
    const data = await response.json();
    return crossrefToPublication(data.message);
}

/**
 * Fetch every work Crossref has tagged with this ORCID iD
 */
async function fetchCrossrefPublications() {
    // No `select=` here: Crossref rejects `institution` as a selectable field,
    // and that's where a preprint's server name (bioRxiv/medRxiv) lives.
    // Newest first, so a record longer than one page can't hide a new paper.
    const url = `https://api.crossref.org/works?filter=orcid:${ORCID_ID}&rows=200&sort=created&order=desc`;

    try {
        const response = await fetch(url, { headers: { 'User-Agent': CROSSREF_UA } });
        if (!response.ok) {
            throw new Error(`Crossref API error: ${response.status}`);
        }

        const data = await response.json();
        const items = data.message?.items || [];
        const total = data.message?.['total-results'] ?? items.length;
        const publications = items.map(crossrefToPublication).filter((p) => p.title);

        if (total > items.length) {
            console.log(`::warning::Crossref has ${total} works but only ${items.length} were read.`);
        }

        // An empty 200 response looks exactly like "nothing new", which is the
        // bug this source was added to fix. Treat it as a failure instead.
        if (publications.length === 0) {
            throw new Error('Crossref returned no works for this ORCID iD');
        }

        console.log(`Fetched ${publications.length} publications from Crossref`);
        return publications;
    } catch (error) {
        // Returning null (not []) so main() can fail loudly. A dead primary
        // source otherwise looks identical to "no new publications".
        console.error('Error fetching from Crossref:', error.message);
        return null;
    }
}

/**
 * Fetch publications from Europe PMC by author name, restricted to the lab's
 * affiliations.
 *
 * Crossref's ORCID filter only sees works whose publisher deposited the ORCID
 * iD, which misses papers where Ben is a middle author — the 2023 Nature
 * Communications paper, for one. A bare name search is unusable (at least two
 * other researchers publish as "Rubin BE"), but adding the affiliation makes
 * it precise enough that the occasional stray can just be rejected.
 */
async function fetchEuropePmcPublications() {
    const query = 'AUTH:"Rubin BE" AND (AFF:"Berkeley" OR AFF:"Innovative Genomics")';
    const url =
        'https://www.ebi.ac.uk/europepmc/webservices/rest/search' +
        `?query=${encodeURIComponent(query)}&format=json&pageSize=100&resultType=lite`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Europe PMC API error: ${response.status}`);
        }

        const data = await response.json();
        const results = data.resultList?.result || [];

        const publications = results
            // Europe PMC also matches consortium credits (the IGI SARS-CoV-2
            // Testing Consortium, say), where he isn't a named author.
            .filter((r) => /\bRubin BE\b/.test(r.authorString || ''))
            .map((r) => ({
            title: (r.title || '').replace(/<[^>]+>/g, '').replace(/\.$/, '').trim(),
            authors: (r.authorString || '').replace(/\.$/, '').trim(),
            year: r.pubYear ? parseInt(r.pubYear, 10) : null,
            journal: r.journalTitle || (r.source === 'PPR' ? 'Preprint' : ''),
            doi: normalizeDoi(r.doi),
            pmid: r.pmid || null,
            preprint: r.source === 'PPR',
            source: 'europepmc'
        })).filter((p) => p.title);

        console.log(`Fetched ${publications.length} publications from Europe PMC`);
        return publications;
    } catch (error) {
        console.error('Error fetching from Europe PMC:', error.message);
        return [];
    }
}

/**
 * Fetch publications from ORCID API
 */
async function fetchOrcidPublications() {
    const url = `https://pub.orcid.org/v3.0/${ORCID_ID}/works`;

    try {
        const response = await fetch(url, {
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`ORCID API error: ${response.status}`);
        }

        const data = await response.json();
        const publications = [];

        if (data.group) {
            for (const group of data.group) {
                const workSummary = group['work-summary']?.[0];
                if (!workSummary) continue;

                const title = workSummary.title?.title?.value || '';
                const year = workSummary['publication-date']?.year?.value || null;
                const journal = workSummary['journal-title']?.value || '';

                // Get external IDs
                let doi = null;
                let pmid = null;
                const externalIds = workSummary['external-ids']?.['external-id'] || [];
                for (const extId of externalIds) {
                    if (extId['external-id-type'] === 'doi') {
                        doi = extId['external-id-value'];
                    }
                    if (extId['external-id-type'] === 'pmid') {
                        pmid = extId['external-id-value'];
                    }
                }

                publications.push({
                    title,
                    year: year ? parseInt(year) : null,
                    journal,
                    doi: normalizeDoi(doi),
                    pmid,
                    source: 'orcid'
                });
            }
        }

        console.log(`Fetched ${publications.length} publications from ORCID`);
        return publications;
    } catch (error) {
        console.error('Error fetching from ORCID:', error.message);
        return [];
    }
}

/**
 * Fetch publications from PubMed API
 */
async function fetchPubmedPublications() {
    const apiKey = process.env.NCBI_API_KEY || '';
    const apiKeyParam = apiKey ? `&api_key=${apiKey}` : '';

    // Search by ORCID identifier ([auid]), NOT by name. A name search for
    // "Rubin BE" matches a different (radiology) author and floods the repo
    // with false positives. Querying the ORCID iD only returns papers the
    // author has explicitly linked to their ORCID record.
    const term = `${ORCID_ID}[auid]`;
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=100&retmode=json${apiKeyParam}`;

    try {
        const searchResponse = await fetch(searchUrl);
        if (!searchResponse.ok) {
            throw new Error(`PubMed search error: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        const pmids = searchData.esearchresult?.idlist || [];

        if (pmids.length === 0) {
            console.log('No publications found in PubMed');
            return [];
        }

        // Fetch details for each PMID
        const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=json${apiKeyParam}`;

        const fetchResponse = await fetch(fetchUrl);
        if (!fetchResponse.ok) {
            throw new Error(`PubMed fetch error: ${fetchResponse.status}`);
        }

        const fetchData = await fetchResponse.json();
        const publications = [];

        for (const pmid of pmids) {
            const article = fetchData.result?.[pmid];
            if (!article) continue;

            const title = article.title || '';
            const authors = article.authors?.map(a => a.name).join(', ') || '';
            const journal = article.source || '';
            const year = article.pubdate ? parseInt(article.pubdate.substring(0, 4)) : null;

            // Get DOI from article IDs
            let doi = null;
            const articleIds = article.articleids || [];
            for (const id of articleIds) {
                if (id.idtype === 'doi') {
                    doi = id.value;
                    break;
                }
            }

            publications.push({
                title,
                authors,
                year,
                journal,
                doi: normalizeDoi(doi),
                pmid,
                source: 'pubmed'
            });
        }

        console.log(`Fetched ${publications.length} publications from PubMed`);
        return publications;
    } catch (error) {
        console.error('Error fetching from PubMed:', error.message);
        return [];
    }
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title) {
    return (title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function allKnownPublications(existingData) {
    return [
        ...(existingData.approved || []),
        ...(existingData.pending || []),
        ...(existingData.rejected || [])
    ];
}

/**
 * Check if a publication already exists in our data.
 * `supersededBy` DOIs count as aliases so a preprint whose journal version is
 * already listed isn't re-proposed under its preprint DOI.
 */
function findExisting(pub, existingData) {
    const doiSet = new Set([pub.doi, ...(pub.supersededBy || [])].filter(Boolean));

    for (const existing of allKnownPublications(existingData)) {
        const existingDoi = normalizeDoi(existing.doi);

        if (existingDoi && doiSet.has(existingDoi)) {
            return existing;
        }

        if (pub.pmid && existing.pmid && String(pub.pmid) === String(existing.pmid)) {
            return existing;
        }

        if (normalizeTitle(pub.title) && normalizeTitle(pub.title) === normalizeTitle(existing.title)) {
            return existing;
        }
    }

    return null;
}

/**
 * If this journal article is the published version of a preprint already on
 * the site, return that preprint entry so it can be replaced rather than
 * duplicated.
 *
 * Crossref's `has-preprint` relation is the reliable signal but only appears
 * some weeks after publication, so fall back to a title match — bioRxiv titles
 * usually survive peer review unchanged.
 */
function findSupersededPreprint(pub, existingData) {
    if (pub.preprint) return null;

    const approved = existingData.approved || [];

    // Nothing to upgrade if this exact article is already listed.
    if (approved.some((e) => normalizeDoi(e.doi) === pub.doi)) return null;

    const byRelation = approved.find(
        (e) => e.preprint && (pub.hasPreprint || []).includes(normalizeDoi(e.doi))
    );
    if (byRelation) return byRelation;

    return approved.find(
        (e) => e.preprint && normalizeTitle(e.title) && normalizeTitle(e.title) === normalizeTitle(pub.title)
    ) || null;
}

/**
 * DOIs that already have an open review issue.
 *
 * Without this the weekly run re-opens an identical issue for anything not yet
 * approved or rejected — the repo has three copies of one publication from
 * three consecutive Mondays.
 */
async function fetchPendingReviewIds() {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) return new Set();

    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json'
    };

    // `state=open` returns an empty list on this repo even though open issues
    // exist — GitHub's issue-list index never recovered from the ~1,800 issues
    // opened by the old name-based search. Page newest-first over every issue
    // and filter here instead.
    // 300 most recent issues. Anything still awaiting review is recent; the
    // thousand-plus older ones are the historical false-positive flood.
    const MAX_PAGES = 3;
    const ids = new Set();
    let openOnLastPage = 0;
    let pagesRead = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
        const url =
            `https://api.github.com/repos/${repo}/issues` +
            `?state=all&sort=created&direction=desc&per_page=100&page=${page}`;

        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`GitHub issue list error: ${response.status}`);
        }

        const issues = await response.json();
        if (issues.length === 0) break;

        pagesRead = page;
        openOnLastPage = 0;

        for (const issue of issues) {
            if (issue.state !== 'open' || issue.pull_request) continue;
            openOnLastPage++;

            const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
            if (!labels.includes('publication')) continue;

            const body = issue.body || '';
            const doi = body.match(/\*\*DOI:\*\*\s*(\S+)/);
            if (doi) ids.add(normalizeDoi(doi[1]));

            // Some records only ever carry a PMID.
            const pmid = body.match(/\*\*PMID:\*\*\s*(\S+)/);
            if (pmid) ids.add(`pmid:${pmid[1].trim()}`);
        }
    }

    // Only a page that both filled the window and still held open issues
    // suggests there are older ones we didn't reach.
    if (pagesRead === MAX_PAGES && openOnLastPage > 0) {
        console.log(
            `::warning::Only the ${MAX_PAGES * 100} most recent issues were checked and the oldest ` +
            'page still held open ones; a duplicate review issue is possible.'
        );
    }

    console.log(`${ids.size} publication(s) already awaiting review`);
    return ids;
}

/**
 * Generate issue body for a new publication.
 *
 * The `replaces` marker is read back by approve-publication.js so approving a
 * journal version overwrites the preprint entry instead of duplicating it.
 */
function generateIssueBody(pub) {
    const lines = [
        pub.doi ? `**DOI:** ${pub.doi}` : '',
        pub.pmid ? `**PMID:** ${pub.pmid}` : '',
        `**Preprint:** ${pub.preprint ? 'yes' : 'no'}`
    ].filter(Boolean);

    const command = pub.doi ? `doi:${pub.doi}` : `pmid:${pub.pmid}`;

    const supersedeNote = pub.replaces
        ? `\n> ⬆️ This is the peer-reviewed version of a preprint already on the site (\`${pub.replaces}\`). Approving will **replace** that entry rather than add a second one.\n`
        : '';

    const replacesMarker = pub.replaces ? `\n<!-- replaces: ${pub.replaces} -->` : '';

    return `
## New Publication Detected
${supersedeNote}
**Title:** ${pub.title}

**Authors:** ${pub.authors || 'N/A'}

**Journal:** ${pub.journal || 'N/A'}

**Year:** ${pub.year || 'N/A'}

${lines.join('\n')}

**Source:** ${pub.source}

---

### Actions

**Reply to this email with a single word** — \`approve\` to add it to the website,
or \`reject\` to never be asked again. Put the word on the first line; the quoted
text below it is ignored.

Commenting here works too:

\`\`\`
/approve ${command}
\`\`\`
\`\`\`
/reject ${command}
\`\`\`
${replacesMarker}
`.trim();
}

/**
 * Create GitHub issue for a new publication
 */
async function createGitHubIssue(pub) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;

    if (!token || !repo) {
        console.log('GitHub token or repository not configured, skipping issue creation');
        return null;
    }

    const url = `https://api.github.com/repos/${repo}/issues`;
    const owner = repo.split('/')[0];

    const shortTitle = pub.title.length > 80 ? `${pub.title.substring(0, 80)}…` : pub.title;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `[New Publication] ${shortTitle}`,
            // Assign and @-mention the owner. Simply opening an issue only
            // emails people who watch the repo with "All Activity"; assignment
            // and mentions notify under the default settings too, and this
            // email *is* the review request the whole pipeline exists for.
            body: `@${owner}\n\n${generateIssueBody(pub)}`,
            labels: ['publication', 'pending-review'],
            assignees: [owner]
        })
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`GitHub API error: ${response.status} - ${error}`);
    }

    const issue = await response.json();
    console.log(`Created issue #${issue.number}: ${issue.html_url}`);
    return issue;
}

/**
 * Write the new_count output for GitHub Actions
 */
function setOutput(count) {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (outputFile) {
        fs.appendFileSync(outputFile, `new_count=${count}\n`);
    }
}

/**
 * Merge the per-source results, preferring the richest record for each work
 */
function dedupe(allFetched) {
    const bySource = { crossref: 0, pubmed: 1, europepmc: 2, orcid: 3 };
    const merged = [];

    // Sources describe the same work differently, so match on any identifier
    // rather than a single key — otherwise one paper becomes two issues.
    const sameWork = (a, b) =>
        (a.doi && b.doi && a.doi === b.doi) ||
        (a.pmid && b.pmid && String(a.pmid) === String(b.pmid)) ||
        (normalizeTitle(a.title) && normalizeTitle(a.title) === normalizeTitle(b.title));

    for (const pub of allFetched) {
        const index = merged.findIndex((m) => sameWork(m, pub));

        if (index === -1) {
            merged.push({ ...pub });
            continue;
        }

        const current = merged[index];

        // When a work turns up as both a preprint and a journal article, the
        // journal version is the one to describe it. Only sources that report
        // preprint status get a say — ORCID and PubMed leave the field unset,
        // which must not be read as "this is a journal article".
        const knowsPreprintStatus = (p) => p.source === 'crossref' || p.source === 'europepmc';
        const rank = (p) => (knowsPreprintStatus(p) && p.preprint ? 10 : 0) + bySource[p.source];

        const winner = rank(pub) < rank(current) ? { ...pub } : current;
        const loser = winner === current ? pub : current;

        winner.doi = winner.doi || loser.doi;
        winner.pmid = winner.pmid || loser.pmid;
        winner.authors = winner.authors || loser.authors;
        winner.journal = winner.journal || loser.journal;
        winner.year = winner.year || loser.year;
        winner.hasPreprint = [...(winner.hasPreprint || []), ...(loser.hasPreprint || [])];

        // A merged record must not claim to be superseded by itself.
        winner.supersededBy = [...(winner.supersededBy || []), ...(loser.supersededBy || [])]
            .filter((doi) => doi !== winner.doi);

        // Preprint status survives the merge only if the winner came from a
        // source that reports it; otherwise inherit what the loser knew.
        if (!knowsPreprintStatus(winner)) {
            winner.preprint = loser.preprint;
        }

        merged[index] = winner;
    }

    return merged;
}

/**
 * A preprint already on the site is "upgraded" once Crossref links it to a
 * journal version. Surface that journal version so approving it replaces the
 * preprint entry.
 */
function findPreprintUpgrades(uniquePubs, existingData) {
    const approved = existingData.approved || [];
    const upgrades = [];

    for (const pub of uniquePubs) {
        for (const publishedDoi of pub.supersededBy || []) {
            const preprintEntry = approved.find(
                (e) => normalizeDoi(e.doi) === normalizeDoi(pub.doi) && e.preprint
            );
            if (!preprintEntry) continue;

            // Includes the rejected list: a journal version turned down once
            // must not come back every Monday.
            const alreadyListed = allKnownPublications(existingData).some(
                (e) => normalizeDoi(e.doi) === publishedDoi
            );
            if (alreadyListed) continue;

            upgrades.push({ publishedDoi, replaces: normalizeDoi(preprintEntry.doi) });
        }
    }

    return upgrades;
}

/**
 * Main function
 */
async function main() {
    console.log('Starting publication check...\n');

    // Load existing publications
    let existingData;
    try {
        const fileContent = fs.readFileSync(PUBLICATIONS_FILE, 'utf-8');
        existingData = JSON.parse(fileContent);
    } catch (error) {
        // Exiting 0 here would report "no new publications" for a file that
        // simply failed to parse.
        console.error('Error loading publications file:', error.message);
        console.log('::error::Could not read data/publications.json.');
        setOutput(0);
        process.exit(1);
    }

    // Fetch from all sources
    const [crossrefPubs, europePmcPubs, orcidPubs, pubmedPubs] = await Promise.all([
        fetchCrossrefPublications(),
        fetchEuropePmcPublications(),
        fetchOrcidPublications(),
        fetchPubmedPublications()
    ]);

    // Crossref is the only source that sees preprints. If it's down, say so
    // instead of quietly reporting "no new publications".
    const crossrefFailed = crossrefPubs === null;

    const uniquePubs = dedupe([...(crossrefPubs || []), ...pubmedPubs, ...europePmcPubs, ...orcidPubs]);

    console.log(`\nTotal unique publications found: ${uniquePubs.length}`);

    // Skip data deposits (figshare/zenodo/dryad) — these are datasets linked
    // to the ORCID record, not papers, and shouldn't become review issues.
    const DATA_REPO_DOI = /(figshare|zenodo|dryad|\/m9\.figshare)/i;
    const isDataDeposit = pub => pub.doi && DATA_REPO_DOI.test(pub.doi);

    const candidates = [];
    let upgradeFailures = 0;

    for (const pub of uniquePubs) {
        if (isDataDeposit(pub)) {
            console.log(`  skip (data deposit): ${pub.doi}`);
            continue;
        }

        // Check for a preprint being upgraded before the "already listed"
        // check, because a journal version usually keeps the preprint's title
        // and would otherwise be mistaken for the entry it should replace.
        const superseded = findSupersededPreprint(pub, existingData);
        if (superseded) {
            pub.replaces = normalizeDoi(superseded.doi);
            console.log(`  preprint ${pub.replaces} is now published as ${pub.doi}`);
            candidates.push(pub);
            continue;
        }

        const existing = findExisting(pub, existingData);
        if (existing) {
            console.log(`  skip (already listed): ${pub.doi || pub.pmid} — ${pub.title.substring(0, 60)}`);
            continue;
        }

        // A preprint whose journal version exists is represented by that
        // journal version, not by the preprint itself.
        if (pub.preprint && pub.supersededBy?.length) {
            const publishedDoi = pub.supersededBy[0];
            console.log(`  preprint ${pub.doi} is published as ${publishedDoi}; using the journal version`);
            try {
                candidates.push(await fetchCrossrefWork(publishedDoi));
            } catch (error) {
                console.error(`  could not resolve ${publishedDoi}:`, error.message);
                candidates.push(pub);
            }
            continue;
        }

        candidates.push(pub);
    }

    // Preprints already on the site whose journal version isn't in the feed
    // (its publisher didn't deposit the ORCID iD), reachable only through the
    // preprint's own is-preprint-of relation.
    for (const upgrade of findPreprintUpgrades(uniquePubs, existingData)) {
        try {
            const published = await fetchCrossrefWork(upgrade.publishedDoi);
            published.replaces = upgrade.replaces;
            console.log(`  preprint ${upgrade.replaces} now published as ${upgrade.publishedDoi}`);
            candidates.push(published);
        } catch (error) {
            upgradeFailures++;
            console.error(`  could not resolve upgrade ${upgrade.publishedDoi}:`, error.message);
        }
    }

    // Best-effort: this only avoids a duplicate issue, so a GitHub hiccup here
    // must not cost us the publications we just found.
    let pendingReviewIds = new Set();
    try {
        pendingReviewIds = await fetchPendingReviewIds();
    } catch (error) {
        console.log(`::warning::Could not check for open review issues (${error.message}); a duplicate is possible.`);
    }

    // Final pass: drop anything the resolution steps turned into a duplicate
    const seen = new Set();
    const newPublications = candidates.filter((pub) => {
        const key = pub.doi || normalizeTitle(pub.title);
        if (seen.has(key)) return false;
        seen.add(key);

        if (
            (pub.doi && pendingReviewIds.has(pub.doi)) ||
            (pub.pmid && pendingReviewIds.has(`pmid:${pub.pmid}`))
        ) {
            console.log(`  skip (review issue already open): ${pub.doi || pub.pmid}`);
            return false;
        }

        // An upgrade legitimately matches the preprint entry it replaces, so
        // only its own DOI being on record rules it out.
        if (pub.replaces) {
            const recorded = allKnownPublications(existingData).some(
                (e) => normalizeDoi(e.doi) === pub.doi
            );
            if (recorded) {
                console.log(`  skip (upgrade already recorded): ${pub.doi}`);
            }
            return !recorded;
        }

        return !findExisting(pub, existingData);
    });

    console.log(`New publications: ${newPublications.length}`);

    let issueFailures = 0;

    if (newPublications.length === 0) {
        console.log('\nNo new publications found.');
    } else {
        console.log('\nCreating GitHub issues for new publications...');
        for (const pub of newPublications) {
            try {
                await createGitHubIssue(pub);
            } catch (error) {
                issueFailures++;
                console.error(`Error creating issue for "${pub.title}":`, error.message);
            }
        }
    }

    setOutput(newPublications.length);

    if (crossrefFailed) {
        console.log('::error::Crossref lookup failed — preprints were not checked this run.');
    }
    if (issueFailures > 0) {
        console.log(`::error::${issueFailures} review issue(s) could not be created.`);
    }
    if (upgradeFailures > 0) {
        console.log(`::error::${upgradeFailures} preprint(s) appear to be published but could not be resolved.`);
    }
    if (crossrefFailed || issueFailures > 0 || upgradeFailures > 0) {
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        console.log('::error::Publication check failed.');
        setOutput(0);
        process.exit(1);
    });
}

module.exports = {
    normalizeDoi,
    normalizeTitle,
    formatCrossrefAuthors,
    dedupe,
    findExisting,
    findSupersededPreprint,
    findPreprintUpgrades,
    generateIssueBody,
    fetchCrossrefWork,
    createGitHubIssue
};
