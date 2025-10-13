const diningMenuSections = [
  { key: 'starters', title: 'Starters', order: 1 },
  { key: 'mains', title: 'Mains', order: 2 },
  { key: 'desserts', title: 'Desserts', order: 3 },
  { key: 'drinks', title: 'Drinks', order: 4 },
  { key: 'kids', title: 'Kids', order: 5 }
];

const diningMenuItems = [
  {
    id: 'starter-1',
    name: 'Golden Beet Carpaccio',
    course: 'starters',
    priceCents: 1800,
    tags: ['vegetarian', 'gluten-free'],
    spiceLevel: 1,
    description: 'Shaved beets, pistachio praline, Meyer lemon gel.',
    hoverDetail: 'Mountain beets are shaved tableside and kissed with smoked olive oil.'
  },
  {
    id: 'starter-2',
    name: 'Torched Hamachi Mosaic',
    course: 'starters',
    priceCents: 2400,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Yuzu kosho, compressed cucumber, sesame tuile.',
    hoverDetail: 'Hamachi is line-caught in Hokkaido and finished with our in-house citrus ash.'
  },
  {
    id: 'starter-3',
    name: 'Charred Octopus Kintsugi',
    course: 'starters',
    priceCents: 2600,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Coal-grilled octopus, miso caramel, finger lime pearls.',
    hoverDetail: 'Octopus is marinated 24 hours in koji before being seared over binchōtan coals.'
  },
  {
    id: 'starter-4',
    name: 'Snow Pea & Burrata Fresca',
    course: 'starters',
    priceCents: 1900,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Fresh burrata, snap pea tendrils, basil cloud.',
    hoverDetail: 'Burrata arrives twice weekly from a micro-dairy and is plated within hours of delivery.'
  },
  {
    id: 'starter-5',
    name: 'Glacier Oyster Trio',
    course: 'starters',
    priceCents: 2300,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Three varietals with spruce tip mignonette and trout roe.',
    hoverDetail: 'Each oyster is paired with a distinct spruce infusion to echo alpine aromatics.'
  },
  {
    id: 'main-1',
    name: 'Wagyu Striploin',
    course: 'mains',
    priceCents: 6400,
    tags: [],
    spiceLevel: 1,
    description: 'Charred onion soubise, truffle pomme purée.',
    hoverDetail: 'The striploin is A5 grade from Miyazaki, seared in brown butter for 45 seconds per side.'
  },
  {
    id: 'main-2',
    name: 'Black Garlic Cauliflower Steak',
    course: 'mains',
    priceCents: 3600,
    tags: ['vegan', 'gluten-free'],
    spiceLevel: 2,
    description: 'Harissa, preserved lemon, smoked almond cream.',
    hoverDetail: 'Cauliflower is lacquered in black garlic molasses then finished over the hearth.'
  },
  {
    id: 'main-3',
    name: 'Cedar-Smoked Salmon Fillet',
    course: 'mains',
    priceCents: 4200,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Roasted roots, pine sap glaze, foraged chanterelles.',
    hoverDetail: 'Salmon is smoked in our open-fire hearth with hand-cut cedar planks from British Columbia.'
  },
  {
    id: 'main-4',
    name: 'Porcini Crusted Venison',
    course: 'mains',
    priceCents: 5800,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Cocoa jus, black currant, juniper ash.',
    hoverDetail: 'Wild venison is dry-aged 14 days and dusted with porcini powder and cocoa nib.'
  },
  {
    id: 'main-5',
    name: 'Saffron Lobster Tagliatelle',
    course: 'mains',
    priceCents: 4900,
    tags: ['shellfish'],
    spiceLevel: 1,
    description: 'House-made saffron pasta, lobster coral butter, citrus zest.',
    hoverDetail: 'Pasta dough is infused with Iranian saffron and rolled to order for every seating.'
  },
  {
    id: 'dessert-1',
    name: '64% Chocolate Marquise',
    course: 'desserts',
    priceCents: 1900,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Hazelnut praline, salted caramel, cocoa nib crunch.',
    hoverDetail: 'The marquise is poured into custom molds lined with tempered chocolate filigree.'
  },
  {
    id: 'dessert-2',
    name: 'Aurora Citrus Pavlova',
    course: 'desserts',
    priceCents: 1700,
    tags: ['gluten-free'],
    spiceLevel: 0,
    description: 'Citrus curd, grapefruit sorbet, candied fennel.',
    hoverDetail: 'Meringues are slow-dried for six hours to achieve the aurora-inspired swirls.'
  },
  {
    id: 'dessert-3',
    name: 'Midnight Sesame Soufflé',
    course: 'desserts',
    priceCents: 1800,
    tags: ['vegetarian'],
    spiceLevel: 1,
    description: 'Black sesame sponge, ginger anglaise, honeycomb.',
    hoverDetail: 'Soufflés are fired individually and whisked with freshly ground black sesame paste.'
  },
  {
    id: 'dessert-4',
    name: 'Frozen Garden Tisane',
    course: 'desserts',
    priceCents: 1600,
    tags: ['vegan', 'gluten-free'],
    spiceLevel: 0,
    description: 'Herbal granité, compressed melon, verbena bubbles.',
    hoverDetail: 'Verbena leaves are steeped tableside and poured over the granité for a cloud of aroma.'
  },
  {
    id: 'dessert-5',
    name: 'Caramelized Pear Mille-Feuille',
    course: 'desserts',
    priceCents: 2000,
    tags: ['vegetarian'],
    spiceLevel: 0,
    description: 'Vanilla bean custard, burnt honey, almond brittle.',
    hoverDetail: 'Each mille-feuille uses laminated pastry baked hourly for optimal shatter.'
  },
  {
    id: 'drink-1',
    name: 'Celestial Negroni',
    course: 'drinks',
    priceCents: 2100,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Barrel-aged gin, cacao vermouth, amaro, orange oils.',
    hoverDetail: 'Finished with a flamed cacao mist expressed from the bar\'s rotovap.'
  },
  {
    id: 'drink-2',
    name: 'Alpenglow Spritz',
    course: 'drinks',
    priceCents: 1800,
    tags: ['gluten-free'],
    spiceLevel: 0,
    description: 'Sparkling rosé, mountain berry shrub, smoked thyme.',
    hoverDetail: 'Shrub berries are foraged from local alpine farms and macerated for 72 hours.'
  },
  {
    id: 'drink-3',
    name: 'Juniper Ember',
    course: 'drinks',
    priceCents: 1900,
    tags: ['gluten-free'],
    spiceLevel: 2,
    description: 'Smoked gin, charred citrus, ember bitters.',
    hoverDetail: 'The cocktail is smoked in a cedar cloche before arriving at the table.'
  },
  {
    id: 'drink-4',
    name: 'Crystal Garden Mocktail',
    course: 'drinks',
    priceCents: 1400,
    tags: ['gluten-free', 'vegan'],
    spiceLevel: 0,
    description: 'Seedlip grove, cucumber nectar, basil crystalline.',
    hoverDetail: 'Edible basil crystals are dehydrated in-house for each service.'
  },
  {
    id: 'drink-5',
    name: 'Spiced Chai Old Fashioned',
    course: 'drinks',
    priceCents: 2000,
    tags: ['gluten-free'],
    spiceLevel: 1,
    description: 'Single barrel bourbon, masala syrup, smoked vanilla.',
    hoverDetail: 'Bourbon is fat-washed with toasted coconut and paired with house chai bitters.'
  },
  {
    id: 'kids-1',
    name: 'Mini Garden Poke Bowl',
    course: 'kids',
    priceCents: 1200,
    tags: ['kids', 'gluten-free'],
    spiceLevel: 0,
    description: 'Marinated tofu, sushi rice, rainbow veggies, sweet soy drizzle.',
    hoverDetail: 'Rice is gently seasoned with apple cider vinegar to keep flavors bright for young palates.'
  },
  {
    id: 'kids-2',
    name: 'Sprout Slider Duo',
    course: 'kids',
    priceCents: 1100,
    tags: ['kids'],
    spiceLevel: 0,
    description: 'Grass-fed beef sliders, cheddar melt, soft milk buns.',
    hoverDetail: 'Sliders use a hidden carrot purée for extra sweetness and nutrients.'
  },
  {
    id: 'kids-3',
    name: 'Starlit Pasta Twirls',
    course: 'kids',
    priceCents: 1000,
    tags: ['kids', 'vegetarian'],
    spiceLevel: 0,
    description: 'Mini farfalle, roasted tomato sauce, parmesan snowfall.',
    hoverDetail: 'Tomatoes are slow-roasted with basil to deliver sweetness without heat.'
  },
  {
    id: 'kids-4',
    name: 'Aurora Chicken Bites',
    course: 'kids',
    priceCents: 1200,
    tags: ['kids', 'gluten-free'],
    spiceLevel: 0,
    description: 'Air-baked chicken, quinoa crust, honey herb dip.',
    hoverDetail: 'Chicken is brined in citrus and oven-baked for a crunchy crust without frying.'
  },
  {
    id: 'kids-5',
    name: 'Moonbeam Fruit Parfait',
    course: 'kids',
    priceCents: 800,
    tags: ['kids', 'vegetarian', 'gluten-free'],
    spiceLevel: 0,
    description: 'Vanilla yogurt, berry constellations, granola clusters.',
    hoverDetail: 'Granola clusters are nut-free and toasted with maple syrup for gentle sweetness.'
  }
];

