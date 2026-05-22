import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import scrollama from 'https://cdn.jsdelivr.net/npm/scrollama@3.2.0/+esm';

const REPO_PATH = 'shreybe/DSC106Portfolio';

const SCATTER = {
  width: 1000,
  height: 600,
  margin: { top: 14, right: 14, bottom: 40, left: 52 },
};

let data;
let commits;
let filteredCommits;
let commitProgress = 100;
let timeScale;
let commitMaxTime;
let xScale;
let yScale;
let fileColors;

async function loadData() {
  return d3.csv('loc.csv', (row) => ({
    ...row,
    line: Number(row.line),
    depth: Number(row.depth),
    length: Number(row.length),
    datetime: new Date(row.datetime),
  }));
}

function processCommits(raw) {
  return d3
    .groups(raw, (d) => d.commit)
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
    })
    .sort((a, b) => d3.ascending(a.datetime, b.datetime));
}

function usableArea() {
  const { margin, width, height } = SCATTER;
  return {
    top: margin.top,
    right: width - margin.right,
    bottom: height - margin.bottom,
    left: margin.left,
    width: width - margin.left - margin.right,
    height: height - margin.top - margin.bottom,
  };
}

function renderCommitInfo(_locData, commitList) {
  const linesInView = commitList.flatMap((d) => d.lines);
  const numFiles = d3.group(linesInView, (d) => d.file).size;
  const maxDepth = d3.max(linesInView, (d) => d.depth) ?? 0;
  const longestLine = d3.max(linesInView, (d) => d.length) ?? 0;
  const fileLengths = d3.rollups(
    linesInView,
    (v) => d3.max(v, (r) => r.line),
    (d) => d.file,
  );
  const maxLines = d3.max(fileLengths, (d) => d[1]) ?? 0;

  const metrics = [
    { label: 'Commits', value: commitList.length },
    { label: 'Files', value: numFiles },
    { label: 'Total LOC', value: linesInView.length },
    { label: 'Max depth', value: maxDepth },
    { label: 'Longest line', value: longestLine },
    { label: 'Max lines', value: maxLines },
  ];

  const container = d3.select('#stats');
  container.selectAll('*').remove();
  const row = container
    .append('div')
    .attr('class', 'stats-row')
    .selectAll('div')
    .data(metrics)
    .join('div')
    .attr('class', 'stat');

  row.append('span').attr('class', 'stat-label').text((d) => d.label);
  row.append('span').attr('class', 'stat-value').text((d) => d.value);
}

