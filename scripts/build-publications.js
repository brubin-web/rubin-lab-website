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
const LAB_MEMBERS_FILE = path.join(ROOT, 'data', 'lab-members.json');
const PUBLICATIONS_HTML = path.join(ROOT, 'publications.html');
const ORCID_URL = 'https://orcid.org/0000-0001-8684-2417';

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Keep in step with js/publications.js, which applies the same rule at runtime.
function loadLabMemberKeys() {
    try {
        const data = JSON.parse(fs.readFileSync(LAB_MEMBERS_FILE, 'utf8'));
        const keys = (data.members || [])
            .filter((m) => m.surname && m.initial)
            .map((m) => `${m.surname.toLowerCase()}|${m.initial.toUpperCase()}`);
        if (keys.length > 0) return new Set(keys);
    } catch (error) {
        console.warn(`Could not read ${LAB_MEMBERS_FILE}; bolding the PI only.`);
    }
    return new Set(['rubin|B']);
}

const labMemberKeys = loadLabMemberKeys();

// "Martinson JNV" -> "martinson|J"
function authorKey(author) {
    const parts = author.trim().split(/\s+/);
    if (parts.length < 2) return null;

    const initials = parts[parts.length - 1];
    if (!/^[A-Za-z]/.test(initials)) return null;

    const surname = parts.slice(0, -1).join(' ');
    return `${surname.toLowerCase()}|${initials[0].toUpperCase()}`;
}

function formatAuthors(authors) {
    return String(authors == null ? '' : authors)
        .split(/,\s*/)
        .filter((name) => name.length > 0)
        .map((name) => {
            const key = authorKey(name);
            const safe = escapeHtml(name);
            return key && labMemberKeys.has(key) ? `<strong>${safe}</strong>` : safe;
        })
        .join(', ');
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
