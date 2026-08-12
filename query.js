// Theme — kept identical to main.js's theme handling (same localStorage key)
// so the toggle stays consistent whichever page you land on. Small enough to
// duplicate here rather than pull in a shared module for one page.
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
const formEl = document.getElementById('query-form');
const inputEl = document.getElementById('query-input');
const submitBtn = document.getElementById('query-submit');
const errorEl = document.getElementById('query-error');
const statusEl = document.getElementById('query-status');
const resultsEl = document.getElementById('query-results');
const modeButtons = Array.from(document.querySelectorAll('.query-mode'));

const MODE_PLACEHOLDERS = {
    isbn: 'Enter ISBN (e.g. 9780141439518)',
    title: 'Enter a book name',
    author: 'Enter an author name',
};

// ISBN is the default search mode (see task requirement) — every other piece
// of state (placeholder text, which API path a submit takes) is derived from
// this rather than re-read from the DOM each time.
let activeMode = 'isbn';

modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
        activeMode = btn.dataset.mode;
        modeButtons.forEach((b) => {
            const active = b === btn;
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
        });
        inputEl.placeholder = MODE_PLACEHOLDERS[activeMode];
        inputEl.focus();
    });
});

// ---------------------------------------------------------------------------
// Open Library API
// ---------------------------------------------------------------------------
// Cover images are always fetched from covers.openlibrary.org/b/... — the
// same host+path pattern main.js already uses for shelf book covers
// (see coverUrl in createInspectScene) — so a result card and a shelf spine
// resolve a cover the same way.
function coverUrlFromIsbn(isbn, size) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-${size}.jpg`;
}

function coverUrlFromId(coverId, size) {
    return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}

// ISBN search hits Open Library's Books API directly by bibkey — it's a
// lookup by a known identifier rather than a text search, so it can only
// ever resolve to zero or one edition (returned as a one-item list so the
// rendering path stays identical to the multi-result search modes).
async function searchByIsbn(rawIsbn) {
    const isbn = rawIsbn.replace(/[^0-9Xx]/g, '');
    if (!isbn) return [];

    const url = `https://openlibrary.org/api/books?bibkeys=${encodeURIComponent(`ISBN:${isbn}`)}&format=json&jscmd=data`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Library responded with ${res.status}`);
    const data = await res.json();
    const entry = data[`ISBN:${isbn}`];
    if (!entry) return [];

    return [{
        title: entry.title || 'Untitled',
        author: (entry.authors || []).map((a) => a.name).join(', ') || 'Unknown author',
        isbn,
        year: entry.publish_date || '',
        pages: entry.number_of_pages || null,
        coverUrl: (entry.cover && (entry.cover.large || entry.cover.medium)) || coverUrlFromIsbn(isbn, 'L'),
        infoUrl: entry.url || null,
    }];
}