function renderTooltipContent(commit) {
  if (!commit?.id) return;

  document.getElementById('commit-link').href = commit.url;
  document.getElementById('commit-link').textContent = commit.id.slice(0, 7);
  document.getElementById('commit-date').textContent =
    commit.datetime?.toLocaleString('en', { dateStyle: 'full' }) ?? '';
  document.getElementById('commit-time-tooltip').textContent =
    commit.datetime?.toLocaleString('en', { timeStyle: 'short' }) ?? '';
  document.getElementById('commit-author').textContent = commit.author ?? '';
  document.getElementById('commit-lines').textContent = String(commit.totalLines ?? '');
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

const LANGUAGE_DISPLAY_ORDER = ['css', 'js', 'html', 'javascript', 'ts', 'tsx', 'json', 'md'];

function languageSortPriority(type) {
  const key = String(type).toLowerCase();
  const i = LANGUAGE_DISPLAY_ORDER.indexOf(key);
  return i === -1 ? LANGUAGE_DISPLAY_ORDER.length : i;
}

function formatLanguageLabel(lang) {
  const k = String(lang).toLowerCase();
  if (k === 'javascript') return 'JS';
  if (k === 'typescript') return 'TS';
  return String(lang).toUpperCase();
}

function renderLanguageBreakdown(selection, commitList, isCommitSelected) {
  const selectedCommits = selection
    ? commitList.filter((d) => isCommitSelected(selection, d))
    : [];
  const container = document.getElementById('language-breakdown');
  if (!container) return;

  if (selectedCommits.length === 0) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;

  const lines = selectedCommits.flatMap((d) => d.lines);
  const breakdown = d3.rollup(lines, (v) => v.length, (d) => d.type);

  const entries = Array.from(breakdown, ([language, count]) => ({
    language,
    count,
  })).sort((a, b) => {
    const pa = languageSortPriority(a.language);
    const pb = languageSortPriority(b.language);
    if (pa !== pb) return pa - pb;
    return String(a.language).localeCompare(String(b.language));
  });

  container.innerHTML = entries
    .map(({ language, count }) => {
      const proportion = count / lines.length;
      const formatted = d3.format('.1~%')(proportion);
      const label = formatLanguageLabel(language);
      return `<div class="language-col"><span class="language-name">${label}</span><span class="language-detail">${count} lines (${formatted})</span></div>`;
    })
    .join('');
}

function updateFileDisplay(commitList) {
  const lines = commitList.flatMap((d) => d.lines);
  const files = d3
    .groups(lines, (d) => d.file)
    .map(([name, fileLines]) => ({ name, lines: fileLines }))
    .sort((a, b) => b.lines.length - a.lines.length);

  const filesContainer = d3
    .select('#files')
    .selectAll('div')
    .data(files, (d) => d.name)
    .join((enter) =>
      enter.append('div').call((div) => {
        div.append('dt').call((dt) => {
          dt.append('code');
          dt.append('small');
        });
        div.append('dd');
      }),
    );

  filesContainer.select('dt > code').text((d) => d.name);
  filesContainer
    .select('dt > small')
    .html((d) => `${d.lines.length} lines`);

  filesContainer
    .select('dd')
    .selectAll('div.loc')
    .data((d) => d.lines, (d) => `${d.file}-${d.line}`)
    .join('div')
    .attr('class', 'loc')
    .attr('style', (d) => `--color: ${fileColors(d.type)}`);
}

function renderScatterPlot(locData, commitList) {
  const chart = d3.select('#chart');
  chart.selectAll('*').remove();

  if (!commitList.length) {
    chart.append('p').text('No commit data to visualize.');
    return;
  }

  const area = usableArea();
  const sortedCommits = d3.sort(commitList, (d) => -d.totalLines);

  xScale = d3
    .scaleTime()
    .domain(d3.extent(commitList, (d) => d.datetime))
    .range([area.left, area.right])
    .nice();

  yScale = d3.scaleLinear().domain([0, 24]).range([area.bottom, area.top]);

  const [minLines, maxLines] = d3.extent(commitList, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([Math.max(1, minLines ?? 1), Math.max(maxLines ?? 1, minLines ?? 1)])
    .range([2, 30]);

  const svg = chart
    .append('svg')
    .attr('viewBox', `0 0 ${SCATTER.width} ${SCATTER.height}`)
    .attr('class', 'meta-scatter-svg')
    .style('overflow', 'visible');

  const yTickHours = d3.range(0, 25, 2);

  svg
    .append('g')
    .attr('class', 'gridlines')
    .attr('transform', `translate(${area.left}, 0)`)
    .call(
      d3
        .axisLeft(yScale)
        .tickValues(yTickHours)
        .tickFormat('')
        .tickSize(-area.width),
    );

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeDay.every(2))
    .tickFormat(d3.timeFormat('%a %d'));
  const yAxis = d3
    .axisLeft(yScale)
    .tickValues(yTickHours)
    .tickFormat((d) => `${String(d % 24).padStart(2, '0')}:00`);

  svg
    .append('g')
    .attr('class', 'x-axis')
    .attr('transform', `translate(0, ${area.bottom})`)
    .call(xAxis);

  svg
    .append('g')
    .attr('class', 'y-axis')
    .attr('transform', `translate(${area.left}, 0)`)
    .call(yAxis);

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
    renderSelectionCount(selection, commitList, isCommitSelected);
    renderLanguageBreakdown(selection, commitList, isCommitSelected);
  }

  function renderSelectionCount(selection, list, fn) {
    const selectedCommits = selection ? list.filter((d) => fn(selection, d)) : [];
    const countElement = document.querySelector('#selection-count');
    if (!countElement) return;
    if (!selection) {
      countElement.hidden = true;
      return;
    }
    countElement.hidden = false;
    countElement.textContent = `${selectedCommits.length} commits selected`;
  }

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .style('--r', (d) => rScale(d.totalLines))
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

  svg
    .call(
      d3
        .brush()
        .extent([
          [area.left, area.top],
          [area.right, area.bottom],
        ])
        .on('start brush end', brushed),
    );

  svg.select('.dots').raise();
  brushed({ selection: null });
}

