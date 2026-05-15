import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const STATIONS_JSON =
  'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const TRAFFIC_CSV =
  'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

const BOSTON_BIKE_GEOJSON =
  'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson';
const CAMBRIDGE_BIKE_GEOJSON =
  'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson';

const BIKE_LANE_PAINT = {
  'line-color': '#32D400',
  'line-width': 4,
  'line-opacity': 0.55,
};

/**
 * Paste your Mapbox *public* access token (starts with pk.) from
 * https://account.mapbox.com/access-tokens/
 */
const MAPBOX_ACCESS_TOKEN = '';

const stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

const departuresByMinute = Array.from({ length: 1440 }, () => []);
const arrivalsByMinute = Array.from({ length: 1440 }, () => []);

let map;
let rawStations = [];
let radiusScale = d3.scaleSqrt().domain([0, 1]).range([0, 25]);
const svg = d3.select('#map').select('svg');

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) {
    return tripsByMinute.flat();
  }

  let minMinute = (minute - 60 + 1440) % 1440;
  let maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    const beforeMidnight = tripsByMinute.slice(minMinute);
    const afterMidnight = tripsByMinute.slice(0, maxMinute);
    return beforeMidnight.concat(afterMidnight).flat();
  }
  return tripsByMinute.slice(minMinute, maxMinute).flat();
}

function computeStationTraffic(stationList, timeFilter = -1) {
  const depTrips = filterByMinute(departuresByMinute, timeFilter);
  const arrTrips = filterByMinute(arrivalsByMinute, timeFilter);

  const departures = d3.rollup(
    depTrips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    arrTrips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  return stationList.map((station) => {
    const id = station.short_name;
    const arr = arrivals.get(id) ?? 0;
    const dep = departures.get(id) ?? 0;
    return {
      ...station,
      arrivals: arr,
      departures: dep,
      totalTraffic: arr + dep,
    };
  });
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function updatePositions() {
  svg
    .selectAll('circle')
    .attr('cx', (d) => getCoords(d).cx)
    .attr('cy', (d) => getCoords(d).cy);
}

function updateScatterPlot(timeFilter) {
  const withTraffic = computeStationTraffic(rawStations, timeFilter);
  const maxT = d3.max(withTraffic, (d) => d.totalTraffic) || 1;
  radiusScale.domain([0, maxT]);

  if (timeFilter === -1) {
    radiusScale.range([0, 25]);
  } else {
    radiusScale.range([3, 50]);
  }

  svg
    .selectAll('circle')
    .data(withTraffic, (d) => d.short_name)
    .join('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .style('--departure-ratio', (d) => {
      if (!d.totalTraffic) return 0.5;
      return stationFlow(d.departures / d.totalTraffic);
    })
    .each(function (d) {
      d3.select(this).selectAll('title').remove();
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  updatePositions();
}

function initMap() {
  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
  });

  map.on('load', async () => {
    map.addSource('boston_route', {
      type: 'geojson',
      data: BOSTON_BIKE_GEOJSON,
    });
    map.addLayer({
      id: 'bike-lanes-boston',
      type: 'line',
      source: 'boston_route',
      paint: BIKE_LANE_PAINT,
    });

    map.addSource('cambridge_route', {
      type: 'geojson',
      data: CAMBRIDGE_BIKE_GEOJSON,
    });
    map.addLayer({
      id: 'bike-lanes-cambridge',
      type: 'line',
      source: 'cambridge_route',
      paint: BIKE_LANE_PAINT,
    });

    let jsonData;
    try {
      jsonData = await d3.json(STATIONS_JSON);
    } catch (e) {
      console.error('Error loading stations JSON:', e);
      return;
    }

    const trips = await d3.csv(TRAFFIC_CSV, (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });

    for (const trip of trips) {
      const startedMinutes = minutesSinceMidnight(trip.started_at);
      const endedMinutes = minutesSinceMidnight(trip.ended_at);
      departuresByMinute[startedMinutes].push(trip);
      arrivalsByMinute[endedMinutes].push(trip);
    }

    rawStations = jsonData.data.stations;

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    function updateTimeDisplay() {
      const tf = Number(timeSlider.value);

      if (tf === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.style.display = 'block';
      } else {
        selectedTime.textContent = formatTime(tf);
        anyTimeLabel.style.display = 'none';
      }

      updateScatterPlot(tf);
    }

    updateScatterPlot(-1);

    timeSlider.addEventListener('input', updateTimeDisplay);

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    const svgEl = document.querySelector('#map svg');
    if (svgEl?.parentNode) {
      svgEl.parentNode.appendChild(svgEl);
    }
  });
}

if (!MAPBOX_ACCESS_TOKEN?.trim()) {
  const el = document.querySelector('#map');
  if (el) {
    el.innerHTML = `<p class="map-error" style="padding:2rem;margin:0">
      Add your Mapbox public token to <code>bikewatching/map.js</code>
      (<code>MAPBOX_ACCESS_TOKEN</code>), then reload this page.
    </p>`;
  }
} else {
  initMap();
}
