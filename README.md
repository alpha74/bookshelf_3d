<img width="800" height="380" alt="image" src="https://github.com/user-attachments/assets/f90c94bb-3a6f-4d91-a20a-943178a1cad3" />

# 3D Interactive Bookshelf

A beautiful, interactive 3D bookshelf built with HTML, CSS, JavaScript, and Three.js. Browse your book collection, inspect books in 3D, and read notes with elegant page-flip animations.

## Features

- **3D Book Visualization**: Hardcover book models with cover art, spines, and realistic shadows
- **Interactive Shelf**: Browse books horizontally with smooth scrolling and tag-based filtering
- **3D Inspection Mode**: Click any book to rotate it in 3D space with OrbitControls
- **Desk Lamp**: Toggle a warm spotlight that illuminates the book cover
- **Page-Flip Notes**: Read book notes with smooth page-turn animations
- **Dark/Light Theme**: Toggle between dark and light color schemes
- **External Catalog Support**: Load books from Google Drive, GitHub, or any JSON API
- **Lazy Loading**: Cover images load only when books are opened, not on the shelf

## Project Structure

```
book_3d/
├── index.html              # Main HTML structure
├── style.css               # Styling (dark/light themes)
├── main.js                 # Core logic (Three.js, interactions)
├── books.json              # Local book catalog
├── books_external.json     # External source configuration (optional)
├── notes.json              # Book notes for reading interface
├── .claude/
│   └── launch.json         # Dev server configuration
└── README.md               # This file
```

## Setup

### Option 1: Node.js (Recommended)

**Prerequisites**: Node.js 14+ installed

```bash
cd book_3d
npx serve -l 5173 .
```

Then open **http://localhost:5173** in your browser.

### Option 2: Python 3

**Prerequisites**: Python 3.x installed

```bash
cd book_3d
python -m http.server 5173
```

Then open **http://localhost:5173** in your browser.

### Option 3: Python 2 (Legacy)

```bash
cd book_3d
python -m SimpleHTTPServer 5173
```

Then open **http://localhost:5173** in your browser.

## Configuration

### Local vs. External Books

By default, the app loads books from `books.json` (50 local books included).

To load from an external source (Google Drive, GitHub, etc.):

1. Edit `books_external.json`:
   ```json
   {
     "source": "Google Drive",
     "link": "https://your-json-url-here"
   }
   ```

2. The JSON must be a valid array of book objects matching this shape:
   ```json
   [
     {
       "id": "book1",
       "title": "Book Title",
       "author": "Author Name",
       "isbn": "9780123456789",
       "tags": ["fiction", "fantasy"],
       "date_added": "2026-01-01T10:00:00Z",
       "pages": 320,
       "rating": 4.7,
       "color": "#7d2e46",
       "dimensions": { "width": 140, "height": 210 }
     }
   ]
   ```

**Note**: Google Drive often blocks CORS. Use GitHub Raw URLs or a JSON hosting service (jsonbin.io, etc.) for reliability.

If the external link fails, the app automatically falls back to `books.json`.

### Book Notes

Add reading notes in `notes.json`. Only books with note entries show an enabled "Read Notes" button:

```json
{
  "book1": [
    { "page": 1, "content": "<h2>Chapter 1</h2><p>Opening passage...</p>" },
    { "page": 2, "content": "<p>More notes...</p>" }
  ]
}
```

## Usage

### Shelf Navigation
- **Scroll horizontally** or use arrow buttons to browse books
- **Click tag buttons** to filter by genre
- **"Latest 10"** shows the 10 most recently added books
- **"All"** shows the complete catalog

### 3D Inspection
- **Click a book** to open the 3D viewer
- **Drag to rotate** around the book
- **Scroll to zoom** in/out
- **Toggle Lamp** to add warm lighting
- **"Read Notes"** opens the page-flip interface (if notes exist)
- **"Close"** returns to the shelf

### Reading Interface
- **Click "Read Notes"** to enter page-flip mode
- **Use arrow buttons** to turn pages
- **Click "Close Book"** to return to the 3D model

### Theme
- **Click the sun/moon icon** to toggle dark/light theme

## Development Notes

- **No build step required** — vanilla HTML/CSS/JS
- **Three.js** loaded from CDN (v0.160.0 via jsDelivr)
- **OrbitControls** for 3D camera interaction
- **localStorage** persists theme preference across sessions
- **Lamp state** is session-only (not persisted)
- **Cover images** fetched lazily from Open Library API

## Troubleshooting

**Books not showing?**
- Check browser console for errors
- Ensure `books.json` is in the root directory
- Clear `localStorage` and reload: `localStorage.clear(); location.reload()`

**External books not loading?**
- Verify the URL in `books_external.json` returns valid JSON
- Check CORS headers if using Google Drive (often blocked — use GitHub instead)
- Confirm the JSON array matches the expected structure

**Cover images not loading?**
- Open Library API may be slow; wait a moment for the spinner to finish
- Check your internet connection
- Fallback color will display if the image fails to load

**3D book looks wrong?**
- Try rotating with the mouse — perspective changes at different angles
- The lamp can help reveal details on dark covers

## License

This project is open source and available for personal and educational use.

## Author

Created with ❤️ for book lovers who appreciate beautiful design.
