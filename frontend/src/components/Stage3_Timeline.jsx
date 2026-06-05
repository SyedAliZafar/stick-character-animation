import { useEffect, useState } from 'react'
import usePipelineStore from '../store/pipelineStore'
import { TONE_COLORS } from '../App'

function TimelineBlock({ scene, totalDuration, selected, onClick }) {
  const start = parseTimestamp(scene.start)
  const end = parseTimestamp(scene.end)
  const duration = end - start
  const widthPct = (duration / totalDuration) * 100
  const color = TONE_COLORS[scene.emotional_tone] || '#C8C0B0'

  return (
    <div
      className="relative h-12 flex-shrink-0 cursor-pointer rounded overflow-hidden group"
      style={{ width: `max(48px, ${widthPct}%)`, backgroundColor: color, opacity: selected ? 1 : 0.75 }}
      onClick={onClick}
      title={`Scene ${scene.scene_id}: ${scene.concept}\n${scene.start} → ${scene.end}`}
    >
      <div className="absolute inset-0 flex flex-col justify-center px-2">
        <span className="text-xs font-semibold truncate" style={{ color: '#2a2018' }}>
          {scene.scene_id}
        </span>
        <span className="text-xs truncate" style={{ color: '#3a3028', opacity: 0.7 }}>
          {duration.toFixed(1)}s
        </span>
      </div>
      {selected && (
        <div className="absolute inset-0 border-2 border-stone-700 rounded" />
      )}
    </div>
  )
}

function parseTimestamp(ts) {
  if (!ts) return 0
  const parts = ts.split(':')
  if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2])
  }
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1])
  }
  return parseFloat(parts[0])
}

export default function Stage3_Timeline() {
  const finalScenes = usePipelineStore((s) => s.finalScenes)
  const scenes = usePipelineStore((s) => s.scenes)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)
  const setFinalScenes = usePipelineStore((s) => s.setFinalScenes)

  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)

  // Auto-run split if finalScenes not yet populated
  useEffect(() => {
    if (finalScenes.length === 0 && scenes.length > 0) {
      setLoading(true)
      fetch('/api/split-scenes', { method: 'POST' })
        .then((r) => r.json())
        .then((data) => {
          setFinalScenes(data.final_scenes)
          setStageStatus(3, 'complete')
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    }
  }, [])

  const totalDuration = finalScenes.length
    ? parseTimestamp(finalScenes[finalScenes.length - 1].end)
    : 0

  const toneCounts = finalScenes.reduce((acc, s) => {
    acc[s.emotional_tone] = (acc[s.emotional_tone] || 0) + 1
    return acc
  }, {})

  const selectedScene = selected !== null ? finalScenes.find((s) => s.scene_id === selected) : null

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 3 — Timeline</h2>
      <p className="text-stone-500 text-sm mb-6">
        Scenes longer than 8s are split into 3-6s sub-scenes.
      </p>

      {loading && (
        <div className="text-center py-12 text-stone-400">Splitting scenes...</div>
      )}

      {finalScenes.length > 0 && (
        <>
          {/* Stats */}
          <div className="flex gap-6 mb-6">
            <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-stone-800">{scenes.length}</div>
              <div className="text-xs text-stone-400">Original scenes</div>
            </div>
            <div className="text-stone-300 self-center text-xl">→</div>
            <div className="bg-white border border-stone-200 rounded-xl px-4 py-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{finalScenes.length}</div>
              <div className="text-xs text-stone-400">Final scenes</div>
            </div>
            <div className="flex-1" />
            {Object.entries(toneCounts).map(([tone, count]) => (
              <div
                key={tone}
                className="rounded-xl px-3 py-2 text-center text-xs"
                style={{ backgroundColor: TONE_COLORS[tone] || '#C8C0B0', color: '#2a2018' }}
              >
                <div className="font-bold text-sm">{count}</div>
                <div className="capitalize">{tone}</div>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="bg-white border border-stone-200 rounded-xl p-4 mb-4 overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {finalScenes.map((scene) => (
                <TimelineBlock
                  key={scene.scene_id}
                  scene={scene}
                  totalDuration={totalDuration}
                  selected={selected === scene.scene_id}
                  onClick={() => setSelected(selected === scene.scene_id ? null : scene.scene_id)}
                />
              ))}
            </div>
          </div>

          {/* Selected scene detail */}
          {selectedScene && (
            <div
              className="bg-white border rounded-xl p-4 mb-4"
              style={{ borderLeftColor: TONE_COLORS[selectedScene.emotional_tone], borderLeftWidth: 4 }}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs text-stone-400 font-mono">Scene {selectedScene.scene_id}</span>
                  <h4 className="font-semibold text-stone-800">{selectedScene.concept}</h4>
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-xs font-medium capitalize"
                  style={{ backgroundColor: TONE_COLORS[selectedScene.emotional_tone], color: '#3a3028' }}
                >
                  {selectedScene.emotional_tone}
                </span>
              </div>
              <p className="text-sm text-stone-600 mb-2">{selectedScene.visual_description}</p>
              <p className="text-xs text-stone-400 font-mono">
                {selectedScene.start} → {selectedScene.end}
              </p>
            </div>
          )}

          <button
            onClick={() => setActiveStage(4)}
            className="px-6 py-2.5 bg-stone-800 text-white text-sm rounded-xl font-semibold hover:bg-stone-700 transition-colors"
          >
            Continue to Stage 4 →
          </button>
        </>
      )}
    </div>
  )
}
