import { useCallback, useEffect, useRef, useState } from 'react'
import browser from 'webextension-polyfill'
import type { Category, Snippet } from '../types'
import { getCategories, getSnippets, saveSnippetOrder } from '../services/storageService'
import { extractPlaceholders, fillPlaceholders } from '../utils/placeholder'
import { copyText } from '../utils/clipboard'
import { PlaceholderModal } from '../components/PlaceholderModal'
import './popup.css'

export function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Placeholder modal state
  const [pendingSnippet, setPendingSnippet] = useState<Snippet | null>(null)
  const [pendingTokens, setPendingTokens] = useState<string[]>([])

  const loadData = useCallback(async () => {
    const [cats, snips] = await Promise.all([getCategories(), getSnippets()])
    setCategories(cats)
    setSnippets(snips)
  }, [])

  useEffect(() => {
    void loadData()
    const listener = () => void loadData()
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

  function inititateCopy(snippet: Snippet) {
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
  }

  function openSidePanel() {
    // Open side panel — works in Chrome MV3
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.windowId != null) {
        // chrome.sidePanel is not in the polyfill types; cast to any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (browser as any).sidePanel?.open({ windowId: tab.windowId })
        window.close()
      }
    })
  }

  return (
    <div className="popup-root">
      {/* Header */}
      <header className="popup-header">
        <span className="popup-logo">⚡ SnapPaste</span>
        <button className="btn btn-ghost btn-sm" onClick={openSidePanel}>
          Manage
        </button>
      </header>

      {/* Search */}
      <div className="popup-search">
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
        <div className="popup-categories">
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
              style={activeCategoryId === cat.id ? { background: cat.color, color: '#fff', borderColor: cat.color } : { borderColor: cat.color, color: cat.color }}
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
      <div className="popup-list">
        {filteredSnippets.length === 0 ? (
          <div className="popup-empty">
            {snippets.length === 0
              ? 'No snippets yet — click Manage to add some.'
              : 'No snippets match your search.'}
          </div>
        ) : (
          filteredSnippets.map((snippet) => {
            const cats = getCategoriesForSnippet(snippet)
            return (
              <div
                key={snippet.id}
                className={`snippet-card snippet-card--clickable ${copiedId === snippet.id ? 'snippet-card--copied' : ''} ${dragOverId === snippet.id ? 'snippet-card--drag-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(snippet.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverId(snippet.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { e.stopPropagation(); void handleDrop(snippet.id) }}
                onClick={() => inititateCopy(snippet)}
                title="Click to copy"
              >
                <div className="snippet-card-top">
                  <span className="snippet-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="snippet-title">{snippet.title}</span>
                  <span className="snippet-copy-hint">
                    {copiedId === snippet.id ? '✓ Copied!' : 'Click to copy'}
                  </span>
                </div>
                {cats.length > 0 && (
                  <div className="snippet-badges">
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
                <p className="snippet-preview">{snippet.body.slice(0, 100)}{snippet.body.length > 100 ? '…' : ''}</p>
              </div>
            )
          })
        )}
      </div>

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