const diningLeadership = [
  {
    id: 'dir-1',
    name: 'Isabella Marchetti',
    title: 'Director of Culinary Experiences',
    focus: 'Vision & Guest Journey',
    bio: 'Former Michelin-starred GM bringing theatrical dining to Skyhaven.',
    photo: '/images/dining/leadership/isabella.jpg'
  },
  {
    id: 'chef-1',
    name: 'Kenji Nakamoto',
    title: 'Executive Chef',
    focus: 'Modern kaiseki-inspired tasting menus',
    bio: 'Sourced from Kyoto, blending precision with seasonal Rocky Mountain ingredients.',
    photo: '/images/dining/leadership/kenji.jpg'
  },
  {
    id: 'pastry-1',
    name: 'Aurora Chen',
    title: 'Pastry Chef',
    focus: 'Edible art installations',
    bio: 'Inventor of the luminescent pavlova series and a lifelong chocolate sculptor.',
    photo: '/images/dining/leadership/aurora.jpg'
  },
  {
    id: 'som-1',
    name: 'Thierry Dubois',
    title: 'Head Sommelier',
    focus: 'Rare allocations & tableside storytelling',
    bio: 'Certified Master Sommelier specializing in biodynamic pairings.',
    photo: '/images/dining/leadership/thierry.jpg'
  },
  {
    id: 'foh-1',
    name: 'Sasha Patel',
    title: 'Front of House Director',
    focus: 'Service choreography',
    bio: 'Leads a synchronized team delivering choreographed service cues.',
    photo: '/images/dining/leadership/sasha.jpg'
  },
  {
    id: 'boh-1',
    name: 'Luis Romero',
    title: 'Back of House Director',
    focus: 'Culinary operations',
    bio: 'Drives mise-en-place precision and nightly kitchen briefings.',
    photo: '/images/dining/leadership/luis.jpg'
  }
];

