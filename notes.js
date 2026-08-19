const themeToggleBtn = document.getElementById('theme-toggle');
const formsEl = document.getElementById('notes-forms');
const pageCountEl = document.getElementById('notes-page-count');
const errorEl = document.getElementById('notes-error');
const openBookEl = document.getElementById('notes-open-book');
const prevPageBtn = document.getElementById('notes-prev-page');
const nextPageBtn = document.getElementById('notes-next-page');
const previewLabelEl = document.getElementById('preview-page-label');
const pasteDialogEl = document.getElementById('paste-json-dialog');
const pasteInputEl = document.getElementById('paste-json-input');
const pasteErrorEl = document.getElementById('paste-json-error');
const fileInputEl = document.getElementById('json-file-input');
const copyBtn = document.getElementById('copy-notes-btn');

let notes = [{ page: 1, content: '' }];
let currentPhysicalPage = 0;
let previewPages = [];

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
    localStorage.setItem('theme', theme);
}

applyTheme(localStorage.getItem('theme') || 'dark');
themeToggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'light' ? 'dark' : 'light');
});

function renumberNotes() {
    notes.forEach((note, index) => {
        note.page = index + 1;
    });
}

function notesJson() {
    renumberNotes();
    return JSON.stringify(notes, null, 2);
}

function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

function clearError() {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
}

function addPageButton(index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'notes-add-page';
    button.dataset.insertAt = String(index);
    button.innerHTML = '<span>+</span> Add page';
    button.setAttribute('aria-label', `Add page at position ${index + 1}`);
    return button;
}

function renderForms(focusIndex = null) {
    renumberNotes();
    formsEl.innerHTML = '';
    formsEl.appendChild(addPageButton(0));

    notes.forEach((note, index) => {
        const card = document.createElement('article');
        card.className = 'notes-page-form';

        const header = document.createElement('div');
        header.className = 'notes-page-form-header';

        const title = document.createElement('h3');
        title.textContent = `Page ${note.page}`;

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'notes-remove-page';
        remove.dataset.removeAt = String(index);
        remove.textContent = 'Remove';
        remove.disabled = notes.length === 1;
        remove.setAttribute('aria-label', `Remove page ${note.page}`);
        header.append(title, remove);

        const pageField = document.createElement('div');
        pageField.className = 'form-field';
        const pageLabel = document.createElement('label');
        pageLabel.textContent = 'Page';
        const pageInput = document.createElement('input');
        pageInput.className = 'form-input';
        pageInput.type = 'number';
        pageInput.value = String(note.page);
        pageInput.readOnly = true;
        pageField.append(pageLabel, pageInput);

        const contentField = document.createElement('div');
        contentField.className = 'form-field';
        const contentLabel = document.createElement('label');
        contentLabel.htmlFor = `note-content-${index}`;
        contentLabel.textContent = 'Content';
        const content = document.createElement('textarea');
        content.id = `note-content-${index}`;
        content.className = 'form-input form-textarea notes-content-input';
        content.rows = 8;
        content.dataset.noteIndex = String(index);
        content.value = note.content;
        content.placeholder = '<h2>Chapter title</h2><p>Add your note here.</p>';
        contentField.append(contentLabel, content);

        card.append(header, pageField, contentField);
        formsEl.append(card, addPageButton(index + 1));
    });

    pageCountEl.textContent = `${notes.length} page${notes.length === 1 ? '' : 's'}`;
    if (focusIndex !== null) {
        document.getElementById(`note-content-${focusIndex}`)?.focus();
    }
}

// Notes intentionally support a small set of HTML for headings, paragraphs,
// lists and emphasis. Strip executable/embedded markup before live previewing
// pasted or typed content.
function sanitizedNoteHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    template.content.querySelectorAll('script, style, iframe, object, embed, form, input, button, link, meta').forEach((el) => el.remove());
    template.content.querySelectorAll('*').forEach((el) => {
        Array.from(el.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            if (name.startsWith('on') || (['href', 'src', 'xlink:href'].includes(name) && value.startsWith('javascript:'))) {
                el.removeAttribute(attr.name);
            }
        });
    });
    return template.innerHTML;
}

function renderPreview() {
    openBookEl.innerHTML = '';
    const physicalCount = Math.max(1, Math.ceil(notes.length / 2));
    currentPhysicalPage = Math.min(currentPhysicalPage, physicalCount);
    previewPages = [];

    for (let index = 0; index < physicalCount; index++) {
        const leaf = document.createElement('div');
        leaf.className = 'page';
        const front = notes[index * 2];
        const back = notes[index * 2 + 1];
        leaf.innerHTML = `
            <div class="page-front">${sanitizedNoteHtml(front?.content)}</div>
            <div class="page-back">${sanitizedNoteHtml(back?.content)}</div>
        `;
        if (index < currentPhysicalPage) leaf.classList.add('flipped');
        openBookEl.appendChild(leaf);
        previewPages.push(leaf);
    }
    updatePreviewState();
}

