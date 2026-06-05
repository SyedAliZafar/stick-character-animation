# Stick Animation Pipeline

UI-driven pipeline that turns a transcript + audio into a stick-figure animation video.

**Stack:** FastAPI · React 18 · Vite · Tailwind · Zustand · FFmpeg · OpenRouter (Gemini 2.5 Flash Image)

---

## Quick Start

**Backend** (terminal 1, from `/backend`):
```bash
uv sync
uv run uvicorn main:app --reload --port 8000
```

**Frontend** (terminal 2, from `/frontend`):
```bash
npm install
npm run dev
```

Open → http://localhost:5173

---

## Pipeline

| Stage | What happens | Mode |
|-------|-------------|------|
| 1 | Upload transcript `.txt` + audio `.mp4` | Auto |
| 2 | Generate Claude prompt → paste response | Manual Claude step |
| 3 | Split scenes >8s into 3-6s sub-scenes | Auto |
| 4 | Wrap image prompts in stick figure style template | Auto + manual edit |
| 5 | Generate images via OpenRouter API | Auto (3 concurrent) |
| 6 | Assemble final MP4 with FFmpeg | Auto |

---

## Requirements

- Python 3.11+ with [uv](https://github.com/astral-sh/uv)
- Node 18+
- FFmpeg in PATH
- OpenRouter API key (enter in Stage 5 UI — stored in localStorage)

---

## Cost

- ~**$0.039 per scene image** via OpenRouter (Gemini 2.5 Flash Image)
- A 12-scene video costs ~$0.47 in images

---

## Output Formats

| Format | Resolution | Use |
|--------|-----------|-----|
| Portrait | 1080×1920 | YouTube Shorts |
| Landscape | 1920×1080 | Standard YouTube |

---

## File Structure

```
backend/          FastAPI app + pipeline logic
frontend/         React + Vite UI
inputs/           Uploaded transcript + audio
outputs/images/   Generated scene PNGs
outputs/videos/   Final assembled MP4s
data/             Pipeline JSON state (auto-saved)
```

## Character Style

Stick figure: large circular head, oval eyes, round pupils, single-line torso + 4 limbs.  
Background: off-white warm paper `#FAF7F2`. No color fill.
