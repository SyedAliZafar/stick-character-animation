import { useRef, useState } from 'react'
import usePipelineStore from '../store/pipelineStore'

function FileDropZone({ accept, label, icon, file, onFile }) {
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div
      className={[
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
        dragging ? 'drop-active border-amber-500 bg-amber-50' : 'border-stone-300 hover:border-stone-400',
        file ? 'bg-green-50 border-green-400' : '',
      ].join(' ')}
      onClick={() => inputRef.current.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
      />
      <div className="text-3xl mb-2">{icon}</div>
      {file ? (
        <div>
          <p className="text-green-700 font-medium text-sm">{file.name}</p>
          <p className="text-green-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
      ) : (
        <div>
          <p className="text-stone-600 font-medium text-sm">{label}</p>
          <p className="text-stone-400 text-xs mt-1">drag & drop or click to browse</p>
          <p className="text-stone-300 text-xs mt-1">{accept}</p>
        </div>
      )}
    </div>
  )
}

export default function Stage1_Upload() {
  const [txtFile, setTxtFile] = useState(null)
  const [mp4File, setMp4File] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const setSegments = usePipelineStore((s) => s.setSegments)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)
  const setActiveStage = usePipelineStore((s) => s.setActiveStage)
  const segments = usePipelineStore((s) => s.segments)

  const handleUpload = async () => {
    if (!txtFile || !mp4File) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('transcript', txtFile)
      form.append('video', mp4File)
      const res = await fetch('/api/parse-transcript', { method: 'POST', body: form })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.detail || 'Parse failed')
      }
      const data = await res.json()
      setSegments(data.segments)
      setStageStatus(1, 'complete')
      setActiveStage(2)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const totalDuration = segments.length ? segments[segments.length - 1].end : 0

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 1 — Upload</h2>
      <p className="text-stone-500 text-sm mb-6">Upload your transcript (.txt) and narration audio (.mp4)</p>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <FileDropZone
          accept=".txt"
          label="Transcript (.txt)"
          icon="📄"
          file={txtFile}
          onFile={setTxtFile}
        />
        <FileDropZone
          accept=".mp4,.m4a,.mov,.mp3,.wav,.ogg,.flac,.aac,.webm"
          label="Audio/Video (.mp4, .mp3, .wav …)"
          icon="🎙️"
          file={mp4File}
          onFile={setMp4File}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!txtFile || !mp4File || uploading}
        className={[
          'w-full py-3 rounded-xl font-semibold text-sm transition-all',
          txtFile && mp4File && !uploading
            ? 'bg-stone-800 text-white hover:bg-stone-700'
            : 'bg-stone-200 text-stone-400 cursor-not-allowed',
        ].join(' ')}
      >
        {uploading ? 'Parsing transcript...' : 'Parse Transcript'}
      </button>

      {segments.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-stone-700">Parsed Segments</h3>
            <div className="text-xs text-stone-400">
              {segments.length} segments &middot; {formatTime(totalDuration)} total
            </div>
          </div>
          <div className="border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-stone-100 text-stone-500 text-left">
                  <th className="px-3 py-2 font-medium">Start</th>
                  <th className="px-3 py-2 font-medium">End</th>
                  <th className="px-3 py-2 font-medium">Duration</th>
                  <th className="px-3 py-2 font-medium">Text</th>
                </tr>
              </thead>
              <tbody>
                {segments.slice(0, 50).map((seg, i) => (
                  <tr
                    key={seg.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-stone-50'}
                  >
                    <td className="px-3 py-2 font-mono text-stone-500">{formatTime(seg.start)}</td>
                    <td className="px-3 py-2 font-mono text-stone-500">{formatTime(seg.end)}</td>
                    <td className="px-3 py-2 text-stone-400">{seg.duration.toFixed(1)}s</td>
                    <td className="px-3 py-2 text-stone-700 max-w-xs truncate">{seg.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {segments.length > 50 && (
              <p className="text-center text-stone-400 text-xs py-2 border-t border-stone-100">
                … {segments.length - 50} more segments
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
