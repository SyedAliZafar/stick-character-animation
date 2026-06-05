import { useEffect, useState } from 'react'
import usePipelineStore from './store/pipelineStore'
import Sidebar from './components/Sidebar'
import Stage1_Upload from './components/Stage1_Upload'
import Stage2_Scenes from './components/Stage2_Scenes'
import Stage3_Timeline from './components/Stage3_Timeline'
import Stage4_Prompts from './components/Stage4_Prompts'
import Stage5_Images from './components/Stage5_Images'
import Stage6_Video from './components/Stage6_Video'

export const TONE_COLORS = {
  anxiety:      '#E8A0A0',
  breakthrough: '#A0C8A0',
  growth:       '#A0B8D8',
  trauma:       '#C0A0C8',
  neutral:      '#C8C0B0',
}

const STAGE_COMPONENTS = {
  1: Stage1_Upload,
  2: Stage2_Scenes,
  3: Stage3_Timeline,
  4: Stage4_Prompts,
  5: Stage5_Images,
  6: Stage6_Video,
}

function ResumeBanner({ onResume, onDismiss }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-50 border border-amber-300 rounded-lg px-5 py-3 shadow-md flex items-center gap-4">
      <span className="text-amber-800 text-sm font-medium">Previous pipeline progress detected.</span>
      <button
        onClick={onResume}
        className="px-3 py-1 bg-amber-700 text-white text-xs rounded hover:bg-amber-800 transition-colors"
      >
        Resume
      </button>
      <button onClick={onDismiss} className="text-amber-500 hover:text-amber-700 text-xs">
        Dismiss
      </button>
    </div>
  )
}

export default function App() {
  const activeStage = usePipelineStore((s) => s.activeStage)
  const stages = usePipelineStore((s) => s.stages)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)
  const setSegments = usePipelineStore((s) => s.setSegments)
  const setScenes = usePipelineStore((s) => s.setScenes)
  const setFinalScenes = usePipelineStore((s) => s.setFinalScenes)
  const setFormattedPrompts = usePipelineStore((s) => s.setFormattedPrompts)
  const setVideoUrl = usePipelineStore((s) => s.setVideoUrl)

  const [showResume, setShowResume] = useState(false)
  const [serverState, setServerState] = useState(null)

  useEffect(() => {
    fetch('/api/state')
      .then((r) => r.json())
      .then((state) => {
        setServerState(state)
        if (state.stage1_complete) setShowResume(true)
      })
      .catch(() => {})
  }, [])

  const handleResume = async () => {
    setShowResume(false)
    if (!serverState) return

    try {
      if (serverState.stage1_complete) {
        const r = await fetch('/api/state')
        // Re-load segments
        const segsR = await fetch('/data/raw_segments.json').catch(() => null)
        if (segsR?.ok) setSegments(await segsR.json())
        setStageStatus(1, 'complete')
      }
      if (serverState.stage2_complete) {
        setStageStatus(2, 'complete')
        setStageStatus(3, 'complete')
      }
      if (serverState.stage4_complete) setStageStatus(4, 'complete')
      if (serverState.stage5_complete) setStageStatus(5, 'complete')
      if (serverState.stage6_complete) {
        setStageStatus(6, 'complete')
        if (serverState.video_portrait_ready)
          setVideoUrl('portrait', '/api/outputs/videos/final_video_portrait.mp4')
        if (serverState.video_landscape_ready)
          setVideoUrl('landscape', '/api/outputs/videos/final_video_landscape.mp4')
      }
      // Navigate to furthest completed stage
      const furthest = [6, 5, 4, 3, 2, 1].find((s) => serverState[`stage${s}_complete`]) || 1
      setActiveStage(furthest)
    } catch (e) {
      console.error('Resume failed', e)
    }
  }

  const StageComponent = STAGE_COMPONENTS[activeStage] || Stage1_Upload

  return (
    <div className="flex h-screen bg-paper overflow-hidden">
      {showResume && (
        <ResumeBanner onResume={handleResume} onDismiss={() => setShowResume(false)} />
      )}
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <StageComponent />
      </main>
    </div>
  )
}
