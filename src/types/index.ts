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
