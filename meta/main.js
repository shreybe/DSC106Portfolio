import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

const REPO_PATH = 'shreybe/DSC106Portfolio';

async function loadData() {
  const data = await d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    datetime: new Date(row.datetime),
  }));
  return data;
}

function processCommits(data) {
  return d3
    .groups(data, (d) => d.commit)
    .map(([commit, lines]) => {
      const first = lines[0];
      const { author, date, time, timezone, datetime } = first;
      const ret = {
        id: commit,
        url: `https://github.com/${REPO_PATH}/commit/${commit}`,
        author,
        date,
        time,
        timezone,
        datetime,
        hourFrac: datetime.getHours() + datetime.getMinutes() / 60,
        totalLines: lines.length,
      };
      Object.defineProperty(ret, 'lines', {
        value: lines,
        enumerable: false,
        configurable: true,
        writable: false,
      });
      return ret;
    });
}

function renderCommitInfo(data, commits) {
  const dl = d3.select('#stats').append('dl').attr('class', 'stats');

  dl.append('dt').html('Total <abbr title="Lines of code">LOC</abbr>');
  dl.append('dd').text(data.length);

  dl.append('dt').text('Total commits');
  dl.append('dd').text(commits.length);

  const numFiles = d3.group(data, (d) => d.file).size;
  dl.append('dt').text('Distinct files');
  dl.append('dd').text(numFiles);

  const numAuthors = d3.group(data, (d) => d.author).size;
  dl.append('dt').text('Distinct authors');
  dl.append('dd').text(numAuthors);

  const maxDepth = d3.max(data, (d) => d.depth);
  dl.append('dt').text('Maximum indentation depth');
  dl.append('dd').text(maxDepth ?? '—');

  const avgLineLen = d3.mean(data, (d) => d.length);
  dl.append('dt').text('Average line length (chars)');
  dl.append('dd').text(avgLineLen != null ? avgLineLen.toFixed(1) : '—');

  const fileLengths = d3.rollups(
    data,
    (v) => d3.max(v, (r) => r.line),
    (d) => d.file,
  );
  const avgFileLen = d3.mean(fileLengths, (d) => d[1]);
  dl.append('dt').text('Average file length (lines)');
  dl.append('dd').text(avgFileLen != null ? avgFileLen.toFixed(1) : '—');

  const longestFile = d3.greatest(fileLengths, (d) => d[1]);
  if (longestFile) {
    dl.append('dt').text('Longest file (lines)');
    dl.append('dd').text(`${longestFile[0]} (${longestFile[1]} lines)`);
  }

  const workByPeriod = d3.rollups(
    data,
    (v) => v.length,
    (d) =>
      new Date(d.datetime).toLocaleString('en', {
        dayPeriod: 'short',
      }),
  );
  const maxPeriod = d3.greatest(workByPeriod, (d) => d[1])?.[0];
  dl.append('dt').text('Most edits by time of day');
  dl.append('dd').text(maxPeriod ?? '—');
}

function renderTooltipContent(commit) {
  if (!commit?.id) return;

  const link = document.getElementById('commit-link');
  const dateEl = document.getElementById('commit-date');
  const timeEl = document.getElementById('commit-time');
  const authorEl = document.getElementById('commit-author');
  const linesEl = document.getElementById('commit-lines');

  link.href = commit.url;
  link.textContent = commit.id.slice(0, 7);
  dateEl.textContent =
    commit.datetime?.toLocaleString('en', { dateStyle: 'full' }) ?? '';
  timeEl.textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' }) ?? '';
  authorEl.textContent = commit.author ?? '';
  linesEl.textContent = String(commit.totalLines ?? '');
}

function updateTooltipVisibility(isVisible) {
  const tooltip = document.getElementById('commit-tooltip');
  if (tooltip) tooltip.hidden = !isVisible;
}

function updateTooltipPosition(event) {
  const tooltip = document.getElementById('commit-tooltip');
  if (!tooltip) return;
  const pad = 12;
  tooltip.style.left = `${event.clientX + pad}px`;
  tooltip.style.top = `${event.clientY + pad}px`;
}

