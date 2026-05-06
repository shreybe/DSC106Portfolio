/**
 * DSC 106 Project 3 — D3-only interactive MODIS / FIRMS hotspot explorer.
 */
(function () {
  const MAP_BASE = { width: 2800, height: 1520 };

  const parseDate = d3.timeParse("%Y-%m-%d");
  const fmtDate = d3.timeFormat("%b %-d, %Y");
  const fmtShort = d3.timeFormat("%b %-d");

  const state = {
    raw: [],
    dates: [],
    projection: null,
    path: null,
    geo: null,
    selected: null,
    allowDay: true,
    allowNight: true,
    minConf: 0,
    minDateIdx: 0,
    maxDateIdx: 0,
  };

  function regionLabel(lon) {
    if (lon < -102) return "West";
    if (lon < -88) return "Central";
    return "East";
  }

  function applyFilters(data) {
    const dmin = state.dates[state.minDateIdx];
    const dmax = state.dates[state.maxDateIdx];
    return data.filter((d) => {
      if (d.acq_date < dmin || d.acq_date > dmax) return false;
      if (d.confidence < state.minConf) return false;
      if (d.daynight === "D" && !state.allowDay) return false;
      if (d.daynight === "N" && !state.allowNight) return false;
      return true;
    });
  }

  function renderDetail(d) {
    const empty = document.getElementById("detail-empty");
    const dl = document.getElementById("detail-dl");
    if (!d) {
      empty.hidden = false;
      dl.hidden = true;
      dl.innerHTML = "";
      return;
    }
    empty.hidden = true;
    dl.hidden = false;
    const rows = [
      ["Latitude", d.latitude.toFixed(5)],
      ["Longitude", d.longitude.toFixed(5)],
      ["Brightness (K)", d.brightness.toFixed(2)],
      ["Brightness T31 (K)", d.bright_t31.toFixed(2)],
      ["FRP (MW)", d.frp.toFixed(2)],
      ["Acquisition date", fmtDate(d.acq_date)],
      ["Acquisition time (UTC)", d.acq_time],
      ["Satellite", d.satellite],
      ["Confidence (%)", String(d.confidence)],
      ["Scan (km)", d.scan.toFixed(2)],
      ["Track (km)", d.track.toFixed(2)],
      ["Approx footprint area (km²)", (d.scan * d.track).toFixed(2)],
      ["Day/night", d.daynight === "D" ? "Day" : "Night"],
      ["Region (band)", regionLabel(d.longitude)],
    ];
    dl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  }

  function measureMapSize() {
    const el = document.querySelector("#map-svg");
    const box = el?.getBoundingClientRect?.();
    const w = Math.max(MAP_BASE.width, Math.floor(box?.width || MAP_BASE.width));
    const h = Math.max(MAP_BASE.height, Math.floor(box?.height || MAP_BASE.height));
    return [w, h];
  }

  function setupMap(firesFiltered) {
    const svg = d3.select("#map-svg");
    svg.selectAll("*").remove();

    const domSvg = svg.node();
    const [mw, mh] = measureMapSize();
    svg.attr("viewBox", `0 0 ${mw} ${mh}`);
    if (domSvg) {
      domSvg.setAttribute("width", String(mw));
      domSvg.setAttribute("height", String(mh));
    }

    const defs = svg.append("defs");
    const filter = defs.append("filter").attr("id", "spark-glow").attr("x", "-80%").attr("y", "-80%").attr("width", "260%").attr("height", "260%");
    filter.append("feGaussianBlur").attr("stdDeviation", "2").attr("result", "blur");
    const merge = filter.append("feMerge");
    merge.append("feMergeNode").attr("in", "blur");
    merge.append("feMergeNode").attr("in", "SourceGraphic");

    const root = svg.append("g").attr("class", "map-root");
    const statesFeat = topojson.feature(state.geo, state.geo.objects.states);
    state.projection = d3.geoAlbersUsa().fitSize([mw, mh], statesFeat);
    state.path = d3.geoPath(state.projection);

    root
      .append("path")
      .datum(statesFeat)
      .attr("class", "states-fill")
      .attr("d", state.path)
      .attr("fill", "#15151d")
      .attr("stroke", "none");

    root.append("path").datum(topojson.mesh(state.geo, state.geo.objects.states, (a, b) => a !== b)).attr("class", "state-boundary").attr("d", state.path);

    const maxFrp = d3.max(state.raw, (d) => d.frp) || 1;
    const rScale = d3.scaleSqrt().domain([0, maxFrp]).range([2.2, 10]);

    root
      .append("g")
      .attr("class", "fires")
      .selectAll("circle")
      .data(firesFiltered, (d) => `${d.longitude},${d.latitude},${d.acq_time},${d.acq_date.getTime()}`)
      .join("circle")
      .attr("class", "spark-dot")
      .attr("cx", (d) => state.projection([d.longitude, d.latitude])[0])
      .attr("cy", (d) => state.projection([d.longitude, d.latitude])[1])
      .attr("r", (d) => rScale(d.frp))
      .attr("fill", (d) => {
        const t = (d.brightness - 300) / 60;
        return d3.interpolateRgb("#ffe5a8", "#ffb020")(Math.min(1, Math.max(0, t)));
      })
      .attr("opacity", 0.92)
      .attr("filter", "url(#spark-glow)")
      .classed("selected", (d) => d === state.selected)
      .on("click", (event, d) => {
        event.stopPropagation();
        state.selected = d;
        root.selectAll("circle.spark-dot").classed("selected", (dd) => dd === d);
        renderDetail(d);
      });

    svg.call(
      d3
        .zoom()
        .scaleExtent([1, 24])
        .on("zoom", (event) => {
          root.attr("transform", event.transform);
        })
    );

    svg.on("dblclick.zoom", null);

    svg.on("click", () => {
      state.selected = null;
      root.selectAll("circle.spark-dot").classed("selected", false);
      renderDetail(null);
    });
  }

  function refresh() {
    const filtered = applyFilters(state.raw);
    setupMap(filtered);

    document.getElementById(
      "date-label"
    ).textContent = `${fmtShort(state.dates[state.minDateIdx])} → ${fmtShort(state.dates[state.maxDateIdx])}`;
    document.getElementById("conf-label").textContent = `${state.minConf}%`;
    const stats = document.querySelector("#map-stats");
    if (stats) {
      stats.textContent = `${filtered.length} / ${state.raw.length} hotspots shown`;
    }
  }

  async function init() {
    const csvText =
      typeof window.__MODIS_FIRES_CSV === "string" && window.__MODIS_FIRES_CSV.length
        ? window.__MODIS_FIRES_CSV
        : await d3.text("data/modis_fires_us.csv");
    const geo = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    state.geo = geo;

    const rows = d3.csvParse(csvText, (d) => ({
      ...d,
      latitude: +d.latitude,
      longitude: +d.longitude,
      brightness: +d.brightness,
      scan: +d.scan,
      track: +d.track,
      acq_date: parseDate(d.acq_date),
      acq_time: d.acq_time,
      satellite: d.satellite,
      instrument: d.instrument,
      confidence: +d.confidence,
      version: d.version,
      bright_t31: +d.bright_t31,
      frp: +d.frp,
      daynight: d.daynight,
    }));

    state.raw = rows;
    state.dates = Array.from(new Set(rows.map((d) => d.acq_date.getTime())))
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    state.minDateIdx = 0;
    state.maxDateIdx = state.dates.length - 1;

    const minEl = document.getElementById("date-min");
    const maxEl = document.getElementById("date-max");
    minEl.min = maxEl.min = 0;
    minEl.max = maxEl.max = String(state.dates.length - 1);
    minEl.step = maxEl.step = "1";
    minEl.value = "0";
    maxEl.value = String(state.dates.length - 1);

    minEl.addEventListener("input", () => {
      state.minDateIdx = Math.min(+minEl.value, +maxEl.value);
      minEl.value = String(state.minDateIdx);
      refresh();
    });
    maxEl.addEventListener("input", () => {
      state.maxDateIdx = Math.max(+minEl.value, +maxEl.value);
      maxEl.value = String(state.maxDateIdx);
      refresh();
    });

    document.getElementById("confidence").addEventListener("input", (e) => {
      state.minConf = +e.target.value;
      refresh();
    });

    document.getElementById("btn-day").addEventListener("click", (e) => {
      state.allowDay = !state.allowDay;
      e.currentTarget.classList.toggle("active", state.allowDay);
      refresh();
    });
    document.getElementById("btn-night").addEventListener("click", (e) => {
      state.allowNight = !state.allowNight;
      e.currentTarget.classList.toggle("active", state.allowNight);
      refresh();
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      state.minConf = 0;
      state.allowDay = true;
      state.allowNight = true;
      state.minDateIdx = 0;
      state.maxDateIdx = state.dates.length - 1;
      document.getElementById("confidence").value = "0";
      document.getElementById("date-min").value = "0";
      document.getElementById("date-max").value = String(state.dates.length - 1);
      document.getElementById("btn-day").classList.add("active");
      document.getElementById("btn-night").classList.add("active");
      refresh();
    });

    refresh();

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => refresh(), 120);
    });
  }

  init().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<p style="color:#faa;padding:1rem">Failed to load data: ${err.message}</p>`
    );
  });
})();
