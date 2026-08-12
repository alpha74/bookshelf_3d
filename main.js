import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

let allBooks = [];
let activeTag = 'latest';
let currentInspectedBook = null;

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Data folder — a single path segment in the URL (e.g. /alpha74) selects an
// alternate data folder to load books/notes from instead of the project
// root. The URL itself stays flat (just the folder name); the files
// actually live one level deeper, under profiles/<folder>, keeping every
// profile's data out of the project root. Resolved once at load; this is a
// plain static site with full page loads per URL, not a client-side router,
// so there's nothing to re-resolve later. Deeper paths just use their first
// segment; the plain "/" root has none and keeps using the top-level files.
const dataFolder = window.location.pathname.split('/').filter(Boolean)[0] || null;

function dataPath(fileName) {
    return dataFolder ? `profiles/${dataFolder}/${fileName}` : fileName;
}

// Theme
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

// Timeline strip toggle — off by default (no stored value → false); the
// strip itself is always built into each row's DOM (see renderBooks), this
// just shows/hides it via a class, so toggling doesn't need a re-render.
const timelineToggleBtn = document.getElementById('timeline-toggle');
let showTimeline = localStorage.getItem('showTimeline') === 'true';
function applyTimelineUI() {
    bookshelfContainerEl.classList.toggle('hide-timeline', !showTimeline);
    timelineToggleBtn.classList.toggle('active', showTimeline);
    timelineToggleBtn.setAttribute('aria-pressed', String(showTimeline));
}
timelineToggleBtn.addEventListener('click', () => {
    showTimeline = !showTimeline;
    localStorage.setItem('showTimeline', String(showTimeline));
    applyTimelineUI();
});

// DOM Elements
const bookshelfRowsEl = document.getElementById('bookshelf-rows');
const bookshelfContainerEl = document.getElementById('bookshelf-container');
const shelfPrevBtn = document.getElementById('shelf-prev');
const shelfNextBtn = document.getElementById('shelf-next');
const tagsNavEl = document.getElementById('tags-nav');
const tagsContainerEl = document.getElementById('tags-container');
const notFoundEl = document.getElementById('not-found');
const notFoundMessageEl = document.getElementById('not-found-message');
const layoutControlEl = document.getElementById('layout-control');
const layoutToggleBtn = document.getElementById('layout-toggle');
const layoutPopoverEl = document.getElementById('layout-popover');
const layoutSliderEl = document.getElementById('layout-slider');
const layoutSliderValueEl = document.getElementById('layout-slider-value');
const overlayEl = document.getElementById('inspect-overlay');
const inspectStageEl = document.getElementById('inspect-stage');
const closeBtn = document.getElementById('close-btn');
const readBtn = document.getElementById('read-btn');
const readingInterface = document.getElementById('reading-interface');
const openBookEl = document.getElementById('open-book');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const inspectLoaderEl = document.getElementById('inspect-loader');
const lampToggleBtn = document.getElementById('lamp-toggle');

applyTimelineUI();

// Lamp — a warm spotlight mimicking a desk lamp, toggled on/off and made to
// shine on whichever book is currently open. No lamp fixture is rendered —
// just its effect on the book — so only the toggle button's own state (and
// the actual light on the cover) reflects on/off. Persisted across book
// opens within the session (not localStorage — it's a "while I'm browsing"
// mood, not a durable preference).
let lampOn = true;
function applyLampUI() {
    lampToggleBtn.setAttribute('aria-pressed', String(lampOn));
    if (threeState) threeState.lampLight.intensity = lampOn ? 1.8 : 0;
}
lampToggleBtn.addEventListener('click', () => {
    lampOn = !lampOn;
    applyLampUI();
});

// Shelf layout — how many horizontal shelf rows the catalog is split
// across (1-5). Persisted like the theme, since it's a real layout
// preference rather than a session mood.
let shelfCount = Math.max(1, Math.min(5, parseInt(localStorage.getItem('shelfCount'), 10) || 1));

function applyLayoutUI() {
    layoutSliderEl.value = String(shelfCount);
    layoutSliderValueEl.textContent = String(shelfCount);
    document.querySelectorAll('.layout-quick-btn').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.count) === shelfCount);
    });
}

function setShelfCount(count) {
    shelfCount = Math.max(1, Math.min(5, count));
    localStorage.setItem('shelfCount', String(shelfCount));
    applyLayoutUI();
    renderBooks();
}

applyLayoutUI();

layoutToggleBtn.addEventListener('click', () => {
    const willOpen = layoutPopoverEl.classList.contains('hidden');
    layoutPopoverEl.classList.toggle('hidden', !willOpen);
    layoutToggleBtn.setAttribute('aria-expanded', String(willOpen));
});

document.addEventListener('click', (e) => {
    if (!layoutControlEl.contains(e.target)) {
        layoutPopoverEl.classList.add('hidden');
        layoutToggleBtn.setAttribute('aria-expanded', 'false');
    }
});

document.querySelectorAll('.layout-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => setShelfCount(Number(btn.dataset.count)));
});

layoutSliderEl.addEventListener('input', () => {
    setShelfCount(Number(layoutSliderEl.value));
});

// About — a popover of profile links sourced from about.json (root or
// profiles/<folder>/about.json, via dataPath()). Each entry's `name` is
// matched against ABOUT_ICONS (aliases included) to pick an icon; any name
// not in that map — including keys added to about.json later — falls back
// to a generic link glyph, so new link types show up automatically with no
// code change.
const aboutControlEl = document.getElementById('about-control');
const aboutToggleBtn = document.getElementById('about-toggle');
const aboutPopoverEl = document.getElementById('about-popover');
const aboutLinksEl = document.getElementById('about-links');

