import browser from 'webextension-polyfill'
import type { Category, Snippet } from '../types'

const CATEGORIES_KEY = 'categories'
const SNIPPETS_KEY = 'snippets'

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories(): Promise<Category[]> {
  const result = await browser.storage.local.get(CATEGORIES_KEY)
  return (result[CATEGORIES_KEY] as Category[]) ?? []
}

export async function saveCategory(
  data: Omit<Category, 'id'>
): Promise<Category> {
  const categories = await getCategories()
  const category: Category = { id: crypto.randomUUID(), ...data }
  await browser.storage.local.set({ [CATEGORIES_KEY]: [...categories, category] })
  return category
}

export async function updateCategory(
  id: string,
  patch: Partial<Omit<Category, 'id'>>
): Promise<Category> {
  const categories = await getCategories()
  const updated = categories.map((c) => (c.id === id ? { ...c, ...patch } : c))
  await browser.storage.local.set({ [CATEGORIES_KEY]: updated })
  const found = updated.find((c) => c.id === id)
  if (!found) throw new Error(`Category ${id} not found`)
  return found
}

export async function deleteCategory(id: string): Promise<void> {
  const [categories, snippets] = await Promise.all([getCategories(), getSnippets()])

  // Remove the category
  const updatedCategories = categories.filter((c) => c.id !== id)

  // Remove this categoryId from all snippets
  const updatedSnippets = snippets.map((s) => ({
    ...s,
    categoryIds: s.categoryIds.filter((cid) => cid !== id),
  }))

  await browser.storage.local.set({
    [CATEGORIES_KEY]: updatedCategories,
    [SNIPPETS_KEY]: updatedSnippets,
  })
}

// ─── Snippets ─────────────────────────────────────────────────────────────────

export async function getSnippets(): Promise<Snippet[]> {
  const result = await browser.storage.local.get(SNIPPETS_KEY)
  return (result[SNIPPETS_KEY] as Snippet[]) ?? []
}

export async function saveSnippet(
  data: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>
): Promise<Snippet> {
  const snippets = await getSnippets()
  const now = Date.now()
  const snippet: Snippet = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...data,
  }
  await browser.storage.local.set({ [SNIPPETS_KEY]: [...snippets, snippet] })
  return snippet
}

export async function updateSnippet(
  id: string,
  patch: Partial<Omit<Snippet, 'id' | 'createdAt'>>
): Promise<Snippet> {
  const snippets = await getSnippets()
  const updated = snippets.map((s) =>
    s.id === id ? { ...s, ...patch, updatedAt: Date.now() } : s
  )
  await browser.storage.local.set({ [SNIPPETS_KEY]: updated })
  const found = updated.find((s) => s.id === id)
  if (!found) throw new Error(`Snippet ${id} not found`)
  return found
}

export async function deleteSnippet(id: string): Promise<void> {
  const snippets = await getSnippets()
  await browser.storage.local.set({
    [SNIPPETS_KEY]: snippets.filter((s) => s.id !== id),
  })
}

export async function saveSnippetOrder(ordered: Snippet[]): Promise<void> {
  await browser.storage.local.set({ [SNIPPETS_KEY]: ordered })
}

// ─── Bulk Import ──────────────────────────────────────────────────────────────

/**
 * Merges imported categories and snippets into existing storage.
 * Items with the same `id` are skipped (no overwrite) to avoid duplicates.
 */
export async function importData(
  importedCategories: Category[],
  importedSnippets: Snippet[]
): Promise<{ addedCategories: number; addedSnippets: number }> {
  const [existingCats, existingSnips] = await Promise.all([
    getCategories(),
    getSnippets(),
  ])

  const existingCatIds = new Set(existingCats.map((c) => c.id))
  const existingSnipIds = new Set(existingSnips.map((s) => s.id))

  const newCats = importedCategories.filter((c) => !existingCatIds.has(c.id))
  const newSnips = importedSnippets.filter((s) => !existingSnipIds.has(s.id))

  await browser.storage.local.set({
    [CATEGORIES_KEY]: [...existingCats, ...newCats],
    [SNIPPETS_KEY]: [...existingSnips, ...newSnips],
  })

  return { addedCategories: newCats.length, addedSnippets: newSnips.length }
}
