console.log("IT'S ALIVE!");

/** Same repo path on GitHub Pages (must match your repository name). */
const BASE_PATH =
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/'
    : '/DSC106Portfolio/';

const pages = [
  { url: '', title: 'Home' },
  { url: 'projects/', title: 'Projects' },
  { url: 'cv/', title: 'CV' },
  { url: 'contact/', title: 'Contact' },
  { url: 'https://github.com/shreybe', title: 'GitHub' },
];

function pathnameMatches(a) {
  if (a.host !== location.host) return false;
  const normalizePath = (path) =>
    path.replace(/\/index\.html$/i, '/').replace(/\/+$/, '') || '/';
  return normalizePath(a.pathname) === normalizePath(location.pathname);
}

document.body.insertAdjacentHTML(
  'afterbegin',
  `<label class="color-scheme">
    Theme:
    <select>
      <option value="light dark">Automatic</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>`,
);

const nav = document.createElement('nav');
document.body.prepend(nav);

for (const page of pages) {
  const url = page.url.startsWith('http') ? page.url : BASE_PATH + page.url;
  const a = document.createElement('a');
  a.href = url;
  a.textContent = page.title;
  a.classList.toggle('current', pathnameMatches(a));
  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  nav.append(a);
}

function setColorScheme(value) {
  document.documentElement.style.setProperty('color-scheme', value);
  const themeSelect = document.querySelector('.color-scheme select');
  if (themeSelect) themeSelect.value = value;
}

const themeSelect = document.querySelector('.color-scheme select');
if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
} else {
  setColorScheme('light dark');
}

themeSelect?.addEventListener('input', (event) => {
  const value = event.target.value;
  setColorScheme(value);
  localStorage.colorScheme = value;
});

const contactForm = document.querySelector('#contact-form');
contactForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  form.email.value = form.email.value.trim();
  form.subject.value = form.subject.value.trim();
  form.body.value = form.body.value.trim();
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const data = new FormData(form);
  const email = data.get('email');
  const to = email;
  const subject = data.get('subject');
  const body = data.get('body');
  const mailBody = `${body}`;

  const link = document.createElement('a');
  link.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
});

export async function fetchJSON(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching or parsing JSON data:', error);
    return [];
  }
}

function getValidHeadingTag(headingLevel) {
  return /^h[1-6]$/i.test(headingLevel) ? headingLevel.toLowerCase() : 'h2';
}

export function renderProjects(projects, containerElement, headingLevel = 'h2') {
  if (!containerElement) return;

  const headingTag = getValidHeadingTag(headingLevel);
  containerElement.innerHTML = '';

  if (!Array.isArray(projects) || projects.length === 0) {
    containerElement.innerHTML = '<p>No projects available yet.</p>';
    return;
  }

  for (const project of projects) {
    const article = document.createElement('article');
    const title = project.title ?? 'Untitled project';
    const image = project.image ?? 'https://vis-society.github.io/labs/2/images/empty.svg';
    const description = project.description ?? 'No description provided yet.';
    const year = project.year ? `<p class="project-year">${project.year}</p>` : '';

    article.innerHTML = `
      <${headingTag}>${title}</${headingTag}>
      <img src="${image}" alt="${title}">
      <div class="project-content">
        <p>${description}</p>
        ${year}
      </div>
    `;
    containerElement.append(article);
  }
}

export async function fetchGitHubData(username) {
  return fetchJSON(`https://api.github.com/users/${username}`);
}
