const express = require('express');
const { ensureDiningAuthenticated, getUserFromRequest } = require('../utils/jwt');
const { initModels, getMenuByCourse, listLeadership, listStaff } = require('../services/diningService');
const {
  listReservationsForUser: listDiningReservationsForUser,
  updateReservationDetails,
  cancelReservation,
  getDiningPolicy,
} = require('../services/diningAccount');
const { sanitizeString } = require('../utils/sanitize');
const { lockSeat, releaseSeat, getCurrentSeats } = require('../services/diningSeatLocks');

const router = express.Router();

function isLocalHost(hostname) {
  if (!hostname) {
    return false;
  }
  const normalized = hostname.split(':')[0];
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

function buildBaseUrl(req) {
  const hostHeader = req.get('host');
  const host = hostHeader && hostHeader.length > 0 ? hostHeader : `localhost:${process.env.PORT || 3000}`;
  const configuredBase = process.env.PUBLIC_BASE_URL;
  const localHost = isLocalHost(host);

  if (configuredBase) {
    try {
      const configuredUrl = new URL(configuredBase);
      const configuredHost = configuredUrl.host;

      if (!host || configuredHost === host) {
        if (localHost && req.protocol === 'http' && configuredUrl.protocol === 'https:') {
          return `${req.protocol}://${host}`;
        }
        return `${configuredUrl.protocol}//${configuredHost}`;
      }
    } catch (error) {
      // Ignore malformed configured base URLs and fall back to request data.
    }
  }

  const forwardedProto = req.get('x-forwarded-proto');
  const forwardedProtocol = forwardedProto ? forwardedProto.split(',')[0].trim() : '';
  const protocol = forwardedProtocol && !localHost ? forwardedProtocol : req.protocol;

  return `${protocol}://${host}`;
}

function buildAbsoluteUrl(req, path) {
  const base = buildBaseUrl(req);
  try {
    return new URL(path, base).toString();
  } catch (error) {
    return `${base}${path}`;
  }
}

router.use(async (req, res, next) => {
  await initModels();
  res.locals.layout = 'dining';
  res.locals.diningBrand = {
    palette: {
      background: '#05070F',
      surface: '#101424',
      accent: '#CFA858'
    },
    name: 'Skyhaven Supper Club'
  };
  res.locals.diningUser = getUserFromRequest(req);
  next();
});

router.get('/dining', (req, res) => {
  const canonicalUrl = buildAbsoluteUrl(req, '/dining');
  const ogImage = buildAbsoluteUrl(req, '/images/nebula.svg');
  const restaurantJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'Skyhaven Supper Club',
    image: ogImage,
    servesCuisine: ['Modernist', 'Tasting Menu'],
    url: canonicalUrl,
    telephone: '+1-202-555-0177',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Orbital Dock 7',
      addressLocality: 'Neo-Tokyo',
      addressRegion: 'Stratos District',
      postalCode: '00000',
      addressCountry: 'JP'
    },
  };
  res.render('dining/landing', {
    title: 'Skyhaven Supper Club',
    metaDescription:
      'Skyhaven Supper Club blends aurora lighting, rare vintages, and a progressive tasting journey inside Aurora Nexus Skyhaven.',
    canonicalUrl,
    openGraph: {
      title: 'Skyhaven Supper Club at Aurora Nexus Skyhaven',
      description:
        'Discover Skyhaven\'s twilight dining theatre with curated tasting menus, cellar pairings, and chef table experiences.',
      url: canonicalUrl,
      image: ogImage,
      imageAlt: 'Skyhaven Supper Club aurora dining room',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Skyhaven Supper Club',
      description:
        'Reserve an evening at Aurora Nexus Skyhaven\'s Supper Club with rare vintages and choreographed service.',
      image: ogImage,
    },
    jsonLd: [restaurantJsonLd],
    highlights: [
      {
        title: 'Chef\'s Tasting',
        body: 'A seven-course symphony with live plating theatrics.',
        background: 'linear-gradient(135deg, rgba(207,168,88,0.6), rgba(92,132,255,0.4))',
      },
      {
        title: 'Cellar Pairings',
        body: 'Rare allocations curated by our Master Sommelier.',
        background: 'linear-gradient(135deg, rgba(126,188,255,0.5), rgba(28,52,96,0.8))',
      },
      {
        title: 'Midnight Desserts',
        body: 'Progressive pastry showcase lit by aurora-inspired projections.',
        background: 'linear-gradient(135deg, rgba(212,36,78,0.4), rgba(12,20,40,0.95))',
      },
    ],
  });
});

