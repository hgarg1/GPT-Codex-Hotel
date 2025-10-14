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
    badges: ['Sugar Artist', 'Plating Architect'],
    nextShift: '2024-07-01T15:00:00Z'
  },
  {
    id: 'staff-3',
    name: 'Malik Carter',
    role: 'Sommelier',
    badges: ['Spirits Curator', 'Cellar Whisperer'],
    nextShift: '2024-07-02T17:00:00Z'
  },
  {
    id: 'staff-4',
    name: 'Aya Nakamoto',
    role: 'Tea Ceremony Master',
    badges: ['Sencha Scholar', 'Botanical Infusions'],
    nextShift: '2024-07-01T18:30:00Z'
  },
  {
    id: 'staff-5',
    name: 'Dante Morales',
    role: 'Hearth Chef',
    badges: ['Live Fire', 'Smoke Dialects'],
    nextShift: '2024-07-01T16:00:00Z'
  },
  {
    id: 'staff-6',
    name: 'Celeste Quinn',
    role: 'Experience Conductor',
    badges: ['Guest Whisperer', 'Flow Maestro'],
    nextShift: '2024-07-01T17:30:00Z'
  },
  {
    id: 'staff-7',
    name: 'Priya Desai',
    role: 'Flavor Anthropologist',
    badges: ['Fermentation Lab', 'Spice Cartographer'],
    nextShift: '2024-07-03T14:30:00Z'
  },
  {
    id: 'staff-8',
    name: 'Luca Benedetti',
    role: 'Pasta Virtuoso',
    badges: ['Lamination Guild', 'Saffron Steward'],
    nextShift: '2024-07-01T14:00:00Z'
  },
  {
    id: 'staff-9',
    name: 'Noor al-Salim',
    role: 'Dessert Cartelier',
    badges: ['Frozen Atelier', 'Aromatic Sculptor'],
    nextShift: '2024-07-02T19:00:00Z'
  },
  {
    id: 'staff-10',
    name: 'Hugo Sterling',
    role: 'Lighting Dramaturg',
    badges: ['Atmosphere Designer', 'Projection Pilot'],
    nextShift: '2024-07-02T17:45:00Z'
  },
  {
    id: 'staff-11',
    name: 'Mira Solberg',
    role: 'Sound Curator',
    badges: ['Acoustic Alchemist'],
    nextShift: '2024-07-03T16:15:00Z'
  },
  {
    id: 'staff-12',
    name: 'Tessa Vaughn',
    role: 'Forager Liaison',
    badges: ['Alpine Scout', 'Sustainability Lead'],
    nextShift: '2024-07-02T13:00:00Z'
  },
  {
    id: 'staff-13',
    name: 'Gabriel Montrose',
    role: 'Cellar Archivist',
    badges: ['Rare Vintage', 'Decanting Rituals'],
    nextShift: '2024-07-03T20:00:00Z'
  },
  {
    id: 'staff-14',
    name: 'Xiang Li',
    role: 'Dim Sum Savant',
    badges: ['Folding Mastery', 'Steam Artisan'],
    nextShift: '2024-07-01T11:00:00Z'
  },
  {
    id: 'staff-15',
    name: 'Amara Kinte',
    role: 'Beverage Cartographer',
    badges: ['Zero-Proof Innovator', 'Herbarium Keeper'],
    nextShift: '2024-07-03T18:45:00Z'
  },
  {
    id: 'staff-16',
    name: 'Jonas Rivera',
    role: 'Service Choreographer',
    badges: ['Shift Maestro', 'Training Lead'],
    nextShift: '2024-07-02T16:30:00Z'
  },
  {
    id: 'staff-17',
    name: 'Sabine Laurent',
    role: 'Cheese Fromagère',
    badges: ['Affinage Cellar', 'Pairing Muse'],
    nextShift: '2024-07-01T19:30:00Z'
  },
  {
    id: 'staff-18',
    name: 'Rafael Kim',
    role: 'Robotics Steward',
    badges: ['Service Drones', 'Maintenance Virtuoso'],
    nextShift: '2024-07-03T12:30:00Z'
  },
  {
    id: 'staff-19',
    name: 'Lila Starborn',
    role: 'Aromatics Composer',
    badges: ['Scent Lab', 'Candlewright'],
    nextShift: '2024-07-02T21:00:00Z'
  },
  {
    id: 'staff-20',
    name: 'Omar Idrissi',
    role: 'Night Market Chef',
    badges: ['Wok Pulse', 'Spice Forge'],
    nextShift: '2024-07-02T22:15:00Z'
  },
  {
    id: 'staff-21',
    name: 'Sylvia Petrov',
    role: 'Ice Sculptor',
    badges: ['Crystal Forge', 'Rapid Carve'],
    nextShift: '2024-07-01T20:45:00Z'
  },
  {
    id: 'staff-22',
    name: 'Mateo Alvarez',
    role: 'Sustainability Captain',
    badges: ['Zero Waste', 'Aqua Reclamation'],
    nextShift: '2024-07-03T10:00:00Z'
  },
  {
    id: 'staff-23',
    name: 'Hana Ito',
    role: 'Reservation Maestro',
    badges: ['Guest Intel', 'Mood Mapping'],
    nextShift: '2024-07-01T09:00:00Z'
  },
  {
    id: 'staff-24',
    name: 'Quinn Harper',
    role: 'Digital Concierge',
    badges: ['Holographic Briefings', 'Data Pulse'],
    nextShift: '2024-07-02T11:45:00Z'
  },
  {
    id: 'staff-25',
    name: 'Farah El-Amin',
    role: 'Wellness Sommelier',
    badges: ['Tea Therapy', 'Breathwork Guide'],
    nextShift: '2024-07-03T15:00:00Z'
  }
];

