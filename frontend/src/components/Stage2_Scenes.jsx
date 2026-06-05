import { useState } from 'react'
import usePipelineStore from '../store/pipelineStore'
import { TONE_COLORS } from '../App'

function ToneBadge({ tone }) {
  const color = TONE_COLORS[tone] || '#C8C0B0'
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: color, color: '#3a3028' }}
    >
      {tone}
    </span>
  )
}

function SceneCard({ scene }) {
  const color = TONE_COLORS[scene.emotional_tone] || '#C8C0B0'
  return (
    <div
      className="border rounded-xl p-4 bg-white shadow-sm"
      style={{ borderLeftColor: color, borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs text-stone-400 font-mono">Scene {scene.scene_id}</span>
          <h4 className="font-semibold text-stone-800 text-sm mt-0.5">{scene.concept}</h4>
        </div>
        <ToneBadge tone={scene.emotional_tone} />
      </div>
      <p className="text-xs text-stone-500 mb-2 line-clamp-2">{scene.visual_description}</p>
      <div className="text-xs text-stone-400 font-mono">
        {scene.start} → {scene.end}
      </div>
    </div>
  )
}

export default function Stage2_Scenes() {
  const claudePrompt = usePipelineStore((s) => s.claudePrompt)
  const scenes = usePipelineStore((s) => s.scenes)
  const finalScenes = usePipelineStore((s) => s.finalScenes)
  const setClaudePrompt = usePipelineStore((s) => s.setClaudePrompt)
  const setScenes = usePipelineStore((s) => s.setScenes)
  const setFinalScenes = usePipelineStore((s) => s.setFinalScenes)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)

  const [pasteText, setPasteText] = useState('')
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const generatePrompt = async () => {
    setLoadingPrompt(true)
    setError('')
    try {
      const res = await fetch('/api/generate-claude-prompt')
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Failed to generate prompt')
      }
      const data = await res.json()
      setClaudePrompt(data.prompt)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingPrompt(false)
    }
  }

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(claudePrompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const processResponse = async () => {
    if (!pasteText.trim()) return
    setProcessing(true)
    setError('')
    try {
      const res = await fetch('/api/process-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes_json: pasteText }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Failed to process scenes')
      }
      const data = await res.json()
      setScenes(data.scenes)
      setFinalScenes(data.final_scenes)
      setStageStatus(2, 'complete')
      setStageStatus(3, 'complete')
      setActiveStage(3)
    } catch (e) {
      setError(e.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 2 — Scene Grouping</h2>
      <p className="text-stone-500 text-sm mb-6">
        Generate the Claude prompt, paste it into Claude, then paste back the scene JSON.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Generate Prompt */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-stone-700 mb-3">1. Generate the Claude Prompt</h3>
        <button
          onClick={generatePrompt}
          disabled={loadingPrompt}
          className="px-4 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
        >
          {loadingPrompt ? 'Generating...' : 'Generate Prompt'}
        </button>

        {claudePrompt && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-stone-400">Copy and paste this into Claude:</span>
              <button
                onClick={copyToClipboard}
                className={[
                  'px-3 py-1 text-xs rounded-lg transition-colors',
                  copied
                    ? 'bg-green-100 text-green-700'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200',
                ].join(' ')}
              >
                {copied ? '✓ Copied!' : 'Copy to Clipboard'}
              </button>
            </div>
            <textarea
              readOnly
              value={claudePrompt}
              className="w-full h-40 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg p-3 resize-none text-stone-600 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Step 2: Paste Response */}
      {claudePrompt && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
          <h3 className="font-semibold text-stone-700 mb-3">2. Paste Claude's JSON Response</h3>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder='Paste the JSON array from Claude here... [{"scene_id": 1, ...}]'
            className="w-full h-48 text-xs font-mono bg-stone-50 border border-stone-200 rounded-lg p-3 resize-none text-stone-700 focus:outline-none focus:border-stone-400"
          />
          <button
            onClick={processResponse}
            disabled={!pasteText.trim() || processing}
            className={[
              'mt-3 px-5 py-2 text-sm rounded-lg font-medium transition-colors',
              pasteText.trim() && !processing
                ? 'bg-amber-700 text-white hover:bg-amber-800'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed',
            ].join(' ')}
          >
            {processing ? 'Processing...' : 'Process Response'}
          </button>
        </div>
      )}

      {/* Step 3: Scene Cards */}
      {scenes.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-700">
              {scenes.length} Scenes Loaded
            </h3>
            <span className="text-xs text-stone-400">
              → {finalScenes.length} after split
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {scenes.map((scene) => (
              <SceneCard key={scene.scene_id} scene={scene} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
