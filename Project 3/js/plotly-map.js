(function () {
  const fmtShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
  const fmtDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const state = {
    rows: [],
    dates: [],
    minDateIdx: 0,
    maxDateIdx: 0,
    minConf: 0,
    allowDay: true,
    allowNight: true,
  };

  function parseRows(csvText) {
    return Plotly.d3.csvParse(csvText, (d) => ({
      latitude: +d.latitude,
      longitude: +d.longitude,
      brightness: +d.brightness,
      scan: +d.scan,
      track: +d.track,
      acq_date: new Date(`${d.acq_date}T00:00:00`),
      acq_time: d.acq_time,
      satellite: d.satellite,
      confidence: +d.confidence,
      bright_t31: +d.bright_t31,
      frp: +d.frp,
      daynight: d.daynight,
    }));
  }

  async function loadCSVText() {
    if (typeof window.__MODIS_FIRES_CSV === "string" && window.__MODIS_FIRES_CSV.length > 0) {
      return window.__MODIS_FIRES_CSV;
    }
    const res = await fetch("data/modis_fires_us.csv");
    if (!res.ok) throw new Error("Could not load data/modis_fires_us.csv");
    return await res.text();
  }

  function getFilteredRows() {
    const minDate = state.dates[state.minDateIdx];
    const maxDate = state.dates[state.maxDateIdx];
    return state.rows.filter((d) => {
      if (d.acq_date < minDate || d.acq_date > maxDate) return false;
      if (d.confidence < state.minConf) return false;
      if (d.daynight === "D" && !state.allowDay) return false;
      if (d.daynight === "N" && !state.allowNight) return false;
      return true;
    });
  }

  function renderDetail(d) {
    const empty = document.getElementById("detail-empty");
    const list = document.getElementById("detail-list");
    if (!d) {
      empty.hidden = false;
      list.hidden = true;
      list.innerHTML = "";
      return;
    }
    empty.hidden = true;
    list.hidden = false;
    const rows = [
      ["Latitude", d.latitude.toFixed(5)],
      ["Longitude", d.longitude.toFixed(5)],
      ["Brightness (K)", d.brightness.toFixed(2)],
      ["Brightness T31 (K)", d.bright_t31.toFixed(2)],
      ["FRP (MW)", d.frp.toFixed(2)],
      ["Acquisition date", fmtDate.format(d.acq_date)],
      ["Acquisition time (UTC)", d.acq_time],
      ["Satellite", d.satellite],
      ["Confidence (%)", String(d.confidence)],
      ["Day/night", d.daynight === "D" ? "Day" : "Night"],
    ];
    list.innerHTML = rows.map(([k, v]) => `<dt class="muted">${k}</dt><dd>${v}</dd>`).join("");
  }

  function render() {
    const filtered = getFilteredRows();
    const maxFrp = Math.max(...state.rows.map((d) => d.frp), 1);
    const sizes = filtered.map((d) => 3 + 8 * Math.sqrt(d.frp / maxFrp));
    const trace = {
      type: "scattergeo",
      mode: "markers",
      lat: filtered.map((d) => d.latitude),
      lon: filtered.map((d) => d.longitude),
      text: filtered.map(
        (d) =>
          `${fmtDate.format(d.acq_date)} · ${d.daynight === "D" ? "Day" : "Night"}<br>` +
          `Brightness: ${d.brightness.toFixed(2)} K<br>` +
          `FRP: ${d.frp.toFixed(2)} MW<br>` +
          `Confidence: ${d.confidence}%`
      ),
      customdata: filtered,
      hovertemplate: "%{text}<extra></extra>",
      marker: {
        size: sizes,
        color: filtered.map((d) => d.brightness),
        cmin: 300,
        cmax: 350,
        colorscale: [
          [0, "#ffe5a8"],
          [1, "#ffb020"],
        ],
        opacity: 0.92,
        line: { width: 0 },
      },
    };

    const layout = {
      margin: { l: 10, r: 10, t: 10, b: 10 },
      paper_bgcolor: "#0b0f19",
      plot_bgcolor: "#0b0f19",
      geo: {
        scope: "usa",
        projection: { type: "albers usa" },
        bgcolor: "#0b0f19",
        showland: true,
        landcolor: "#15151d",
        showlakes: false,
        showsubunits: true,
        subunitcolor: "#2a3040",
      },
    };

    Plotly.react("plotly-map", [trace], layout, {
      responsive: true,
      displayModeBar: false,
    });

    document.getElementById("date-label").textContent =
      `${fmtShort.format(state.dates[state.minDateIdx])} -> ${fmtShort.format(state.dates[state.maxDateIdx])}`;
    document.getElementById("conf-label").textContent = `${state.minConf}%`;
    renderDetail(null);

    const mapEl = document.getElementById("plotly-map");
    mapEl.on("plotly_click", (event) => {
      const datum = event?.points?.[0]?.customdata;
      if (datum) renderDetail(datum);
    });
  }

  function initControls() {
    const minEl = document.getElementById("date-min");
    const maxEl = document.getElementById("date-max");
    minEl.min = maxEl.min = "0";
    minEl.max = maxEl.max = String(state.dates.length - 1);
    minEl.step = maxEl.step = "1";
    minEl.value = "0";
    maxEl.value = String(state.dates.length - 1);

    minEl.addEventListener("input", () => {
      state.minDateIdx = Math.min(+minEl.value, +maxEl.value);
      minEl.value = String(state.minDateIdx);
      render();
    });
    maxEl.addEventListener("input", () => {
      state.maxDateIdx = Math.max(+minEl.value, +maxEl.value);
      maxEl.value = String(state.maxDateIdx);
      render();
    });

    document.getElementById("confidence").addEventListener("input", (e) => {
      state.minConf = +e.target.value;
      render();
    });

    document.getElementById("allow-day").addEventListener("change", (e) => {
      state.allowDay = e.target.checked;
      render();
    });
    document.getElementById("allow-night").addEventListener("change", (e) => {
      state.allowNight = e.target.checked;
      render();
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      state.minDateIdx = 0;
      state.maxDateIdx = state.dates.length - 1;
      state.minConf = 0;
      state.allowDay = true;
      state.allowNight = true;
      minEl.value = "0";
      maxEl.value = String(state.dates.length - 1);
      document.getElementById("confidence").value = "0";
      document.getElementById("allow-day").checked = true;
      document.getElementById("allow-night").checked = true;
      render();
    });
  }

  async function init() {
    const csvText = await loadCSVText();
    state.rows = parseRows(csvText);
    state.dates = [...new Set(state.rows.map((d) => d.acq_date.getTime()))]
      .sort((a, b) => a - b)
      .map((t) => new Date(t));
    state.minDateIdx = 0;
    state.maxDateIdx = state.dates.length - 1;
    initControls();
    render();
  }

  init().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<p style="padding:1rem;color:#ff9b9b">Failed to load Plotly map: ${err.message}</p>`
    );
  });
})();
