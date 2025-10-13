// Client-side enhancements for Aurora Nexus Skyhaven interactions.
(() => {
  const root = document.documentElement;
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
  if (csrfToken) {
    window.__CSRF_TOKEN__ = csrfToken;
  }
  const toggleButton = document.querySelector('[data-theme-toggle]');
  const navContainer = document.querySelector('[data-nav-container]');
  const navToggle = document.querySelector('[data-nav-toggle]');
  const navPanel = document.querySelector('[data-nav-panel]');
  const navBackdrop = document.querySelector('[data-nav-backdrop]');

  const closeMobileNav = ({ returnFocus } = { returnFocus: false }) => {
    if (!navContainer) return;
    navContainer.classList.remove('is-nav-open');
    document.body.classList.remove('nav-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      if (returnFocus) {
        navToggle.focus();
      }
    }
  };

  if (navToggle && navContainer && navPanel) {
    navToggle.addEventListener('click', () => {
      const willOpen = !navContainer.classList.contains('is-nav-open');
      navContainer.classList.toggle('is-nav-open', willOpen);
      document.body.classList.toggle('nav-open', willOpen);
      navToggle.setAttribute('aria-expanded', String(willOpen));

      if (willOpen) {
        const focusable = navPanel.querySelector(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }
    });

    navBackdrop?.addEventListener('click', () => closeMobileNav({ returnFocus: true }));

    navPanel.querySelectorAll('a[href]').forEach((link) => {
      link.addEventListener('click', () => closeMobileNav());
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && navContainer.classList.contains('is-nav-open')) {
        event.preventDefault();
        closeMobileNav({ returnFocus: true });
      }
    });

    const mq = window.matchMedia('(min-width: 901px)');
    mq.addEventListener('change', (event) => {
      if (event.matches) {
        closeMobileNav();
      }
    });
  }

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

  const animatedElements = document.querySelectorAll('[data-animate]');
  if ('IntersectionObserver' in window) {
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

    animatedElements.forEach((element) => {
      observer.observe(element);
    });
  } else {
    animatedElements.forEach((element) => {
      element.classList.add('is-visible');
    });
  }

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

  const chatBadge = document.querySelector('[data-chat-unread]');
  const chatLayout = document.querySelector('.chat-layout');

  const updateChatBadge = (total) => {
    if (!chatBadge) return;
    const value = Number(total) || 0;
    chatBadge.textContent = value;
    chatBadge.hidden = value <= 0;
  };

  const spawnChatToast = ({ from, preview, channelLabel }) => {
    const toast = document.createElement('div');
    toast.className = 'toast-alert toast-info chat-toast';
    toast.setAttribute('data-autodismiss', '8000');
    const wrapper = document.createElement('div');
    wrapper.className = 'chat-toast-content';
    const header = document.createElement('div');
    header.className = 'chat-toast-header';
    header.textContent = from?.name || 'New message';
    const meta = document.createElement('span');
    meta.className = 'chat-toast-meta';
    meta.textContent = channelLabel || 'Chat';
    const body = document.createElement('p');
    body.className = 'chat-toast-body';
    body.textContent = preview || '';
    wrapper.append(header, meta, body);
    toast.appendChild(wrapper);
    toast.style.cursor = 'pointer';
    const stack =
      document.querySelector('[data-alert-stack]') ||
      (() => {
        const container = document.createElement('div');
        container.className = 'alert-stack';
        container.setAttribute('data-alert-stack', '');
        document.body.appendChild(container);
        return container;
      })();
    stack.appendChild(toast);
    let timer = setTimeout(() => dismissToast(toast), 8000);
    toast.addEventListener('click', () => {
      dismissToast(toast);
      window.location.href = '/chat';
    });
    toast.addEventListener('mouseenter', () => {
      clearTimeout(timer);
      timer = null;
    });
    toast.addEventListener('mouseleave', () => {
      if (timer !== null) return;
      timer = setTimeout(() => dismissToast(toast), 8000);
    });
  };

  const initChatNotifications = () => {
    const currentUserId = document.body?.dataset.currentUser;
    if (!currentUserId) {
      return;
    }
    updateChatBadge(chatBadge?.textContent || 0);
    let socket = window.skyhavenSocket;
    if (!socket) {
      socket = window.io(window.location.origin, {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        withCredentials: true,
        autoConnect: true,
        reconnectionAttempts: 6
      });
      window.skyhavenSocket = socket;
    }

    const handleUnread = ({ total }) => {
      updateChatBadge(total);
    };

    const handleNotification = (payload = {}) => {
      const activeRoom = chatLayout?.getAttribute('data-active-room');
      if (payload.room && activeRoom === payload.room && document.hasFocus()) {
        return;
      }
      spawnChatToast(payload);
    };

    socket.off('chat:unread', handleUnread);
    socket.on('chat:unread', handleUnread);
    socket.off('chat:notification', handleNotification);
    socket.on('chat:notification', handleNotification);
    socket.emit('chat:requestUnread');
  };

  initChatNotifications();

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

  const passwordRules = [
    { id: 'length', test: (value) => value.length >= 8 },
    { id: 'lowercase', test: (value) => /[a-z]/.test(value) },
    { id: 'uppercase', test: (value) => /[A-Z]/.test(value) },
    { id: 'number', test: (value) => /\d/.test(value) },
    { id: 'special', test: (value) => /[^A-Za-z0-9]/.test(value) }
  ];

  const strengthStages = [
    { score: 0, tone: 'empty', message: 'Start typing' },
    { score: 1, tone: 'weak', message: 'Weak' },
    { score: 3, tone: 'fair', message: 'Fair' },
    { score: 4, tone: 'strong', message: 'Strong' },
    { score: 5, tone: 'excellent', message: 'Excellent' }
  ];

  const resolveStrength = (score) => {
    let current = strengthStages[0];
    for (const stage of strengthStages) {
      if (score >= stage.score) {
        current = stage;
      }
    }
    return current;
  };

  document.querySelectorAll('[data-password-container]').forEach((container) => {
    const input = container.querySelector('[data-password-input]');
    if (!input) return;

    const bar = container.querySelector('[data-password-bar]');
    const label = container.querySelector('[data-password-strength]');
    const criteriaItems = new Map();
    container.querySelectorAll('[data-password-criterion]').forEach((item) => {
      const key = item.getAttribute('data-password-criterion');
      if (key) {
        criteriaItems.set(key, item);
      }
    });
    const form = input.closest('form');
    const submitButton = form?.querySelector('[data-password-submit]');
    const enforce = container.hasAttribute('data-enforce');
    const totalRules = passwordRules.length;

    const evaluate = () => {
      const value = input.value || '';
      let score = 0;

      passwordRules.forEach((rule) => {
        const isMet = rule.test(value);
        const criterion = criteriaItems.get(rule.id);
        if (criterion) {
          criterion.classList.toggle('is-met', isMet);
        }
        if (isMet) {
          score += 1;
        }
      });

      const width = Math.max(0, Math.min(100, (score / totalRules) * 100));
      if (bar) {
        bar.style.width = `${width}%`;
      }

      const { tone, message } = resolveStrength(score);
      container.dataset.passwordStrength = tone;
      if (label) {
        label.textContent = message;
      }

      const meetsAll = score === totalRules;
      container.classList.toggle('is-complete', meetsAll);
      if (submitButton && enforce) {
        submitButton.disabled = !meetsAll;
        if (meetsAll) {
          submitButton.removeAttribute('aria-disabled');
        } else {
          submitButton.setAttribute('aria-disabled', 'true');
        }
      }

      if (enforce) {
        input.setAttribute('aria-invalid', meetsAll ? 'false' : 'true');
      }

      return meetsAll;
    };

    input.addEventListener('input', evaluate);
    input.addEventListener('blur', evaluate);
    evaluate();

    if (form && enforce) {
      form.addEventListener('submit', (event) => {
        if (!evaluate()) {
          event.preventDefault();
          input.focus();
        }
      });
    }
  });
})();
