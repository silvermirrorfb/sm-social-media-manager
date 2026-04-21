// Silver Mirror Google Maps location registry
// Used for linking to Google review pages per location.
// Locations marked ADDRESS_ONLY link to the street address, not the business profile.

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
    url: 'https://www.google.com/maps/place/385+9th+Ave,+New+York,+NY+10001/@40.7522767,-73.9980801,17z',
    addressOnly: true,
  },
  {
    id: 'uws',
    name: 'Upper West Side',
    city: 'New York',
    url: 'https://www.google.com/maps/place/2305+Broadway,+New+York,+NY+10024/@40.7867389,-73.9781542,16z',
    addressOnly: true,
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
    url: 'https://www.google.com/maps/place/920+H+St+NW,+Washington,+DC+20268/@38.8996463,-77.0246111,17z',
    addressOnly: true,
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
    url: 'https://www.google.com/maps/place/2955+Ponce+de+Leon,+Coral+Gables,+FL+33134/@25.7448935,-80.2583191,17z',
    addressOnly: true,
  },
];

export function getGoogleLocations() {
  return GOOGLE_LOCATIONS;
}

export function getGoogleLocationById(id) {
  return GOOGLE_LOCATIONS.find((loc) => loc.id === id) || null;
}

export function getGoogleLocationsWithBusinessProfile() {
  return GOOGLE_LOCATIONS.filter((loc) => !loc.addressOnly);
}