function renderSelectionCount(selection, commits, isCommitSelected) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];

  const countElement = document.querySelector('#selection-count');
  if (countElement) {
    countElement.textContent = `${selectedCommits.length || 'No'} commits selected`;
  }
  return selectedCommits;
}

function renderLanguageBreakdown(selection, commits, isCommitSelected) {
  const selectedCommits = selection
    ? commits.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');
  if (!container) return;

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    return;
  }

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(
    lines,
    (v) => v.length,
    (d) => d.type,
  );

  container.innerHTML = '';

  for (const [language, count] of breakdown) {
    const proportion = count / lines.length;
    const formatted = d3.format('.1~%')(proportion);
    container.innerHTML += `<dt>${language}</dt><dd>${count} lines (${formatted})</dd>`;
  }
}

function renderScatterPlot(data, commits) {
  const chart = d3.select('#chart');
  chart.selectAll('*').remove();

  if (!commits.length) {
    chart.append('p').text('No commit data to visualize.');
    return;
  }

  const sortedCommits = d3.sort(commits, (d) => -d.totalLines);

  const width = 1000;
  const height = 600;
  const margin = { top: 10, right: 10, bottom: 30, left: 46 };

  const usableArea = {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };

  const xScale = d3
    .scaleTime()
    .domain(d3.extent(sortedCommits, (d) => d.datetime))
    .range([usableArea.left, usableArea.right])
    .nice();

  const yScale = d3.scaleLinear().domain([0, 24]).range([usableArea.bottom, usableArea.top]);

  xScale.range([usableArea.left, usableArea.right]);
  yScale.range([usableArea.bottom, usableArea.top]);

  const [minLines, maxLines] = d3.extent(sortedCommits, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([Math.max(1, minLines ?? 1), Math.max(maxLines ?? 1, minLines ?? 1)])
    .range([2, 30]);

  const svg = chart
    .append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'meta-scatter-svg')
    .style('overflow', 'visible');

  const gridlines = svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${usableArea.left}, 0)`);

  gridlines.call(
    d3.axisLeft(yScale).tickFormat('').tickSize(-usableArea.width),
  );

  const xAxis = d3.axisBottom(xScale);
  const yAxis = d3
    .axisLeft(yScale)
    .tickFormat((d) => `${String(d % 24).padStart(2, '0')}:00`);

  svg
    .append('g')
    .attr('transform', `translate(0, ${usableArea.bottom})`)
    .call(xAxis);

  svg.append('g').attr('transform', `translate(${usableArea.left}, 0)`).call(yAxis);

  const dots = svg.append('g').attr('class', 'dots');

  function isCommitSelected(selection, commit) {
    if (!selection) return false;
    const [[x0, y0], [x1, y1]] = selection;
    const cx = xScale(commit.datetime);
    const cy = yScale(commit.hourFrac);
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  }

  function brushed(event) {
    const selection = event.selection;
    svg.selectAll('.dots circle').classed('selected', (d) =>
      isCommitSelected(selection, d),
    );
    renderSelectionCount(selection, commits, isCommitSelected);
    renderLanguageBreakdown(selection, commits, isCommitSelected);
  }

  dots
    .selectAll('circle')
    .data(sortedCommits)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .on('mouseenter', (event, commit) => {
      d3.select(event.currentTarget).style('fill-opacity', 1);
      renderTooltipContent(commit);
      updateTooltipVisibility(true);
      updateTooltipPosition(event);
    })
    .on('mousemove', (event) => {
      updateTooltipPosition(event);
    })
    .on('mouseleave', (event) => {
      d3.select(event.currentTarget).style('fill-opacity', 0.7);
      updateTooltipVisibility(false);
    });

  svg.call(d3.brush().on('start brush end', brushed));
  svg.select('.dots').raise();

  brushed({ selection: null });
}

const data = await loadData();
const commits = processCommits(data);

renderCommitInfo(data, commits);
renderScatterPlot(data, commits);
