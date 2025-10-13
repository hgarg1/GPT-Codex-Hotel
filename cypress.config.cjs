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
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();

      on('task', {
        async 'dining:reset'() {
          await prisma.reservation.deleteMany();
          await prisma.user.deleteMany();
          return null;
        },
        async 'dining:createReservation'(input) {
          const { userId, email, name, date, time, tableIds, partySize, status = 'CONFIRMED' } = input;
          if (!userId || !email || !date || !time || !Array.isArray(tableIds) || tableIds.length === 0) {
            throw new Error('Invalid reservation payload for dining:createReservation task');
          }
          await prisma.user.upsert({
            where: { id: userId },
            update: { email, name },
            create: { id: userId, email, name },
          });
          await prisma.reservation.create({
            data: {
              userId,
              date: new Date(`${date}T00:00:00`),
              time,
              partySize: partySize || tableIds.length,
              tableIds,
              status,
              contactPhone: '+10000000000',
            },
          });
          return null;
        },
      });

      on('after:run', async () => {
        await prisma.$disconnect();
      });

      return undefined;
    },
  },
});
