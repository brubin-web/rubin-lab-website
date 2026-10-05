/** Shared, on-demand paper previews for Publications and Research. */
(function() {
    'use strict';

    const SELECTOR = '.publication-title a, .research-papers a';
    const enhanced = new WeakSet();
    const hoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
    let papers = new Map();
    let figures = {};
    let panel;
    let active;
    let openTimer;
    let closeTimer;
    let lastInput = 'keyboard';

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function externalLink(label, url) {
        const link = element('a', '', label);
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        return link;
    }

    function doiFromLink(link) {
        try {
            const url = new URL(link.href);
            return url.hostname === 'doi.org' ? decodeURIComponent(url.pathname.slice(1)).toLowerCase() : '';
        } catch (_) {
            return '';
        }
    }

    function clearTimers() {
        window.clearTimeout(openTimer);
        window.clearTimeout(closeTimer);
    }

    function containsFocus() {
        return active && (panel.contains(document.activeElement) ||
            document.activeElement === active.entry.link || document.activeElement === active.entry.button);
    }

    function closePreview(returnFocus) {
        clearTimers();
        if (!active) return;
        const entry = active.entry;
        active = null;
        panel.hidden = true;
        entry.button.setAttribute('aria-expanded', 'false');
        if (entry.description) entry.link.setAttribute('aria-describedby', entry.description);
        else entry.link.removeAttribute('aria-describedby');
        if (returnFocus) entry.button.focus({ preventScroll: true });
    }

    function scheduleClose() {
        window.clearTimeout(openTimer);
        window.clearTimeout(closeTimer);
        closeTimer = window.setTimeout(function() {
            if (active && !active.pinned && !containsFocus()) closePreview(false);
        }, 180);
    }

    function handleFocusOut() {
        window.setTimeout(function() {
            if (active && !containsFocus()) closePreview(false);
        }, 0);
    }

    function positionPreview() {
        if (!active) return;
        const margin = 12;
        const width = window.innerWidth;
        const height = window.innerHeight;
        const anchor = active.anchor.getBoundingClientRect();
        if (anchor.bottom < 0 || anchor.top > height) {
            closePreview(false);
            return;
        }
        panel.style.width = Math.min(420, width - margin * 2) + 'px';
        panel.style.maxHeight = Math.max(100, height - margin * 2) + 'px';
        const bounds = panel.getBoundingClientRect();
        const left = Math.max(margin, Math.min(anchor.left, width - bounds.width - margin));
        const below = anchor.bottom + 8;
        const above = anchor.top - bounds.height - 8;
        const top = below + bounds.height <= height - margin ? below :
            (above >= margin ? above : Math.max(margin, height - bounds.height - margin));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
    }

    function createPanel() {
        panel = element('section', 'paper-preview');
        panel.id = 'paper-preview';
        panel.hidden = true;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-labelledby', 'paper-preview-heading');
        panel.addEventListener('pointerenter', function() { window.clearTimeout(closeTimer); });
        panel.addEventListener('pointerleave', scheduleClose);
        panel.addEventListener('focusout', handleFocusOut);
        document.body.appendChild(panel);
    }

    function openPreview(entry, anchor, pinned) {
        clearTimers();
        if (active && active.entry === entry) {
            if (pinned) {
                active.pinned = true;
                active.anchor = anchor;
                positionPreview();
                panel.querySelector('.paper-preview-close').focus({ preventScroll: true });
            }
            return;
        }
        closePreview(false);
        if (!panel) createPanel();
        panel.replaceChildren();

        const asset = figures[entry.doi];
        const hasFigure = asset && asset.status === 'available';
        const header = element('div', 'paper-preview-header');
        const heading = element('h2', '', hasFigure ? asset.label : 'Paper details');
        heading.id = 'paper-preview-heading';
        const close = element('button', 'paper-preview-close', '×');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close paper preview');
        close.addEventListener('click', function() { closePreview(true); });
        header.append(heading, close);
        panel.appendChild(header);

        const title = element('p', 'paper-preview-title', entry.paper.title);
        panel.appendChild(title);
        const summary = element('p', 'paper-preview-summary');
        summary.id = 'paper-preview-summary';

        if (hasFigure) {
            const figure = element('figure', 'paper-preview-figure');
            const image = document.createElement('img');
            image.alt = asset.alt;
            image.width = asset.width;
            image.height = asset.height;
            image.decoding = 'async';
            image.loading = 'lazy';
            const caption = element('figcaption', '', asset.caption);
            const failure = element('p', 'paper-preview-unavailable', 'This figure could not load. You can view it in the paper.');
            failure.hidden = true;
            failure.setAttribute('role', 'status');
            image.addEventListener('load', positionPreview);
            image.addEventListener('error', function() {
                image.hidden = true;
                failure.hidden = false;
                positionPreview();
            });
            figure.append(image, failure, caption);
            panel.appendChild(figure);
            summary.textContent = asset.attribution;
            summary.append(' ', externalLink(asset.license, asset.licenseUrl));
            if (asset.additionalCredit) {
                summary.appendChild(element('span', 'paper-preview-extra-credit', asset.additionalCredit));
            }
            panel.appendChild(summary);
            const links = element('div', 'paper-preview-links');
            links.append(externalLink('Full figure', asset.src), externalLink('Source', asset.sourceUrl),
                externalLink('Read paper', entry.link.href));
            panel.appendChild(links);
            // No figure URL is assigned, requested or preloaded before user intent.
            image.src = asset.src;
        } else {
            summary.textContent = entry.paper.journal + ' (' + entry.paper.year + ')' +
                (entry.paper.preprint ? ' · Preprint' : '');
            panel.append(summary, element('p', 'paper-preview-unavailable', 'A figure preview is not available for this paper yet.'));
            const links = element('div', 'paper-preview-links');
            links.appendChild(externalLink('Read paper', entry.link.href));
            panel.appendChild(links);
        }

        active = { entry: entry, anchor: anchor, pinned: pinned };
        entry.button.setAttribute('aria-expanded', 'true');
        entry.link.setAttribute('aria-describedby', [entry.description, 'paper-preview-summary'].filter(Boolean).join(' '));
        panel.hidden = false;
        positionPreview();
        if (pinned) close.focus({ preventScroll: true });
    }

    function enhanceLinks() {
        document.querySelectorAll(SELECTOR).forEach(function(link) {
            if (enhanced.has(link)) return;
            const doi = doiFromLink(link);
            const paper = papers.get(doi);
            if (!paper) return;
            const button = element('button', 'paper-preview-toggle', 'Preview');
            button.type = 'button';
            button.setAttribute('aria-label', 'Preview paper: ' + paper.title);
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-controls', 'paper-preview');
            button.setAttribute('aria-expanded', 'false');
            const entry = { link: link, button: button, doi: doi, paper: paper,
                description: link.getAttribute('aria-describedby') };

            const article = link.closest('.publication-item');
            const holder = article && article.querySelector('.publication-links');
            if (holder) holder.appendChild(button);
            else link.closest('li').append(' ', button);

            link.addEventListener('pointerenter', function(event) {
                if (event.pointerType === 'touch' || !hoverMedia.matches) return;
                clearTimers();
                if (active && active.pinned && active.entry !== entry) return;
                openTimer = window.setTimeout(function() { openPreview(entry, link, false); }, 180);
            });
            link.addEventListener('pointerleave', scheduleClose);
            link.addEventListener('focus', function() {
                if (lastInput === 'keyboard') openPreview(entry, link, false);
            });
            link.addEventListener('focusout', handleFocusOut);
            link.addEventListener('click', function() { closePreview(false); });
            button.addEventListener('pointerenter', function() { window.clearTimeout(closeTimer); });
            button.addEventListener('pointerleave', scheduleClose);
            button.addEventListener('focusout', handleFocusOut);
            button.addEventListener('click', function() {
                if (active && active.entry === entry && active.pinned) closePreview(true);
                else openPreview(entry, button, true);
            });
            enhanced.add(link);
        });
        const note = document.querySelector('.publication-preview-note');
        if (note && document.querySelector('.paper-preview-toggle')) note.hidden = false;
    }

    document.addEventListener('pointerdown', function(event) {
        lastInput = 'pointer';
        if (active && !panel.contains(event.target) && event.target !== active.entry.button &&
            !active.entry.link.contains(event.target)) closePreview(false);
    }, true);
    document.addEventListener('keydown', function(event) {
        lastInput = 'keyboard';
        if (event.key === 'Escape' && active) {
            event.preventDefault();
            closePreview(panel.contains(document.activeElement));
        }
    });
    window.addEventListener('resize', positionPreview);
    window.addEventListener('scroll', positionPreview, { capture: true, passive: true });
    document.addEventListener('publications:rendered', enhanceLinks);

    Promise.all(['data/publications.json', 'data/publication-figures.json'].map(function(url) {
        return fetch(url).then(function(response) {
            if (!response.ok) throw new Error('Preview metadata unavailable');
            return response.json();
        });
    })).then(function(data) {
        papers = new Map(data[0].approved.map(function(paper) { return [paper.doi.toLowerCase(), paper]; }));
        figures = data[1].figures || {};
        enhanceLinks();
    }).catch(function(error) {
        // Paper links remain fully usable if preview metadata is unavailable.
        console.warn(error.message);
    });
})();
