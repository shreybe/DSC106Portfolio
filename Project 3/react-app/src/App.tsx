import { useEffect, useRef } from "react";
import { runWildfireViz } from "./initWildfire";
import "./App.css";

export default function App() {
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    runWildfireViz();
  }, []);

  return (
    <div className="app-viewport">
      <section className="fullscreen-map" aria-label="Wildfire map explorer">
        <div className="map-hero">
          <div className="map-hero-inner">
            <div id="map-wrap">
              <div className="map-stage">
                <svg
                  id="map-svg"
                  viewBox="0 0 2800 1520"
                  preserveAspectRatio="xMidYMid meet"
                  aria-label="United States basemap for wildfire hotspots"
                />
                <canvas id="map-canvas" aria-hidden="true" />
              </div>
            </div>
            <div id="timeline-host" className="timeline-floating">
              <p className="timeline-caption">
                Daily rhythm (confidence &amp; pass filters) · click bar = that day · double-click chart = full
                range
              </p>
              <svg
                id="timeline-svg"
                role="img"
                aria-label="Daily detection counts across the dataset timeline"
              />
            </div>
          </div>
        </div>

        <div className="deck">
          <div className="deck-header">
            <div className="chrome-title">
              <span className="tag">DSC 106 · NASA FIRMS · MODIS_NRT</span>
              <h1 className="map-title">Where do U.S. thermal hotspots cluster in space and time?</h1>
              <p className="map-sub">
                Full-width map above. Color = brightness (K), size = FRP (MW). D3-only visualization; React
                handles layout for a smoother shell.
              </p>
            </div>
            <div className="chrome-actions">
              <span className="chrome-hint">
                Wheel / pinch zoom · drag pan · tap hotspot · double-click timeline to reset dates · full write-up
                in repo <code>index.html</code>
              </span>
            </div>
          </div>

          <div className="map-legend" aria-label="Map legend">
            <span className="legend-title">Hotspot color → brightness (K)</span>
            <span className="legend-scale" aria-hidden="true" />
            <span className="legend-low">cooler</span>
            <span className="legend-high">hotter</span>
          </div>

          <div className="rail-row">
            <div className="rail-left">
              <div id="map-stats" className="map-rail-stats" role="status" />
              <div id="insights-card" className="insights-card" aria-live="polite">
                <h4 className="insights-title">Live insights</h4>
                <ul id="insights-list" className="insights-list" />
              </div>
            </div>
            <aside className="detail-panel" id="detail-panel">
              <div className="panel-head">
                <h3 className="panel-title">Hotspot inspector</h3>
                <p className="panel-sub">Select any point on the map</p>
              </div>
              <p className="detail-empty" id="detail-empty">
                Click a hotspot on the map to load acquisition and intensity fields.
              </p>
              <dl id="detail-dl" hidden />
            </aside>
          </div>

          <div className="controls">
            <div className="control">
              <strong>Acquisition date range</strong>
              <span id="date-label" />
              <input type="range" id="date-min" />
              <input type="range" id="date-max" />
            </div>
            <div className="control">
              <strong>Minimum confidence (%)</strong>
              <span id="conf-label" />
              <input type="range" id="confidence" min={0} max={100} step={5} defaultValue={0} />
            </div>
            <div className="control">
              <strong>Pass</strong>
              <div className="toggle-row">
                <button type="button" id="btn-day" className="active">
                  Day
                </button>
                <button type="button" id="btn-night" className="active">
                  Night
                </button>
              </div>
            </div>
            <div className="control">
              <strong>Reset</strong>
              <button type="button" id="btn-reset">
                Reset all filters
              </button>
            </div>
            <div className="control control-spotlight">
              <strong>Spotlight</strong>
              <label className="checkbox-label">
                <input type="checkbox" id="chk-peak-frp" />
                Crosshair on strongest FRP in the filtered map
              </label>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
