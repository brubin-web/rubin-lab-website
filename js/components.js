// Shared header & footer components
// Single source of truth — edit here, all pages update automatically.

(function () {
    'use strict';

    // ── Nav links (label → href) ──
    var navLinks = [
        { label: 'Home', href: 'index.html' },
        { label: 'Research', href: 'research.html' },
        { label: 'People', href: 'people.html' },
        { label: 'Publications', href: 'publications.html' },
        { label: 'News', href: 'news.html' },
        { label: 'Contact', href: 'contact.html' }
    ];

    // ── Funder logos (src → alt) ──
    var funders = [
        { src: 'images/funders/igi.jpg', alt: 'Innovative Genomics Institute' },
        { src: 'images/funders/jbei.png', alt: 'Joint BioEnergy Institute' },
        { src: 'images/funders/curci.png', alt: 'Shurl and Kay Curci Foundation' },
        { src: 'images/funders/doe.png', alt: 'U.S. Department of Energy' },
        { src: 'images/funders/audacious.png', alt: 'TED Audacious Project' },
        { src: 'images/funders/helmsley.png', alt: 'The Helmsley Charitable Trust' }
    ];

    // ── Detect current page for active nav highlight ──
    function currentPage() {
        var path = window.location.pathname;
        var file = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
        return file;
    }

    // ── Build header HTML ──
    function headerHTML() {
        var page = currentPage();
        var links = navLinks.map(function (l) {
            var active = (l.href === page) ? ' active' : '';
            return '<li><a href="' + l.href + '" class="nav-link' + active + '">' + l.label + '</a></li>';
        }).join('\n                        ');

        return '\
        <div class="container">\
            <div class="header-content">\
                <a href="index.html" class="logo">\
                    <img src="images/logos/black-logo.png" alt="Rubin Lab" class="logo-icon">\
                    <span class="logo-text">Rubin Lab</span>\
                </a>\
                <nav class="nav" id="nav">\
                    <ul class="nav-list">\
                        ' + links + '\
                    </ul>\
                </nav>\
                <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle menu">\
                    <span></span>\
                    <span></span>\
                    <span></span>\
                </button>\
            </div>\
        </div>';
    }

    // ── Build footer HTML ──
    function footerHTML() {
        var logos = funders.map(function (f) {
            return '<img src="' + f.src + '" alt="' + f.alt + '" class="footer-funder-logo">';
        }).join('\n                    ');

        var year = new Date().getFullYear();

        return '\
        <div class="container">\
            <div class="footer-content">\
                <div class="footer-info">\
                    <h3 class="footer-logo">Rubin Lab</h3>\
                    <p class="footer-affiliation">\
                        Innovative Genomics Institute<br>\
                        University of California, Berkeley\
                    </p>\
                </div>\
                <div class="footer-links">\
                    <h4 class="footer-heading">Quick Links</h4>\
                    <ul>\
                        <li><a href="research.html">Research</a></li>\
                        <li><a href="people.html">People</a></li>\
                        <li><a href="publications.html">Publications</a></li>\
                        <li><a href="contact.html">Contact</a></li>\
                    </ul>\
                </div>\
                <div class="footer-contact">\
                    <h4 class="footer-heading">Contact</h4>\
                    <p>\
                        Innovative Genomics Institute<br>\
                        Berkeley, CA 94720<br>\
                        <a href="mailto:contact@therubinlab.org">contact@therubinlab.org</a>\
                    </p>\
                </div>\
            </div>\
            <div class="footer-funder">\
                <p class="footer-funder-text">Supported by</p>\
                <div class="footer-funder-logos">\
                    ' + logos + '\
                </div>\
            </div>\
            <div class="footer-bottom">\
                <p>&copy; ' + year + ' Rubin Lab. All rights reserved.</p>\
            </div>\
        </div>';
    }

    // ── Inject & wire up event listeners ──
    document.addEventListener('DOMContentLoaded', function () {
        // Inject header
        var header = document.querySelector('.header');
        if (header) {
            header.innerHTML = headerHTML();
        }

        // Inject footer
        var footer = document.querySelector('.footer');
        if (footer) {
            footer.innerHTML = footerHTML();
        }

        // Mobile menu toggle
        var menuToggle = document.getElementById('mobile-menu-toggle');
        var nav = document.getElementById('nav');

        if (menuToggle && nav) {
            menuToggle.addEventListener('click', function () {
                nav.classList.toggle('active');
                menuToggle.classList.toggle('active');
            });

            // Close menu when clicking a link
            var links = nav.querySelectorAll('.nav-link');
            links.forEach(function (link) {
                link.addEventListener('click', function () {
                    nav.classList.remove('active');
                    menuToggle.classList.remove('active');
                });
            });
        }

        // Header shadow on scroll
        if (header) {
            window.addEventListener('scroll', function () {
                if (window.scrollY > 10) {
                    header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                } else {
                    header.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                }
            });
        }
    });
})();
