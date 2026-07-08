import React, { useCallback, useEffect, useRef, useState } from 'react'
import browser from 'webextension-polyfill'
import type { AppSettings, Category, Snippet } from '../types'
import {
  getCategories,
  getSnippets,
  saveSnippet,
  updateSnippet,
  deleteSnippet,
  saveSnippetOrder,
  saveCategory,
  updateCategory,
  deleteCategory,
  importData,
  getSettings,
  saveSettings,
  getLastSync,
  saveLastSync,
} from '../services/storageService'
import type { LastSyncInfo } from '../services/storageService'
import { extractPlaceholders, fillPlaceholders } from '../utils/placeholder'
import { copyText } from '../utils/clipboard'
import { PlaceholderModal } from '../components/PlaceholderModal'
import {
  exportWithPicker,
  importWithPicker,
  autoSyncToFile,
  getSyncFileHandle,
} from '../utils/exportImport'
import './sidepanel.css'

type View = 'list' | 'edit'

// ─── Apply theme to <html> ─────────────────────────────────────────────────────

function applyTheme(theme: AppSettings['theme']) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark')
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light')
  } else {
    root.removeAttribute('data-theme')
  }
}

// ─── Format last sync timestamp ───────────────────────────────────────────────

function formatSyncTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [view, setView] = useState<View>('list')
  const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null)
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [showCategoryManager, setShowCategoryManager] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  // Settings
  const [settings, setSettings] = useState<AppSettings>({ theme: 'system', iconClick: 'popup' })
  const [lastSync, setLastSync] = useState<LastSyncInfo | null>(null)

  // Placeholder modal state
  const [pendingSnippet, setPendingSnippet] = useState<Snippet | null>(null)
  const [pendingTokens, setPendingTokens] = useState<string[]>([])

  // Sync file handle — kept in a ref so the storage listener always sees latest
  const syncHandleRef = useRef<FileSystemFileHandle | null>(null)

  const loadData = useCallback(async () => {
    const [cats, snips] = await Promise.all([getCategories(), getSnippets()])
    setCategories(cats)
    setSnippets(snips)
    return { cats, snips }
  }, [])

  // On mount: restore persisted file handle, load settings, load last sync
  useEffect(() => {
    getSyncFileHandle().then((h) => {
      syncHandleRef.current = h
    })
    getSettings().then((s) => {
      setSettings(s)
      applyTheme(s.theme)
    })
    getLastSync().then(setLastSync)
  }, [])

  // On every storage change: reload data then auto-sync to file if handle exists
  useEffect(() => {
    void loadData()
    const listener = () => {
      void (async () => {
        const { cats, snips } = await loadData()
        if (syncHandleRef.current) {
          try {
            await autoSyncToFile(syncHandleRef.current, cats, snips)
            const info: LastSyncInfo = {
              timestamp: Date.now(),
              fileName: syncHandleRef.current.name,
            }
            await saveLastSync(info)
            setLastSync(info)
          } catch {
            // Permission revoked — clear the handle so we don't keep failing silently
            syncHandleRef.current = null
          }
        }
      })()
    }
    browser.storage.onChanged.addListener(listener)
    return () => browser.storage.onChanged.removeListener(listener)
  }, [loadData])

  const filteredSnippets = snippets.filter((s) => {
    const matchesSearch =
      search === '' ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.body.toLowerCase().includes(search.toLowerCase())
    const matchesCategory =
      activeCategoryId === null || s.categoryIds.includes(activeCategoryId)
    return matchesSearch && matchesCategory
  })

  function getCategoriesForSnippet(snippet: Snippet): Category[] {
    return snippet.categoryIds
      .map((id) => categories.find((c) => c.id === id))
      .filter(Boolean) as Category[]
  }

  const [importExportMsg, setImportExportMsg] = useState<string | null>(null)

  function showMsg(msg: string, duration = 3000) {
    setImportExportMsg(msg)
    setTimeout(() => setImportExportMsg(null), duration)
  }

  // ⬆️ Export — pick save location, write file, register handle for auto-sync
  async function handleExport() {
    try {
      const handle = await exportWithPicker(categories, snippets)
      syncHandleRef.current = handle
      const info: LastSyncInfo = {
        timestamp: Date.now(),
        fileName: handle.name,
      }
      await saveLastSync(info)
      setLastSync(info)
      showMsg(`Saved & syncing ${snippets.length} snippet${snippets.length !== 1 ? 's' : ''}`)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return // user cancelled
      showMsg(err instanceof Error ? err.message : 'Export failed')
    }
  }

  // ⬇️ Import — pick a file, merge into storage
  async function handleImport() {
    try {
      const data = await importWithPicker()
      const result = await importData(data.categories, data.snippets)
      await loadData()
      showMsg(`Imported ${result.addedSnippets} snippet${result.addedSnippets !== 1 ? 's' : ''} and ${result.addedCategories} categor${result.addedCategories !== 1 ? 'ies' : 'y'}`)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return // user cancelled
      showMsg(err instanceof Error ? err.message : 'Import failed')
    }
  }

  function openNew() {
    setEditingSnippet(null)
    setView('edit')
  }

  function openEdit(snippet: Snippet) {
    setEditingSnippet(snippet)
    setView('edit')
  }

  async function handleSave(data: { title: string; body: string; categoryIds: string[] }) {
    if (editingSnippet) {
      await updateSnippet(editingSnippet.id, data)
    } else {
      await saveSnippet(data)
    }
    await loadData()
    setView('list')
  }

  async function handleDelete(id: string) {
    await deleteSnippet(id)
    await loadData()
  }

  const dragIdRef = useRef<string | null>(null)

  function handleDragStart(id: string) {
    dragIdRef.current = id
  }

  async function handleDrop(targetId: string) {
    setDragOverId(null)
    const fromId = dragIdRef.current
    dragIdRef.current = null
    if (!fromId || fromId === targetId) return
    const reordered = [...snippets]
    const fromIdx = reordered.findIndex((s) => s.id === fromId)
    const toIdx = reordered.findIndex((s) => s.id === targetId)
    if (fromIdx === -1 || toIdx === -1) return
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    await saveSnippetOrder(reordered)
    await loadData()
  }

  function initiateCopy(snippet: Snippet) {
    const tokens = extractPlaceholders(snippet.body)
    if (tokens.length > 0) {
      setPendingSnippet(snippet)
      setPendingTokens(tokens)
    } else {
      void performCopy(snippet.body, {}, snippet.id)
    }
  }

  async function performCopy(
    body: string,
    values: Record<string, string>,
    snippetId: string
  ) {
    const filled = fillPlaceholders(body, values)
    await copyText(filled)
    setCopiedId(snippetId)
    setTimeout(() => setCopiedId((prev) => (prev === snippetId ? null : prev)), 1500)
  }

  function handleModalConfirm(values: Record<string, string>) {
    if (!pendingSnippet) return
    void performCopy(pendingSnippet.body, values, pendingSnippet.id)
    setPendingSnippet(null)
    setPendingTokens([])
  }

  function handleModalCancel() {
    setPendingSnippet(null)
    setPendingTokens([])
  }

  async function handleSettingsChange(patch: Partial<AppSettings>) {
    const updated = await saveSettings(patch)
    setSettings(updated)
    applyTheme(updated.theme)
    // Tell the background worker to update the action popup binding immediately
    if (patch.iconClick !== undefined) {
      void browser.runtime.sendMessage({ type: 'SET_ICON_CLICK', value: updated.iconClick })
    }
  }

  if (view === 'edit') {
    return (
      <SnippetEditor
        snippet={editingSnippet}
        categories={categories}
        onSave={handleSave}
        onCancel={() => setView('list')}
      />
    )
  }

  return (
    <div className="sp-root">
      {/* Header */}
      <header className="sp-header">
        <div className="sp-header-left">
          <button
            className="btn btn-icon"
            title="Export snippets — pick a file location, then auto-syncs on every change"
            onClick={() => void handleExport()}
          >
            ⬆️
          </button>
          <button
            className="btn btn-icon"
            title="Import snippets from a JSON file"
            onClick={() => void handleImport()}
          >
            ⬇️
          </button>
        </div>
        <div className="sp-header-actions">
          <button
            className="btn btn-icon btn-icon--lg"
            title="Manage categories"
            onClick={() => setShowCategoryManager(true)}
          >
            ⚙
          </button>
          <button
            className="btn btn-icon btn-icon--lg"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            ☰
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>
            + New
          </button>
        </div>
      </header>

      {/* Import/Export toast */}
      {importExportMsg && (
        <div className="sp-toast">{importExportMsg}</div>
      )}

      {/* Search */}
      <div className="sp-search">
        <input
          className="input"
          type="search"
          placeholder="Search snippets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="sp-categories">
          <button
            className={`cat-chip ${activeCategoryId === null ? 'cat-chip--active' : ''}`}
            onClick={() => setActiveCategoryId(null)}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`cat-chip ${activeCategoryId === cat.id ? 'cat-chip--active' : ''}`}
              style={
                activeCategoryId === cat.id
                  ? { background: cat.color, color: '#fff', borderColor: cat.color }
                  : { borderColor: cat.color, color: cat.color }
              }
              onClick={() =>
                setActiveCategoryId((prev) => (prev === cat.id ? null : cat.id))
              }
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Snippet List */}
      <div className="sp-list">
        {filteredSnippets.length === 0 ? (
          <div className="sp-empty">
            {snippets.length === 0
              ? 'No snippets yet — click "+ New" to add your first one.'
              : 'No snippets match your search.'}
          </div>
        ) : (
          filteredSnippets.map((snippet) => {
            const cats = getCategoriesForSnippet(snippet)
            return (
              <div
                key={snippet.id}
                className={`sp-card ${copiedId === snippet.id ? 'sp-card--copied' : ''} ${dragOverId === snippet.id ? 'sp-card--drag-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(snippet.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverId(snippet.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => void handleDrop(snippet.id)}
              >
                <div className="sp-card-top">
                  <span className="sp-drag-handle" title="Drag to reorder">⠿</span>
                  <span
                    className="sp-card-title sp-card-title--clickable"
                    onClick={() => initiateCopy(snippet)}
                    title="Click to copy"
                  >
                    {snippet.title}
                  </span>
                  {/* Category badges — between title and Edit button */}
                  {cats.length > 0 && (
                    <div className="sp-card-badges sp-card-badges--inline">
                      {cats.map((cat) => (
                        <span
                          key={cat.id}
                          className="category-badge"
                          style={{ background: cat.color }}
                        >
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {copiedId === snippet.id && (
                    <span className="sp-card-copied-badge">✓ Copied!</span>
                  )}
                  <div className="sp-card-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => openEdit(snippet)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => void handleDelete(snippet.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p
                  className="sp-card-preview sp-card-preview--clickable"
                  onClick={() => initiateCopy(snippet)}
                  title="Click to copy"
                >
                  {snippet.body.slice(0, 120)}{snippet.body.length > 120 ? '…' : ''}
                </p>
              </div>
            )
          })
        )}
      </div>

      {/* Category Manager Modal */}
      {showCategoryManager && (
        <CategoryManager
          categories={categories}
          onClose={() => { setShowCategoryManager(false); void loadData() }}
          onSave={saveCategory}
          onUpdate={updateCategory}
          onDelete={deleteCategory}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          settings={settings}
          lastSync={lastSync}
          onClose={() => setShowSettings(false)}
          onChange={handleSettingsChange}
        />
      )}

      {/* Placeholder Modal */}
      {pendingSnippet && (
        <PlaceholderModal
          tokens={pendingTokens}
          onConfirm={handleModalConfirm}
          onCancel={handleModalCancel}
        />
      )}

    </div>
  )
}

// ─── Snippet Editor ────────────────────────────────────────────────────────────

interface EditorProps {
  snippet: Snippet | null
  categories: Category[]
  onSave: (data: { title: string; body: string; categoryIds: string[] }) => Promise<void>
  onCancel: () => void
}

function SnippetEditor({ snippet, categories, onSave, onCancel }: EditorProps) {
  const [title, setTitle] = useState(snippet?.title ?? '')
  const [body, setBody] = useState(snippet?.body ?? '')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    snippet?.categoryIds ?? []
  )
  const [saving, setSaving] = useState(false)
  const [editorTab, setEditorTab] = useState<'write' | 'preview'>('write')

  // Track desired caret position so we can restore it after React re-renders the textarea
  const caretPosRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // After every body state update, restore caret if we have a pending position
  useEffect(() => {
    if (caretPosRef.current !== null && textareaRef.current) {
      textareaRef.current.selectionStart = caretPosRef.current
      textareaRef.current.selectionEnd = caretPosRef.current
      caretPosRef.current = null
    }
  })

  function toggleCategory(id: string) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    await onSave({ title: title.trim(), body, categoryIds: selectedCategoryIds })
    setSaving(false)
  }

  /** Strip rich text on paste — insert plain text only at caret position */
  function handleBodyPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    e.preventDefault()
    const plain = e.clipboardData.getData('text/plain')
    const textarea = e.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newVal = body.slice(0, start) + plain + body.slice(end)
    caretPosRef.current = start + plain.length
    setBody(newVal)
  }

  /**
   * Wrap the currently selected text with a marker (e.g. ** for bold).
   * If the selection is already wrapped, remove the markers (toggle off).
   */
  function wrapSelection(marker: string) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selected = body.slice(start, end)
    const before = body.slice(0, start)
    const after = body.slice(end)
    const mLen = marker.length

    // Toggle off if already wrapped
    if (
      before.endsWith(marker) && after.startsWith(marker)
    ) {
      const newVal = before.slice(0, before.length - mLen) + selected + after.slice(mLen)
      caretPosRef.current = start - mLen + selected.length
      setBody(newVal)
      return
    }

    // Wrap
    const newVal = before + marker + selected + marker + after
    // Place cursor after closing marker, or select the wrapped text
    caretPosRef.current = end + mLen * 2
    setBody(newVal)
  }

  /** Render markdown-like syntax to HTML for the preview pane */
  function renderPreview(text: string): string {
    return text
      // Bold: **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      // Italic: *text* or _text_
      .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
      .replace(/_([^_\n]+?)_/g, '<em>$1</em>')
      // Underline: ~text~
      .replace(/~(.+?)~/g, '<u>$1</u>')
      // Escape HTML special chars first (do this before other replacements ideally — safe enough here)
      // Line breaks
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="sp-root">
      <header className="sp-header">
        <span className="sp-logo">{snippet ? 'Edit Snippet' : 'New Snippet'}</span>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          ← Back
        </button>
      </header>

      <form className="sp-editor" onSubmit={(e) => void handleSubmit(e)}>
        <div className="sp-field">
          <label className="sp-label" htmlFor="snippet-title">Title</label>
          <input
            id="snippet-title"
            className="input"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Follow-up email"
            required
            autoFocus
          />
        </div>

        <div className="sp-field">
          <label className="sp-label">Categories</label>
          <div className="sp-cat-picker">
            {categories.length === 0 ? (
              <span className="sp-cat-empty">No categories yet — add them via ⚙</span>
            ) : (
              categories.map((cat) => (
                <label key={cat.id} className="sp-cat-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                  />
                  <span
                    className="sp-cat-label-text"
                    style={{ borderLeft: `3px solid ${cat.color}`, paddingLeft: '6px' }}
                  >
                    {cat.name}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="sp-field sp-field--grow">
          {/* Label row */}
          <div className="sp-body-header">
            <label className="sp-label" htmlFor="snippet-body">
              Body
              <span className="sp-hint"> — use {'{{name}}'}, {'{{date}}'} for placeholders</span>
            </label>
            {/* Write / Preview tabs */}
            <div className="sp-editor-tabs">
              <button
                type="button"
                className={`sp-tab ${editorTab === 'write' ? 'sp-tab--active' : ''}`}
                onClick={() => setEditorTab('write')}
              >
                Write
              </button>
              <button
                type="button"
                className={`sp-tab ${editorTab === 'preview' ? 'sp-tab--active' : ''}`}
                onClick={() => setEditorTab('preview')}
              >
                Preview
              </button>
            </div>
          </div>

          {editorTab === 'write' && (
            <>
              {/* Formatting toolbar */}
              <div className="sp-fmt-toolbar">
                <button
                  type="button"
                  className="sp-fmt-btn"
                  title="Bold (Ctrl+B) — wraps selection with **"
                  onMouseDown={(e) => { e.preventDefault(); wrapSelection('**') }}
                >
                  <strong>B</strong>
                </button>
                <button
                  type="button"
                  className="sp-fmt-btn"
                  title="Italic (Ctrl+I) — wraps selection with *"
                  onMouseDown={(e) => { e.preventDefault(); wrapSelection('*') }}
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  className="sp-fmt-btn"
                  title="Underline — wraps selection with ~"
                  onMouseDown={(e) => { e.preventDefault(); wrapSelection('~') }}
                >
                  <u>U</u>
                </button>
                <span className="sp-fmt-divider" />
                <span className="sp-fmt-hint">Select text then click a style</span>
              </div>

              <textarea
                id="snippet-body"
                ref={textareaRef}
                className="input sp-textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={handleBodyPaste}
                onKeyDown={(e) => {
                  // Keyboard shortcuts: Ctrl/Cmd + B / I / U
                  if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**') }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*') }
                  if ((e.ctrlKey || e.metaKey) && e.key === 'u') { e.preventDefault(); wrapSelection('~') }
                }}
                placeholder="Type your snippet here…"
                rows={12}
              />
            </>
          )}

          {editorTab === 'preview' && (
            <div
              className="sp-preview-pane"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: renderPreview(body) || '<span class="sp-preview-empty">Nothing to preview yet…</span>' }}
            />
          )}
        </div>

        <div className="sp-editor-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : snippet ? 'Save Changes' : 'Create Snippet'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Settings Panel ────────────────────────────────────────────────────────────

interface SettingsPanelProps {
  settings: AppSettings
  lastSync: LastSyncInfo | null
  onClose: () => void
  onChange: (patch: Partial<AppSettings>) => Promise<void>
}

function SettingsPanel({ settings, lastSync, onClose, onChange }: SettingsPanelProps) {
  return (
    <div className="ph-backdrop" onClick={onClose}>
      <div
        className="ph-modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="ph-title">Settings</h2>

        {/* Theme */}
        <div className="settings-section">
          <label className="settings-label">Theme</label>
          <div className="settings-radio-group">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <label key={t} className="settings-radio">
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={settings.theme === t}
                  onChange={() => void onChange({ theme: t })}
                />
                {t === 'system' ? 'System default' : t.charAt(0).toUpperCase() + t.slice(1)}
              </label>
            ))}
          </div>
        </div>

        {/* Icon click behaviour */}
        <div className="settings-section">
          <label className="settings-label">When clicking the extension icon</label>
          <div className="settings-radio-group">
            <label className="settings-radio">
              <input
                type="radio"
                name="iconClick"
                value="popup"
                checked={settings.iconClick === 'popup'}
                onChange={() => void onChange({ iconClick: 'popup' })}
              />
              Open popup
            </label>
            <label className="settings-radio">
              <input
                type="radio"
                name="iconClick"
                value="sidepanel"
                checked={settings.iconClick === 'sidepanel'}
                onChange={() => void onChange({ iconClick: 'sidepanel' })}
              />
              Open side panel
            </label>
          </div>
        </div>

        {/* Last sync */}
        <div className="settings-section">
          <label className="settings-label">Backup sync</label>
          {lastSync ? (
            <div className="settings-sync-info">
              <div className="settings-sync-row">
                <span className="settings-sync-key">Last synced</span>
                <span className="settings-sync-val">{formatSyncTime(lastSync.timestamp)}</span>
              </div>
              <div className="settings-sync-row">
                <span className="settings-sync-key">File</span>
                <span className="settings-sync-val settings-sync-file" title={lastSync.fileName}>
                  {lastSync.fileName}
                </span>
              </div>
            </div>
          ) : (
            <p className="settings-hint">No backup file linked yet. Use ⬆️ Export to set one up.</p>
          )}
        </div>

        <div className="ph-actions" style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ─── Category Manager ──────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#3b82d4', '#7c5cd8', '#16a34a', '#d97706',
  '#d73a3a', '#0891b2', '#9333ea', '#15803d',
]

interface CategoryManagerProps {
  categories: Category[]
  onClose: () => void
  onSave: (data: Omit<Category, 'id'>) => Promise<Category>
  onUpdate: (id: string, patch: Partial<Omit<Category, 'id'>>) => Promise<Category>
  onDelete: (id: string) => Promise<void>
}

function CategoryManager({ categories, onClose, onSave, onUpdate, onDelete }: CategoryManagerProps) {
  const [localCats, setLocalCats] = useState<Category[]>(categories)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const cat = await onSave({ name: newName.trim(), color: newColor })
    setLocalCats((prev) => [...prev, cat])
    setNewName('')
  }

  async function handleUpdate(id: string) {
    const updated = await onUpdate(id, { name: editName, color: editColor })
    setLocalCats((prev) => prev.map((c) => (c.id === id ? updated : c)))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    await onDelete(id)
    setLocalCats((prev) => prev.filter((c) => c.id !== id))
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.color)
  }

  return (
    <div className="ph-backdrop" onClick={onClose}>
      <div
        className="ph-modal catmgr"
        role="dialog"
        aria-modal="true"
        aria-label="Manage categories"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="ph-title">Categories</h2>

        {/* Existing categories */}
        <div className="catmgr-list">
          {localCats.length === 0 && (
            <p className="sp-cat-empty">No categories yet.</p>
          )}
          {localCats.map((cat) =>
            editingId === cat.id ? (
              <div key={cat.id} className="catmgr-row catmgr-row--edit">
                <input
                  className="input catmgr-name-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <div className="catmgr-colors">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot ${editColor === c ? 'color-dot--active' : ''}`}
                      style={{ background: c }}
                      onClick={() => setEditColor(c)}
                    />
                  ))}
                </div>
                <div className="catmgr-row-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => void handleUpdate(cat.id)}>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div key={cat.id} className="catmgr-row">
                <span className="category-badge" style={{ background: cat.color }}>{cat.name}</span>
                <div className="catmgr-row-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(cat)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => void handleDelete(cat.id)}>Delete</button>
                </div>
              </div>
            )
          )}
        </div>

        {/* Add new */}
        <form className="catmgr-add" onSubmit={(e) => void handleAdd(e)}>
          <input
            className="input catmgr-name-input"
            placeholder="New category name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <div className="catmgr-colors">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-dot ${newColor === c ? 'color-dot--active' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <button type="submit" className="btn btn-primary btn-sm">Add</button>
        </form>

        <div className="ph-actions" style={{ marginTop: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
