/**
 * Publications loader for Rubin Lab website
 * Fetches publications from data/publications.json and renders them dynamically
 */

(function() {
    'use strict';

    const PUBLICATIONS_URL = 'data/publications.json';
    const LAB_MEMBERS_URL = 'data/lab-members.json';
    const CONTAINER_ID = 'publications-container';
    const ORCID_URL = 'https://orcid.org/0000-0001-8684-2417';

    // Surname + first initial of every current and former lab member, so their
    // names can be bolded in author lists. Falls back to the PI alone if the
    // roster can't be loaded.
    let labMemberKeys = new Set(['rubin|B']);

    /**
     * Escape text before it goes into innerHTML. Publication data comes from
     * publisher metadata, so it must not be trusted as markup.
     */
    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * "Martinson JNV" -> "martinson|J". Matching on the first initial only
     * keeps working when a paper spells out more middle initials than another.
     */
    function authorKey(author) {
        const parts = author.trim().split(/\s+/);
        if (parts.length < 2) return null;

        const initials = parts[parts.length - 1];
        if (!/^[A-Za-z]/.test(initials)) return null;

        const surname = parts.slice(0, -1).join(' ');
        return `${surname.toLowerCase()}|${initials[0].toUpperCase()}`;
    }

    /**
     * Format an author string, bolding current and former lab members
     */
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

    /**
     * Load the lab roster used for bolding author names
     */
    async function loadLabMembers() {
        try {
            const response = await fetch(LAB_MEMBERS_URL);
            if (!response.ok) return;

            const data = await response.json();
            const keys = (data.members || [])
                .filter((m) => m.surname && m.initial)
                .map((m) => `${m.surname.toLowerCase()}|${m.initial.toUpperCase()}`);

            if (keys.length > 0) {
                labMemberKeys = new Set(keys);
            }
        } catch (error) {
            console.error('Could not load lab members; bolding the PI only:', error);
        }
    }

    /**
     * Create publication links HTML
     */
    function createLinksHTML(links) {
        if (!links || Object.keys(links).length === 0) {
            return '';
        }

        const linkLabels = {
            paper: 'Paper',
            pdf: 'PDF',
            data: 'Data',
            code: 'Code',
            preprint: 'Preprint',
            supplement: 'Supplement'
        };

        const linksHTML = Object.entries(links)
            .filter(([key, url]) => url && url !== '#')
            .map(([key, url]) => {
                const label = linkLabels[key] || key.charAt(0).toUpperCase() + key.slice(1);
                return `<a href="${escapeHtml(url)}" class="publication-link" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
            })
            .join('\n                        ');

        return linksHTML ? `<div class="publication-links">\n                        ${linksHTML}\n                    </div>` : '';
    }

    /**
     * Create a single publication item HTML
     */
    function createPublicationHTML(pub) {
        const doiLink = pub.doi ? escapeHtml(`https://doi.org/${pub.doi}`) : '#';
        const linksHTML = createLinksHTML(pub.links);

        return `
                <article class="publication-item">
                    <h3 class="publication-title">
                        <a href="${doiLink}"${pub.doi ? ' target="_blank" rel="noopener"' : ''}>${escapeHtml(pub.title)}</a>
                    </h3>
                    <p class="publication-authors">
                        ${formatAuthors(pub.authors)}
                    </p>
                    <p class="publication-journal">
                        <em>${escapeHtml(pub.journal)}</em> (${escapeHtml(pub.year)})${pub.preprint ? ' <span class="publication-badge">Preprint</span>' : ''}
                    </p>
                    ${linksHTML}
                </article>`;
    }

    /**
     * Group publications by year
     */
    function groupByYear(publications) {
        const grouped = {};
        publications.forEach(pub => {
            const year = pub.year;
            if (!grouped[year]) {
                grouped[year] = [];
            }
            grouped[year].push(pub);
        });
        return grouped;
    }

    /**
     * Render all publications into the container
     */
    function renderPublications(publications) {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) {
            console.error('Publications container not found');
            return;
        }

        if (!publications || publications.length === 0) {
            container.innerHTML = `
                <div class="publications-empty">
                    <p>No publications available at this time.</p>
                </div>
            `;
            return;
        }

        // Group by year and sort years descending
        const grouped = groupByYear(publications);
        const years = Object.keys(grouped).sort((a, b) => b - a);

        let html = '';

        years.forEach(year => {
            html += `
            <div class="publications-year">
                <h2 class="publications-year-title">${escapeHtml(year)}</h2>
                ${grouped[year].map(createPublicationHTML).join('')}
            </div>`;
        });

        // Link out to the full, canonical publication record on ORCID
        html += `
            <div class="publications-more">
                <p>Ben Rubin's full publication record is available on ORCID:</p>
                <a href="${ORCID_URL}" class="btn btn-secondary" target="_blank" rel="noopener">ORCID Profile</a>
            </div>
        `;

        container.innerHTML = html;
    }

    /**
     * Show loading state
     */
    function showLoading() {
        const container = document.getElementById(CONTAINER_ID);
        if (container) {
            container.innerHTML = `
                <div class="publications-loading">
                    <div class="loading-spinner"></div>
                    <p>Loading publications...</p>
                </div>
            `;
        }
    }

    /**
     * Show error state
     */
    function showError(message) {
        // The "bold means lab member" note explains a list that isn't there.
        const note = document.getElementById('publications-note');
        if (note) {
            note.style.display = 'none';
        }

        const container = document.getElementById(CONTAINER_ID);
        if (container) {
            container.innerHTML = `
                <div class="publications-error">
                    <p>Unable to load publications. Please try again later.</p>
                </div>
            `;
            console.error('Publications error:', message);
        }
    }

    /**
     * Fetch and render publications
     */
    async function loadPublications() {
        const container = document.getElementById(CONTAINER_ID);
        if (!container) {
            return; // Not on publications page
        }

        showLoading();

        try {
            await loadLabMembers();

            const response = await fetch(PUBLICATIONS_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            // Only show approved publications
            const approvedPublications = data.approved || [];
            renderPublications(approvedPublications);
        } catch (error) {
            showError(error.message);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPublications);
    } else {
        loadPublications();
    }
})();