const diningStaff = [
  {
    id: 'staff-1',
    name: 'Rowan Lee',
    role: 'Captain',
    badges: ['Lead Service', 'Wine Studio'],
    nextShift: '2024-07-01T17:00:00Z'
  },
  {
    id: 'staff-2',
    name: 'Emilia Hart',
    role: 'Pastry Sous Chef',
    badges: ['Sugar Artist'],
    nextShift: '2024-07-01T15:00:00Z'
  },
  {
    id: 'staff-3',
    name: 'Malik Carter',
    role: 'Sommelier',
    badges: ['Spirits Curator'],
    nextShift: '2024-07-02T17:00:00Z'
  }
];

const diningSeats = [
  { id: 'A1', label: 'A1', capacity: 2, zone: 'Atrium', status: 'available' },
  { id: 'A2', label: 'A2', capacity: 2, zone: 'Atrium', status: 'available' },
  { id: 'A3', label: 'A3', capacity: 4, zone: 'Atrium', status: 'held' },
  { id: 'B1', label: 'B1', capacity: 6, zone: 'Garden', status: 'reserved' },
  { id: 'B2', label: 'B2', capacity: 4, zone: 'Garden', status: 'available' },
  { id: 'C1', label: 'C1', capacity: 2, zone: "Chef's Counter", status: 'available' }
];

module.exports = {
  diningMenuSections,
  diningMenuItems,
  diningLeadership,
  diningStaff,
  diningSeats,
};
