import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import { fetchJSON, renderProjects } from '../global.js';

const projects = await fetchJSON('../lib/projects.json');
const projectsContainer = document.querySelector('.projects');
const projectsTitle = document.querySelector('.projects-title');
const searchInput = document.querySelector('.searchBar');

let query = '';
let selectedYear = null;
let selectedIndex = -1;

function updateProjectsTitle(count) {
  if (projectsTitle) {
    projectsTitle.textContent = `My Projects (${count})`;
  }
}

function filterByQuery(projectsGiven) {
  return projectsGiven.filter((project) => {
    const values = Object.values(project).join('\n').toLowerCase();
    return values.includes(query.toLowerCase());
  });
}

function renderPieChart(projectsGiven) {
  const svg = d3.select('#projects-pie-plot');
  const legend = d3.select('.legend');

  svg.selectAll('path').remove();
  legend.selectAll('li').remove();

  const rolledData = d3.rollups(
    projectsGiven,
    (v) => v.length,
    (d) => String(d.year),
  ).sort((a, b) => d3.ascending(a[0], b[0]));

  const data = rolledData.map(([year, count]) => ({
    label: year,
    value: count,
  }));

  if (data.length === 0) {
    selectedYear = null;
    selectedIndex = -1;
    return;
  }

  selectedIndex = selectedYear === null ? -1 : data.findIndex((d) => d.label === selectedYear);
  if (selectedIndex === -1) selectedYear = null;

  const colors = d3.scaleOrdinal(d3.schemeTableau10);
  const arcGenerator = d3.arc().innerRadius(0).outerRadius(50);
  const sliceGenerator = d3.pie().value((d) => d.value);
  const arcData = sliceGenerator(data);

  arcData.forEach((arc, i) => {
    const isSelected = selectedYear !== null && data[i].label === selectedYear;
    svg
      .append('path')
      .attr('d', arcGenerator(arc))
      .attr('fill', colors(i))
      .attr('class', isSelected ? 'selected' : null)
      .on('click', () => {
        selectedYear = selectedYear === data[i].label ? null : data[i].label;
        renderAll();
      });
  });

  data.forEach((d, i) => {
    const isSelected = selectedYear !== null && d.label === selectedYear;
    legend
      .append('li')
      .attr('style', `--color:${colors(i)}`)
      .attr('class', `legend-item${isSelected ? ' selected' : ''}`)
      .html(`<span class="swatch"></span> ${d.label} <em>(${d.value})</em>`)
      .on('click', () => {
        selectedYear = selectedYear === d.label ? null : d.label;
        renderAll();
      });
  });
}

function renderAll() {
  const queryFiltered = filterByQuery(projects);
  renderPieChart(queryFiltered);

  const visibleProjects =
    selectedYear === null
      ? queryFiltered
      : queryFiltered.filter((project) => String(project.year) === String(selectedYear));

  renderProjects(visibleProjects, projectsContainer, 'h2');
  updateProjectsTitle(visibleProjects.length);
}

searchInput?.addEventListener('input', (event) => {
  query = event.target.value.trim();
  renderAll();
});

renderAll();
