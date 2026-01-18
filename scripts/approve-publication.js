/**
 * Handle publication approval/rejection from GitHub issue comments
 * Called by the approve-publication.yml workflow
 */

const fs = require('fs');
const path = require('path');

const PUBLICATIONS_FILE = path.join(__dirname, '..', 'data', 'publications.json');

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

    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        authors: authorsMatch ? authorsMatch[1].trim() : '',
        journal: journalMatch ? journalMatch[1].trim() : '',
        year: yearMatch ? parseInt(yearMatch[1]) : null,
        doi: doiMatch ? doiMatch[1].trim() : null,
        pmid: pmidMatch ? pmidMatch[1].trim() : null
    };
}

/**
 * Generate a unique ID for a publication
 */
function generateId(pub) {
    const year = pub.year || new Date().getFullYear();
    const randomSuffix = Math.random().toString(36).substring(2, 5);
    return `pub-${year}-${randomSuffix}`;
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
    fs.writeFileSync(PUBLICATIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Main function
 */
async function main() {
    const comment = process.env.ISSUE_COMMENT || '';
    const issueBody = process.env.ISSUE_BODY || '';
    const issueNumber = process.env.ISSUE_NUMBER || '';

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

    // Load existing data
    const data = loadPublications();

    // Create publication entry
    const publication = {
        id: generateId(pubDetails),
        title: pubDetails.title,
        authors: pubDetails.authors,
        journal: pubDetails.journal,
        year: pubDetails.year,
        doi: pubDetails.doi,
        pmid: pubDetails.pmid,
        links: {}
    };

    // Add DOI link if available
    if (pubDetails.doi) {
        publication.links.paper = `https://doi.org/${pubDetails.doi}`;
    }

    if (command.action === 'approve') {
        // Add to approved list
        data.approved.push(publication);
        console.log(`Added "${publication.title}" to approved publications`);
    } else if (command.action === 'reject') {
        // Add to rejected list
        data.rejected.push(publication);
        console.log(`Added "${publication.title}" to rejected publications`);
    }

    // Save updated data
    savePublications(data);
    console.log('Publications file updated');

    // Output for GitHub Actions
    console.log(`::set-output name=action::${command.action}`);
    console.log(`::set-output name=title::${publication.title}`);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
