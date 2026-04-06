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
