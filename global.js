console.log("IT'S ALIVE!");

function $$(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

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
  const norm = (p) =>
    p.replace(/\/index\.html$/i, '/').replace(/\/+$/, '') || '/';
  return norm(a.pathname) === norm(location.pathname);
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

for (const p of pages) {
  let url = p.url;
  url = !url.startsWith('http') ? BASE_PATH + url : url;
  const a = document.createElement('a');
  a.href = url;
  a.textContent = p.title;
  a.classList.toggle('current', pathnameMatches(a));
  if (a.host !== location.host) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  nav.append(a);
}

function setColorScheme(value) {
  document.documentElement.style.setProperty('color-scheme', value);
  const sel = document.querySelector('.color-scheme select');
  if (sel) sel.value = value;
}

const select = document.querySelector('.color-scheme select');
if ('colorScheme' in localStorage) {
  setColorScheme(localStorage.colorScheme);
} else {
  setColorScheme('light dark');
}

select?.addEventListener('input', (event) => {
  const value = event.target.value;
  setColorScheme(value);
  localStorage.colorScheme = value;
});

/** Step 5 (optional): mailto with encodeURIComponent so spaces are %20, not + */
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
  const to = 'sbharathwajan@ucsd.edu';
  const email = data.get('email');
  const subject = data.get('subject');
  const body = data.get('body');
  const mailBody = `${email}\n\n${body}`;
  location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;
});
