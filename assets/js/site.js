(function () {
    'use strict';

    document.documentElement.classList.add('js');

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var progressBar = document.getElementById('scroll-progress-bar');
    var navbar = document.getElementById('site-navbar');
    var portrait = document.querySelector('.profile-card .profile-portrait');
    var portraitWrap = portrait ? portrait.parentElement : null;
    var desktop = window.matchMedia('(min-width: 992px)');
    var ticking = false;

    function updatePortrait() {
        if (!portrait || !portraitWrap) return;

        if (!desktop.matches || reduceMotion.matches) {
            portrait.style.removeProperty('max-width');
            return;
        }

        var base = Math.min(188, portraitWrap.clientWidth || 188);
        var progress = Math.min(Math.max(window.scrollY, 0) / 300, 1);
        portrait.style.maxWidth = Math.round(base * (1 - progress * 0.5)) + 'px';
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;

        window.requestAnimationFrame(function () {
            var doc = document.documentElement;
            var max = doc.scrollHeight - window.innerHeight;
            var progress = max > 0 ? Math.min(window.scrollY / max, 1) : 0;

            if (progressBar) {
                progressBar.style.width = (progress * 100).toFixed(2) + '%';
            }
            if (navbar) {
                navbar.classList.toggle('navbar-scrolled', window.scrollY > 12);
            }

            updatePortrait();
            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    desktop.addEventListener('change', onScroll);
    reduceMotion.addEventListener('change', onScroll);
    onScroll();

    var cards = document.querySelectorAll('main .card');
    if (!reduceMotion.matches && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

        cards.forEach(function (card, index) {
            card.classList.add('reveal');
            card.style.transitionDelay = Math.min(index * 45, 220) + 'ms';
            observer.observe(card);
        });
    }
})();