function updateScatterPlot(locData, commitList) {
  const svg = d3.select('#chart').select('svg');
  if (svg.empty() || !commitList.length) return;

  const area = usableArea();
  const sortedCommits = d3.sort(commitList, (d) => -d.totalLines);

  xScale.domain(d3.extent(commitList, (d) => d.datetime)).nice();

  const [minLines, maxLines] = d3.extent(commitList, (d) => d.totalLines);
  const rScale = d3
    .scaleSqrt()
    .domain([Math.max(1, minLines ?? 1), Math.max(maxLines ?? 1, minLines ?? 1)])
    .range([2, 30]);

  const xAxis = d3
    .axisBottom(xScale)
    .ticks(d3.timeDay.every(2))
    .tickFormat(d3.timeFormat('%a %d'));

  const xAxisGroup = svg.select('g.x-axis');
  xAxisGroup.selectAll('*').remove();
  xAxisGroup.call(xAxis);

  const dots = svg.select('g.dots');

  dots
    .selectAll('circle')
    .data(sortedCommits, (d) => d.id)
    .join('circle')
    .attr('cx', (d) => xScale(d.datetime))
    .attr('cy', (d) => yScale(d.hourFrac))
    .attr('r', (d) => rScale(d.totalLines))
    .attr('fill', 'steelblue')
    .style('fill-opacity', 0.7)
    .style('--r', (d) => rScale(d.totalLines))
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
}

function applyCommitFilter() {
  filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);
  renderCommitInfo(data, filteredCommits);
  updateScatterPlot(data, filteredCommits);
  updateFileDisplay(filteredCommits);
}

function onTimeSliderChange() {
  const slider = document.getElementById('commit-progress');
  commitProgress = Number(slider.value);
  commitMaxTime = timeScale.invert(commitProgress);
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  applyCommitFilter();
}

function onStepEnter(response) {
  const stepCommit = response.element.__data__;
  if (!stepCommit?.datetime) return;

  commitMaxTime = stepCommit.datetime;
  commitProgress = timeScale(commitMaxTime);
  const slider = document.getElementById('commit-progress');
  if (slider) slider.value = commitProgress;
  document.getElementById('commit-time').textContent = commitMaxTime.toLocaleString('en', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  applyCommitFilter();
}

function renderScatterStory() {
  d3.select('#scatter-story')
    .selectAll('.step')
    .data(commits)
    .join('div')
    .attr('class', 'step')
    .html(
      (d, i) => `
		On ${d.datetime.toLocaleString('en', {
      dateStyle: 'full',
      timeStyle: 'short',
    })},
		I made <a href="${d.url}" target="_blank" rel="noopener noreferrer">${
      i > 0 ? 'another glorious commit' : 'my first commit, and it was glorious'
    }</a>.
		I edited ${d.totalLines} lines across ${
      d3.rollups(
        d.lines,
        (v) => v.length,
        (line) => line.file,
      ).length
    } files.
		Then I looked over all I had made, and I saw that it was very good.
	`,
    );
}

function initScrollama() {
  const scroller = scrollama();
  scroller
    .setup({
      step: '#scrolly-1 .step',
      offset: 0.55,
    })
    .onStepEnter(onStepEnter);
}

data = await loadData();
commits = processCommits(data);
fileColors = d3.scaleOrdinal(d3.schemeTableau10);

timeScale = d3
  .scaleTime()
  .domain([d3.min(commits, (d) => d.datetime), d3.max(commits, (d) => d.datetime)])
  .range([0, 100]);

commitMaxTime = timeScale.invert(commitProgress);
filteredCommits = commits.filter((d) => d.datetime <= commitMaxTime);

renderCommitInfo(data, filteredCommits);
renderScatterPlot(data, filteredCommits);
updateFileDisplay(filteredCommits);
renderScatterStory();

document.getElementById('commit-progress')?.addEventListener('input', onTimeSliderChange);
onTimeSliderChange();

initScrollama();