router.get('/dining/menu', async (req, res) => {
  const { dietary, spice, priceRange, course } = req.query;
  const filters = { dietary, spice, priceRange, course };
  const menu = await getMenuByCourse(filters);
  const canonicalUrl = buildAbsoluteUrl(req, '/dining/menu');
  const menuImage = buildAbsoluteUrl(req, '/images/suite.svg');
  const sectionsJsonLd = Object.entries(menu).map(([sectionKey, items]) => ({
    '@type': 'MenuSection',
    name: sectionKey,
    hasMenuItem: (items || []).map((item) => {
      const priceCents =
        typeof item.priceCents === 'number'
          ? item.priceCents
          : Number.isFinite(item.price)
            ? Math.round(Number(item.price) * 100)
            : null;
      const priceValue = priceCents !== null ? (priceCents / 100).toFixed(2) : undefined;
      return {
        '@type': 'MenuItem',
        name: item.name,
        description: item.description,
        offers:
          priceValue !== undefined
            ? {
                '@type': 'Offer',
                priceCurrency: 'USD',
                price: priceValue,
              }
            : undefined,
      };
    }),
  }));
  const menuJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    name: 'Skyhaven Supper Club Seasonal Menu',
    url: canonicalUrl,
    hasMenuSection: sectionsJsonLd,
  };
  res.render('dining/menu', {
    title: 'Supper Club Menu',
    metaDescription:
      'Explore the Skyhaven Supper Club menu featuring modernist tasting courses, cellar pairings, and crafted desserts.',
    canonicalUrl,
    openGraph: {
      title: 'Skyhaven Supper Club Seasonal Menu',
      description:
        'Preview Chef Kenji\'s seasonal tasting selections, curated pairings, and signature cocktails before your evening.',
      url: canonicalUrl,
      image: menuImage,
      imageAlt: 'Seasonal dishes from Skyhaven Supper Club',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Skyhaven Supper Club Menu',
      description:
        'See the latest Skyhaven Supper Club tasting menu, cocktails, and dessert flights prepared nightly.',
      image: menuImage,
    },
    jsonLd: [menuJsonLd],
    menu,
    filters,
  });
});

router.get('/dining/reserve', ensureDiningAuthenticated, (req, res) => {
  const canonicalUrl = buildAbsoluteUrl(req, '/dining/reserve');
  const ogImage = buildAbsoluteUrl(req, '/images/nebula.svg');
  res.render('dining/reserve', {
    title: 'Reserve Your Evening',
    step: 'schedule',
    metaDescription:
      'Secure a Skyhaven Supper Club seating in minutes—select your time, guests, table, and share any tailored preferences.',
    canonicalUrl,
    openGraph: {
      title: 'Reserve Skyhaven Supper Club',
      description:
        'Book Skyhaven\'s signature tasting with live seat availability, dietary notes, and instant confirmation.',
      url: canonicalUrl,
      image: ogImage,
      imageAlt: 'Aurora-lit dining table ready for guests',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Reserve Skyhaven Supper Club',
      description:
        'Choose your evening and hold tables in real-time for the Skyhaven Supper Club tasting experience.',
      image: ogImage,
    },
  });
});

router.post('/dining/reserve/seat-lock', ensureDiningAuthenticated, async (req, res) => {
  const { seatId } = req.body;
  const user = req.diningUser;
  if (!seatId) {
    return res.status(400).json({ error: 'Seat selection missing.' });
  }
  const lock = await lockSeat(seatId, user.id);
  if (!lock.ok) {
    return res.status(409).json({ error: lock.error || 'Seat unavailable.' });
  }
  return res.json(lock);
});

