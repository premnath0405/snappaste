import browser from 'webextension-polyfill'
import type { Category, Snippet } from '../types'

export interface ExportData {
  version: 1
  exportedAt: string
  categories: Category[]
  snippets: Snippet[]
}

// Key used to persist the FileSystemFileHandle in extension storage
const SYNC_FILE_KEY = 'syncFileHandle'

/**
 * Build the JSON payload from current data.
 */
function buildPayload(categories: Category[], snippets: Snippet[]): string {
  const payload: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    categories,
    snippets,
  }
  return JSON.stringify(payload, null, 2)
}

/**
 * Write JSON text to a FileSystemFileHandle.
 */
async function writeToHandle(
  handle: FileSystemFileHandle,
  json: string
): Promise<void> {
  const writable = await handle.createWritable()
  await writable.write(json)
  await writable.close()
}

/**
 * Persist the FileSystemFileHandle so it survives panel close/reopen.
 * Chrome allows storing handles in extension storage via IndexedDB-compatible objects.
 */
async function persistHandle(handle: FileSystemFileHandle): Promise<void> {
  await browser.storage.local.set({ [SYNC_FILE_KEY]: handle as unknown as Record<string, unknown> })
}

/**
 * Retrieve the previously saved FileSystemFileHandle, if any.
 * Returns null if none stored or the handle is no longer valid.
 */
export async function getSyncFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const result = await browser.storage.local.get(SYNC_FILE_KEY)
    const handle = result[SYNC_FILE_KEY] as FileSystemFileHandle | undefined
    if (!handle || typeof handle.createWritable !== 'function') return null
    return handle
  } catch {
    return null
  }
}

/**
 * Export: open a Save File picker, write data, and persist the handle for auto-sync.
 * Returns the handle so the caller can store it in state.
 */
export async function exportWithPicker(
  categories: Category[],
  snippets: Snippet[]
): Promise<FileSystemFileHandle> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = await (window as any).showSaveFilePicker({
    suggestedName: `snappaste-backup-${new Date().toISOString().slice(0, 10)}.json`,
    types: [
      {
        description: 'JSON backup',
        accept: { 'application/json': ['.json'] },
      },
    ],
  }) as FileSystemFileHandle
  await writeToHandle(handle, buildPayload(categories, snippets))
  await persistHandle(handle)
  return handle
}

/**
 * Auto-save to the already-chosen file handle (silent, no picker).
 */
export async function autoSyncToFile(
  handle: FileSystemFileHandle,
  categories: Category[],
  snippets: Snippet[]
): Promise<void> {
  await writeToHandle(handle, buildPayload(categories, snippets))
}

/**
 * Import: open a file picker, read and parse the selected JSON file.
 */
export async function importWithPicker(): Promise<ExportData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [handle] = await (window as any).showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: 'JSON backup',
        accept: { 'application/json': ['.json'] },
      },
    ],
  }) as FileSystemFileHandle[]
  const file = await handle.getFile()
  const text = await file.text()
  return parseImportFile(text)
}

/**
 * Parse and validate a JSON backup string.
 */
export function parseImportFile(jsonText: string): ExportData {
  const data = JSON.parse(jsonText) as ExportData
  if (data.version !== 1) throw new Error('Unsupported backup version')
  if (!Array.isArray(data.categories) || !Array.isArray(data.snippets)) {
    throw new Error('Invalid backup file format')
  }
  return data
}
