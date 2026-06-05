import { useEffect, useState } from 'react'
import usePipelineStore from '../store/pipelineStore'
import { TONE_COLORS } from '../App'

function CharBadge({ count }) {
  const color = count < 500 ? 'bg-green-100 text-green-700' : count < 800 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${color}`}>{count}</span>
}

function LockIcon({ locked }) {
  return (
    <span title={locked ? 'Manually edited — locked' : 'Auto-generated'} className="text-base cursor-default">
      {locked ? '🔒' : '🔓'}
    </span>
  )
}

function PromptCard({ prompt, onSave }) {
  const [text, setText] = useState(prompt.formatted_prompt)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setText(prompt.formatted_prompt)
    setDirty(false)
  }, [prompt.formatted_prompt])

  const handleSave = async () => {
    setSaving(true)
    await onSave(prompt.scene_id, text)
    setDirty(false)
    setSaving(false)
  }

  return (
    <div className={`bg-white border rounded-xl p-4 ${prompt.locked ? 'border-amber-300' : 'border-stone-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-stone-400">Scene {prompt.scene_id}</span>
          <LockIcon locked={prompt.locked} />
        </div>
        <CharBadge count={text.length} />
      </div>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true) }}
        className="w-full h-28 text-xs bg-stone-50 border border-stone-200 rounded-lg p-2 resize-none font-mono text-stone-700 focus:outline-none focus:border-stone-400"
      />
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-2 px-3 py-1 bg-amber-700 text-white text-xs rounded-lg hover:bg-amber-800 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Lock'}
        </button>
      )}
    </div>
  )
}

export default function Stage4_Prompts() {
  const formattedPrompts = usePipelineStore((s) => s.formattedPrompts)
  const setFormattedPrompts = usePipelineStore((s) => s.setFormattedPrompts)
  const updatePromptInStore = usePipelineStore((s) => s.updatePromptInStore)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const formatAll = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/format-prompts', { method: 'POST' })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Failed to format prompts')
      }
      const data = await res.json()
      setFormattedPrompts(data.formatted_prompts)
      setStageStatus(4, 'complete')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (scene_id, newText) => {
    try {
      const res = await fetch(`/api/update-prompt/${scene_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: newText }),
      })
      if (!res.ok) throw new Error('Save failed')
      updatePromptInStore(scene_id, newText)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 4 — Image Prompts</h2>
      <p className="text-stone-500 text-sm mb-6">
        Each scene's image prompt gets wrapped in the stick figure style template. Edit and lock any prompt before generation.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={formatAll}
          disabled={loading}
          className="px-5 py-2.5 bg-stone-800 text-white text-sm rounded-xl font-semibold hover:bg-stone-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Formatting...' : formattedPrompts.length > 0 ? 'Re-Format Unlocked Prompts' : 'Format All Prompts'}
        </button>
        {formattedPrompts.length > 0 && (
          <span className="text-xs text-stone-400">
            {formattedPrompts.filter((p) => p.locked).length} locked &middot; {formattedPrompts.length} total
          </span>
        )}
      </div>

      {formattedPrompts.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 mb-6">
            {formattedPrompts.map((p) => (
              <PromptCard key={p.scene_id} prompt={p} onSave={handleSave} />
            ))}
          </div>
          <button
            onClick={() => setActiveStage(5)}
            className="px-6 py-2.5 bg-stone-800 text-white text-sm rounded-xl font-semibold hover:bg-stone-700 transition-colors"
          >
            Continue to Stage 5 →
          </button>
        </>
      )}
    </div>
  )
}