const diningSeats = [
  { id: 'T1', label: 'T1', capacity: 2, zone: "Chef's Counter", status: 'available', x: 120, y: 80 },
  { id: 'T2', label: 'T2', capacity: 2, zone: "Chef's Counter", status: 'available', x: 210, y: 80 },
  { id: 'T3', label: 'T3', capacity: 2, zone: "Chef's Counter", status: 'available', x: 300, y: 80 },
  { id: 'T4', label: 'T4', capacity: 2, zone: "Chef's Counter", status: 'available', x: 390, y: 80 },
  { id: 'T5', label: 'T5', capacity: 4, zone: 'Main floor', status: 'available', x: 80, y: 180 },
  { id: 'T6', label: 'T6', capacity: 4, zone: 'Main floor', status: 'available', x: 200, y: 180 },
  { id: 'T7', label: 'T7', capacity: 4, zone: 'Main floor', status: 'available', x: 320, y: 180 },
  { id: 'T8', label: 'T8', capacity: 4, zone: 'Main floor', status: 'available', x: 440, y: 180 },
  { id: 'T9', label: 'T9', capacity: 2, zone: 'Main floor', status: 'available', x: 80, y: 270 },
  { id: 'T10', label: 'T10', capacity: 6, zone: 'Main floor', status: 'held', x: 200, y: 270 },
  { id: 'T11', label: 'T11', capacity: 2, zone: 'Main floor', status: 'available', x: 320, y: 270 },
  { id: 'T12', label: 'T12', capacity: 6, zone: 'Main floor', status: 'reserved', x: 440, y: 270 },
  { id: 'T13', label: 'T13', capacity: 4, zone: 'Celestial Terrace', status: 'available', x: 80, y: 360 },
  { id: 'T14', label: 'T14', capacity: 4, zone: 'Celestial Terrace', status: 'available', x: 200, y: 360 },
  { id: 'T15', label: 'T15', capacity: 4, zone: 'Celestial Terrace', status: 'available', x: 320, y: 360 },
  { id: 'T16', label: 'T16', capacity: 4, zone: 'Celestial Terrace', status: 'available', x: 440, y: 360 },
  { id: 'T17', label: 'T17', capacity: 8, zone: 'Solstice Lounge', status: 'available', x: 560, y: 220 },
  { id: 'T18', label: 'T18', capacity: 6, zone: 'Solstice Lounge', status: 'available', x: 560, y: 320 },
  { id: 'T19', label: 'T19', capacity: 8, zone: 'Private Dining', status: 'available', x: 560, y: 120 },
  { id: 'T20', label: 'T20', capacity: 6, zone: 'Aurora Bar', status: 'available', x: 200, y: 450 },
  { id: 'T21', label: 'T21', capacity: 4, zone: 'Aurora Bar', status: 'available', x: 320, y: 450 },
  { id: 'T22', label: 'T22', capacity: 2, zone: 'Aurora Bar', status: 'available', x: 440, y: 450 }
];

module.exports = {
  diningMenuSections,
  diningMenuItems,
  diningLeadership,
  diningStaff,
  diningSeats,
};