const ABOUT_ICON_PATHS = {
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none"/>',
    twitter: '<path d="M22 5.9c-.7.3-1.5.6-2.3.7.8-.5 1.4-1.3 1.7-2.3-.8.5-1.7.8-2.6 1a4 4 0 0 0-6.9 3.6C8.3 8.6 5.7 7.2 3.8 5c-.3.6-.5 1.3-.5 2a4 4 0 0 0 1.8 3.3c-.7 0-1.4-.2-2-.5 0 1.9 1.4 3.6 3.2 4-.6.2-1.3.2-2 .1.6 1.7 2.1 2.9 4 3-1.5 1.2-3.3 1.8-5.3 1.8H2c1.8 1.2 4 1.9 6.3 1.9 7.5 0 11.7-6.3 11.7-11.7v-.5c.8-.6 1.5-1.3 2-2.1z"/>',
    x: '<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>',
    linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7.5" y1="10" x2="7.5" y2="17"/><circle cx="7.5" cy="6.8" r="0.6" fill="currentColor" stroke="none"/><path d="M11.5 17v-4.5c0-1.4 1-2.5 2.5-2.5s2.5 1.1 2.5 2.5V17" fill="none"/><line x1="11.5" y1="10" x2="11.5" y2="17"/>',
    github: '<path d="M12 3a9 9 0 0 0-2.8 17.6c.4.1.6-.2.6-.4v-1.7c-2.4.5-3-1.1-3-1.1-.4-1-1-1.3-1-1.3-.8-.6.1-.5.1-.5.9.1 1.4.9 1.4.9.8 1.4 2.1 1 2.6.7.1-.6.3-1 .6-1.2-1.9-.2-3.9-1-3.9-4.3 0-.9.3-1.7.9-2.3-.1-.2-.4-1.1.1-2.3 0 0 .8-.2 2.5 1a8.5 8.5 0 0 1 4.5 0c1.7-1.2 2.5-1 2.5-1 .5 1.2.2 2.1.1 2.3.6.6.9 1.4.9 2.3 0 3.3-2 4.1-3.9 4.3.3.3.6.8.6 1.6v2.4c0 .2.2.5.6.4A9 9 0 0 0 12 3z"/>',
    portfolio: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18z"/>',
    website: '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13 13 0 0 1 0 18a13 13 0 0 1 0-18z"/>',
    email: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 6.5l8 6 8-6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 6.5l8 6 8-6"/>',
    facebook: '<path d="M15 8.5h2V5.3c-.4 0-1.5-.1-2.5-.1-2.5 0-4 1.5-4 4.2v2.1H8v3.2h2.5V21H14v-6.3h2.4l.4-3.2H14v-1.7c0-.9.3-1.3 1-1.3z" fill="currentColor" stroke="none"/>',
    youtube: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M11 9.5l4 2.5-4 2.5z" fill="currentColor" stroke="none"/>',
};
const ABOUT_ICON_FALLBACK = '<path d="M9.5 14.5l5-5"/><path d="M13 6h3a3 3 0 0 1 3 3v0a3 3 0 0 1-3 3h-2"/><path d="M11 18H8a3 3 0 0 1-3-3v0a3 3 0 0 1 3-3h2"/>';

