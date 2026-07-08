import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import browser from 'webextension-polyfill'
import type { Category, Snippet } from '../types'
import { getCategories, getSnippets, saveSnippetOrder } from '../services/storageService'
import { extractPlaceholders, fillPlaceholders } from '../utils/placeholder'
import { copyText } from '../utils/clipboard'
import { stripHtml } from '../utils/html'
import { PlaceholderModal } from '../components/PlaceholderModal'
import './popup.css'

interface PendingCopy {
  snippet: Snippet
  tokens: string[]
}

export function App() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [search, setSearch] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingCopy | null>(null)
  const dragIdRef = useRef<string | null>(null)

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

  // Memoised — recomputes only when snippets, search or activeCategoryId change
  const searchLower = useMemo(() => search.toLowerCase(), [search])
  const filteredSnippets = useMemo(() =>
    snippets.filter((s) => {
      if (activeCategoryId !== null && !s.categoryIds.includes(activeCategoryId)) return false
      if (searchLower === '') return true
      return (
        s.title.toLowerCase().includes(searchLower) ||
        stripHtml(s.body).toLowerCase().includes(searchLower)
      )
    }),
    [snippets, searchLower, activeCategoryId]
  )

  // Stable map for O(1) category lookups instead of repeated .find()
  const categoryMap = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  )

  const getCategoriesForSnippet = useCallback(
    (snippet: Snippet): Category[] =>
      snippet.categoryIds.map((id) => categoryMap.get(id)).filter(Boolean) as Category[],
    [categoryMap]
  )

  function initiateCopy(snippet: Snippet) {
    const tokens = extractPlaceholders(stripHtml(snippet.body))
    if (tokens.length > 0) {
      setPending({ snippet, tokens })
    } else {
      void performCopy(snippet.body, {}, snippet.id)
    }
  }

  async function performCopy(body: string, values: Record<string, string>, snippetId: string) {
    const filledHtml = fillPlaceholders(body, values)
    const plainText = stripHtml(filledHtml)
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([filledHtml], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        }),
      ])
    } catch {
      await copyText(plainText)
    }
    setCopiedId(snippetId)
    setTimeout(() => setCopiedId((prev) => (prev === snippetId ? null : prev)), 1500)
  }

  function handleModalConfirm(values: Record<string, string>) {
    if (!pending) return
    void performCopy(pending.snippet.body, values, pending.snippet.id)
    setPending(null)
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
    void browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab?.windowId != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        void (browser as any).sidePanel?.open({ windowId: tab.windowId })
        window.close()
      }
    })
  }

  return (
    <div className="popup-root">
      <header className="popup-header">
        <span className="popup-logo">⚡ SnapPaste</span>
        <button className="btn btn-ghost btn-sm" onClick={openSidePanel}>
          Manage
        </button>
      </header>

      <div className="popup-search">
        <input
          className="input"
          type="search"
          placeholder="Search snippets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
              style={
                activeCategoryId === cat.id
                  ? { background: cat.color, color: '#fff', borderColor: cat.color }
                  : { borderColor: cat.color, color: cat.color }
              }
              onClick={() => setActiveCategoryId((prev) => (prev === cat.id ? null : cat.id))}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

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
            const preview = stripHtml(snippet.body)
            return (
              <div
                key={snippet.id}
                className={[
                  'snippet-card snippet-card--clickable',
                  copiedId === snippet.id ? 'snippet-card--copied' : '',
                  dragOverId === snippet.id ? 'snippet-card--drag-over' : '',
                ].join(' ')}
                draggable
                onDragStart={() => { dragIdRef.current = snippet.id }}
                onDragOver={(e) => e.preventDefault()}
                onDragEnter={() => setDragOverId(snippet.id)}
                onDragLeave={() => setDragOverId(null)}
                onDrop={(e) => { e.stopPropagation(); void handleDrop(snippet.id) }}
                onClick={() => initiateCopy(snippet)}
                title="Click to copy"
              >
                <div className="snippet-card-top">
                  <span className="snippet-drag-handle" title="Drag to reorder">⠿</span>
                  <span className="snippet-title">{snippet.title}</span>
                  {cats.length > 0 && (
                    <div className="snippet-badges snippet-badges--inline">
                      {cats.map((cat) => (
                        <span key={cat.id} className="category-badge" style={{ background: cat.color }}>
                          {cat.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="snippet-copy-hint">
                    {copiedId === snippet.id ? '✓ Copied!' : 'Click to copy'}
                  </span>
                </div>
                <p className="snippet-preview">
                  {preview.slice(0, 100)}{preview.length > 100 ? '…' : ''}
                </p>
              </div>
            )
          })
        )}
      </div>

      {pending && (
        <PlaceholderModal
          tokens={pending.tokens}
          onConfirm={handleModalConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  )
}
