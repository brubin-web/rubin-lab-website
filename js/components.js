// Behaviour for the shared header & footer.
//
// The header/footer MARKUP lives in each page's HTML so that crawlers which
// don't run JavaScript still see the navigation links. To change the nav items,
// funder logos, or contact block, edit scripts/build-shell.js and re-run
// `node scripts/build-shell.js`.

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {
        var header = document.querySelector('.header');
        var menuToggle = document.getElementById('mobile-menu-toggle');
        var nav = document.getElementById('nav');

        if (menuToggle && nav) {
            menuToggle.addEventListener('click', function () {
                var open = nav.classList.toggle('active');
                menuToggle.classList.toggle('active', open);
                menuToggle.setAttribute('aria-expanded', String(open));
            });

            // Close menu when clicking a link
            nav.querySelectorAll('.nav-link').forEach(function (link) {
                link.addEventListener('click', function () {
                    nav.classList.remove('active');
                    menuToggle.classList.remove('active');
                    menuToggle.setAttribute('aria-expanded', 'false');
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

        // Keep the copyright year current without a rebuild.
        var yearEl = document.getElementById('footer-year');
        if (yearEl) {
            yearEl.textContent = String(new Date().getFullYear());
        }
    });
})();
