#!/usr/bin/env node
// Writes the shared header & footer directly into every page's HTML.
//
// Edit the navLinks / funders definitions below, then run:
//     node scripts/build-shell.js
//
// The markup lands in the HTML itself rather than being injected at runtime so
// that crawlers which don't execute JavaScript still see the internal links.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const navLinks = [
    { label: 'Home', href: '/', slug: 'index' },
    { label: 'Research', href: '/research', slug: 'research' },
    { label: 'People', href: '/people', slug: 'people' },
    { label: 'Publications', href: '/publications', slug: 'publications' },
    { label: 'News', href: '/news', slug: 'news' },
    { label: 'Contact', href: '/contact', slug: 'contact' }
];

const funders = [
    { src: 'images/funders/igi.jpg', alt: 'Innovative Genomics Institute' },
    { src: 'images/funders/jbei.png', alt: 'Joint BioEnergy Institute' },
    { src: 'images/funders/curci.png', alt: 'Shurl and Kay Curci Foundation' },
    { src: 'images/funders/doe.png', alt: 'U.S. Department of Energy' },
    { src: 'images/funders/audacious.png', alt: 'TED Audacious Project' },
    { src: 'images/funders/helmsley.png', alt: 'The Helmsley Charitable Trust' }
];

const footerQuickLinks = ['research', 'people', 'publications', 'contact'];

const YEAR = 2026;

function headerHTML(slug) {
    const items = navLinks.map((l) => {
        const active = l.slug === slug ? ' active' : '';
        const current = l.slug === slug ? ' aria-current="page"' : '';
        return `                        <li><a href="${l.href}" class="nav-link${active}"${current}>${l.label}</a></li>`;
    }).join('\n');

    return `        <div class="container">
            <div class="header-content">
                <a href="/" class="logo">
                    <img src="images/logos/black-logo.png" alt="Rubin Lab" class="logo-icon">
                    <span class="logo-text">Rubin Lab</span>
                </a>
                <nav class="nav" id="nav" aria-label="Main navigation">
                    <ul class="nav-list">
${items}
                    </ul>
                </nav>
                <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle menu" aria-controls="nav" aria-expanded="false">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>
            </div>
        </div>`;
}

function footerHTML() {
    const logos = funders.map((f) =>
        `                    <img src="${f.src}" alt="${f.alt}" class="footer-funder-logo" loading="lazy">`
    ).join('\n');

    const quick = footerQuickLinks.map((slug) => {
        const l = navLinks.find((n) => n.slug === slug);
        return `                        <li><a href="${l.href}">${l.label}</a></li>`;
    }).join('\n');

    return `        <div class="container">
            <div class="footer-content">
                <div class="footer-info">
                    <h3 class="footer-logo">Rubin Lab</h3>
                    <p class="footer-affiliation">
                        Innovative Genomics Institute<br>
                        University of California, Berkeley
                    </p>
                </div>
                <div class="footer-links">
                    <h4 class="footer-heading">Quick Links</h4>
                    <ul>
${quick}
                    </ul>
                </div>
                <div class="footer-contact">
                    <h4 class="footer-heading">Contact</h4>
                    <p>
                        Innovative Genomics Institute<br>
                        2151 Berkeley Way, Room 220<br>
                        Berkeley, CA 94704<br>
                        <a href="mailto:brubin@berkeley.edu">brubin@berkeley.edu</a><br>
                        Bluesky: <a href="https://bsky.app/profile/therubinlab.bsky.social" target="_blank" rel="noopener noreferrer">@therubinlab</a>
                    </p>
                </div>
            </div>
            <div class="footer-funder">
                <p class="footer-funder-text">Supported by</p>
                <div class="footer-funder-logos">
${logos}
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; <span id="footer-year">${YEAR}</span> Rubin Lab. All rights reserved.</p>
            </div>
        </div>`;
}

// Replace the whole <header class="header">…</header> / <footer class="footer">…</footer>
// block so re-running the script is idempotent.
function replaceBlock(html, tag, cls, inner) {
    const re = new RegExp(`<${tag} class="${cls}">[\\s\\S]*?</${tag}>`);
    if (!re.test(html)) {
        throw new Error(`no <${tag} class="${cls}"> block found`);
    }
    return html.replace(re, `<${tag} class="${cls}">\n${inner}\n    </${tag}>`);
}

let changed = 0;
for (const l of navLinks) {
    const file = path.join(ROOT, `${l.slug}.html`);
    const before = fs.readFileSync(file, 'utf8');
    let after = replaceBlock(before, 'header', 'header', headerHTML(l.slug));
    after = replaceBlock(after, 'footer', 'footer', footerHTML());
    if (after !== before) {
        fs.writeFileSync(file, after);
        changed++;
        console.log(`updated ${l.slug}.html`);
    } else {
        console.log(`unchanged ${l.slug}.html`);
    }
}
console.log(`\n${changed} file(s) updated.`);
