import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const existingTables = await prisma.diningTable.count();
  if (existingTables === 0) {
    const tablesToCreate = Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        label: `T${number}`,
        capacity: number <= 4 ? 2 + (number % 4) : 6,
        x: 50 * number,
        y: 40 * number,
        rotation: (number % 4) * 15,
        zone: number <= 5 ? 'Main Hall' : 'Window',
      };
    });

    await prisma.diningTable.createMany({ data: tablesToCreate });
  }

  const section = await prisma.menuSection.upsert({
    where: { title: 'Chef\'s Signatures' },
    update: {},
    create: {
      title: "Chef's Signatures",
      order: 1,
    },
  });

  const menuItems = await prisma.menuItem.count({ where: { sectionId: section.id } });
  if (menuItems === 0) {
    await prisma.menuItem.createMany({
      data: [
        {
          sectionId: section.id,
          name: 'Seared Scallops',
          description: 'Day-boat scallops with citrus beurre blanc and crispy pancetta.',
          priceCents: 3200,
          glutenFree: true,
        },
        {
          sectionId: section.id,
          name: 'Black Garlic Wagyu',
          description: 'Miyazaki A5 wagyu, smoked pomme puree, and charred spring onions.',
          priceCents: 5800,
        },
      ],
    });
  }

  const staffCount = await prisma.staff.count({ where: { role: 'Executive Chef' } });
  if (staffCount === 0) {
    await prisma.staff.create({
      data: {
        name: 'Elena Marquez',
        role: 'Executive Chef',
        bio: 'Oversees the Supper Club kitchen with a focus on sustainable coastal cuisine.',
        photoUrl: 'https://example.com/images/staff/elena-marquez.jpg',
      },
    });
  }
}

main()
  .catch((error) => {
    console.error('Failed to seed dining data', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
