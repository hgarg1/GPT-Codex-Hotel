/// <reference types="cypress" />

const PASSWORD = 'skyhaven123';
const GUEST_EMAIL = 'nova@guest.test';
const SECONDARY_GUEST_EMAIL = 'mira@guest.test';
const ADMIN_EMAIL = 'astra@skyhaven.test';

function futureDate(daysAhead = 1) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function loginViaRequest(email, password = PASSWORD) {
  return cy.request('/login').then((response) => {
    const $html = Cypress.$(response.body);
    const csrf = $html.find('input[name="_csrf"]').val();
    expect(csrf, 'CSRF token present').to.be.a('string').and.not.be.empty;

    return cy.request({
      method: 'POST',
      url: '/login',
      form: true,
      body: {
        _csrf: csrf,
        email,
        password,
      },
    });
  });
}

function completeLoginForm(email, password = PASSWORD) {
  cy.get('input#email').clear().type(email);
  cy.get('input#password').clear().type(password, { log: false });
  cy.get('form.auth-form').submit();
}

describe('Skyhaven dining integration', () => {
  beforeEach(() => {
    cy.task('dining:reset');
  });

  it('allows a guest to complete the dining reservation journey and view it in their account', () => {
    const reservationDate = futureDate(2);
    const reservationTime = '19:00';

    cy.intercept('POST', '/api/dining/reservations/validate').as('validateReservation');
    cy.intercept('GET', '/api/dining/tables').as('fetchTables');
    cy.intercept('GET', /\/api\/dining\/availability.*/).as('fetchAvailability');
    cy.intercept('POST', '/api/dining/hold').as('holdTables');
    cy.intercept('POST', '/api/dining/reservations').as('createReservation');

    cy.visit('/dining/reserve');
    cy.location('pathname').should('eq', '/login');
    completeLoginForm(GUEST_EMAIL);

    cy.location('pathname', { timeout: 10000 }).should('eq', '/dining/reserve');

    cy.get('#reserve-schedule-form').within(() => {
      cy.get('input[name="date"]').type(reservationDate);
      cy.get('input[name="time"]').type(reservationTime);
      cy.root().submit();
    });
    cy.wait('@validateReservation');

    cy.contains('h2', 'Party size').should('be.visible');
    cy.get('#reserve-party-form').within(() => {
      cy.get('input[name="partySize"]').clear().type('2');
      cy.contains('button', 'Check availability').click();
    });
    cy.wait('@validateReservation');
    cy.wait('@fetchAvailability');
    cy.wait('@fetchTables');

    cy.contains('h2', 'Select your tables', { timeout: 10000 }).should('be.visible');
    cy.get('[data-role="seat-map"]').within(() => {
      cy.contains('button', 'T1').click();
    });
    cy.contains('[data-role="selected-capacity"]', '3');
    cy.contains('button', 'Continue').click();
    cy.wait('@holdTables');

    cy.contains('h2', 'Guest details').should('be.visible');
    cy.get('#reserve-guest-form').within(() => {
      cy.get('input[name="phone"]').clear().type('+14155550123');
      cy.get('input[name="email"]').clear().type('nova+ dining@test.com');
      cy.get('textarea[name="dietary"]').type('Vegetarian tasting');
      cy.get('textarea[name="notes"]').type('Celebrating a milestone.');
      cy.contains('button', 'Review reservation').click();
    });
    cy.wait('@validateReservation');

    cy.contains('h2', 'Review & confirm').should('be.visible');
    cy.contains('[data-role="hold-countdown"]', /\d+:\d{2}/);
    cy.contains('button', 'Confirm reservation').click();
    cy.wait('@createReservation').its('response.statusCode').should('eq', 201);

    cy.contains('h2', 'Reservation secured', { timeout: 10000 }).should('be.visible');
    cy.contains('.reserve-summary dt', 'Date')
      .siblings('dd')
      .should('contain', new Date(`${reservationDate}T${reservationTime}:00`).toLocaleDateString());

    cy.visit('/dining/account/reservations');
    cy.contains('h1', 'Your dining reservations').should('be.visible');
    cy.get('.reservation-card').first().within(() => {
      cy.contains('Table T1');
      cy.contains('Vegetarian tasting');
    });
  });

  it('prevents double-booking the same table and surfaces a helpful alert', () => {
    const collisionDate = futureDate(3);
    const collisionTime = '20:00';

    cy.session(`hold-${collisionDate}-${collisionTime}`, () => {
      loginViaRequest(GUEST_EMAIL);
      cy.request({
        method: 'POST',
        url: '/api/dining/hold',
        body: {
          date: collisionDate,
          time: collisionTime,
          tableIds: ['T1'],
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }).its('status').should('eq', 201);
    });

    cy.visit(`/login?redirect=${encodeURIComponent('/dining/reserve')}`);
    completeLoginForm(SECONDARY_GUEST_EMAIL);
    cy.location('pathname', { timeout: 10000 }).should('eq', '/dining/reserve');

    cy.intercept('POST', '/api/dining/reservations/validate').as('validateReservation');
    cy.intercept('GET', /\/api\/dining\/availability.*/).as('fetchAvailability');
    cy.intercept('GET', '/api/dining/tables').as('fetchTables');
    cy.intercept('POST', '/api/dining/hold').as('holdTables');

    cy.get('#reserve-schedule-form').within(() => {
      cy.get('input[name="date"]').type(collisionDate);
      cy.get('input[name="time"]').type(collisionTime);
      cy.root().submit();
    });
    cy.wait('@validateReservation');

    cy.get('#reserve-party-form').within(() => {
      cy.get('input[name="partySize"]').clear().type('2');
      cy.contains('button', 'Check availability').click();
    });
    cy.wait('@validateReservation');
    cy.wait('@fetchAvailability');
    cy.wait('@fetchTables');

    cy.contains('h2', 'Select your tables', { timeout: 10000 }).should('be.visible');
    cy.get('[data-role="seat-map"]').within(() => {
      cy.contains('button', 'T1').click();
    });
    cy.contains('button', 'Continue').click();
    cy.wait('@holdTables');

    cy.get('#dining-reserve-alerts').within(() => {
      cy.contains('Those tables were just taken', { timeout: 10000 });
    });
    cy.contains('h2', 'Select your tables').should('be.visible');
  });

  it('allows dining admins to create menu items and adjust tables for the seat map', () => {
    const adminDate = futureDate(4);
    const seatTestTime = '18:30';
    const menuLabel = `Cypress Tasting ${Date.now()}`;

    loginViaRequest(ADMIN_EMAIL);

    cy.request('/api/admin/dining/menu').then(({ body }) => {
      expect(body.sections, 'menu sections').to.be.an('array').and.not.be.empty;
      const targetSection = body.sections[0];
      return cy
        .request({
          method: 'POST',
          url: '/api/admin/dining/menu',
          body: {
            kind: 'item',
            sectionId: targetSection.id,
            name: menuLabel,
            description: 'Test-driven seasonal highlight',
            priceCents: 4500,
            vegetarian: true,
          },
          headers: {
            'Content-Type': 'application/json',
          },
        })
        .its('status')
        .should('eq', 201);
    });

    cy.request('/api/dining/menu').then(({ body }) => {
      const items = body.sections.flatMap((section) => section.items);
      const created = items.find((item) => item.name === menuLabel);
      expect(created, 'created menu item visible to diners').to.exist;
    });

    cy.request('/api/admin/dining/tables').then(({ body }) => {
      expect(body.tables, 'dining tables').to.be.an('array').and.not.be.empty;
      const table = body.tables.find((entry) => entry.label === 'T2') || body.tables[0];
      const originalCapacity = table.capacity;
      const updatedCapacity = Math.min(originalCapacity + 1, 12);

      cy.request({
        method: 'PATCH',
        url: '/api/admin/dining/tables',
        body: {
          id: table.id,
          capacity: updatedCapacity,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .its('status')
        .should('eq', 200);

      cy.intercept('POST', '/api/dining/reservations/validate').as('adminValidate');
      cy.intercept('GET', /\/api\/dining\/availability.*/).as('adminAvailability');
      cy.intercept('GET', '/api/dining/tables').as('adminTables');

      cy.visit('/dining/reserve');
      cy.get('#reserve-schedule-form').within(() => {
        cy.get('input[name="date"]').type(adminDate);
        cy.get('input[name="time"]').type(seatTestTime);
        cy.root().submit();
      });
      cy.wait('@adminValidate');
      cy.get('#reserve-party-form').within(() => {
        cy.get('input[name="partySize"]').clear().type('2');
        cy.contains('button', 'Check availability').click();
      });
      cy.wait('@adminValidate');
      cy.wait('@adminAvailability');
      cy.wait('@adminTables');
      cy.contains('h2', 'Select your tables', { timeout: 10000 }).should('be.visible');
      cy.get('[data-role="seat-map"]').within(() => {
        cy.contains('button', table.label)
          .parent()
          .find('.seat-button__capacity')
          .should('have.text', String(updatedCapacity));
      });

      cy.request({
        method: 'PATCH',
        url: '/api/admin/dining/tables',
        body: {
          id: table.id,
          capacity: originalCapacity,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      }).its('status');
    });
  });
});
