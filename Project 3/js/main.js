/**
 * DSC 106 Project 3 — MODIS / FIRMS hotspot explorer (SVG basemap + canvas hotspots).
 */
(function () {
  const MAP_BASE = { width: 2800, height: 1520 };

  const parseDate = d3.timeParse("%Y-%m-%d");
  const fmtDate = d3.timeFormat("%b %-d, %Y");
  const fmtShort = d3.timeFormat("%b %-d");

  const state = {
    raw: [],
    dates: [],
    geo: null,
    projection: null,
    path: null,
    mapSizeKey: "",
    zoomTransform: d3.zoomIdentity,
    firesFiltered: [],
    firesProjected: [],
    selected: null,
    zoomBehavior: null,
    rScale: null,
    maxFrp: 1,
    allowDay: true,
    allowNight: true,
    minConf: 0,
    minDateIdx: 0,
    maxDateIdx: 0,
  };

  /** @type {CanvasRenderingContext2D | null} */
  let ctx = null;
  let zoomRaf = null;

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

  function measureMapLogicalSize() {
    const el = document.querySelector("#map-svg");
    const box = el?.getBoundingClientRect?.();
    const w = Math.max(MAP_BASE.width, Math.floor(box?.width || MAP_BASE.width));
    const h = Math.max(MAP_BASE.height, Math.floor(box?.height || MAP_BASE.height));
    return [w, h];
  }

  function colorForBrightness(brightness) {
    const t = (brightness - 300) / 60;
    const c = d3.interpolateRgb("#ffe5a8", "#ffb020")(Math.min(1, Math.max(0, t)));
    return d3.color(c) || d3.rgb("#ffb020");
  }

  function syncCanvasSize(canvas, w, h, dpr) {
    const ww = Math.round(w * dpr);
    const hh = Math.round(h * dpr);
    if (canvas.width !== ww || canvas.height !== hh) {
      canvas.width = ww;
      canvas.height = hh;
    }
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function buildProjectionPath(mw, mh) {
    const statesFeat = topojson.feature(state.geo, state.geo.objects.states);
    const projection = d3.geoAlbersUsa().fitSize([mw, mh], statesFeat);
    const path = d3.geoPath(projection);
    return { statesFeat, projection, path };
  }

  function drawBasemap(svgRoot, path, statesFeat, mw, mh) {
    svgRoot.selectAll("*").remove();

    const domSvg = svgRoot.node();
    if (domSvg) {
      svgRoot.attr("viewBox", `0 0 ${mw} ${mh}`);
      domSvg.setAttribute("width", String(mw));
      domSvg.setAttribute("height", String(mh));
    }

    svgRoot
      .append("g")
      .attr("class", "map-root")
      .append("path")
      .datum(statesFeat)
      .attr("class", "states-fill")
      .attr("d", path)
      .attr("fill", "#15151d")
      .attr("stroke", "none");

    svgRoot
      .select("g.map-root")
      .append("path")
      .datum(topojson.mesh(state.geo, state.geo.objects.states, (a, b) => a !== b))
      .attr("class", "state-boundary")
      .attr("d", path);
  }

  function projectFires(rows) {
    return rows.map((d) => {
      const xy = state.projection([d.longitude, d.latitude]);
      return { datum: d, x: xy[0], y: xy[1], r: state.rScale(d.frp), col: colorForBrightness(d.brightness) };
    });
  }

  function redrawCanvasFires() {
    const canvas = document.getElementById("map-canvas");
    if (!canvas || !ctx) return;

    const w = canvas.clientWidth || MAP_BASE.width;
    const h = canvas.clientHeight || MAP_BASE.height;
    const dpr = window.devicePixelRatio || 1;
    syncCanvasSize(canvas, w, h, dpr);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const t = state.zoomTransform;

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    for (const p of state.firesProjected) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = p.col.formatRgb();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (state.selected) {
      const sp = state.firesProjected.find((p) => p.datum === state.selected);
      if (sp) {
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r + 2.8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2.2 / t.k;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(255,59,48,0.55)";
        ctx.lineWidth = 3 / t.k;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function scheduleRedrawFires() {
    if (zoomRaf !== null) return;
    zoomRaf = window.requestAnimationFrame(() => {
      zoomRaf = null;
      redrawCanvasFires();
    });
  }

  function svgPoint(clientX, clientY) {
    const svgEl = document.getElementById("map-svg");
    if (!(svgEl instanceof SVGSVGElement)) return null;
    const pt = svgEl.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }

  function nearestFireSvgPoint(svgX, svgY) {
    if (!Number.isFinite(svgX) || !Number.isFinite(svgY) || !state.firesProjected.length) return null;

    const t = state.zoomTransform;
    const ix = (svgX - t.x) / t.k;
    const iy = (svgY - t.y) / t.k;

    let best = null;
    let bestD = Infinity;

    const hitPx = Math.max(10, 22 / Math.sqrt(t.k));
    const hitSq = hitPx * hitPx;

    for (const p of state.firesProjected) {
      const dx = ix - p.x;
      const dy = iy - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD && d2 <= hitSq) {
        bestD = d2;
        best = p;
      }
    }
    return best;
  }

  function setupInteractions(svgRoot) {
    const svgNode = svgRoot.node();
    state.zoomBehavior = d3
      .zoom()
      .scaleExtent([1, 24])
      .on("zoom", (event) => {
        state.zoomTransform = event.transform;
        svgRoot.select("g.map-root").attr("transform", event.transform);
        scheduleRedrawFires();
      });

    d3.select(svgNode).call(state.zoomBehavior);
    d3.select(svgNode).on("dblclick.zoom", null);

    d3.select(svgNode).call(state.zoomBehavior.transform, state.zoomTransform);

    svgNode.addEventListener("click", (ev) => {
      const pt = svgPoint(ev.clientX, ev.clientY);
      if (!pt) return;
      const nearest = nearestFireSvgPoint(pt.x, pt.y);
      if (nearest) {
        ev.stopPropagation();
        state.selected = nearest.datum;
        scheduleRedrawFires();
        renderDetail(nearest.datum);
        return;
      }
      state.selected = null;
      scheduleRedrawFires();
      renderDetail(null);
    });
  }

  function ensureMapInfrastructure(firesFiltered) {
    const [mw, mh] = measureMapLogicalSize();
    const key = `${mw}x${mh}`;

    const svgRoot = d3.select("#map-svg");
    const canvas = document.getElementById("map-canvas");

    state.maxFrp = d3.max(state.raw, (d) => d.frp) || 1;
    state.rScale = d3.scaleSqrt().domain([0, state.maxFrp]).range([2.2, 10]);

    if (!ctx && canvas) {
      ctx = canvas.getContext("2d");
    }

    if (key !== state.mapSizeKey || !state.projection) {
      const { statesFeat, projection, path } = buildProjectionPath(mw, mh);
      state.projection = projection;
      state.path = path;
      state.mapSizeKey = key;
      drawBasemap(svgRoot, path, statesFeat, mw, mh);

      if (canvas) {
        syncCanvasSize(canvas, mw, mh, window.devicePixelRatio || 1);
        canvas.dataset.logicalW = String(mw);
        canvas.dataset.logicalH = String(mh);
      }

      setupInteractions(svgRoot);
    }

    const keepSel = state.selected && firesFiltered.includes(state.selected);
    if (!keepSel) {
      state.selected = null;
      renderDetail(null);
    }

    state.firesFiltered = firesFiltered;
    state.firesProjected = projectFires(firesFiltered);
    scheduleRedrawFires();
  }

  function refresh() {
    const filtered = applyFilters(state.raw);
    ensureMapInfrastructure(filtered);

    document.getElementById("date-label").textContent =
      `${fmtShort(state.dates[state.minDateIdx])} → ${fmtShort(state.dates[state.maxDateIdx])}`;
    document.getElementById("conf-label").textContent = `${state.minConf}%`;
    const stats = document.querySelector("#map-stats");
    if (stats) stats.textContent = `${filtered.length} / ${state.raw.length} hotspots shown`;
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
      state.selected = null;
      state.zoomTransform = d3.zoomIdentity;
      state.minDateIdx = 0;
      state.maxDateIdx = state.dates.length - 1;
      document.getElementById("confidence").value = "0";
      document.getElementById("date-min").value = "0";
      document.getElementById("date-max").value = String(state.dates.length - 1);
      document.getElementById("btn-day").classList.add("active");
      document.getElementById("btn-night").classList.add("active");
      renderDetail(null);
      refresh();
    });

    refresh();

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        state.mapSizeKey = "";
        refresh();
      }, 120);
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
