#!/usr/bin/env node
/**
 * Regenerates the <noscript> publication list in publications.html from
 * data/publications.json.
 *
 * js/publications.js renders the same data at runtime; this static copy is
 * what crawlers and no-JS browsers see. Generating it means the two can't
 * drift apart when a publication is added.
 *
 * Run after editing data/publications.json:
 *     node scripts/build-publications.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLICATIONS_FILE = path.join(ROOT, 'data', 'publications.json');
const PUBLICATIONS_HTML = path.join(ROOT, 'publications.html');
const ORCID_URL = 'https://orcid.org/0000-0001-8684-2417';

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Matches js/publications.js, which bolds the lab PI in the author list.
function formatAuthors(authors) {
    return escapeHtml(authors).replace(/Rubin BE/g, '<strong>Rubin BE</strong>');
}

function publicationHTML(pub) {
    const href = pub.doi ? `https://doi.org/${escapeHtml(pub.doi)}` : '#';
    const target = pub.doi ? ' target="_blank" rel="noopener"' : '';
    const badge = pub.preprint ? ' <span class="publication-badge">Preprint</span>' : '';

    return `
                    <article class="publication-item">
                        <h3 class="publication-title">
                            <a href="${href}"${target}>${escapeHtml(pub.title)}</a>
                        </h3>
                        <p class="publication-authors">
                            ${formatAuthors(pub.authors)}
                        </p>
                        <p class="publication-journal">
                            <em>${escapeHtml(pub.journal)}</em> (${escapeHtml(pub.year)})${badge}
                        </p>
                    </article>`;
}

function noscriptHTML(publications) {
    const byYear = new Map();
    for (const pub of publications) {
        if (!byYear.has(pub.year)) byYear.set(pub.year, []);
        byYear.get(pub.year).push(pub);
    }

    const years = [...byYear.keys()].sort((a, b) => b - a);

    const blocks = years.map((year) => `
                <div class="publications-year">
                    <h2 class="publications-year-title">${escapeHtml(year)}</h2>
${byYear.get(year).map(publicationHTML).join('\n')}
                </div>`);

    return `<noscript>${blocks.join('\n')}

                <div class="publications-more">
                    <p>Ben Rubin's full publication record is available on
                        <a href="${ORCID_URL}" target="_blank" rel="noopener">ORCID</a>.</p>
                </div>
            </noscript>`;
}

function build() {
    const data = JSON.parse(fs.readFileSync(PUBLICATIONS_FILE, 'utf8'));
    const approved = (data.approved || []).slice().sort((a, b) => (b.year || 0) - (a.year || 0));

    const before = fs.readFileSync(PUBLICATIONS_HTML, 'utf8');
    const re = /<noscript>[\s\S]*?<\/noscript>/;
    if (!re.test(before)) {
        throw new Error('no <noscript> block found in publications.html');
    }

    const after = before.replace(re, noscriptHTML(approved));

    if (after === before) {
        console.log('publications.html unchanged');
        return false;
    }

    fs.writeFileSync(PUBLICATIONS_HTML, after);
    console.log(`publications.html updated (${approved.length} publications)`);
    return true;
}

if (require.main === module) {
    build();
}

module.exports = { build };
