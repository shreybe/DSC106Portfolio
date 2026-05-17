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

const FLOW_FILL = d3
  .scaleQuantize()
  .domain([0, 1])
  .range(['#e8891a', '#8b64d8', '#2d7dd2']);

const DEFAULT_STATION_FILL = 'steelblue';

const departuresByMinute = Array.from({ length: 1440 }, () => []);
const arrivalsByMinute = Array.from({ length: 1440 }, () => []);

let map;
let rawStations = [];
let radiusScale = d3.scaleSqrt().domain([0, 1]).range([0, 25]);
const svg = d3.select('#map').select('svg');
const statusEl = document.getElementById('map-status');

function setStatus(message) {
  if (statusEl) statusEl.textContent = message;
}

async function resolveMapboxToken() {
  try {
    const cfg = await import('./mapbox-config.js');
    if (cfg.MAPBOX_ACCESS_TOKEN?.trim()) return cfg.MAPBOX_ACCESS_TOKEN.trim();
  } catch {
    /* optional local file */
  }

  const fromStorage = localStorage.getItem('mapbox_access_token');
  if (fromStorage?.trim()) return fromStorage.trim();

  const fromUrl = new URLSearchParams(location.search).get('mapbox_token');
  if (fromUrl?.trim()) {
    localStorage.setItem('mapbox_access_token', fromUrl.trim());
    return fromUrl.trim();
  }

  return '';
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();

  const minMinute = (minute - 60 + 1440) % 1440;
  const maxMinute = (minute + 60) % 1440;

  if (minMinute > maxMinute) {
    return tripsByMinute.slice(minMinute).concat(tripsByMinute.slice(0, maxMinute)).flat();
  }
  return tripsByMinute.slice(minMinute, maxMinute).flat();
}

function computeStationTraffic(stationList, timeFilter = -1) {
  const departures = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
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

function stationFill(d, timeFilter) {
  if (timeFilter === -1 || !d.totalTraffic) return DEFAULT_STATION_FILL;
  return FLOW_FILL(d.departures / d.totalTraffic);
}

function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat);
  const { x, y } = map.project(point);
  return { cx: x, cy: y };
}

function raiseSvgOverlay() {
  const svgEl = document.querySelector('#map svg');
  if (svgEl?.parentNode) svgEl.parentNode.appendChild(svgEl);
}

function updatePositions() {
  svg
    .selectAll('circle')
    .attr('cx', (d) => getCoords(d).cx)
    .attr('cy', (d) => getCoords(d).cy);
}

let currentTimeFilter = -1;

function updateScatterPlot(timeFilter) {
  currentTimeFilter = timeFilter;
  const withTraffic = computeStationTraffic(rawStations, timeFilter);
  const sorted = d3.sort(withTraffic, (d) => d.totalTraffic);
  const maxT = d3.max(withTraffic, (d) => d.totalTraffic) || 1;

  radiusScale.domain([0, maxT]);
  radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]);

  svg
    .selectAll('circle')
    .data(sorted, (d) => d.short_name)
    .join('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .style('fill', (d) => stationFill(d, timeFilter))
    .each(function (d) {
      d3.select(this).selectAll('title').remove();
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  updatePositions();
  raiseSvgOverlay();
}

function initMap(accessToken) {
  if (map) return;

  mapboxgl.accessToken = accessToken;

  map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18,
  });

  map.on('load', async () => {
    setStatus('Loading bike lanes…');

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

    setStatus('Loading stations…');
    let jsonData;
    try {
      jsonData = await d3.json(STATIONS_JSON);
    } catch (e) {
      console.error(e);
      setStatus('Could not load station data.');
      return;
    }

    setStatus('Loading March 2024 trip data (this can take a minute)…');
    const trips = await d3.csv(TRAFFIC_CSV, (trip) => {
      trip.started_at = new Date(trip.started_at);
      trip.ended_at = new Date(trip.ended_at);
      return trip;
    });

    for (const trip of trips) {
      departuresByMinute[minutesSinceMidnight(trip.started_at)].push(trip);
      arrivalsByMinute[minutesSinceMidnight(trip.ended_at)].push(trip);
    }

    rawStations = jsonData.data.stations;
    setStatus('');

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    function updateTimeDisplay() {
      const tf = Number(timeSlider.value);

      if (tf === -1) {
        selectedTime.textContent = '';
        anyTimeLabel.hidden = false;
      } else {
        selectedTime.textContent = formatTime(tf);
        anyTimeLabel.hidden = true;
      }

      updateScatterPlot(tf);
    }

    updateTimeDisplay();
    timeSlider.addEventListener('input', updateTimeDisplay);

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    raiseSvgOverlay();
  });
}

const tokenSetup = document.getElementById('token-setup');
const tokenForm = document.getElementById('token-form');
const tokenInput = document.getElementById('token-input');

function showTokenSetup() {
  if (tokenSetup) tokenSetup.hidden = false;
}

function hideTokenSetup() {
  if (tokenSetup) tokenSetup.hidden = true;
}

function bindTokenForm() {
  tokenForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = tokenInput?.value.trim() ?? '';
    if (!value.startsWith('pk.')) {
      setStatus('Token must start with pk. — use your Mapbox public access token.');
      return;
    }
    localStorage.setItem('mapbox_access_token', value);
    hideTokenSetup();
    setStatus('Loading map…');
    initMap(value);
  });
}

const token = await resolveMapboxToken();

if (!token) {
  showTokenSetup();
  bindTokenForm();
} else {
  hideTokenSetup();
  initMap(token);
}
