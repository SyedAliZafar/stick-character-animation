import json
import math
import re

VALID_TONES = {"anxiety", "breakthrough", "growth", "trauma", "neutral"}

REQUIRED_FIELDS = {"scene_id", "start", "end", "segments", "concept", "visual_description", "emotional_tone", "image_prompt"}

CLAUDE_PROMPT_TEMPLATE = """You are a visual scene director for a stick figure animation channel.
Below is a transcript with timestamps. Group these segments into 20-30 meaningful scenes that follow the narrative arc.

For each scene return ONLY a valid JSON array, no explanation, no markdown:
[{{
  "scene_id": 1,
  "start": "00:00:00",
  "end": "00:00:08",
  "segments": [0, 1, 2],
  "concept": "one line concept",
  "visual_description": "exactly what to draw, be specific about character pose and any objects",
  "emotional_tone": "anxiety|breakthrough|growth|trauma|neutral",
  "image_prompt": "detailed image generation prompt for this scene"
}}]

Rules:
- emotional_tone must be exactly one of: anxiety, breakthrough, growth, trauma, neutral
- No scene shorter than 3 seconds
- No scene longer than 8 seconds
- start/end times must align with the provided segment timestamps
- image_prompt should describe the stick figure pose, expression, and scene context

TRANSCRIPT:
{transcript_content}"""


def _seconds_to_ts(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def build_claude_prompt(segments: list[dict]) -> str:
    lines = []
    for seg in segments:
        ts = _seconds_to_ts(seg["start"])
        lines.append(f"[{ts}] {seg['text']}")
    transcript_content = "\n".join(lines)
    return CLAUDE_PROMPT_TEMPLATE.format(transcript_content=transcript_content)


def validate_claude_response(raw_response: str) -> list[dict]:
    text = raw_response.strip()
    # Strip markdown fences
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"```\s*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    # Find the JSON array start
    array_start = text.find("[")
    if array_start == -1:
        raise ValueError("No JSON array found in response. Expected response to begin with '['.")
    text = text[array_start:]
    # Find matching close bracket
    array_end = text.rfind("]")
    if array_end == -1:
        raise ValueError("JSON array is not properly closed. Missing ']'.")
    text = text[: array_end + 1]

    try:
        scenes = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    if not isinstance(scenes, list):
        raise ValueError("Expected a JSON array at the top level.")

    cleaned = []
    for i, scene in enumerate(scenes):
        missing = REQUIRED_FIELDS - set(scene.keys())
        if missing:
            raise ValueError(f"Scene {i + 1} missing fields: {missing}")
        tone = scene["emotional_tone"]
        if tone not in VALID_TONES:
            raise ValueError(
                f"Scene {i + 1} has invalid emotional_tone '{tone}'. Must be one of: {VALID_TONES}"
            )
        cleaned.append({
            "scene_id": int(scene["scene_id"]),
            "start": scene["start"],
            "end": scene["end"],
            "segments": scene["segments"],
            "concept": str(scene["concept"]),
            "visual_description": str(scene["visual_description"]),
            "emotional_tone": tone,
            "image_prompt": str(scene["image_prompt"]),
        })
    return cleaned


def _ts_to_seconds(ts: str) -> float:
    parts = ts.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def _split_one_scene(scene: dict, start_id: int) -> list[dict]:
    start = _ts_to_seconds(scene["start"])
    end = _ts_to_seconds(scene["end"])
    duration = end - start
    # Split into chunks of at most 6s
    n_parts = max(2, math.ceil(duration / 6))
    chunk = duration / n_parts
    result = []
    for i in range(n_parts):
        part_start = start + i * chunk
        part_end = start + (i + 1) * chunk
        if i == n_parts - 1:
            part_end = end  # avoid floating point drift
        new_scene = {
            "scene_id": start_id + i,
            "start": f"{int(part_start // 3600):02d}:{int((part_start % 3600) // 60):02d}:{part_start % 60:06.3f}",
            "end": f"{int(part_end // 3600):02d}:{int((part_end % 3600) // 60):02d}:{part_end % 60:06.3f}",
            "segments": scene["segments"],
            "concept": scene["concept"],
            "visual_description": scene["visual_description"],
            "emotional_tone": scene["emotional_tone"],
            "image_prompt": scene["image_prompt"],
        }
        result.append(new_scene)
    return result


def split_scenes(scenes: list[dict]) -> list[dict]:
    result = []
    counter = 1
    for scene in scenes:
        start = _ts_to_seconds(scene["start"])
        end = _ts_to_seconds(scene["end"])
        duration = end - start
        if duration > 8:
            parts = _split_one_scene(scene, counter)
            result.extend(parts)
            counter += len(parts)
        else:
            updated = dict(scene)
            updated["scene_id"] = counter
            result.append(updated)
            counter += 1
    return result
