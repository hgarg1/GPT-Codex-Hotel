const { v4: uuidv4 } = require('uuid');

// Curated inventory of 30 suites that define Aurora Nexus Skyhaven.
const rooms = [
  {
    id: uuidv4(),
    name: 'Celestial Horizon Suite',
    category: 'Signature Suites',
    description: 'Panoramic holo-glass walls and adaptive gravity bedding bring orbit-level serenity to every guest.',
    price: 820,
    capacity: 4,
    availableUnits: 6,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Nebula Immersion Loft',
    category: 'Signature Suites',
    description: 'Bioluminescent panels respond to your heart rate, crafting a personalised nebula each evening.',
    price: 760,
    capacity: 3,
    availableUnits: 5,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Quantum Flow Residence',
    category: 'Residences',
    description: 'Modular living zones reconfigure at a gesture for work, wellness, or celestial entertainment.',
    price: 980,
    capacity: 5,
    availableUnits: 4,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Aurora Pulse Chamber',
    category: 'Immersion Pods',
    description: 'Zero-noise sleep chamber with aurora pulse therapy for accelerated recovery and lucid dreaming.',
    price: 420,
    capacity: 2,
    availableUnits: 8,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Lunar Tide Pavilion',
    category: 'Villas',
    description: 'Private terrace orbit lounge overlooking the anti-grav lagoon with autonomous concierge drones.',
    price: 1120,
    capacity: 6,
    availableUnits: 3,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Stellar Garden Atrium',
    category: 'Residences',
    description: 'Living green nebula garden, aroma-coded climates, and AI-curated culinary service in-suite.',
    price: 890,
    capacity: 4,
    availableUnits: 4,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Zenith Halo Penthouse',
    category: 'Signature Suites',
    description: 'Tri-level penthouse crowned by a kinetic halo skylight and private levitation spa.',
    price: 1480,
    capacity: 6,
    availableUnits: 2,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Comet Trail Studio',
    category: 'Studios',
    description: 'Compact studio with adaptive projection walls that stream live cosmic vistas in real time.',
    price: 360,
    capacity: 2,
    availableUnits: 10,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Gravity Well Villa',
    category: 'Villas',
    description: 'Sunken lounge with levitating daybeds suspended over a cascading photon waterfall.',
    price: 1340,
    capacity: 6,
    availableUnits: 2,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Aether Sound Capsule',
    category: 'Immersion Pods',
    description: '360° acoustic field with mood-synced frequency therapy and customizable starlight canopy.',
    price: 410,
    capacity: 2,
    availableUnits: 7,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Ion Drift Loft',
    category: 'Residences',
    description: 'Floor-to-ceiling nanoglass invites the skyline indoors with responsive opacity and thermal aura.',
    price: 810,
    capacity: 4,
    availableUnits: 4,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Nimbus Reflect Suite',
    category: 'Signature Suites',
    description: 'Reflective holo-furniture and curated scent choreography create a dreamlike atmosphere.',
    price: 790,
    capacity: 3,
    availableUnits: 5,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Orbital Muse Gallery',
    category: 'Residences',
    description: 'Private gallery walls display AI-generated art based on your brainwave patterns.',
    price: 920,
    capacity: 4,
    availableUnits: 3,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Photon Stream Cabin',
    category: 'Studios',
    description: 'Suspended sleeping pod with photon stream shower and immersive night-sky projection.',
    price: 380,
    capacity: 2,
    availableUnits: 9,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Nova Tidal Loft',
    category: 'Residences',
    description: 'Responsive floor tides simulate ocean swells with adjustable tempo for meditation.',
    price: 870,
    capacity: 4,
    availableUnits: 4,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Horizon Forge Villa',
    category: 'Villas',
    description: 'Integrated holo-kitchen with matter synthesis bar and private stargazing deck.',
    price: 1200,
    capacity: 5,
    availableUnits: 3,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Prism Veil Suite',
    category: 'Signature Suites',
    description: 'Prismatic veils refract dawn light across sculpted walls, paired with levitation bath.',
    price: 840,
    capacity: 3,
    availableUnits: 5,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Celestine Writer Pod',
    category: 'Immersion Pods',
    description: 'AI co-creation desk, adaptive circadian lighting, and full-sensory inspiration sequences.',
    price: 390,
    capacity: 1,
    availableUnits: 6,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Stratos Signal Loft',
    category: 'Residences',
    description: 'Quantum-encrypted workspace, private signal garden, and atmosphere harmoniser.',
    price: 860,
    capacity: 4,
    availableUnits: 4,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Eclipse Mirage Suite',
    category: 'Signature Suites',
    description: 'Adaptive eclipse canopy transitions the room from daylight clarity to cosmic dusk.',
    price: 810,
    capacity: 4,
    availableUnits: 5,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Pulsewave Wellness Villa',
    category: 'Villas',
    description: 'Hydro-levitation pools, cryo sauna, and personal wellness AI with real-time biometrics.',
    price: 1380,
    capacity: 6,
    availableUnits: 2,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Lattice Dream Studio',
    category: 'Studios',
    description: 'Geometric lattice walls pulse gently with binaural soundscapes for mindful rest.',
    price: 350,
    capacity: 2,
    availableUnits: 10,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Voyager Horizon Loft',
    category: 'Residences',
    description: 'Expansive dual-level loft with skywalk and personalized drone butler.',
    price: 940,
    capacity: 5,
    availableUnits: 3,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Spectral Flow Suite',
    category: 'Signature Suites',
    description: 'Spectral waterfalls cascade along the walls, timed to your curated playlist.',
    price: 830,
    capacity: 3,
    availableUnits: 5,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Chrono Drift Pod',
    category: 'Immersion Pods',
    description: 'Adjustable time dilation sequences offer restorative sleep in 45 conscious minutes.',
    price: 460,
    capacity: 2,
    availableUnits: 7,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Halo Harbor Villa',
    category: 'Villas',
    description: 'Floating fire pit, holo-mixology lab, and private aerial shuttle dock.',
    price: 1400,
    capacity: 6,
    availableUnits: 2,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Astral Crest Residence',
    category: 'Residences',
    description: 'Celestial observatory dome with auto-align telescope and quantum cinema.',
    price: 990,
    capacity: 5,
    availableUnits: 3,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Pulse Arc Studio',
    category: 'Studios',
    description: 'Immersive art studio with haptic canvas surfaces and holographic inspiration loops.',
    price: 370,
    capacity: 2,
    availableUnits: 9,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Zen Spiral Suite',
    category: 'Signature Suites',
    description: 'Spiral meditation chamber, levitating reading lounge, and AI-personalised tea rituals.',
    price: 780,
    capacity: 3,
    availableUnits: 5,
    image: '/images/suite.svg'
  },
  {
    id: uuidv4(),
    name: 'Stellar Forge Loft',
    category: 'Residences',
    description: 'Forged metal sculptures double as smart storage and living art installations.',
    price: 900,
    capacity: 4,
    availableUnits: 4,
    image: '/images/skyline.svg'
  },
  {
    id: uuidv4(),
    name: 'Aurora Drift Pod',
    category: 'Immersion Pods',
    description: 'Weightless slumber experience with choreographed aurora borealis canopy.',
    price: 430,
    capacity: 2,
    availableUnits: 8,
    image: '/images/nebula.svg'
  },
  {
    id: uuidv4(),
    name: 'Eon Cascade Villa',
    category: 'Villas',
    description: 'Waterfall atrium with suspended botanical orbs and gravity dining stage.',
    price: 1460,
    capacity: 7,
    availableUnits: 2,
    image: '/images/suite.svg'
  }
];

function getAllRooms() {
  return rooms;
}

function getRoomById(id) {
  return rooms.find((room) => room.id === id);
}

function adjustRoomAvailability(id, delta) {
  const room = getRoomById(id);
  if (room) {
    room.availableUnits = Math.max(0, room.availableUnits + delta);
  }
  return room;
}

function setRoomAvailability(id, availableUnits) {
  const room = getRoomById(id);
  if (room) {
    room.availableUnits = Math.max(0, Number.parseInt(availableUnits, 10) || 0);
  }
  return room;
}

module.exports = {
  rooms,
  getAllRooms,
  getRoomById,
  adjustRoomAvailability,
  setRoomAvailability
};