function aboutIconSvg(name) {
    const key = String(name || '').trim().toLowerCase();
    const inner = ABOUT_ICON_PATHS[key] || ABOUT_ICON_FALLBACK;
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function aboutLinkHref(entry) {
    const link = entry.link || '';
    if (entry.type === 'email' && link && !link.startsWith('mailto:')) {
        return `mailto:${link}`;
    }
    return link;
}

async function loadAbout() {
    try {
        const res = await fetch(dataPath('about.json'));
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function renderAbout(links) {
    const usable = links.filter(entry => entry && entry.name && entry.link);
    if (!usable.length) return;

    usable.forEach(entry => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'about-link';
        a.href = aboutLinkHref(entry);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.innerHTML = `${aboutIconSvg(entry.name)}<span>${entry.name}</span>`;
        li.appendChild(a);
        aboutLinksEl.appendChild(li);
    });

    aboutControlEl.classList.remove('hidden');
}

aboutToggleBtn.addEventListener('click', () => {
    const willOpen = aboutPopoverEl.classList.contains('hidden');
    aboutPopoverEl.classList.toggle('hidden', !willOpen);
    aboutToggleBtn.setAttribute('aria-expanded', String(willOpen));
});

document.addEventListener('click', (e) => {
    if (!aboutControlEl.contains(e.target)) {
        aboutPopoverEl.classList.add('hidden');
        aboutToggleBtn.setAttribute('aria-expanded', 'false');
    }
});

// Thrown by loadBooks() when a /<folder> URL points at a folder that has no
// usable books.json — init() catches this specifically to show the 404 page
// instead of logging a generic load error.
class FolderNotFoundError extends Error {
    constructor(folder) {
        super(`Data folder "${folder}" not found`);
        this.folder = folder;
    }
}

// Book source — checked once at startup. If books_external.json exists, its
// `link` field is fetched and used as the catalog instead of the local
// books.json; every other part of the app is unaware of the difference and
// just works off whatever ends up in `allBooks`. Any failure along the way
// (the manifest is missing, its link 404s, CORS blocks it, the response
// isn't valid JSON, …) silently falls back to the local books.json — an
// external source can only ever add books, never break the app.
//
// None of that applies when a /<folder> URL is active: that's an explicit
// request for that folder's own local catalog, so it skips the external
// manifest entirely and goes straight to <folder>/books.json — and unlike
// the root case, a missing or unreadable file there is a real error (the
// folder doesn't exist / has no data), surfaced as a FolderNotFoundError
// rather than silently falling back to something else.
async function loadBooks() {
    if (dataFolder) {
        try {
            const res = await fetch(dataPath('books.json'));
            if (res.ok) {
                const books = await res.json();
                if (Array.isArray(books)) return books;
            }
        } catch {
            // network error / invalid JSON — treated the same as a missing folder below
        }
        throw new FolderNotFoundError(dataFolder);
    }

    try {
        const manifestRes = await fetch('books_external.json');
        if (manifestRes.ok) {
            const manifest = await manifestRes.json();
            if (manifest && manifest.link) {
                try {
                    const remoteRes = await fetch(manifest.link);
                    if (remoteRes.ok) {
                        const remoteBooks = await remoteRes.json();
                        if (Array.isArray(remoteBooks) && remoteBooks.length) {
                            console.info(`Loaded ${remoteBooks.length} books from external source (${manifest.source || manifest.link}).`);
                            return remoteBooks;
                        }
                    }
                    console.warn('books_external.json link did not return a usable book list — falling back to local books.json.');
                } catch (err) {
                    console.warn('Could not reach the external book source — falling back to local books.json.', err);
                }
            }
        }
    } catch {
        // No books_external.json present — that's the normal case, just use the local file.
    }

    const localRes = await fetch('books.json');
    return localRes.json();
}

// Shown instead of the shelf when a /<folder> URL's folder has no usable
// books.json (see FolderNotFoundError/loadBooks). Leaves the header (title,
// theme toggle) in place — only the tag filters and shelf are folder-scoped.
function showFolderNotFound(folder) {
    tagsNavEl.style.display = 'none';
    bookshelfContainerEl.style.display = 'none';
    notFoundMessageEl.textContent = `The data folder "${folder}" doesn't exist.`;
    notFoundEl.classList.remove('hidden');
}

// Initialize
async function init() {
    loadAbout().then(renderAbout);

    try {
        allBooks = await loadBooks();
        // Ascending (oldest first) so every shelf row — and the timeline
        // strip beneath it — reads left-to-right as oldest-to-newest.
        allBooks.sort((a, b) => new Date(a.date_added) - new Date(b.date_added));

        extractTags();
        renderBooks();
    } catch (err) {
        if (err instanceof FolderNotFoundError) {
            showFolderNotFound(err.folder);
        } else {
            console.error("Error loading data:", err);
        }
    }
}

// Tags
function extractTags() {
    const tags = new Set();
    allBooks.forEach(b => b.tags.forEach(t => tags.add(t)));

    tags.forEach(tag => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'tag';
        btn.dataset.tag = tag;
        btn.textContent = tag.charAt(0).toUpperCase() + tag.slice(1);
        btn.addEventListener('click', () => setTag(tag));
        li.appendChild(btn);
        tagsContainerEl.appendChild(li);
    });
}

function setTag(tag) {
    activeTag = tag;
    document.querySelectorAll('.tag').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tag === tag);
    });
    renderBooks();
}

document.querySelector('.tag[data-tag="latest"]').addEventListener('click', () => setTag('latest'));
document.querySelector('.tag[data-tag="all"]').addEventListener('click', () => setTag('all'));

// Thickness (spine width) derived from page count, trimmed to a believable range
function getThickness(book) {
    const pages = book.pages || 250;
    return Math.max(16, Math.min(50, Math.round(pages / 8)));
}

// Multiplicative shade (channel * (1 + percent/100)) rather than a flat
// subtraction — a flat subtract crushes already medium-dark colors (like
// deep greens/reds used for spines) almost to black instead of just
// darkening them proportionally.
function shade(hex, percent) {
    const n = parseInt(hex.slice(1), 16);
    const f = 1 + percent / 100;
    let r = Math.round((n >> 16) * f);
    let g = Math.round(((n >> 8) & 0xff) * f);
    let b = Math.round((n & 0xff) * f);
    r = Math.max(0, Math.min(255, r));
    g = Math.max(0, Math.min(255, g));
    b = Math.max(0, Math.min(255, b));
    return `rgb(${r},${g},${b})`;
}

// ---------------------------------------------------------------------------
// Shelf (CSS 3D). Each book is a static "slot" (fixed layout box, never
// transformed) wrapping the animated ".book" box. Hover/lift is applied only
// to the inner box, so the slot's hit-region never moves under the cursor —
// that's what keeps hover stable instead of flickering in and out.
// ---------------------------------------------------------------------------

// Every shelf row's own scrollable viewport — rebuilt each renderBooks()
// call, and shared by updateShelfScrollState() and the prev/next buttons so
// a single pair of arrows can drive every row (with different book counts
// per row) in sync.
let shelfViewports = [];
// One "keep the plank matched to its row's width/scroll position" sync
// function per row — re-run on window resize since a row's scrollWidth can
// change (e.g. font/zoom changes) even without re-rendering the books.
let plankSyncFns = [];

