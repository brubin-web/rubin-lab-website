// Smooth scroll for anchor links
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Gallery Carousel
    const track = document.querySelector('.gallery-track');
    if (track) {
        const slides = track.querySelectorAll('.gallery-slide');
        const prevBtn = document.querySelector('.gallery-btn-prev');
        const nextBtn = document.querySelector('.gallery-btn-next');
        let current = 0;
        let autoTimer;

        function goTo(index) {
            current = (index + slides.length) % slides.length;
            track.style.transform = 'translateX(-' + (current * 100) + '%)';
            resetAuto();
        }

        function resetAuto() {
            clearInterval(autoTimer);
            autoTimer = setInterval(() => goTo(current + 1), 5000);
        }

        prevBtn.addEventListener('click', () => goTo(current - 1));
        nextBtn.addEventListener('click', () => goTo(current + 1));
        resetAuto();
    }

    // Make each news item fully clickable (not just the small "Read more" link).
    // The primary destination is the item's own link or its image link; inner
    // links keep working because we ignore clicks that land on an anchor.
    document.querySelectorAll('.news-item').forEach(item => {
        const primary = item.querySelector('.news-read-more, .news-item-image a');
        if (!primary) return;

        item.classList.add('news-item-clickable');
        item.addEventListener('click', function(e) {
            if (e.target.closest('a')) return; // let real links handle themselves
            if (window.getSelection().toString()) return; // don't hijack text selection
            if (primary.target === '_blank') {
                window.open(primary.href, '_blank', 'noopener');
            } else {
                window.location.href = primary.href;
            }
        });
    });

    // People page: bios are clamped to a uniform height in CSS. For any bio that
    // actually overflows, add a hover popover that reveals the full text.
    document.querySelectorAll('.team-card-bio').forEach(bio => {
        if (bio.scrollHeight - bio.clientHeight > 2) {
            const popover = document.createElement('div');
            popover.className = 'team-card-bio-popover';
            popover.textContent = bio.textContent.trim();
            bio.closest('.team-card').appendChild(popover);
        }
    });

    // News Year Filter
    const yearPills = document.querySelectorAll('.news-year-pill');
    if (yearPills.length) {
        const newsItems = document.querySelectorAll('.news-item[data-year]');

        yearPills.forEach(pill => {
            pill.addEventListener('click', function() {
                const year = this.dataset.year;

                yearPills.forEach(p => p.classList.remove('active'));
                this.classList.add('active');

                newsItems.forEach(item => {
                    item.classList.toggle('hidden', item.dataset.year !== year);
                });
            });
        });

        // Show only the first year (2026) on load
        newsItems.forEach(item => {
            item.classList.toggle('hidden', item.dataset.year !== '2026');
        });
    }
});
