# ⚡ SnapPaste

> Snap your snippets, paste them instantly — a Chrome / Edge browser extension for managing reusable text templates.

---

## What is SnapPaste?

SnapPaste is a browser extension that lets you store frequently used text snippets and copy them to the clipboard in one click. No more retyping the same responses, greetings, or templates — just snap and paste.

---

## Features

| Feature | Description |
|---|---|
| **Quick Copy** | Click any snippet in the popup to copy it instantly |
| **Side Panel** | Full management panel docked to the browser — always accessible |
| **Categories** | Organise snippets with colour-coded category tags |
| **Placeholders** | Use `{{name}}`, `{{company}}` etc. — a modal prompts you to fill them before copying |
| **Auto Date** | `{{date}}` is always replaced automatically with today's date (YYYY-MM-DD) |
| **Drag to Reorder** | Drag snippets up or down to set your preferred order |
| **Export & File Sync** | Export snippets to a `.json` file — the file auto-syncs on every change |
| **Import** | Import a `.json` backup to restore or share snippets |
| **Search** | Filter snippets by title or body text in real time |
| **Dark Mode** | Automatically follows your OS dark/light mode preference |

---

## How to Install (Developer Mode)

> No store listing yet — install manually from the built `dist` folder.

### Prerequisites
- [Node.js](https://nodejs.org) v18 or later
- Chrome or Microsoft Edge browser

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/premnath0405/snappaste.git
cd snappaste
```

**2. Install dependencies**
```bash
npm install
```

**3. Build the extension**
```bash
npm run build
```
This creates a `dist/` folder — that is the extension.

**4. Load in Chrome / Edge**
1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode** (toggle, top-right in Chrome / bottom-left in Edge)
3. Click **Load unpacked**
4. Select the **`dist`** folder inside the project
5. SnapPaste appears in your toolbar ✅

---

## How to Use

### Popup (Quick Access)
- Click the **⚡ SnapPaste** icon in your toolbar
- **Click any card** to copy the snippet instantly
- Use the **search bar** to filter snippets
- Filter by **category** using the chips below the search bar
- **Drag** the grip handle `⠿` on any card to reorder
- Click **Manage** to open the full Side Panel

### Side Panel (Full Management)
- Click the **snippet title or preview text** to copy
- A **✓ Copied!** badge appears next to the title for 1.5 seconds
- Click **Edit** to modify a snippet
- Click **Delete** to remove a snippet
- Click **+ New** to create a new snippet
- Click **⚙** to manage categories
- **Drag** the `⠿` handle to reorder snippets

### Export & Auto-Sync
- Click **⬆️** to export — a file picker opens so you choose where to save
- Once a file is chosen, every future change **auto-saves** to that file
- The file handle is remembered across panel close/reopen

### Import
- Click **⬇️** to import — pick a previously exported `.json` file
- Existing snippets are not overwritten (merge by ID)

---

## Placeholders

Use `{{token}}` syntax in your snippet body to create dynamic templates.

**Example snippet body:**
```
Hi {{name}},

Thank you for reaching out to {{company}}.
Your request has been received on {{date}}.

Best regards
```

When you copy this snippet, a modal appears asking you to fill in `name` and `company`. `{{date}}` is filled in automatically.

---

## Export File Format

Exports are plain `.json` files with this structure:

```json
{
  "version": 1,
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "categories": [
    { "id": "abc123", "name": "Support", "color": "#3b82d4" }
  ],
  "snippets": [
    {
      "id": "xyz789",
      "title": "Initial Response",
      "body": "Hi {{name}}, thank you for contacting us.",
      "categoryIds": ["abc123"],
      "createdAt": 1700000000000,
      "updatedAt": 1700000000000
    }
  ]
}
```

---

## Project Structure

```
snappaste/
├── public/
│   ├── manifest.json        # Chrome extension manifest (MV3)
│   └── icons/               # Extension icons
├── src/
│   ├── popup/               # Toolbar popup UI
│   ├── sidepanel/           # Side panel UI
│   ├── components/
│   │   └── PlaceholderModal # Modal for filling {{placeholders}}
│   ├── services/
│   │   └── storageService   # All chrome.storage.local operations
│   ├── utils/
│   │   ├── clipboard.ts     # Copy to clipboard
│   │   ├── exportImport.ts  # File System Access API export/import
│   │   └── placeholder.ts   # {{token}} extraction and filling
│   ├── styles/
│   │   └── tokens.css       # Design tokens and shared styles
│   └── types/
│       └── index.ts         # TypeScript interfaces (Snippet, Category)
├── popup/index.html
├── sidepanel/index.html
└── vite.config.ts
```

---

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | UI components |
| TypeScript | Type safety |
| Vite + vite-plugin-web-extension | Build & extension bundling |
| Chrome Extension Manifest V3 | Extension platform |
| File System Access API | Export with location picker + auto-sync |
| chrome.storage.local | Persistent snippet storage |

---

## Development

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Lint
npm run lint
```

After any code change, run `npm run build` and click the **🔄 reload** button on `chrome://extensions`.

---

## License

MIT — free to use, modify, and distribute.
