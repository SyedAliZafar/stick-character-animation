import { useEffect, useRef, useState } from 'react'
import usePipelineStore from '../store/pipelineStore'

function ImageCell({ scene_id, concept, imageUrl, status, error, onRetry }) {
  return (
    <div className="relative bg-white border border-stone-200 rounded-xl overflow-hidden aspect-square group">
      {imageUrl ? (
        <img src={imageUrl} alt={`Scene ${scene_id}`} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-stone-100">
          {status === 'generating' ? (
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-stone-400 border-t-amber-600 rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-stone-400">Generating...</p>
            </div>
          ) : (
            <span className="text-stone-300 text-3xl">🖼️</span>
          )}
        </div>
      )}

      {/* Error overlay */}
      {error && !imageUrl && (
        <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center p-2">
          <p className="text-white text-xs text-center mb-2 line-clamp-3">{error}</p>
          <button
            onClick={onRetry}
            className="px-3 py-1 bg-white text-red-700 text-xs rounded-lg font-medium hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Scene label */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/40 px-2 py-1">
        <p className="text-white text-xs truncate">
          <span className="font-mono opacity-60">{scene_id}</span> {concept}
        </p>
      </div>

      {/* Regenerate button on hover */}
      {imageUrl && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
          <button
            onClick={onRetry}
            className="px-3 py-1 bg-white/90 text-stone-800 text-xs rounded-lg font-medium hover:bg-white"
          >
            Regenerate
          </button>
        </div>
      )}
    </div>
  )
}

export default function Stage5_Images() {
  const formattedPrompts = usePipelineStore((s) => s.formattedPrompts)
  const generatedImages = usePipelineStore((s) => s.generatedImages)
  const imageErrors = usePipelineStore((s) => s.imageErrors)
  const imageGenProgress = usePipelineStore((s) => s.imageGenProgress)
  const setImageGenProgress = usePipelineStore((s) => s.setImageGenProgress)
  const setGeneratedImage = usePipelineStore((s) => s.setGeneratedImage)
  const setImageError = usePipelineStore((s) => s.setImageError)
  const clearImageError = usePipelineStore((s) => s.clearImageError)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)

  const [apiKey, setApiKey] = useState(() => localStorage.getItem('openrouter_api_key') || '')
  const [generating, setGenerating] = useState(false)
  const [inProgress, setInProgress] = useState(new Set())
  const esRef = useRef(null)

  const n = formattedPrompts.length
  const costEstimate = (n * 0.02).toFixed(2)
  const doneCount = Object.values(generatedImages).filter(Boolean).length
  const failedCount = Object.values(imageErrors).filter(Boolean).length

  const saveApiKey = (key) => {
    setApiKey(key)
    localStorage.setItem('openrouter_api_key', key)
  }

  const startSSE = () => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource('/api/generation-progress')
    esRef.current = es

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'started') {
        setImageGenProgress({ total: msg.total, completed: 0, failed: [], inProgress: [] })
      }
      if (msg.type === 'progress') {
        setInProgress((prev) => new Set([...prev, msg.scene_id]))
      }
      if (msg.type === 'image_ready') {
        setInProgress((prev) => { const n = new Set(prev); n.delete(msg.scene_id); return n })
        setGeneratedImage(msg.scene_id, msg.url + `?t=${Date.now()}`)
        clearImageError(msg.scene_id)
        setImageGenProgress({ completed: (imageGenProgress.completed || 0) + 1 })
      }
      if (msg.type === 'image_error') {
        setInProgress((prev) => { const n = new Set(prev); n.delete(msg.scene_id); return n })
        setImageError(msg.scene_id, msg.error)
      }
      if (msg.type === 'done') {
        setGenerating(false)
        setStageStatus(5, 'complete')
        es.close()
        setImageGenProgress({ total: msg.total, completed: msg.completed, failed: msg.failed })
      }
      if (msg.type === 'heartbeat') { /* keepalive */ }
    }
    es.onerror = () => { setGenerating(false); es.close() }
  }

  const generateAll = async () => {
    if (!apiKey) { alert('Enter your OpenRouter API key first.'); return }
    setGenerating(true)
    startSSE()
    try {
      const res = await fetch(`/api/generate-all-images?api_key=${encodeURIComponent(apiKey)}`, { method: 'POST' })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Failed to start generation')
      }
    } catch (e) {
      setGenerating(false)
      alert(e.message)
    }
  }

  const retrySingle = async (scene_id) => {
    if (!apiKey) { alert('Enter your OpenRouter API key first.'); return }
    clearImageError(scene_id)
    setInProgress((prev) => new Set([...prev, scene_id]))
    try {
      const res = await fetch(`/api/generate-image/${scene_id}/run?api_key=${encodeURIComponent(apiKey)}`, { method: 'POST' })
      if (!res.ok) {
        const e = await res.json()
        setImageError(scene_id, e.detail || 'Failed')
      } else {
        const data = await res.json()
        setGeneratedImage(scene_id, data.url + `?t=${Date.now()}`)
      }
    } catch (e) {
      setImageError(scene_id, e.message)
    } finally {
      setInProgress((prev) => { const n = new Set(prev); n.delete(scene_id); return n })
    }
  }

  useEffect(() => () => { if (esRef.current) esRef.current.close() }, [])

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 5 — Image Generation</h2>
      <p className="text-stone-500 text-sm mb-6">Generate stick figure images via OpenRouter → Gemini 2.5 Flash</p>

      {/* Controls */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-52">
            <label className="block text-xs text-stone-500 mb-1">OpenRouter API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-stone-500"
            />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
            Estimated cost: <strong>{n} × $0.02 = ${costEstimate}</strong>
          </div>
          <button
            onClick={generateAll}
            disabled={generating || !apiKey || n === 0}
            className={[
              'px-5 py-2.5 rounded-xl font-semibold text-sm transition-colors',
              !generating && apiKey && n > 0
                ? 'bg-stone-800 text-white hover:bg-stone-700'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed',
            ].join(' ')}
          >
            {generating ? 'Generating...' : 'Generate All Images'}
          </button>
        </div>

        {/* Progress bar */}
        {generating && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-stone-500 mb-1">
              <span>Generating {doneCount + failedCount} / {n}</span>
              <span>{Math.round(((doneCount + failedCount) / Math.max(1, n)) * 100)}%</span>
            </div>
            <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-600 transition-all duration-300"
                style={{ width: `${((doneCount + failedCount) / Math.max(1, n)) * 100}%` }}
              />
            </div>
          </div>
        )}

        {!generating && doneCount > 0 && (
          <div className="mt-3 text-xs text-stone-400">
            {doneCount} generated &middot; {failedCount} failed
            {doneCount + failedCount < n && ` &middot; ${n - doneCount - failedCount} pending`}
          </div>
        )}
      </div>

      {/* Image Grid */}
      {formattedPrompts.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {formattedPrompts.map((p) => {
            const url = generatedImages[p.scene_id]
            const err = imageErrors[p.scene_id]
            const isGenerating = inProgress.has(p.scene_id)
            return (
              <ImageCell
                key={p.scene_id}
                scene_id={p.scene_id}
                concept={p.original_prompt?.slice(0, 40) || `Scene ${p.scene_id}`}
                imageUrl={url || null}
                status={isGenerating ? 'generating' : err ? 'error' : url ? 'done' : 'pending'}
                error={err}
                onRetry={() => retrySingle(p.scene_id)}
              />
            )
          })}
        </div>
      )}

      {doneCount > 0 && (
        <button
          onClick={() => setActiveStage(6)}
          className="px-6 py-2.5 bg-stone-800 text-white text-sm rounded-xl font-semibold hover:bg-stone-700 transition-colors"
        >
          Continue to Stage 6 →
        </button>
      )}
    </div>
  )
}