function renderBooks() {
    bookshelfRowsEl.innerHTML = '';
    shelfViewports = [];
    plankSyncFns = [];

    let booksToRender = [];
    if (activeTag === 'latest') {
        // allBooks is sorted ascending by date_added, so the 25 most
        // recently added books are the last 25 in the array — kept in that
        // same ascending order so the row still reads oldest-to-newest.
        booksToRender = allBooks.slice(-25);
    } else if (activeTag === 'all') {
        booksToRender = allBooks;
    } else {
        booksToRender = allBooks.filter(b => b.tags.includes(activeTag));
    }

    const chunkSize = Math.max(1, Math.ceil(booksToRender.length / shelfCount));

    for (let row = 0; row < shelfCount; row++) {
        const rowBooks = booksToRender.slice(row * chunkSize, (row + 1) * chunkSize);
        if (rowBooks.length === 0) break; // fewer books than shelves — skip trailing empty rows

        const rowEl = document.createElement('div');
        rowEl.className = 'shelf-row';

        const viewport = document.createElement('div');
        viewport.className = 'bookshelf-viewport';

        const shelf = document.createElement('div');
        shelf.className = 'bookshelf';

        // One slot element per book, in row order — used after layout to
        // position that book's timeline tick (see timelineTicks below).
        const slotEls = [];

        rowBooks.forEach((book) => {
            const d = getThickness(book);
            const h = book.dimensions.height;

            const slot = document.createElement('div');
            slot.className = 'book-slot';
            slot.style.width = `${d}px`;
            slot.style.height = `${h}px`;

            const bookEl = createBookElement(book);
            bookEl.style.width = `${d}px`;
            bookEl.style.height = `${h}px`;

            // Resting rotation shows the spine to the viewer; a little per-book
            // jitter keeps the row from feeling too mechanically uniform.
            const jitterY = (Math.random() - 0.5) * 6;
            const jitterZ = (Math.random() - 0.5) * 1.6;
            bookEl.style.setProperty('--rest-y', `${-90 + jitterY}deg`);
            bookEl.style.setProperty('--rest-z', `${jitterZ}deg`);

            // A hover tooltip showing title + author. It's a sibling of
            // .book rather than a child of it, so it stays in normal 2D
            // layout and isn't dragged along by the book's own 3D hover
            // transform (lift/scale/rotation) — it just fades in in place.
            const tooltip = document.createElement('div');
            tooltip.className = 'book-tooltip';
            tooltip.innerHTML = `
                <span class="book-tooltip-title">${book.title}</span>
                <span class="book-tooltip-author">${book.author}</span>
            `;

            slot.appendChild(bookEl);
            slot.appendChild(tooltip);
            slot.addEventListener('click', () => inspectBook(book));
            shelf.appendChild(slot);
            slotEls.push(slot);
        });

        viewport.appendChild(shelf);
        rowEl.appendChild(viewport);

        // The plank has to match the row's actual (possibly scrollable)
        // content width, not just the visible viewport — otherwise it falls
        // short of the outermost books once a row overflows (e.g. "All").
        // It lives in its own clipped track (same visible width as the
        // viewport) and is widened to the full scrollable content width,
        // then translated to mirror the viewport's scroll position so it
        // stays glued under the books as you scroll.
        const plankTrack = document.createElement('div');
        plankTrack.className = 'shelf-plank-track';
        const plank = document.createElement('div');
        plank.className = 'shelf-plank';
        plankTrack.appendChild(plank);
        rowEl.appendChild(plankTrack);

        // Timeline strip — one tick per date change point in this row (a
        // year tick whenever the year advances, a month tick for every other
        // month change in between), each positioned under the book that
        // introduced it. Ticks are sparse by design: a tick per book would
        // overlap into an unreadable smear on any row with more than a
        // handful of books.
        const timelineTicks = [];
        let lastYear = null;
        let lastMonth = null;
        rowBooks.forEach((book, i) => {
            const parsed = book.date_added ? new Date(book.date_added.replace(' ', 'T')) : null;
            if (!parsed || isNaN(parsed)) return;
            const year = parsed.getFullYear();
            const month = parsed.getMonth();
            if (year !== lastYear) {
                timelineTicks.push({ slot: slotEls[i], type: 'year', text: String(year) });
                lastYear = year;
                lastMonth = month;
            } else if (month !== lastMonth) {
                timelineTicks.push({ slot: slotEls[i], type: 'month', text: MONTH_ABBR[month] });
                lastMonth = month;
            }
        });

        const timelineTrack = document.createElement('div');
        timelineTrack.className = 'shelf-timeline-track';
        const timelineEl = document.createElement('div');
        timelineEl.className = 'shelf-timeline';
        const tickEls = timelineTicks.map((tick) => {
            const tickEl = document.createElement('span');
            tickEl.className = `timeline-tick timeline-tick-${tick.type}`;
            tickEl.textContent = tick.text;
            timelineEl.appendChild(tickEl);
            return tickEl;
        });
        timelineTrack.appendChild(timelineEl);
        rowEl.appendChild(timelineTrack);

        // Plank and timeline both mirror the viewport's scrollable content:
        // sized to its full scroll width and translated to cancel out the
        // current scroll offset, so they stay glued under the books. Tick
        // positions themselves (slot.offsetLeft) don't move on scroll — only
        // the container translating them does — so they're set here too but
        // stay correct without recomputation.
        function syncRow() {
            plank.style.width = `${viewport.scrollWidth}px`;
            plank.style.transform = `translateX(${-viewport.scrollLeft}px)`;
            timelineEl.style.width = `${viewport.scrollWidth}px`;
            timelineEl.style.transform = `translateX(${-viewport.scrollLeft}px)`;
            timelineTicks.forEach((tick, i) => {
                const center = tick.slot.offsetLeft + tick.slot.offsetWidth / 2;
                tickEls[i].style.left = `${center}px`;
            });
        }
        syncRow();

        viewport.addEventListener('scroll', () => {
            updateShelfScrollState();
            syncRow();
        });
        // Mouse wheels/trackpads usually send vertical deltaY even when the
        // user means to scroll a horizontal row — convert that to horizontal.
        viewport.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                viewport.scrollLeft += e.deltaY;
            }
        }, { passive: false });

        bookshelfRowsEl.appendChild(rowEl);
        shelfViewports.push(viewport);
        plankSyncFns.push(syncRow);
    }

    shelfViewports.forEach((v) => { v.scrollLeft = 0; });
    plankSyncFns.forEach((sync) => sync());
    requestAnimationFrame(updateShelfScrollState);
}

