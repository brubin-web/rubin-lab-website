/**
 * Handle publication approval/rejection from GitHub issue comments
 * Called by the approve-publication.yml workflow
 */

const fs = require('fs');
const path = require('path');

const { build: buildPublicationsHtml } = require('./build-publications');

const PUBLICATIONS_FILE = path.join(__dirname, '..', 'data', 'publications.json');

function normalizeDoi(doi) {
    if (!doi) return null;
    return doi
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
}

function normalizeTitle(title) {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Parse command from issue comment
 * Format: /approve doi:10.1234/example or /reject pmid:12345678
 */
function parseCommand(comment) {
    const approveMatch = comment.match(/\/approve\s+(doi:|pmid:)(\S+)/i);
    const rejectMatch = comment.match(/\/reject\s+(doi:|pmid:)(\S+)/i);

    if (approveMatch) {
        return {
            action: 'approve',
            idType: approveMatch[1].replace(':', ''),
            idValue: approveMatch[2]
        };
    }

    if (rejectMatch) {
        return {
            action: 'reject',
            idType: rejectMatch[1].replace(':', ''),
            idValue: rejectMatch[2]
        };
    }

    return null;
}

/**
 * Parse publication details from issue body
 */
function parseIssueBody(body) {
    const titleMatch = body.match(/\*\*Title:\*\*\s*(.+)/);
    const authorsMatch = body.match(/\*\*Authors:\*\*\s*(.+)/);
    const journalMatch = body.match(/\*\*Journal:\*\*\s*(.+)/);
    const yearMatch = body.match(/\*\*Year:\*\*\s*(\d+)/);
    const doiMatch = body.match(/\*\*DOI:\*\*\s*(\S+)/);
    const pmidMatch = body.match(/\*\*PMID:\*\*\s*(\S+)/);
    const preprintMatch = body.match(/\*\*Preprint:\*\*\s*(\S+)/);
    // Written by fetch-publications.js when a journal version supersedes a
    // preprint that's already listed.
    const replacesMatch = body.match(/<!--\s*replaces:\s*(\S+)\s*-->/);

    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        authors: authorsMatch ? authorsMatch[1].trim() : '',
        journal: journalMatch ? journalMatch[1].trim() : '',
        year: yearMatch ? parseInt(yearMatch[1]) : null,
        doi: doiMatch ? normalizeDoi(doiMatch[1]) : null,
        pmid: pmidMatch ? pmidMatch[1].trim() : null,
        preprint: preprintMatch ? /^yes$/i.test(preprintMatch[1].trim()) : false,
        replaces: replacesMatch ? normalizeDoi(replacesMatch[1]) : null
    };
}

/**
 * Generate a stable, collision-free ID for a publication
 */
function generateId(pub, data) {
    const year = pub.year || new Date().getFullYear();
    const taken = new Set(
        [...(data.approved || []), ...(data.rejected || []), ...(data.pending || [])].map((p) => p.id)
    );

    for (let n = 1; n < 1000; n++) {
        const id = `pub-${year}-${String(n).padStart(3, '0')}`;
        if (!taken.has(id)) return id;
    }

    throw new Error(`could not allocate an id for ${year}`);
}

/**
 * Load publications data
 */
function loadPublications() {
    const content = fs.readFileSync(PUBLICATIONS_FILE, 'utf-8');
    return JSON.parse(content);
}

/**
 * Save publications data
 */
function savePublications(data) {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(PUBLICATIONS_FILE, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Find an entry this publication should overwrite: the preprint it supersedes,
 * the same DOI, or the same title.
 */
function findSupersededIndex(list, pub) {
    if (pub.replaces) {
        const idx = list.findIndex((e) => normalizeDoi(e.doi) === pub.replaces);
        if (idx !== -1) return idx;
    }

    if (pub.doi) {
        const idx = list.findIndex((e) => normalizeDoi(e.doi) === pub.doi);
        if (idx !== -1) return idx;
    }

    if (normalizeTitle(pub.title)) {
        const idx = list.findIndex((e) => normalizeTitle(e.title) === normalizeTitle(pub.title));
        if (idx !== -1) return idx;
    }

    return -1;
}

function setOutput(name, value) {
    const outputFile = process.env.GITHUB_OUTPUT;
    if (!outputFile) return;

    // Heredoc form, so titles containing newlines or quotes can't corrupt the file.
    const delimiter = `EOF_${name}_${Math.random().toString(36).substring(2, 10)}`;
    fs.appendFileSync(outputFile, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

/**
 * Main function
 */
async function main() {
    const comment = process.env.ISSUE_COMMENT || '';
    const issueBody = process.env.ISSUE_BODY || '';

    if (!comment) {
        console.error('No comment provided');
        process.exit(1);
    }

    const command = parseCommand(comment);
    if (!command) {
        console.log('No valid command found in comment');
        process.exit(0);
    }

    console.log(`Processing command: ${command.action} ${command.idType}:${command.idValue}`);

    const pubDetails = parseIssueBody(issueBody);
    console.log('Publication details:', pubDetails);

    if (!pubDetails.title) {
        console.error('Could not parse a title from the issue body; refusing to edit publications.json');
        process.exit(1);
    }

    // The comment names the record being acted on; make sure it matches the
    // issue body so a stray /approve on the wrong issue can't add a mismatch.
    const commentDoi = command.idType === 'doi' ? normalizeDoi(command.idValue) : null;
    if (commentDoi && pubDetails.doi && commentDoi !== pubDetails.doi) {
        console.error(`Comment DOI (${commentDoi}) does not match issue DOI (${pubDetails.doi})`);
        process.exit(1);
    }

    const data = loadPublications();

    // Create publication entry
    const publication = {
        id: generateId(pubDetails, data),
        title: pubDetails.title,
        authors: pubDetails.authors,
        journal: pubDetails.journal,
        year: pubDetails.year,
        doi: pubDetails.doi,
        links: {}
    };

    if (pubDetails.pmid) {
        publication.pmid = pubDetails.pmid;
    }

    if (pubDetails.preprint) {
        publication.preprint = true;
    }

    // Add DOI link if available
    if (pubDetails.doi) {
        publication.links.paper = `https://doi.org/${pubDetails.doi}`;
    }

    const list = command.action === 'approve' ? data.approved : data.rejected;
    const supersededIndex = findSupersededIndex(list, pubDetails);

    if (supersededIndex !== -1) {
        // Reuse the existing id so any external references stay valid.
        publication.id = list[supersededIndex].id;
        const previous = list[supersededIndex];
        list[supersededIndex] = publication;
        console.log(`Replaced "${previous.title}" (${previous.doi}) with "${publication.title}" (${publication.doi})`);
    } else if (command.action === 'approve') {
        // Newest paper first within its year, matching how the page reads.
        const insertAt = list.findIndex((e) => (e.year || 0) <= (publication.year || 0));
        if (insertAt === -1) {
            list.push(publication);
        } else {
            list.splice(insertAt, 0, publication);
        }
        console.log(`Added "${publication.title}" to approved publications`);
    } else {
        list.push(publication);
        console.log(`Added "${publication.title}" to rejected publications`);
    }

    // Newest first, so the JSON reads in the same order the page renders.
    data.approved.sort((a, b) => (b.year || 0) - (a.year || 0));

    savePublications(data);
    console.log('Publications file updated');

    // Keep the no-JS/crawler copy of the list in sync with the JSON.
    if (command.action === 'approve') {
        buildPublicationsHtml();
    }

    setOutput('action', command.action);
    setOutput('title', publication.title);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
