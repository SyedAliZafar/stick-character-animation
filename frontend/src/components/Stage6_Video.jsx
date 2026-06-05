import { useEffect, useRef, useState } from 'react'
import usePipelineStore from '../store/pipelineStore'

export default function Stage6_Video() {
  const selectedFormat = usePipelineStore((s) => s.selectedFormat)
  const setSelectedFormat = usePipelineStore((s) => s.setSelectedFormat)
  const ffmpegLogs = usePipelineStore((s) => s.ffmpegLogs)
  const appendFfmpegLog = usePipelineStore((s) => s.appendFfmpegLog)
  const clearFfmpegLogs = usePipelineStore((s) => s.clearFfmpegLogs)
  const videoUrls = usePipelineStore((s) => s.videoUrls)
  const setVideoUrl = usePipelineStore((s) => s.setVideoUrl)
  const assemblyStatus = usePipelineStore((s) => s.assemblyStatus)
  const setAssemblyStatus = usePipelineStore((s) => s.setAssemblyStatus)
  const setStageStatus = usePipelineStore((s) => s.setStageStatus)

  const wsRef = useRef(null)
  const logEndRef = useRef(null)
  const logBufferRef = useRef([])
  const flushIntervalRef = useRef(null)

  // Batch log updates every 100ms to prevent render flood
  const flushLogs = () => {
    if (logBufferRef.current.length > 0) {
      appendFfmpegLog(logBufferRef.current)
      logBufferRef.current = []
    }
  }

  useEffect(() => {
    flushIntervalRef.current = setInterval(flushLogs, 100)
    return () => {
      clearInterval(flushIntervalRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  // Auto-scroll log panel
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [ffmpegLogs])

  const startAssembly = async () => {
    clearFfmpegLogs()
    setAssemblyStatus('running')

    // Connect WebSocket first
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/ffmpeg-progress`)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      if (msg.type === 'log' || msg.type === 'stage') {
        logBufferRef.current.push(msg.line || `[${msg.label}]`)
        flushLogs()
      }
      if (msg.type === 'done') {
        if (msg.portrait) setVideoUrl('portrait', msg.portrait)
        if (msg.landscape) setVideoUrl('landscape', msg.landscape)
        setAssemblyStatus('done')
        setStageStatus(6, 'complete')
        ws.close()
      }
      if (msg.type === 'error') {
        logBufferRef.current.push(`ERROR: ${msg.message}`)
        flushLogs()
        setAssemblyStatus('error')
        ws.close()
      }
    }

    ws.onerror = () => { setAssemblyStatus('error') }

    // Small delay to ensure WS connected before triggering assembly
    setTimeout(async () => {
      try {
        const res = await fetch('/api/assemble-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: selectedFormat }),
        })
        if (!res.ok) {
          const e = await res.json()
          logBufferRef.current.push(`Error: ${e.detail}`)
          setAssemblyStatus('error')
          ws.close()
        }
      } catch (err) {
        logBufferRef.current.push(`Error: ${err.message}`)
        setAssemblyStatus('error')
        ws.close()
      }
    }, 300)
  }

  const isRunning = assemblyStatus === 'running'
  const isDone = assemblyStatus === 'done'

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold text-stone-800 mb-1">Stage 6 — Video Assembly</h2>
      <p className="text-stone-500 text-sm mb-6">
        Assemble scenes into final MP4 with audio using FFmpeg.
      </p>

      {/* Format Selector */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
        <h3 className="font-semibold text-stone-700 mb-3">Output Format</h3>
        <div className="flex gap-4">
          {[
            { value: 'portrait', label: 'Portrait 9:16', desc: '1080×1920 YouTube Shorts' },
            { value: 'landscape', label: 'Landscape 16:9', desc: '1920×1080 Standard' },
            { value: 'both', label: 'Both', desc: 'Portrait + Landscape' },
          ].map((opt) => (
            <label key={opt.value} className="flex items-start gap-2 cursor-pointer flex-1">
              <input
                type="radio"
                name="format"
                value={opt.value}
                checked={selectedFormat === opt.value}
                onChange={() => setSelectedFormat(opt.value)}
                className="mt-0.5 accent-amber-700"
              />
              <div>
                <div className="text-sm font-medium text-stone-700">{opt.label}</div>
                <div className="text-xs text-stone-400">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>

        <button
          onClick={startAssembly}
          disabled={isRunning}
          className={[
            'mt-4 px-6 py-2.5 rounded-xl font-semibold text-sm transition-colors',
            !isRunning
              ? 'bg-stone-800 text-white hover:bg-stone-700'
              : 'bg-stone-300 text-stone-500 cursor-not-allowed',
          ].join(' ')}
        >
          {isRunning ? 'Assembling...' : isDone ? 'Reassemble' : 'Assemble Video'}
        </button>

        {assemblyStatus === 'error' && (
          <p className="mt-2 text-red-600 text-sm">Assembly failed. Check the log below.</p>
        )}
      </div>

      {/* FFmpeg Log */}
      {ffmpegLogs.length > 0 && (
        <div className="bg-stone-900 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-stone-400 font-mono">FFmpeg Output</span>
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                Running
              </span>
            )}
          </div>
          <pre className="text-xs text-green-300 font-mono max-h-64 overflow-y-auto thin-scroll whitespace-pre-wrap">
            {ffmpegLogs.join('\n')}
            <div ref={logEndRef} />
          </pre>
        </div>
      )}

      {/* Downloads & Preview */}
      {isDone && (
        <div className="space-y-4">
          {videoUrls.portrait && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-stone-700">Portrait (9:16)</h3>
                <a
                  href={videoUrls.portrait}
                  download="final_video_portrait.mp4"
                  className="px-3 py-1 bg-stone-800 text-white text-xs rounded-lg hover:bg-stone-700 transition-colors"
                >
                  Download
                </a>
              </div>
              <video
                src={videoUrls.portrait}
                controls
                className="max-h-64 mx-auto rounded-lg"
                style={{ maxWidth: '180px' }}
              />
            </div>
          )}
          {videoUrls.landscape && (
            <div className="bg-white border border-stone-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-stone-700">Landscape (16:9)</h3>
                <a
                  href={videoUrls.landscape}
                  download="final_video_landscape.mp4"
                  className="px-3 py-1 bg-stone-800 text-white text-xs rounded-lg hover:bg-stone-700 transition-colors"
                >
                  Download
                </a>
              </div>
              <video
                src={videoUrls.landscape}
                controls
                className="w-full rounded-lg"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
