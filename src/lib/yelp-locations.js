// Silver Mirror Yelp location registry
// Matt will fill in pending URLs. Scanner skips any entry whose url is PLACEHOLDER_PENDING_MATT.

export const YELP_LOCATIONS = [
  {
    id: 'ues',
    name: 'Upper East Side',
    city: 'New York',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-upper-east-new-york',
  },
  {
    id: 'flatiron',
    name: 'Flatiron',
    city: 'New York',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-flatiron-new-york-2',
  },
  {
    id: 'bryant_park',
    name: 'Bryant Park',
    city: 'New York',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-bryant-park-nyc-new-york',
  },
  {
    id: 'manhattan_west',
    name: 'Manhattan West',
    city: 'New York',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-manhattan-west-new-york-2',
  },
  {
    id: 'uws',
    name: 'Upper West Side',
    city: 'New York',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-upper-west-side-new-york-3',
  },
  {
    id: 'dupont',
    name: 'Dupont Circle',
    city: 'Washington DC',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-dupont-circle-washington-2',
  },
  {
    id: 'navy_yard',
    name: 'Navy Yard',
    city: 'Washington DC',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-navy-yard-washington',
  },
  {
    id: 'penn_quarter',
    name: 'Penn Quarter',
    city: 'Washington DC',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-penn-quarter-washington',
  },
  {
    id: 'brickell',
    name: 'Brickell',
    city: 'Miami',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-brickell-miami',
  },
  {
    id: 'coral_gables',
    name: 'Coral Gables',
    city: 'Miami',
    url: 'https://www.yelp.com/biz/silver-mirror-facial-bar-coral-gables-coral-gables-2',
  },
];

export function getConfiguredYelpLocations() {
  return YELP_LOCATIONS.filter((loc) => loc.url && loc.url !== 'PLACEHOLDER_PENDING_MATT');
}

export function getYelpLocationById(id) {
  return YELP_LOCATIONS.find((loc) => loc.id === id) || null;
}
