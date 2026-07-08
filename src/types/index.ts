export interface Category {
  id: string
  name: string
  color: string
}

export interface Snippet {
  id: string
  categoryIds: string[]
  title: string
  body: string
  createdAt: number
  updatedAt: number
}

export type ThemePreference = 'system' | 'light' | 'dark'
export type IconClickBehaviour = 'popup' | 'sidepanel'

export interface AppSettings {
  theme: ThemePreference
  iconClick: IconClickBehaviour
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  iconClick: 'popup',
}
