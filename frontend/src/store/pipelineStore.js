import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const INITIAL_STATE = {
  stages: { 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending', 6: 'pending' },
  activeStage: 1,
  segments: [],
  claudePrompt: '',
  scenes: [],
  finalScenes: [],
  formattedPrompts: [],
  imageGenProgress: { total: 0, completed: 0, failed: [], inProgress: [] },
  generatedImages: {},
  imageErrors: {},
  selectedFormat: 'portrait',
  ffmpegLogs: [],
  videoUrls: { portrait: null, landscape: null },
  assemblyStatus: 'idle',
}

const usePipelineStore = create(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      setStageStatus: (stage, status) =>
        set((s) => ({ stages: { ...s.stages, [stage]: status } })),

      setActiveStage: (stage) => set({ activeStage: stage }),

      setSegments: (segments) => set({ segments }),

      setClaudePrompt: (claudePrompt) => set({ claudePrompt }),

      setScenes: (scenes) => set({ scenes }),

      setFinalScenes: (finalScenes) => set({ finalScenes }),

      setFormattedPrompts: (formattedPrompts) => set({ formattedPrompts }),

      updatePromptInStore: (scene_id, newText) =>
        set((s) => ({
          formattedPrompts: s.formattedPrompts.map((p) =>
            p.scene_id === scene_id
              ? { ...p, formatted_prompt: newText, locked: true, char_count: newText.length }
              : p,
          ),
        })),

      setImageGenProgress: (update) =>
        set((s) => ({ imageGenProgress: { ...s.imageGenProgress, ...update } })),

      setGeneratedImage: (scene_id, url) =>
        set((s) => ({ generatedImages: { ...s.generatedImages, [scene_id]: url } })),

      setImageError: (scene_id, error) =>
        set((s) => ({ imageErrors: { ...s.imageErrors, [scene_id]: error } })),

      clearImageError: (scene_id) =>
        set((s) => {
          const next = { ...s.imageErrors }
          delete next[scene_id]
          return { imageErrors: next }
        }),

      appendFfmpegLog: (lines) =>
        set((s) => ({ ffmpegLogs: [...s.ffmpegLogs, ...lines] })),

      clearFfmpegLogs: () => set({ ffmpegLogs: [] }),

      setSelectedFormat: (selectedFormat) => set({ selectedFormat }),

      setVideoUrl: (format, url) =>
        set((s) => ({ videoUrls: { ...s.videoUrls, [format]: url } })),

      setAssemblyStatus: (assemblyStatus) => set({ assemblyStatus }),

      resetPipeline: () => set(INITIAL_STATE),
    }),
    {
      name: 'pipeline-storage',
      // Only persist non-ephemeral, serializable fields
      partialize: (s) => ({
        stages: s.stages,
        activeStage: s.activeStage,
        videoUrls: s.videoUrls,
        generatedImages: s.generatedImages,
        selectedFormat: s.selectedFormat,
      }),
    },
  ),
)

export default usePipelineStore
