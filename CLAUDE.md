# Stick Animation Pipeline

## Overview

UI-driven pipeline: transcript → scene breakdown (manual Claude step) → AI images → final MP4.

## Startup

```bash
# Backend (from /backend)
uv sync
uv run uvicorn main:app --reload --port 8000

# Frontend (from /frontend)
npm install
npm run dev
# Opens http://localhost:5173
```

## API Keys Required

- **OpenRouter API key** — entered in the Stage 5 UI, stored in localStorage
  - Used for: Gemini 2.5 Flash image generation via OpenRouter
  - Cost: ~$0.039 per scene

## Pipeline Stages

| Stage | What happens | Automated? |
|-------|-------------|-----------|
| 1 | Upload transcript .txt + audio .mp4 | Auto |
| 2 | Generate Claude prompt → paste response | Manual Claude step |
| 3 | Split scenes >8s into 3-6s sub-scenes | Auto after Stage 2 |
| 4 | Wrap image prompts in stick figure style template | Auto, with manual edit |
| 5 | Generate images via OpenRouter API | Auto (3 concurrent) |
| 6 | Assemble final MP4 with FFmpeg | Auto |

## File Structure

```
backend/          FastAPI app + all pipeline logic
frontend/         React 18 + Vite + Tailwind + Zustand
inputs/           Uploaded transcript + audio files
outputs/images/   Generated scene PNGs
outputs/videos/   Final assembled MP4s
data/             Pipeline JSON state (auto-saved per stage)
```

## Data Files

- `data/raw_segments.json` — parsed transcript segments
- `data/scenes.json` — Claude's scene grouping output
- `data/final_scenes.json` — after splitting long scenes
- `data/formatted_prompts.json` — image prompts with style template applied
- `data/state.json` — pipeline progress (used for Resume on refresh)

## API Routes

```
POST /api/parse-transcript
GET  /api/generate-claude-prompt
POST /api/process-scenes
POST /api/split-scenes
POST /api/format-prompts
PUT  /api/update-prompt/{scene_id}
POST /api/generate-all-images?api_key=...
GET  /api/generation-progress          (SSE)
POST /api/assemble-video
WS   /ws/ffmpeg-progress
GET  /api/state
GET  /api/outputs/images/{filename}
GET  /api/outputs/videos/{filename}
```

## Character Style

Stick figure: large circular head, oval eyes, round pupils, single-line torso + 4 limbs.
Background: off-white warm paper #FAF7F2. No color fill. No red crack (different from TheInnerWar channel style).

## Output Formats

- Portrait: 1080×1920 (YouTube Shorts)
- Landscape: 1920×1080 (standard YouTube)