function updatePreviewState() {
    previewPages.forEach((page, index) => {
        page.style.zIndex = page.classList.contains('flipped')
            ? String(index + 1)
            : String(previewPages.length - index);
    });
    prevPageBtn.disabled = currentPhysicalPage === 0;
    nextPageBtn.disabled = currentPhysicalPage >= previewPages.length;

    if (currentPhysicalPage === 0) {
        previewLabelEl.textContent = notes.length ? 'Page 1' : '';
    } else if (currentPhysicalPage >= previewPages.length) {
        previewLabelEl.textContent = `Page ${notes.length}`;
    } else {
        const left = currentPhysicalPage * 2;
        const right = left + 1;
        previewLabelEl.textContent = right <= notes.length ? `Pages ${left}–${right}` : `Page ${left}`;
    }
}

function refresh(focusIndex = null) {
    clearError();
    renderForms(focusIndex);
    renderPreview();
}

formsEl.addEventListener('input', (event) => {
    const textarea = event.target.closest('[data-note-index]');
    if (!textarea) return;
    notes[Number(textarea.dataset.noteIndex)].content = textarea.value;
    renderPreview();
});

formsEl.addEventListener('click', (event) => {
    const add = event.target.closest('[data-insert-at]');
    if (add) {
        const index = Number(add.dataset.insertAt);
        notes.splice(index, 0, { page: index + 1, content: '' });
        refresh(index);
        return;
    }

    const remove = event.target.closest('[data-remove-at]');
    if (remove && notes.length > 1) {
        notes.splice(Number(remove.dataset.removeAt), 1);
        refresh();
    }
});

prevPageBtn.addEventListener('click', () => {
    if (currentPhysicalPage <= 0) return;
    currentPhysicalPage -= 1;
    previewPages[currentPhysicalPage].classList.remove('flipped');
    updatePreviewState();
});

nextPageBtn.addEventListener('click', () => {
    if (currentPhysicalPage >= previewPages.length) return;
    previewPages[currentPhysicalPage].classList.add('flipped');
    currentPhysicalPage += 1;
    updatePreviewState();
});

document.addEventListener('keydown', (event) => {
    if (pasteDialogEl.open) return;
    if (event.key === 'ArrowLeft') prevPageBtn.click();
    if (event.key === 'ArrowRight') nextPageBtn.click();
});

function validateImportedNotes(value) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('Notes JSON must be a non-empty array.');
    }
    return value.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || typeof entry.content !== 'string') {
            throw new Error(`Page ${index + 1} must be an object with a string "content" field.`);
        }
        return { page: index + 1, content: entry.content };
    });
}

function loadJsonText(text) {
    notes = validateImportedNotes(JSON.parse(text));
    currentPhysicalPage = 0;
    refresh();
}

document.getElementById('paste-json-btn').addEventListener('click', () => {
    pasteErrorEl.classList.add('hidden');
    pasteInputEl.value = notesJson();
    pasteDialogEl.showModal();
    pasteInputEl.focus();
});

document.getElementById('load-pasted-json-btn').addEventListener('click', () => {
    try {
        loadJsonText(pasteInputEl.value);
        pasteDialogEl.close();
    } catch (error) {
        pasteErrorEl.textContent = error instanceof SyntaxError
            ? 'That is not valid JSON.'
            : error.message;
        pasteErrorEl.classList.remove('hidden');
    }
});

document.getElementById('upload-json-btn').addEventListener('click', () => fileInputEl.click());
fileInputEl.addEventListener('change', async () => {
    const file = fileInputEl.files?.[0];
    if (!file) return;
    try {
        loadJsonText(await file.text());
    } catch (error) {
        showError(error instanceof SyntaxError
            ? `"${file.name}" is not valid JSON.`
            : error.message);
    } finally {
        fileInputEl.value = '';
    }
});

copyBtn.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(notesJson());
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy JSON'; }, 1500);
    } catch {
        showError('Clipboard access was blocked. Use Download JSON instead.');
    }
});

document.getElementById('download-notes-btn').addEventListener('click', () => {
    const blob = new Blob([`${notesJson()}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'book_notes.json';
    link.click();
    URL.revokeObjectURL(url);
});

refresh();