// Shows/hides the prev/next arrows and disables whichever one is already at
// its limit. With multiple shelf rows possibly holding different numbers of
// books, "at the limit" means every row has hit its own scroll bound — a
// button stays enabled as long as at least one row still has room to move.
function updateShelfScrollState() {
    if (shelfViewports.length === 0) return;

    const overflowing = shelfViewports.some((v) => v.scrollWidth > v.clientWidth + 1);
    bookshelfContainerEl.classList.toggle('overflowing', overflowing);
    shelfPrevBtn.classList.toggle('hidden', !overflowing);
    shelfNextBtn.classList.toggle('hidden', !overflowing);
    if (!overflowing) return;

    shelfPrevBtn.disabled = shelfViewports.every((v) => v.scrollLeft <= 2);
    shelfNextBtn.disabled = shelfViewports.every((v) => v.scrollLeft >= v.scrollWidth - v.clientWidth - 2);
}

window.addEventListener('resize', () => {
    plankSyncFns.forEach((sync) => sync());
    updateShelfScrollState();
});

shelfPrevBtn.addEventListener('click', () => {
    shelfViewports.forEach((v) => v.scrollBy({ left: -360, behavior: 'smooth' }));
});
shelfNextBtn.addEventListener('click', () => {
    shelfViewports.forEach((v) => v.scrollBy({ left: 360, behavior: 'smooth' }));
});

// Builds a 6-face 3D box: front cover / back cover / spine / fore-edge
// (page block) / top edge / bottom edge, sized from the book's real width,
// height and a thickness computed from its page count.
//
// The shelf only ever shows the SPINE face (the book rests spine-out, and
// the front cover face is rotated away) — so we deliberately never fetch
// the cover image here. It's just a flat color placeholder on the shelf;
// the real cover artwork is only downloaded once a book is actually opened
// in the 3D inspect view (see createInspectScene).
function createBookElement(book) {
    const w = book.dimensions.width;
    const h = book.dimensions.height;
    const d = getThickness(book);
    const color = book.color || '#5b5b5b';

    // On the shelf the book is rotated ~-90deg about Y to face its spine at the
    // viewer, so the cover width `w` (~140px for almost every book) becomes the
    // box's depth — how far it recedes from the spine toward/away from the
    // viewer. Under the slot's perspective, the faces that span that depth
    // (front/back/fore-edge/top/bottom) get their far top corner magnified and
    // projected ABOVE the spine's silhouette — a thin, tapering "spike" poking
    // up out of the book, worst on tall/thin books and amplified by the resting
    // jitter. Capping the depth used to build the box bounds that magnification
    // so no corner clears the silhouette, while leaving the spine's real
    // thickness (d), height (h) and shelf position untouched. The full cover
    // width is still used by the separate Three.js inspect view, so nothing is
    // lost there. (This function builds shelf books only — inspect is Three.js.)
    const depth = Math.min(w, 42);

    const el = document.createElement('div');
    el.className = 'book';
    el.dataset.id = book.id;

    // Each face gets a tiny (2%) extra scale, centered on itself, on top of
    // its positioning transform. Six independently-transformed rectangles
    // only form a perfectly seamless box if every shared edge lines up to
    // the sub-pixel — in practice, per-book rounding (thickness is an
    // integer from getThickness, but w/h and their halves aren't always)
    // leaves a hairline gap at one edge on some books, which shows up as a
    // triangular sliver of the page background at a corner. The extra scale
    // makes every face slightly overlap its neighbors at every seam instead
    // of butting exactly against them, closing that gap regardless of which
    // corner it would otherwise show up on.
    const OVERLAP = 'scale(1.02)';
    el.innerHTML = `
        <div class="book-face book-front cover-fallback-active" style="width:${depth}px;height:${h}px;transform:translateZ(${d/2}px) ${OVERLAP};">
            <div class="cover-fallback" style="background:${color};">
                <span class="fallback-title">${book.title}</span>
                <span class="fallback-author">${book.author}</span>
            </div>
        </div>

        <div class="book-face book-back" style="width:${depth}px;height:${h}px;transform:rotateY(180deg) translateZ(${d/2}px) ${OVERLAP};background:${shade(color, -25)};"></div>

        <div class="book-face book-spine" style="width:${d}px;height:${h}px;transform:rotateY(90deg) translateZ(${-d/2}px) ${OVERLAP};background:${color};">
            <span class="rating-badge">${(book.rating ?? '').toString()}</span>
            <span class="book-spine-title">${book.title}</span>
        </div>

        <div class="book-face book-fore-edge" style="width:${d}px;height:${h}px;transform:rotateY(-90deg) translateZ(${d/2 - depth}px) ${OVERLAP};"></div>

        <div class="book-face book-top" style="width:${depth}px;height:${d}px;transform:rotateX(90deg) translateZ(${d/2}px) ${OVERLAP};"></div>

        <div class="book-face book-bottom" style="width:${depth}px;height:${d}px;transform:rotateX(-90deg) translateZ(${h - d/2}px) ${OVERLAP};"></div>
    `;

    return el;
}

// ---------------------------------------------------------------------------
// Inspect mode: a real Three.js scene with OrbitControls, so dragging
// smoothly orbits the camera around an actual 3D box (with inertia/damping)
// instead of hand-rolled CSS transform math.
// ---------------------------------------------------------------------------

const SCALE = 1 / 60;
let threeState = null;

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

