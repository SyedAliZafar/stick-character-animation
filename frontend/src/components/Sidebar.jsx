import usePipelineStore from '../store/pipelineStore'

const STAGE_LABELS = ['Upload', 'Scene Grouping', 'Timeline', 'Prompts', 'Images', 'Video']

function StatusIcon({ status }) {
  if (status === 'complete') {
    return (
      <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center text-white text-xs flex-shrink-0">
        ✓
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs flex-shrink-0">
        ✕
      </span>
    )
  }
  if (status === 'active') {
    return (
      <span className="w-5 h-5 rounded-full bg-amber-600 pulse-ring flex-shrink-0" />
    )
  }
  return <span className="w-5 h-5 rounded-full border-2 border-stone-300 flex-shrink-0" />
}

export default function Sidebar() {
  const stages = usePipelineStore((s) => s.stages)
  const activeStage = usePipelineStore((s) => s.activeStage)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)

  const canNavigate = (num) => {
    const status = stages[num]
    return status === 'complete' || num === activeStage || (num === 1)
  }

  return (
    <aside className="w-52 flex-shrink-0 border-r border-stone-200 bg-stone-50 flex flex-col py-6 px-3 gap-1">
      <h1 className="text-xs font-semibold uppercase tracking-widest text-stone-400 px-3 mb-4">
        Pipeline
      </h1>
      {STAGE_LABELS.map((label, idx) => {
        const num = idx + 1
        const status = stages[num]
        const isActive = num === activeStage
        const clickable = canNavigate(num)

        return (
          <button
            key={num}
            disabled={!clickable}
            onClick={() => clickable && setActiveStage(num)}
            className={[
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all text-sm',
              isActive
                ? 'bg-amber-100 text-amber-900 font-semibold'
                : clickable
                  ? 'text-stone-600 hover:bg-stone-100'
                  : 'text-stone-300 cursor-not-allowed',
            ].join(' ')}
          >
            <StatusIcon status={isActive ? 'active' : status} />
            <span className="truncate">{label}</span>
            <span className="ml-auto text-xs text-stone-400 font-normal">{num}</span>
          </button>
        )
      })}

      <div className="mt-auto pt-4 border-t border-stone-200">
        <p className="text-xs text-stone-400 px-3">Stick Animation Pipeline</p>
      </div>
    </aside>
  )
}
