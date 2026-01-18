/**
 * Fetch publications from ORCID and PubMed APIs
 * Compares against existing publications and creates GitHub issues for new ones
 */

const fs = require('fs');
const path = require('path');

const ORCID_ID = '0000-0001-8684-2417';
const PUBMED_AUTHOR = 'Rubin BE';
const PUBLICATIONS_FILE = path.join(__dirname, '..', 'data', 'publications.json');

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
                    doi,
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

    // Search for author
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(PUBMED_AUTHOR)}[Author]&retmax=100&retmode=json${apiKeyParam}`;

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
                doi,
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
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

/**
 * Check if a publication already exists in our data
 */
function publicationExists(pub, existingData) {
    const allExisting = [
        ...(existingData.approved || []),
        ...(existingData.pending || []),
        ...(existingData.rejected || [])
    ];

    for (const existing of allExisting) {
        // Match by DOI
        if (pub.doi && existing.doi && pub.doi === existing.doi) {
            return true;
        }

        // Match by PMID
        if (pub.pmid && existing.pmid && pub.pmid === existing.pmid) {
            return true;
        }

        // Match by normalized title
        if (normalizeTitle(pub.title) === normalizeTitle(existing.title)) {
            return true;
        }
    }

    return false;
}

/**
 * Generate issue body for a new publication
 */
function generateIssueBody(pub) {
    const doiLine = pub.doi ? `**DOI:** ${pub.doi}` : '';
    const pmidLine = pub.pmid ? `**PMID:** ${pub.pmid}` : '';

    return `
## New Publication Detected

**Title:** ${pub.title}

**Authors:** ${pub.authors || 'N/A'}

**Journal:** ${pub.journal || 'N/A'}

**Year:** ${pub.year || 'N/A'}

${doiLine}
${pmidLine}

**Source:** ${pub.source}

---

### Actions

To approve this publication and add it to the website, comment:
\`\`\`
/approve ${pub.doi ? `doi:${pub.doi}` : `pmid:${pub.pmid}`}
\`\`\`

To reject this publication (won't be asked again), comment:
\`\`\`
/reject ${pub.doi ? `doi:${pub.doi}` : `pmid:${pub.pmid}`}
\`\`\`
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

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: `[New Publication] ${pub.title.substring(0, 80)}...`,
            body: generateIssueBody(pub),
            labels: ['publication', 'pending-review']
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
 * Send email notification about new publications
 */
async function sendEmailNotification(newPublications) {
    const email = process.env.NOTIFY_EMAIL;
    const emailUser = process.env.EMAIL_USERNAME;
    const emailPass = process.env.EMAIL_PASSWORD;

    if (!email || !emailUser || !emailPass) {
        console.log('Email configuration not complete, skipping email notification');
        return;
    }

    // Email sending would require nodemailer or similar
    // For now, we rely on GitHub Actions email notifications
    console.log(`Would send email to ${email} about ${newPublications.length} new publications`);
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
        console.error('Error loading publications file:', error.message);
        process.exit(1);
    }

    // Fetch from both sources
    const [orcidPubs, pubmedPubs] = await Promise.all([
        fetchOrcidPublications(),
        fetchPubmedPublications()
    ]);

    // Combine and deduplicate
    const allFetched = [...orcidPubs, ...pubmedPubs];
    const seen = new Set();
    const uniquePubs = [];

    for (const pub of allFetched) {
        const key = pub.doi || pub.pmid || normalizeTitle(pub.title);
        if (!seen.has(key)) {
            seen.add(key);
            uniquePubs.push(pub);
        }
    }

    console.log(`\nTotal unique publications found: ${uniquePubs.length}`);

    // Find new publications
    const newPublications = uniquePubs.filter(pub => !publicationExists(pub, existingData));

    console.log(`New publications: ${newPublications.length}`);

    if (newPublications.length === 0) {
        console.log('\nNo new publications found.');
        return;
    }

    // Create issues for new publications
    console.log('\nCreating GitHub issues for new publications...');
    for (const pub of newPublications) {
        try {
            await createGitHubIssue(pub);
        } catch (error) {
            console.error(`Error creating issue for "${pub.title}":`, error.message);
        }
    }

    // Send email notification
    await sendEmailNotification(newPublications);

    // Output for GitHub Actions
    console.log(`\n::set-output name=new_count::${newPublications.length}`);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
