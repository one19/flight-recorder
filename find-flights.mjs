import fs from 'fs';
import axios from 'axios';
import { config } from 'dotenv';
import getDistance from '@riskyvaibhav/lat-long-to-km';

// load our important environment variables
// API_KEY, HOME_LAT, HOME_LNG
config();

const BOX_VARIANCE = 0.025; // lat/long degrees difference from center(home)

// make an equal rectangle on our home from the bottom left
// a bounding box of about 8km diagonal, but it includes more than that
const home = [Number.parseFloat(process.env.HOME_LAT), Number.parseFloat(process.env.HOME_LNG)];
const bottomLeft = [home[0] - BOX_VARIANCE, home[1] - BOX_VARIANCE];
const topRight = [home[0] + BOX_VARIANCE, home[1] + BOX_VARIANCE];

// set the api key as the default parameter given to all api calls
const searchParams = new URLSearchParams({ api_key: process.env.API_KEY, bbox: [...bottomLeft, ...topRight] });

console.log('searchParams', searchParams.toString());
console.log('home', home);



const airLabsApi = axios.create({
  baseURL: 'https://airlabs.co/api/v9',
  transformResponse: (data) => {
    const parsed = JSON.parse(data);
    console.log(`${parsed.request.key.limits_total} requests remaining`);
    return parsed.response;
  }
});

const logFlyover = async () => {
  const { data: flights } = await airLabsApi.get(`/flights?${searchParams.toString()}`);

  console.log(flights.length);

  const likelyFlights = flights
    .filter(flight => flight.alt) // only include flights off the ground
    .map(flight => ({ ...flight, distance: getDistance(home[0], home[1], flight.lat, flight.lng) })) // add the distance from the center
    .filter(flight => flight.distance < 15) // only include flights within 12km of the center
    .map(flight => {
      // calculate the slope of the flight path
      const slope = Number.parseFloat(Math.tan(flight.dir*Math.PI/180).toFixed(4));

      // also reducing the flight path to intercept relative zero
      const relativeHomeLat = home[0] - flight.lat;
      const relativeHomeLon = home[1] - flight.lng;
      console.log(relativeHomeLat);
      console.log(relativeHomeLon);
      const numerator = Math.abs((slope * relativeHomeLon) - relativeHomeLat);
      const denominator = Math.sqrt((slope * slope) + 1);

      // turn our closest distance long/lat into a km distance
      const closestApproach = getDistance(0, numerator / denominator, 0, 0);
      return { ...flight, closestApproach };
    })
    .sort((a, b) => a.closestApproach - b.closestApproach) // sort by distance (ascending)

  console.log(likelyFlights);

  // log it to a file so we can see interpret the results later
  // and collate data on busy days & times
  if (likelyFlights.length) {
    fs.writeFileSync(`./flights/${new Date().toISOString()}.json`, JSON.stringify(likelyFlights, null, 2), 'utf8');
  }
}

logFlyover();
