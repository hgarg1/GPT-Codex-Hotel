const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    defaultCommandTimeout: 15000,
    video: false,
    screenshotOnRunFailure: true,
    env: {
      diningBaseUrl: process.env.CYPRESS_DINING_BASE_URL || 'http://localhost:4000',
    },
    setupNodeEvents(on) {
      const { getDb } = require('./src/db');
      const {
        ensureDiningUserRecord,
        createReservation,
      } = require('./src/dining/data');
      const db = getDb();

      on('task', {
        'dining:reset'() {
          db.exec(`
            DELETE FROM dining_reservations;
            DELETE FROM dining_users;
          `);
          return null;
        },
        async 'dining:createReservation'(input) {
          const { userId, email, name, date, time, tableIds, partySize, status = 'CONFIRMED' } = input;
          if (!userId || !email || !date || !time || !Array.isArray(tableIds) || tableIds.length === 0) {
            throw new Error('Invalid reservation payload for dining:createReservation task');
          }
          await ensureDiningUserRecord({ id: userId, email, name: name ?? null });
          await createReservation({
            userId,
            date,
            time,
            partySize: partySize || tableIds.length,
            tableIds,
            status,
            contactPhone: '+10000000000',
            contactEmail: email,
          });
          return null;
        },
      });

      return undefined;
    },
  },
});
