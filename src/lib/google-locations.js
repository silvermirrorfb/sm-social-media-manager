// Silver Mirror Google Maps location registry
// Used for linking to Google review pages per location.

export const GOOGLE_LOCATIONS = [
  {
    id: 'ues',
    name: 'Upper East Side',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+UES/@40.7658912,-73.9657756,17z',
  },
  {
    id: 'flatiron',
    name: 'Flatiron',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Flatiron/@40.7412863,-73.9915822,17z',
  },
  {
    id: 'bryant_park',
    name: 'Bryant Park',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Bryant+Park/@40.7511413,-73.9822172,17z',
  },
  {
    id: 'manhattan_west',
    name: 'Manhattan West',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Manhattan+West/@40.7522251,-73.9981157,17z',
  },
  {
    id: 'uws',
    name: 'Upper West Side',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Upper+West+Side/@40.7867389,-73.9781542,17z',
  },
  {
    id: 'dupont',
    name: 'Dupont Circle',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Dupont+Circle/@38.9074566,-77.0431579,17z',
  },
  {
    id: 'navy_yard',
    name: 'Navy Yard',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Navy+Yard/@38.8742468,-77.0020446,17z',
  },
  {
    id: 'penn_quarter',
    name: 'Penn Quarter',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Penn+Quarter/@38.8996461,-77.0245956,17z',
  },
  {
    id: 'brickell',
    name: 'Brickell',
    city: 'Miami',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Brickell/@25.766947,-80.1960918,17z',
  },
  {
    id: 'coral_gables',
    name: 'Coral Gables',
    city: 'Miami',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Coral+Gables/@25.7454278,-80.2576065,17z',
  },
];

export function getGoogleLocations() {
  return GOOGLE_LOCATIONS;
}

export function getGoogleLocationById(id) {
  return GOOGLE_LOCATIONS.find((loc) => loc.id === id) || null;
}

