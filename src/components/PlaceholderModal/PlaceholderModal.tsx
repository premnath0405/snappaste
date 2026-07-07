import React, { useEffect, useRef, useState } from 'react'
import './PlaceholderModal.css'

interface Props {
  tokens: string[]
  onConfirm: (values: Record<string, string>) => void
  onCancel: () => void
}

export function PlaceholderModal({ tokens, onConfirm, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(tokens.map((t) => [t, '']))
  )
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus first input on mount
  useEffect(() => {
    firstInputRef.current?.focus()
  }, [])

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  function handleChange(token: string, value: string) {
    setValues((prev) => ({ ...prev, [token]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onConfirm(values)
  }

  return (
    <div className="ph-backdrop" onClick={onCancel}>
      <div
        className="ph-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Fill placeholders"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="ph-title">Fill in placeholders</h2>
        <p className="ph-hint">
          <code>{'{{date}}'}</code> will be auto-filled with today's date.
        </p>
        <form onSubmit={handleSubmit}>
          {tokens.map((token, i) => (
            <div className="ph-field" key={token}>
              <label htmlFor={`ph-${token}`} className="ph-label">
                {token}
              </label>
              <input
                id={`ph-${token}`}
                ref={i === 0 ? firstInputRef : undefined}
                className="ph-input"
                type="text"
                value={values[token]}
                onChange={(e) => handleChange(token, e.target.value)}
                placeholder={`Enter ${token}…`}
              />
            </div>
          ))}
          <div className="ph-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