function makeSpineTexture(book, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (book.rating) {
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        const bw = 56, bh = 28;
        roundRect(ctx, canvas.width / 2 - bw / 2, 14, bw, bh, 8);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(book.rating), canvas.width / 2, 14 + bh / 2 + 1);
    }

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2 + 30);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 27px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(truncate(book.title, 30), 0, -14);
    ctx.font = '500 18px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(book.author, 0, 20);
    ctx.restore();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function makeCoverFallbackTexture(book) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = book.color || '#555';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.font = 'bold 40px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const words = book.title.split(' ');
    let lines = [];
    let line = '';
    words.forEach(word => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > 400 && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    });
    if (line) lines.push(line);

    const startY = canvas.height / 2 - (lines.length - 1) * 26;
    lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, startY + i * 52));

    ctx.font = '500 24px Inter, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    ctx.fillText(book.author, canvas.width / 2, startY + lines.length * 52 + 20);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// `vertical: true` draws the ruled lines running top-to-bottom instead of
// left-to-right. On a BoxGeometry's +x/-x faces (the page block's fore-edge,
// facing the viewer), u maps to depth and v maps to height — so horizontal
// canvas lines land as bands running the full depth of the block, repeated
// up its height, which reads as horizontal stripes on the fore-edge. Real
// page edges run the other way (each page is a full-height sheet, stacked
// side-by-side through the block's depth), so that face needs vertical
// lines instead; +y/-y (top/bottom) keep the horizontal orientation.
function makePagesTexture(lineCount, vertical = false) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4f0e6';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#e2dbc9';
    ctx.lineWidth = 1;
    const step = 64 / Math.max(4, lineCount);
    for (let pos = step / 2; pos < 64; pos += step) {
        ctx.beginPath();
        if (vertical) {
            ctx.moveTo(pos, 0);
            ctx.lineTo(pos, 64);
        } else {
            ctx.moveTo(0, pos);
            ctx.lineTo(64, pos);
        }
        ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

// Image cache — stores cover blobs in IndexedDB with expiry metadata.
// Default cache duration is 30 days; expired or missing entries are
// re-fetched and stored fresh. This drastically reduces API requests
// when browsing the same books multiple times.
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_DB_NAME = 'BookCoverCache';
const CACHE_STORE_NAME = 'covers';

async function initCacheDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(CACHE_DB_NAME, 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
                db.createObjectStore(CACHE_STORE_NAME);
            }
        };
    });
}

async function getCachedImage(url) {
    try {
        const db = await initCacheDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
            const store = tx.objectStore(CACHE_STORE_NAME);
            const req = store.get(url);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => {
                const cached = req.result;
                if (cached && cached.blob && cached.timestamp) {
                    const age = Date.now() - cached.timestamp;
                    if (age < CACHE_DURATION_MS) {
                        resolve(cached.blob);
                        return;
                    }
                }
                resolve(null);
            };
        });
    } catch {
        return null;
    }
}

async function setCachedImage(url, blob) {
    try {
        const db = await initCacheDB();
        return new Promise((resolve) => {
            const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(CACHE_STORE_NAME);
            store.put({ blob, timestamp: Date.now() }, url);
            tx.oncomplete = () => resolve();
        });
    } catch {
        // Silently fail — cache is optional, not critical.
    }
}

// Fetch image from cache or network, storing in cache for future use.
async function fetchImageWithCache(url) {
    const cached = await getCachedImage(url);
    if (cached) {
        return cached;
    }

    try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) return null;
        const blob = await res.blob();
        await setCachedImage(url, blob);
        return blob;
    } catch {
        return null;
    }
}

// A real hardcover isn't one solid block — the page block is slightly
// smaller than the covers, which overhang it on the top, bottom and
// fore-edge (but sit flush with it at the spine, where the pages are bound).
// Modelling that as four separate boards/blocks (instead of one BoxGeometry)
// is what gives the case its stepped, "hardcover" silhouette.
function buildHardcoverGroup(book, w, h, pagesD, color) {
    const overhang = 0.045; // how far the boards overhang the page block
    const boardT = 0.035;   // cover board thickness

    const group = new THREE.Group();
    const backColor = new THREE.Color().setStyle(shade(color, -25));
    const edgeColor = new THREE.Color().setStyle(shade(color, -10));
    const edgeMat = new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.75, metalness: 0.03 });

    // Page block: inset on top/bottom/fore-edge, flush against the spine.
    // The fore-edge (+x/-x) and the top/bottom (+y/-y) need differently
    // oriented ruled textures — see makePagesTexture — so this is a
    // material array rather than one material shared by every face.
    const pagesW = w - overhang;
    const pagesH = h - overhang * 2;
    const foreEdgeMat = new THREE.MeshStandardMaterial({
        map: makePagesTexture(Math.max(8, Math.min(60, Math.round(book.pages / 8))), true),
        roughness: 0.95,
    });
    const pagesMat = new THREE.MeshStandardMaterial({
        map: makePagesTexture(Math.round(book.dimensions.width / 8)),
        roughness: 0.95,
    });
    const pagesMesh = new THREE.Mesh(
        new THREE.BoxGeometry(pagesW, pagesH, pagesD),
        [foreEdgeMat, foreEdgeMat, pagesMat, pagesMat, pagesMat, pagesMat]
    );
    pagesMesh.position.x = -overhang / 2;
    group.add(pagesMesh);

    // Front cover board — the +z face carries the cover art (filled in once
    // it loads; starts white so it isn't pitch black in the meantime).
    const frontMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.08 });
    const frontMesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, boardT),
        [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, edgeMat]
    );
    frontMesh.position.z = pagesD / 2 + boardT / 2;
    group.add(frontMesh);

    // Back cover board — plain board color all round, thin.
    const backMat = new THREE.MeshStandardMaterial({ color: backColor, roughness: 0.8, metalness: 0.03 });
    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, boardT), backMat);
    backMesh.position.z = -(pagesD / 2 + boardT / 2);
    group.add(backMesh);

    // Spine board — wraps around the full thickness (pages + both boards);
    // its outward face (-x, left) carries the title/rating texture.
    const spineOuterD = pagesD + boardT * 2;
    const spineMat = new THREE.MeshStandardMaterial({
        map: makeSpineTexture(book, color),
        roughness: 0.82,
        metalness: 0.04,
    });
    const spineMesh = new THREE.Mesh(
        new THREE.BoxGeometry(boardT, h, spineOuterD),
        [edgeMat, spineMat, edgeMat, edgeMat, edgeMat, edgeMat]
    );
    spineMesh.position.x = -(w / 2 + boardT / 2);
    group.add(spineMesh);

    return { group, frontMat, backMat, spineMat, edgeMat, pagesMat };
}