router.post('/dining/reserve/seat-release', ensureDiningAuthenticated, async (req, res) => {
  const { seatId, lockId } = req.body;
  if (!seatId || !lockId) {
    return res.status(400).json({ error: 'Seat and lock required.' });
  }
  const result = await releaseSeat(seatId, lockId);
  if (!result.ok) {
    return res.status(404).json({ error: 'Seat lock not found.' });
  }
  return res.json({ ok: true });
});

router.get('/dining/map', ensureDiningAuthenticated, (req, res) => {
  const seats = getCurrentSeats();
  if (req.get('x-requested-with') === 'XMLHttpRequest') {
    return res.json({ seats });
  }
  res.render('dining/map', {
    title: 'Seat Map',
    seats
  });
});

router.get('/dining/leadership', (req, res) => {
  const leaders = listLeadership();
  res.render('dining/leadership', {
    title: 'Meet the Culinary Collective',
    leaders
  });
});

router.get('/dining/staff', (req, res) => {
  const staff = listStaff();
  res.render('dining/staff', {
    title: 'Our Team',
    staff
  });
});

router.get('/dining/account/reservations', ensureDiningAuthenticated, async (req, res) => {
  const canonicalUrl = buildAbsoluteUrl(req, '/dining/account/reservations');
  let reservations = { upcoming: [], past: [] };
  let policy = await getDiningPolicy();
  try {
    reservations = await listDiningReservationsForUser(req.diningUser?.id);
  } catch (error) {
    console.warn('Failed to load dining reservations for account', error);
    req.pushAlert(
      'warning',
      'We\'re unable to display dining reservations right now. Please try again shortly.',
    );
  }
  try {
    policy = await getDiningPolicy();
  } catch (error) {
    console.warn('Failed to load dining policy', error);
  }
  const policyWindow = policy?.cancellationWindowHours ?? 24;
  res.render('dining/account', {
    title: 'Dining Reservations',
    metaDescription:
      'Review upcoming and past Skyhaven Supper Club experiences, update dietary notes, and manage cancellations securely.',
    canonicalUrl,
    openGraph: {
      title: 'Your Skyhaven Supper Club Reservations',
      description:
        'Manage Skyhaven Supper Club bookings, modify guest preferences, or cancel within the policy window.',
      url: canonicalUrl,
      image: buildAbsoluteUrl(req, '/images/nebula.svg'),
      imageAlt: 'Skyhaven Supper Club reservation dashboard',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Skyhaven Dining Reservations',
      description:
        'View your upcoming Skyhaven Supper Club evenings and update your preferences in one place.',
      image: buildAbsoluteUrl(req, '/images/nebula.svg'),
    },
    reservations,
    policy,
    policyWindow,
  });
});

router.post('/dining/account/reservations/:id/update', ensureDiningAuthenticated, async (req, res) => {
  const reservationId = sanitizeString(req.params.id);
  const payload = {
    phone: req.body?.phone,
    email: req.body?.email,
    dietary: req.body?.dietary,
    allergies: req.body?.allergies,
    notes: req.body?.notes,
  };
  const result = await updateReservationDetails(req.diningUser?.id, reservationId, payload);
  if (result?.error) {
    req.pushAlert('danger', result.error);
  } else {
    req.pushAlert('success', 'Reservation details updated.');
  }
  res.redirect(`/dining/account/reservations#reservation-${reservationId}`);
});

router.post('/dining/account/reservations/:id/cancel', ensureDiningAuthenticated, async (req, res) => {
  const reservationId = sanitizeString(req.params.id);
  const result = await cancelReservation(req.diningUser?.id, reservationId);
  if (result?.error) {
    req.pushAlert('danger', result.error);
  } else {
    req.pushAlert('info', 'Your dining reservation has been cancelled.');
  }
  res.redirect(`/dining/account/reservations#reservation-${reservationId}`);
});

router.get('/dining/login', (req, res) => {
  const redirect = encodeURIComponent(req.query.redirect || '/dining');
  res.redirect(`/login?redirect=${redirect}`);
});

router.get('/dining/join', (req, res) => {
  const redirect = encodeURIComponent(req.query.redirect || '/dining');
  res.redirect(`/join?redirect=${redirect}`);
});

module.exports = router;
