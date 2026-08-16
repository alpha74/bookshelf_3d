// Theme — kept identical to query.js / main.js so the toggle stays consistent
// whichever page you land on.
const themeToggleBtn = document.getElementById('theme-toggle');
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}
applyTheme(localStorage.getItem('theme') || 'dark');
themeToggleBtn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
});

// DOM
const formEl = document.getElementById('generate-form');
const idNumberEl = document.getElementById('field-id-number');
const titleEl = document.getElementById('field-title');
const authorEl = document.getElementById('field-author');
const isbnEl = document.getElementById('field-isbn');
const pagesEl = document.getElementById('field-pages');
const tagsEl = document.getElementById('field-tags');
const dateAddedEl = document.getElementById('field-date-added');
const descriptionEl = document.getElementById('field-description');
const colorEl = document.getElementById('field-color');
const colorTextEl = document.getElementById('field-color-text');
const widthEl = document.getElementById('field-width');
const heightEl = document.getElementById('field-height');
const starButtons = Array.from(document.querySelectorAll('.star-btn'));
const formErrorEl = document.getElementById('form-error');
const outputSectionEl = document.getElementById('generate-output-section');
const outputEl = document.getElementById('generate-output');
const copyBtn = document.getElementById('copy-json-btn');

const ID_PREFIX = 'book';

// Rating is null until the user picks a star (matching books.json entries
// that leave rating unset). Clicking the currently selected star clears it.
let selectedRating = null;

function pad2(n) {
    return String(n).padStart(2, '0');
}

// datetime-local uses "YYYY-MM-DDTHH:MM"; books.json stores "YYYY-MM-DD HH:MM".
function toDatetimeLocalValue(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toBooksJsonDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return toBooksJsonDate(toDatetimeLocalValue());
    return raw.replace('T', ' ');
}

function normalizeHex(value) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
    if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
    return null;
}

function applyRatingUI() {
    starButtons.forEach((btn) => {
        const value = Number(btn.dataset.rating);
        const active = selectedRating != null && value <= selectedRating;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-checked', String(selectedRating === value));
        btn.setAttribute('role', 'radio');
    });
}

starButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        const value = Number(btn.dataset.rating);
        selectedRating = selectedRating === value ? null : value;
        applyRatingUI();
    });
});

// Keep the id count digits-only so the final id is always book + number.
idNumberEl.addEventListener('input', () => {
    idNumberEl.value = idNumberEl.value.replace(/\D/g, '');
});

colorEl.addEventListener('input', () => {
    colorTextEl.value = colorEl.value;
});

colorTextEl.addEventListener('change', () => {
    const hex = normalizeHex(colorTextEl.value);
    if (hex) {
        colorEl.value = hex;
        colorTextEl.value = hex;
    } else {
        colorTextEl.value = colorEl.value;
    }
});

// Title/author/isbn/pages come from the Open Library search result, and
// width/height are intentional shelf defaults — all start locked. The pencil
// on each row unlocks that one field for editing.
document.querySelectorAll('.field-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.unlock);
        if (!input) return;
        input.readOnly = false;
        input.classList.add('is-unlocked');
        btn.classList.add('active');
        btn.title = 'Unlocked for editing';
        btn.setAttribute('aria-label', btn.getAttribute('aria-label').replace(/^Edit /, 'Editing '));
        input.focus();
        if (typeof input.select === 'function') input.select();
    });
});

function showError(message) {
    formErrorEl.textContent = message;
    formErrorEl.classList.remove('hidden');
}

function clearError() {
    formErrorEl.textContent = '';
    formErrorEl.classList.add('hidden');
}

function parseTags(raw) {
    return String(raw || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
}

function buildBookId() {
    const count = idNumberEl.value.trim();
    return count ? `${ID_PREFIX}${count}` : '';
}

function buildBookEntry() {
    const pagesRaw = pagesEl.value.trim();
    const pages = pagesRaw === '' ? null : Number(pagesRaw);
    const width = Number(widthEl.value) || 160;
    const height = Number(heightEl.value) || 250;
    const color = normalizeHex(colorTextEl.value) || colorEl.value || '#7d2e46';

    return {
        id: buildBookId(),
        title: titleEl.value.trim() || 'Untitled',
        author: authorEl.value.trim() || 'Unknown',
        isbn: isbnEl.value.trim(),
        tags: parseTags(tagsEl.value),
        date_added: toBooksJsonDate(dateAddedEl.value),
        pages: Number.isFinite(pages) && pages > 0 ? pages : null,
        rating: selectedRating,
        description: descriptionEl.value.trim() || "Reader's note",
        color,
        dimensions: {
            width,
            height,
        },
    };
}

formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    clearError();

    const count = idNumberEl.value.trim();
    if (!count) {
        showError('Enter a number for the id — e.g. 100 to generate book100.');
        idNumberEl.focus();
        return;
    }
    if (!/^\d+$/.test(count)) {
        showError('ID count must be numbers only.');
        idNumberEl.focus();
        return;
    }

    const entry = buildBookEntry();
    // Trailing comma matches how entries typically sit in the books.json array.
    outputEl.textContent = `${JSON.stringify(entry, null, 2)},`;
    outputSectionEl.classList.remove('hidden');
    outputSectionEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    copyBtn.textContent = 'Copy';
});

copyBtn.addEventListener('click', async () => {
    const text = outputEl.textContent;
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => {
            copyBtn.textContent = 'Copy';
        }, 1500);
    } catch {
        // Fallback for older browsers / denied clipboard permission.
        const range = document.createRange();
        range.selectNodeContents(outputEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copyBtn.textContent = 'Select & copy';
    }
});

// Prefill from /query "Generate JSON" links (?title=&author=&isbn=&pages=).
function prefillFromQuery() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('title')) titleEl.value = params.get('title');
    if (params.has('author')) authorEl.value = params.get('author');
    if (params.has('isbn')) isbnEl.value = params.get('isbn');
    if (params.has('pages')) pagesEl.value = params.get('pages');
    dateAddedEl.value = toDatetimeLocalValue();
    applyRatingUI();
}

prefillFromQuery();