// Name/author search hits Open Library's full-text search index, which can
// return many editions of the same work — capped at 24 so a broad query
// (e.g. author "King") doesn't return an unbounded list to lazy-load.
async function searchByField(field, query) {
    const params = new URLSearchParams({
        [field]: query,
        fields: 'title,author_name,isbn,cover_i,first_publish_year,number_of_pages_median',
        limit: '24',
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open Library responded with ${res.status}`);
    const data = await res.json();
    const docs = Array.isArray(data.docs) ? data.docs : [];

    return docs.map((doc) => {
        const isbn = Array.isArray(doc.isbn) ? doc.isbn[0] : null;
        let coverUrl = null;
        if (doc.cover_i) coverUrl = coverUrlFromId(doc.cover_i, 'L');
        else if (isbn) coverUrl = coverUrlFromIsbn(isbn, 'L');

        return {
            title: doc.title || 'Untitled',
            author: (doc.author_name || []).join(', ') || 'Unknown author',
            isbn: isbn || '',
            year: doc.first_publish_year || '',
            pages: doc.number_of_pages_median || null,
            coverUrl,
            infoUrl: null,
        };
    });
}

async function runSearch(mode, query) {
    if (mode === 'isbn') return searchByIsbn(query);
    if (mode === 'title') return searchByField('title', query);
    return searchByField('author', query);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// Deterministic pastel-ish color per title, so cover-less results still read
// as distinct cards rather than a wall of identical grey boxes — mirrors the
// per-book `color` field the shelf uses, which search results don't have.
const FALLBACK_PALETTE = ['#7d2e46', '#3c6e71', '#5b5b8a', '#8a5a3c', '#2f5d4e', '#6b4c8a', '#4a6d8c', '#8a4a4a'];
function fallbackColorFor(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return FALLBACK_PALETTE[Math.abs(hash) % FALLBACK_PALETTE.length];
}

function initials(title) {
    const words = title.trim().split(/\s+/).slice(0, 2);
    return words.map((w) => w[0]).join('').toUpperCase();
}

// Swaps a broken/missing cover for a colored initials block, in place of the
// browser's broken-image icon. Also treated as "missing" on a successful but
// suspiciously tiny load — Open Library serves a ~1x1 placeholder image
// (200 OK, not a fetch error) for editions it has no real cover for, so an
// onerror handler alone would miss that case.
function useFallbackCover(img, title) {
    const wrap = img.closest('.result-cover-wrap');
    if (!wrap || wrap.classList.contains('cover-fallback-shown')) return;
    wrap.classList.add('cover-fallback-shown');
    img.remove();

    const fallback = document.createElement('div');
    fallback.className = 'result-cover-fallback';
    fallback.style.background = fallbackColorFor(title);
    fallback.textContent = initials(title) || '?';
    wrap.appendChild(fallback);
}

function buildResultCard(book) {
    const card = document.createElement('article');
    card.className = 'result-card';

    const coverWrap = document.createElement('div');
    coverWrap.className = 'result-cover-wrap';

    if (book.coverUrl) {
        const img = document.createElement('img');
        img.className = 'result-cover';
        img.alt = `Cover of ${book.title}`;
        img.decoding = 'async';
        // Native lazy-load as a baseline, plus the IntersectionObserver
        // below (data-src) as the actual gate — see setUpLazyLoad. Keeping
        // both means images still degrade sensibly if IntersectionObserver
        // is ever unavailable.
        img.loading = 'lazy';
        img.dataset.src = book.coverUrl;
        img.addEventListener('error', () => useFallbackCover(img, book.title));
        img.addEventListener('load', () => {
            if (img.naturalWidth <= 1 || img.naturalHeight <= 1) useFallbackCover(img, book.title);
        });
        coverWrap.appendChild(img);
    } else {
        const fallback = document.createElement('div');
        fallback.className = 'result-cover-fallback';
        fallback.style.background = fallbackColorFor(book.title);
        fallback.textContent = initials(book.title) || '?';
        coverWrap.classList.add('cover-fallback-shown');
        coverWrap.appendChild(fallback);
    }

    const meta = document.createElement('div');
    meta.className = 'result-meta';

    const title = document.createElement('h3');
    title.className = 'result-title';
    title.textContent = book.title;

    const author = document.createElement('p');
    author.className = 'result-author';
    author.textContent = book.author;

    const sub = document.createElement('p');
    sub.className = 'result-sub';
    const subParts = [];
    if (book.isbn) subParts.push(`ISBN ${book.isbn}`);
    if (book.year) subParts.push(String(book.year));
    if (book.pages) subParts.push(`${book.pages} pages`);
    sub.textContent = subParts.join('  ·  ') || '—';

    meta.append(title, author, sub);
    card.append(coverWrap, meta);
    return card;
}

// IntersectionObserver instance is recreated per render — simpler than
// tracking which cards from a previous search are still in the DOM, and
// result sets are small enough (≤24 cards) that this costs nothing.
let lazyObserver = null;

function setUpLazyLoad() {
    if (lazyObserver) lazyObserver.disconnect();

    const images = resultsEl.querySelectorAll('img.result-cover[data-src]');
    if (!images.length) return;

    if (!('IntersectionObserver' in window)) {
        // No IntersectionObserver support — fall back to loading everything
        // immediately rather than leaving covers permanently blank.
        images.forEach((img) => {
            img.src = img.dataset.src;
            delete img.dataset.src;
        });
        return;
    }

    lazyObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const img = entry.target;
                img.src = img.dataset.src;
                delete img.dataset.src;
                observer.unobserve(img);
            });
        },
        { rootMargin: '400px 0px' } // start fetching well before the card is on-screen
    );

    images.forEach((img) => lazyObserver.observe(img));
}

function renderResults(books, mode, query) {
    resultsEl.innerHTML = '';

    if (!books.length) {
        statusEl.textContent = `No books found for ${mode} "${query}".`;
        return;
    }

    statusEl.textContent = `${books.length} result${books.length === 1 ? '' : 's'} for ${mode} "${query}"`;
    const fragment = document.createDocumentFragment();
    books.forEach((book) => fragment.appendChild(buildResultCard(book)));
    resultsEl.appendChild(fragment);
    setUpLazyLoad();
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

formEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const query = inputEl.value.trim();
    if (!query) {
        showError('Enter something to search for.');
        inputEl.focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Searching…';
    statusEl.textContent = 'Searching Open Library…';
    resultsEl.innerHTML = '';

    try {
        const books = await runSearch(activeMode, query);
        renderResults(books, activeMode, query);
    } catch (err) {
        console.error('Book search failed:', err);
        statusEl.textContent = '';
        showError("Couldn't reach Open Library right now — please try again.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Search';
    }
});