function disposeThree() {
    if (!threeState) return;
    inspectLoaderEl.classList.add('hidden');
    cancelAnimationFrame(threeState.animId);
    window.removeEventListener('resize', threeState.onResize);
    threeState.controls.dispose();
    threeState.scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
                if (m.map) m.map.dispose();
                m.dispose();
            });
        }
    });
    threeState.renderer.dispose();
    threeState.renderer.domElement.remove();
    threeState = null;
}

function createInspectScene(book) {
    disposeThree();

    const w = book.dimensions.width * SCALE;
    const h = book.dimensions.height * SCALE;
    const d = getThickness(book) * SCALE;
    const color = book.color || '#5b5b5b';

    const rect = inspectStageEl.getBoundingClientRect();

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, rect.width / rect.height, 0.1, 100);

    // The original fixed camera distance was tuned for a wide/landscape
    // aspect ratio. On a narrow mobile portrait viewport, the horizontal
    // field of view at that same distance is much tighter, so the book's
    // edges get cropped — which reads as "zoomed in". Instead, derive the
    // distance needed to fit the book's width AND height (with a margin) at
    // whatever aspect ratio the stage actually has, along the same viewing
    // angle as before (spine-on-the-left).
    const cameraDir = new THREE.Vector3(-1.6, 0.55, 5.4).normalize();
    function fitCameraDistance(aspect) {
        const halfW = w / 2 + 0.35;
        const halfH = h / 2 + 0.35;
        const vFov = (camera.fov * Math.PI) / 180;
        const distForHeight = halfH / Math.tan(vFov / 2);
        const distForWidth = halfW / (Math.tan(vFov / 2) * aspect);
        return Math.max(distForHeight, distForWidth, 3.2);
    }

    let cameraDistance = fitCameraDistance(rect.width / rect.height);
    camera.position.copy(cameraDir).multiplyScalar(cameraDistance);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(rect.width, rect.height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cursor = 'grab';
    inspectStageEl.prepend(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x201a12, 0.9));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(3, 4, 5);
    scene.add(dirLight);

    // A light that follows the camera, so whichever face is currently
    // turned toward the viewer is always well lit — otherwise the far side
    // of the book (e.g. the back cover) goes almost black when orbited into
    // view, since it faces away from any fixed light.
    const camLight = new THREE.DirectionalLight(0xffffff, 0.9);
    scene.add(camLight);
    scene.add(camLight.target);

    // Desk lamp: a warm, tightly-focused spotlight above and to the side of
    // the book, off by default. The lamp toggle just changes its intensity —
    // the actual "shine" comes from the light itself catching the cover at
    // an angle, since the cover material isn't fully matte.
    const lampLight = new THREE.SpotLight(0xffd9a0, lampOn ? 1.8 : 0, 10, Math.PI / 5, 1, 1.8);
    lampLight.position.set(2.1, 3, 2.6);
    lampLight.target.position.set(0, 0, 0);
    scene.add(lampLight, lampLight.target);

    const bookGroup = buildHardcoverGroup(book, w, h, d, color);
    scene.add(bookGroup.group);

    // The cover texture is fetched only now — the moment this book is
    // actually opened — never while it's just sitting on the shelf. It's
    // also routed through the IndexedDB cover cache (see fetchImageWithCache
    // above), so re-opening the same book — even after a page reload —
    // reuses the cached image instead of hitting Open Library again, as
    // long as the cached copy hasn't passed CACHE_DURATION_MS.
    inspectLoaderEl.classList.remove('hidden');
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const coverUrl = `https://covers.openlibrary.org/b/isbn/${book.isbn}-L.jpg`;
    fetchImageWithCache(coverUrl).then((blob) => {
        // The user may have closed this book or opened another one while
        // the fetch/cache lookup was in flight — don't apply a stale result.
        if (!threeState || threeState.renderer !== renderer) return;

        if (!blob) {
            bookGroup.frontMat.map = makeCoverFallbackTexture(book);
            bookGroup.frontMat.needsUpdate = true;
            inspectLoaderEl.classList.add('hidden');
            return;
        }

        const objectUrl = URL.createObjectURL(blob);
        loader.load(
            objectUrl,
            (tex) => {
                URL.revokeObjectURL(objectUrl);
                tex.colorSpace = THREE.SRGBColorSpace;
                bookGroup.frontMat.map = tex;
                bookGroup.frontMat.color.set(0xffffff);
                bookGroup.frontMat.needsUpdate = true;
                inspectLoaderEl.classList.add('hidden');
            },
            undefined,
            () => {
                URL.revokeObjectURL(objectUrl);
                bookGroup.frontMat.map = makeCoverFallbackTexture(book);
                bookGroup.frontMat.needsUpdate = true;
                inspectLoaderEl.classList.add('hidden');
            }
        );
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    // Proportional to the fitted distance rather than fixed values, so the
    // zoom range still makes sense on a mobile viewport where the base
    // distance itself is larger than on desktop.
    controls.minDistance = cameraDistance * 0.55;
    controls.maxDistance = cameraDistance * 1.7;
    controls.rotateSpeed = 0.85;
    controls.update();

    renderer.domElement.addEventListener('pointerdown', () => {
        renderer.domElement.style.cursor = 'grabbing';
    });
    window.addEventListener('pointerup', () => {
        if (threeState) threeState.renderer.domElement.style.cursor = 'grab';
    });

    let animId;
    function animate() {
        animId = requestAnimationFrame(animate);
        controls.update();
        camLight.position.copy(camera.position);
        camLight.target.position.set(0, 0, 0);
        renderer.render(scene, camera);
    }
    animate();

    function onResize() {
        const r = inspectStageEl.getBoundingClientRect();
        camera.aspect = r.width / r.height;

        // Rescale the camera's distance from target for the new aspect
        // (e.g. a phone rotating between portrait/landscape) without
        // resetting the direction the user has already rotated to.
        const newDistance = fitCameraDistance(camera.aspect);
        const currentDistance = camera.position.length();
        if (currentDistance > 0.001) {
            camera.position.multiplyScalar(newDistance / currentDistance);
        }
        cameraDistance = newDistance;
        controls.minDistance = cameraDistance * 0.55;
        controls.maxDistance = cameraDistance * 1.7;

        camera.updateProjectionMatrix();
        renderer.setSize(r.width, r.height);
    }
    window.addEventListener('resize', onResize);

    threeState = {
        renderer, scene, camera, controls, onResize, lampLight,
        get animId() { return animId; }
    };
    applyLampUI();
}

// Whether the reading interface (page-flip notes) is currently showing
// instead of the 3D model — drives the Read Notes / Close Book toggle.
let notesOpen = false;

function setNotesOpen(open) {
    notesOpen = open;
    readBtn.textContent = open ? 'Close Book' : 'Read Notes';
    readingInterface.classList.toggle('hidden', !open);
    inspectStageEl.style.display = open ? 'none' : 'flex';
}

// Notes live in one file per book — <bookid>_notes.json (see loadNotesForBook)
// — rather than one shared notes.json, so a catalog can grow without every
// book needing an entry, and most books simply have no file (404 => no
// notes, handled the same as "book has no notes" always was). Fetched lazily
// per book, on first inspect, and cached since a book's notes don't change
// during a session.
const notesCache = new Map();

async function loadNotesForBook(book) {
    if (notesCache.has(book.id)) return notesCache.get(book.id);

    let notes = null;
    try {
        const res = await fetch(dataPath(`${book.id}_notes.json`));
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length) notes = data;
        }
    } catch {
        // No <bookid>_notes.json for this book — that's the normal case for most books.
    }

    notesCache.set(book.id, notes);
    return notes;
}

