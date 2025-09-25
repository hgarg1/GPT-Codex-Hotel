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

  document.querySelectorAll('[data-dismiss-alert]').forEach((button) => {
    button.addEventListener('click', () => {
      const container = button.closest('.alert');
      if (container) {
        container.classList.add('is-dismissed');
        container.addEventListener('transitionend', () => container.remove(), { once: true });
      }
    });
  });

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
