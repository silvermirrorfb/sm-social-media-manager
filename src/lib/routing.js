// ─── Silver Mirror Location Directory ────────────────────────
// All 10 locations with leads, phone numbers, and routing data.

export const LOCATIONS = {
  'upper-east-side': {
    name: 'Upper East Side',
    city: 'New York',
    phone: '(646) 861-0089',
    lead: 'PJ',
    leadRole: 'Support Ambassador',
    adaAccessible: false, // Historic building, grandfathered under city law
  },
  'flatiron': {
    name: 'Flatiron',
    city: 'New York',
    phone: '(212) 702-8742',
    lead: 'Vanessa',
    leadRole: 'Experience Ambassador',
    adaAccessible: true,
  },
  'bryant-park': {
    name: 'Bryant Park',
    city: 'New York',
    phone: '(212) 970-7009',
    lead: 'Karen',
    leadRole: 'Experience Ambassador',
    adaAccessible: true,
  },
  'manhattan-west': {
    name: 'Manhattan West',
    city: 'New York',
    phone: '(212) 301-7687',
    lead: 'Missy',
    leadRole: 'Support Ambassador',
    adaAccessible: true,
  },
  'upper-west-side': {
    name: 'Upper West Side',
    city: 'New York',
    phone: '(646) 360-4837',
    lead: 'Brianne',
    leadRole: 'Experience Ambassador',
    adaAccessible: true,
  },
  'dupont-circle': {
    name: 'Dupont Circle',
    city: 'Washington D.C.',
    phone: '(202) 621-6140',
    lead: 'Andrea / Kamlilah',
    leadRole: 'Experience & Support Ambassador',
    adaAccessible: true,
  },
  'navy-yard': {
    name: 'Navy Yard',
    city: 'Washington D.C.',
    phone: '(202) 506-5651',
    lead: 'Nique',
    leadRole: 'Experience Ambassador',
    adaAccessible: true,
  },
  'penn-quarter': {
    name: 'Penn Quarter',
    city: 'Washington D.C.',
    phone: '(202) 998-2090',
    lead: 'Chevisa',
    leadRole: 'Support Ambassador',
    adaAccessible: true,
  },
  'brickell': {
    name: 'Brickell',
    city: 'Miami',
    phone: '(786) 899-0600',
    lead: 'Carla / Nidia',
    leadRole: 'Experience & Support Ambassador',
    adaAccessible: true,
    spanishSupport: true,
  },
  'coral-gables': {
    name: 'Coral Gables',
    city: 'Miami',
    phone: '(786) 988-0520',
    lead: 'Evey',
    leadRole: 'Experience Ambassador',
    adaAccessible: true,
    spanishSupport: true,
  },
};

// ─── Fuzzy location matching ────────────────────────────────
// Match user input like "UES", "brickell", "dupont" to a location key
const LOCATION_ALIASES = {
  'ues': 'upper-east-side',
  'upper east': 'upper-east-side',
  'upper east side': 'upper-east-side',
  'uws': 'upper-west-side',
  'upper west': 'upper-west-side',
  'upper west side': 'upper-west-side',
  'flatiron': 'flatiron',
  'flat iron': 'flatiron',
  'bryant park': 'bryant-park',
  'bryant': 'bryant-park',
  'manhattan west': 'manhattan-west',
  'hudson yards': 'manhattan-west',
  'dupont': 'dupont-circle',
  'dupont circle': 'dupont-circle',
  'navy yard': 'navy-yard',
  'capitol riverfront': 'navy-yard',
  'penn quarter': 'penn-quarter',
  'chinatown dc': 'penn-quarter',
  'brickell': 'brickell',
  'miami': 'brickell', // default Miami location
  'coral gables': 'coral-gables',
  'gables': 'coral-gables',
  'dc': 'dupont-circle', // default DC location
  'washington': 'dupont-circle',
  'georgetown': 'dupont-circle', // closest
  'nyc': 'bryant-park', // default NYC location
  'new york': 'bryant-park',
  'midtown': 'bryant-park',
  'brooklyn': 'flatiron', // closest to Brooklyn
  'williamsburg': 'flatiron',
};

export function findLocation(input) {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();

  // Exact match on key
  if (LOCATIONS[normalized]) return LOCATIONS[normalized];

  // Alias match
  for (const [alias, key] of Object.entries(LOCATION_ALIASES)) {
    if (normalized.includes(alias)) {
      return { ...LOCATIONS[key], key };
    }
  }

  return null;
}

export function getAllLocations() {
  return Object.entries(LOCATIONS).map(([key, loc]) => ({
    key,
    ...loc,
  }));
}

// ─── Contact Routing ────────────────────────────────────────
export const CONTACTS = {
  collaborations: {
    name: 'Sierra Case',
    email: 'sierra.case@silvermirror.com',
    role: 'Collaborations / Influencer / Partnerships',
  },
  press: {
    email: 'hello@silvermirror.com',
    role: 'Press / Media Inquiries',
  },
  events: {
    email: 'hello@silvermirror.com',
    contactName: 'Rachael',
    role: 'Events (bachelorette, birthdays, corporate)',
  },
  memberships: {
    email: 'memberships@silvermirror.com',
    phone: '(888) 677-0055',
    role: 'Membership Questions',
    faqUrl: 'https://silvermirror.com/our-story/memberships-faq',
  },
  general: {
    email: 'hello@silvermirror.com',
    phone: '(888) 677-0055',
    role: 'General Support',
  },
  qa: {
    email: 'qatesting@silvermirror.com',
    role: 'QA / Tech Issues',
  },
  products: {
    email: 'hello@silvermirror.com',
    shopEmail: 'shop@silvermirror.com',
    shopUrl: 'https://shop.silvermirror.com',
    role: 'Product / E-commerce',
  },
  careers: {
    url: 'https://silvermirror.com/careers/',
    role: 'Careers / Jobs',
  },
  giftCards: {
    purchaseUrl: 'https://booking.silvermirror.com/giftcards',
    email: 'hello@silvermirror.com',
    role: 'Gift Cards',
  },
};
