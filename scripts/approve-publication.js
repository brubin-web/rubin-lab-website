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
 * Keep only the part of a reply the reviewer actually typed.
 *
 * A reply sent by email arrives with the quoted issue text attached, and that
 * text lists BOTH /approve and /reject as instructions. Parsing the whole body
 * therefore sees two conflicting commands on every email reply. Strip the
 * quoted portion first so a one-word reply is unambiguous.
 */
function stripQuotedReply(comment) {
    const lines = comment.split(/\r?\n/);
    const kept = [];

    // Markers that begin the quoted tail of a mail client's reply. Everything
    // from here down was written by someone else (or by us), not the reviewer.
    const tailMarkers = [
        /^\s*>/,                                   // quoted line
        /^\s*On\b.*\bwrote:/i,                     // "On <date>, X wrote:" (Gmail, Apple Mail)
        /^\s*-{2,}\s*Original Message\s*-{2,}/i,   // Outlook
        /^\s*_{10,}\s*$/,                          // Outlook divider
        /^\s*--\s*$/,                              // signature delimiter
        /^\s*(—|-{1,3})\s*$/,                       // GitHub's footer rule
        /Reply to this email directly/i,
        /You are receiving this because/i,
        /view it on GitHub/i,
        /^\s*##\s*New Publication Detected/i       // the issue body itself
    ];

    for (const line of lines) {
        if (tailMarkers.some((re) => re.test(line))) {
            break;
        }
        kept.push(line);
    }

    return kept.join('\n').trim();
}

/**
 * Parse command from issue comment.
 *
 * Accepts a full command (`/approve doi:10.1234/example`) or, because one issue
 * covers exactly one publication, a bare `approve` / `reject` on its own line.
 * The bare form is what makes a one-word reply to the notification email work.
 * Requiring the word to be alone on its line keeps prose like "I approve of
 * publishing this" from triggering anything.
 */
function parseCommand(comment) {
    const body = stripQuotedReply(comment);
    const verb = (action) =>
        new RegExp(`^[ \t]*/?${action}(?:[ \t]+(doi:|pmid:)(\\S+))?[ \t]*\\.?[ \t]*$`, 'im');

    const approveMatch = body.match(verb('approve'));
    const rejectMatch = body.match(verb('reject'));

    // Both commands still present after stripping the quote means the reviewer
    // really did type two things. Guessing which one was meant risks publishing
    // something that was being rejected, so refuse instead.
    if (approveMatch && rejectMatch) {
        return { ambiguous: true };
    }

    const match = approveMatch || rejectMatch;
    if (!match) {
        return null;
    }

    return {
        action: approveMatch ? 'approve' : 'reject',
        idType: match[1] ? match[1].replace(':', '') : null,
        idValue: match[2] || null
    };
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

    // generateIssueBody writes "N/A" for fields a source didn't provide;
    // that placeholder must not end up rendered on the page.
    const value = (match) => {
        const text = match ? match[1].trim() : '';
        return text === 'N/A' ? '' : text;
    };

    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        authors: value(authorsMatch),
        journal: value(journalMatch),
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

    // Title fallback only for a journal version taking over from a preprint.
    // Matching any same-titled entry would let one publication silently
    // overwrite an unrelated one.
    if (!pub.preprint && normalizeTitle(pub.title)) {
        const idx = list.findIndex(
            (e) => e.preprint && normalizeTitle(e.title) === normalizeTitle(pub.title)
        );
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

    // Anything the reviewer needs to know goes out as `problem`, and the
    // workflow posts it on the issue. Exiting non-zero instead would skip that
    // step, leaving a red badge and no explanation on the issue itself.
    const refuse = (message) => {
        console.error(message);
        setOutput('problem', message);
        process.exit(0);
    };

    const command = parseCommand(comment);
    if (!command) {
        // The workflow fires on any comment containing "approve" or "reject",
        // so most misses here are ordinary prose, not a botched command.
        // Only answer when the reviewer clearly meant to issue one.
        const attempted = /(^|\s)\/(approve|reject)\b/i.test(comment) ||
            /^\s*\/?(approve|reject)\b/i.test(stripQuotedReply(comment));
        if (!attempted) {
            console.log('Comment is not a command; nothing to do.');
            process.exit(0);
        }
        refuse('I could not read that command. Reply with `approve` or `reject` on a line by itself, or use the full `/approve doi:<DOI>` form.');
    }

    if (command.ambiguous) {
        refuse('That comment contains both an approve and a reject command, so I did nothing. Reply again with just one of them on the first line.');
    }

    console.log(`Processing command: ${command.action} ${command.idValue ? `${command.idType}:${command.idValue}` : '(id taken from the issue)'}`);

    const pubDetails = parseIssueBody(issueBody);
    console.log('Publication details:', pubDetails);

    if (!pubDetails.title) {
        refuse('I could not find a publication title in this issue, so nothing was changed.');
    }

    // The comment names the record being acted on; make sure it matches the
    // issue body so a stray /approve on the wrong issue can't add a mismatch.
    const commentDoi = command.idType === 'doi' ? normalizeDoi(command.idValue) : null;
    if (commentDoi && pubDetails.doi && commentDoi !== pubDetails.doi) {
        refuse(`The DOI in your comment (\`${commentDoi}\`) doesn't match the one in this issue (\`${pubDetails.doi}\`), so nothing was changed.`);
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
        const previous = list[supersededIndex];

        // Reuse the existing id so any external references stay valid.
        publication.id = previous.id;

        // Carry over anything that was curated by hand and can't be recovered
        // from publisher metadata — PDF/data/code links, a PMID the new record
        // lacks. The new paper link wins.
        publication.links = { ...(previous.links || {}), ...publication.links };
        publication.pmid = publication.pmid || previous.pmid;
        if (!publication.pmid) delete publication.pmid;

        // A journal version is no longer a preprint, but replacing one
        // preprint with another keeps the badge.
        if (!pubDetails.preprint && previous.preprint && publication.doi !== normalizeDoi(previous.doi)) {
            delete publication.preprint;
        }

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
