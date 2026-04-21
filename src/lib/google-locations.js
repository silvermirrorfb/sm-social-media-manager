// Silver Mirror Google Maps location registry
// Used for linking to Google review pages per location.
//
// Each URL includes the `/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1` suffix so
// operators land directly on the Reviews tab. That lets the bookmarklet run on
// the correct tab in one click instead of opening a second window first. The
// `!9m1!1b1` segment is Google Maps' stable encoding for "show the Reviews tab
// on this Place page"; the `!1s0x0:0x0!8m2!3d0!4d0` placeholders are accepted
// even without real hex coordinates.

export const GOOGLE_LOCATIONS = [
  {
    id: 'ues',
    name: 'Upper East Side',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+UES/@40.7658912,-73.9657756,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'flatiron',
    name: 'Flatiron',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Flatiron/@40.7412863,-73.9915822,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'bryant_park',
    name: 'Bryant Park',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Bryant+Park/@40.7511413,-73.9822172,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'manhattan_west',
    name: 'Manhattan West',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Manhattan+West/@40.7522251,-73.9981157,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'uws',
    name: 'Upper West Side',
    city: 'New York',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Upper+West+Side/@40.7867389,-73.9781542,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'dupont',
    name: 'Dupont Circle',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Dupont+Circle/@38.9074566,-77.0431579,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'navy_yard',
    name: 'Navy Yard',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Navy+Yard/@38.8742468,-77.0020446,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'penn_quarter',
    name: 'Penn Quarter',
    city: 'Washington DC',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Penn+Quarter/@38.8996461,-77.0245956,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'brickell',
    name: 'Brickell',
    city: 'Miami',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Brickell/@25.766947,-80.1960918,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
  {
    id: 'coral_gables',
    name: 'Coral Gables',
    city: 'Miami',
    url: 'https://www.google.com/maps/place/Silver+Mirror+Facial+Bar+-+Coral+Gables/@25.7454278,-80.2576065,17z/data=!4m8!3m7!1s0x0:0x0!8m2!3d0!4d0!9m1!1b1',
  },
];

export function getGoogleLocations() {
  return GOOGLE_LOCATIONS;
}

export function getGoogleLocationById(id) {
  return GOOGLE_LOCATIONS.find((loc) => loc.id === id) || null;
}
