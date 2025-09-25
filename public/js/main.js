// Client-side enhancements for Aurora Nexus Skyhaven interactions.
(() => {
  const root = document.documentElement;
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  const toggleButton = document.querySelector('[data-theme-toggle]');

  if (toggleButton && csrfToken) {
    toggleButton.addEventListener('click', async () => {
      try {
        const response = await fetch('/toggle-theme', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CSRF-Token': csrfToken
          },
          body: JSON.stringify({})
        });
        if (response.ok) {
          const data = await response.json();
          root.setAttribute('data-theme', data.darkMode ? 'dark' : 'light');
        }
      } catch (error) {
        console.error('Theme toggle failed', error);
      }
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll('[data-animate]').forEach((element) => {
    observer.observe(element);
  });

  const dismissToast = (toast) => {
    if (!toast || toast.classList.contains('is-dismissed')) return;
    toast.classList.add('is-dismissed');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };

  document.querySelectorAll('[data-dismiss-alert]').forEach((button) => {
    button.addEventListener('click', () => {
      dismissToast(button.closest('.toast-alert'));
    });
  });

  document.querySelectorAll('.toast-alert').forEach((toast) => {
    const lifetime = Number(toast.getAttribute('data-autodismiss')) || 6000;
    if (!Number.isFinite(lifetime) || lifetime <= 0) return;
    let timer = setTimeout(() => dismissToast(toast), lifetime);

    const pause = () => {
      clearTimeout(timer);
      timer = null;
    };

    const resume = () => {
      if (timer !== null) return;
      timer = setTimeout(() => dismissToast(toast), lifetime);
    };

    toast.addEventListener('mouseenter', pause);
    toast.addEventListener('mouseleave', resume);
    toast.addEventListener('focusin', pause);
    toast.addEventListener('focusout', resume);
  });

  const heroCarousel = document.querySelector('[data-hero-carousel]');
  if (heroCarousel) {
    const slides = Array.from(heroCarousel.querySelectorAll('.hero-slide'));
    const dotsContainer = heroCarousel.querySelector('[data-hero-dots]');
    let index = 0;

    const activate = (nextIndex) => {
      slides[index]?.classList.remove('is-active');
      dotsContainer.children[index]?.classList.remove('active');
      index = nextIndex;
      slides[index]?.classList.add('is-active');
      dotsContainer.children[index]?.classList.add('active');
    };

    slides.forEach((_, slideIndex) => {
      const dot = document.createElement('button');
      if (slideIndex === 0) {
        dot.classList.add('active');
      }
      dot.addEventListener('click', () => {
        activate(slideIndex);
      });
      dotsContainer.appendChild(dot);
    });

    slides[0]?.classList.add('is-active');

    setInterval(() => {
      const next = (index + 1) % slides.length;
      activate(next);
    }, 6000);
  }

  if (window.gsap) {
    window.gsap.from('.hero-copy h1', {
      opacity: 0,
      y: 40,
      duration: 1,
      ease: 'power3.out'
    });
    window.gsap.from('.hero-copy p', {
      opacity: 0,
      y: 40,
      duration: 1,
      delay: 0.2,
      ease: 'power3.out'
    });
    window.gsap.from('.hero-ctas .cta-button', {
      opacity: 0,
      y: 20,
      duration: 0.8,
      delay: 0.4,
      stagger: 0.1,
      ease: 'power3.out'
    });
  }
})();