async function inspectBook(book) {
    currentInspectedBook = book;
    overlayEl.classList.remove('hidden');
    setNotesOpen(false);

    // Notes fetch is async, but the 3D scene doesn't wait on it — the Read
    // Notes button just stays disabled until the fetch resolves.
    readBtn.disabled = true;
    createInspectScene(book);

    const notes = await loadNotesForBook(book);
    if (currentInspectedBook !== book) return; // user closed/switched books while this was in flight
    readBtn.disabled = !notes;
}

closeBtn.addEventListener('click', () => {
    overlayEl.classList.add('hidden');
    setNotesOpen(false);
    disposeThree();
    currentInspectedBook = null;
});

// Reading Interface
let currentPageIndex = 0;
let bookPages = [];

readBtn.addEventListener('click', () => {
    if (!currentInspectedBook) return;

    if (notesOpen) {
        // "Close Book" — leave the notes and bring back the same live 3D
        // model rather than re-creating it (the Three.js scene was only
        // hidden, not disposed, while the notes were showing).
        setNotesOpen(false);
        return;
    }

    // Already resolved by inspectBook()'s loadNotesForBook() call by the time
    // this button is enabled — read the cache rather than re-fetching.
    const notes = notesCache.get(currentInspectedBook.id);
    if (!notes) return; // button is disabled in this case anyway

    setNotesOpen(true);
    buildReadingBook(notes);
});

function buildReadingBook(notes) {
    openBookEl.innerHTML = '';
    currentPageIndex = 0;

    const w = currentInspectedBook.dimensions.width * 2.2;
    const h = currentInspectedBook.dimensions.height * 2.2;
    openBookEl.style.width = `${w * 2}px`;
    openBookEl.style.height = `${h}px`;

    bookPages = [];
    const numPhysicalPages = Math.ceil(notes.length / 2);

    for (let i = 0; i < numPhysicalPages; i++) {
        const p = document.createElement('div');
        p.className = 'page';
        p.style.zIndex = numPhysicalPages - i;

        const frontNote = notes[i * 2];
        const backNote = notes[i * 2 + 1];

        p.innerHTML = `
            <div class="page-front">${frontNote ? frontNote.content : ''}</div>
            <div class="page-back">${backNote ? backNote.content : ''}</div>
        `;

        openBookEl.appendChild(p);
        bookPages.push(p);
    }
    updatePageVisibility();
}

prevPageBtn.addEventListener('click', () => {
    if (currentPageIndex > 0) {
        currentPageIndex--;
        bookPages[currentPageIndex].classList.remove('flipped');
        updatePageVisibility();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPageIndex < bookPages.length) {
        bookPages[currentPageIndex].classList.add('flipped');
        currentPageIndex++;
        updatePageVisibility();
    }
});

function updatePageVisibility() {
    bookPages.forEach((p, idx) => {
        if (p.classList.contains('flipped')) {
            p.style.zIndex = idx + 1;
        } else {
            p.style.zIndex = bookPages.length - idx;
        }
    });
}

init();
