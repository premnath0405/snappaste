/**
 * Background service worker for SnapPaste.
 *
 * Responsibilities:
 * - On startup: read the stored iconClick setting and apply the correct
 *   action binding (popup vs. side panel).
 * - Listen for SET_ICON_CLICK messages from the settings panel and update
 *   the binding live — no extension reload needed.
 * - When the popup is disabled (iconClick === 'sidepanel') handle
 *   chrome.action.onClicked to open the side panel.
 */

import browser from 'webextension-polyfill'

const POPUP_PATH = 'popup/index.html'

async function getIconClickSetting(): Promise<'popup' | 'sidepanel'> {
  const result = await browser.storage.local.get('settings')
  const settings = result['settings'] as { iconClick?: string } | undefined
  return settings?.iconClick === 'sidepanel' ? 'sidepanel' : 'popup'
}

async function applyIconClickBinding(mode: 'popup' | 'sidepanel') {
  if (mode === 'sidepanel') {
    // Remove the default popup so that action.onClicked fires instead
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (browser.action as any).setPopup({ popup: '' })
  } else {
    // Restore the popup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (browser.action as any).setPopup({ popup: POPUP_PATH })
  }
}

// ── On install / browser startup — apply stored setting ──────────────────────

browser.runtime.onInstalled.addListener(async () => {
  const mode = await getIconClickSetting()
  await applyIconClickBinding(mode)
})

browser.runtime.onStartup.addListener(async () => {
  const mode = await getIconClickSetting()
  await applyIconClickBinding(mode)
})

// ── Live updates from the Settings panel ─────────────────────────────────────

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as { type: string; value: string }
  if (msg.type === 'SET_ICON_CLICK') {
    const mode = msg.value === 'sidepanel' ? 'sidepanel' : 'popup'
    void applyIconClickBinding(mode)
  }
})

// ── When popup is disabled, open the side panel on icon click ─────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(browser.action as any).onClicked.addListener(async (tab: { windowId?: number; id?: number }) => {
  // Only fires when popup is empty (sidepanel mode)
  if (tab.windowId != null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (browser as any).sidePanel?.open({ windowId: tab.windowId })
  }
})
