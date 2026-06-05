# Project Context: Stick Animation Pipeline

## What this is

A 6-stage automation pipeline for producing stick figure animation YouTube videos from a narration transcript. Built for the **TheInnerWar** psychology channel workflow.

## Why a manual Claude step?

Stage 2 (scene grouping) is intentionally manual. The user pastes the transcript into Claude and gets back a structured scene JSON. This gives full creative control over:
- How scenes are grouped
- What concept/visual is assigned to each scene
- Emotional tone labeling

Automating this with a direct API call would work but costs money per video and produces less creative results than a thoughtful Claude conversation.

## Character Style Rules

Every image prompt gets wrapped in this style template:

```
Off-white warm paper background (#FAF7F2) with 3-5% film grain noise overlay.
Black thick outlines on warm paper. Stick figure character with large circular head,
oval eyes, round pupils. Expression: {emotional_tone}. Scene: {visual_description}.
Clean minimal hand-drawn illustration, no color fill, light grey elliptical ground 
shadow beneath character.
```

Character anatomy:
- Large circular head, thick black outline
- Two large oval eyes in upper half of face
- Round black filled pupils (offset for gaze direction)
- Single line torso, two arm lines, two leg lines
- Rounded dot endpoints on hands/feet
- Light grey elliptical shadow under feet
- NO color fill anywhere
- NO mouth unless essential

## Tone Color Reference

Used in the UI to color-code scenes by emotional tone:

| Tone | Color | Hex |
|------|-------|-----|
| anxiety | Muted red | `#E8A0A0` |
| breakthrough | Muted green | `#A0C8A0` |
| growth | Muted blue | `#A0B8D8` |
| trauma | Muted purple | `#C0A0C8` |
| neutral | Warm grey | `#C8C0B0` |

## Cost Model

- Image generation: ~$0.02/scene via OpenRouter → Gemini 2.5 Flash
- A 20-scene video: ~$0.40
- A 40-scene video: ~$0.80
- Video assembly: free (local FFmpeg)

## FFmpeg Grain Filter

Applied to all output videos to match the paper texture aesthetic:

```
noise=alls=8:allf=t+u
```

Portrait full filter:
```
[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,
pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#FAF7F2,
noise=alls=8:allf=t+u[v]
```

## State Persistence

All pipeline JSON is written to `/data/` after each stage. On page refresh, the frontend calls `GET /api/state` and offers to resume from the last completed stage.

## Difference from existing pipelines

This project differs from `stick_character_automation/` in the same repo:
- No red crack character brand (different visual style)
- React UI instead of Flask
- Manual scene grouping (not DeepSeek API)
- OpenRouter → Gemini 2.5 Flash (not gpt-image-1)
- FFmpeg directly (not moviepy)
- WebSocket for real-time FFmpeg streaming
