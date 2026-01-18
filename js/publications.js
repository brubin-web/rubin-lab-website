/**
 * Publications loader for Rubin Lab website
 * Fetches publications from data/publications.json and renders them dynamically
 */

(function() {
    'use strict';

    const PUBLICATIONS_URL = 'data/publications.json';
    const CONTAINER_ID = 'publications-container';
    const GOOGLE_SCHOLAR_URL = 'https://scholar.google.com/citations?user=YOUR_SCHOLAR_ID';

    /**
     * Format author string with bold highlighting for Rubin BE
     */
    function formatAuthors(authors) {
        return authors.replace(/Rubin BE/g, '<strong>Rubin BE</strong>');
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
                return `<a href="${url}" class="publication-link" target="_blank" rel="noopener">${label}</a>`;
            })
            .join('\n                        ');

        return linksHTML ? `<div class="publication-links">\n                        ${linksHTML}\n                    </div>` : '';
    }

    /**
     * Create a single publication item HTML
     */
    function createPublicationHTML(pub) {
        const doiLink = pub.doi ? `https://doi.org/${pub.doi}` : '#';
        const linksHTML = createLinksHTML(pub.links);

        return `
                <article class="publication-item">
                    <h3 class="publication-title">
                        <a href="${doiLink}"${pub.doi ? ' target="_blank" rel="noopener"' : ''}>${pub.title}</a>
                    </h3>
                    <p class="publication-authors">
                        ${formatAuthors(pub.authors)}
                    </p>
                    <p class="publication-journal">
                        <em>${pub.journal}</em> (${pub.year})
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
                <h2 class="publications-year-title">${year}</h2>
                ${grouped[year].map(createPublicationHTML).join('')}
            </div>`;
        });

        // Add Google Scholar link
        html += `
            <div class="publications-more">
                <p>For a complete list of publications, visit:</p>
                <a href="${GOOGLE_SCHOLAR_URL}" class="btn btn-secondary" target="_blank" rel="noopener">Google Scholar Profile</a>
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
