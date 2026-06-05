import asyncio
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

import image_generator as ig
import parser as transcript_parser
import prompt_formatter as pf
import scene_builder as sb
import video_assembler as va

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
INPUTS_DIR = BASE_DIR / "inputs"
IMAGES_DIR = BASE_DIR / "outputs" / "images"
VIDEOS_DIR = BASE_DIR / "outputs" / "videos"

for d in (DATA_DIR, INPUTS_DIR, IMAGES_DIR, VIDEOS_DIR):
    d.mkdir(parents=True, exist_ok=True)

# ─── In-memory state ──────────────────────────────────────────────────────────
_state: dict = {
    "stage1_complete": False,
    "stage2_complete": False,
    "stage3_complete": False,
    "stage4_complete": False,
    "stage5_complete": False,
    "stage6_complete": False,
    "segment_count": 0,
    "scene_count": 0,
    "final_scene_count": 0,
    "images_generated": 0,
    "images_failed": [],
    "mp4_filename": None,
    "video_portrait_ready": False,
    "video_landscape_ready": False,
}

# SSE fan-out: set of queues, one per subscriber
_sse_subscribers: set[asyncio.Queue] = set()

# WebSocket fan-out for FFmpeg log streaming
_ws_subscribers: set[asyncio.Queue] = set()

# Last 500 FFmpeg log lines for WebSocket replay on reconnect
_ffmpeg_log_buffer: list[str] = []
_assembly_running: bool = False

# ─── Lifespan ─────────────────────────────────────────────────────────────────

def _load_state_from_disk():
    state_file = DATA_DIR / "state.json"
    if state_file.exists():
        try:
            saved = json.loads(state_file.read_text())
            _state.update(saved)
        except Exception:
            pass
    # Check for JSON artifacts even if state.json missing
    if (DATA_DIR / "raw_segments.json").exists() and not _state["stage1_complete"]:
        try:
            segs = json.loads((DATA_DIR / "raw_segments.json").read_text())
            _state["stage1_complete"] = True
            _state["segment_count"] = len(segs)
        except Exception:
            pass
    if (DATA_DIR / "scenes.json").exists() and not _state["stage2_complete"]:
        try:
            scenes = json.loads((DATA_DIR / "scenes.json").read_text())
            _state["stage2_complete"] = True
            _state["scene_count"] = len(scenes)
        except Exception:
            pass
    if (DATA_DIR / "final_scenes.json").exists() and not _state["stage3_complete"]:
        try:
            fs = json.loads((DATA_DIR / "final_scenes.json").read_text())
            _state["stage3_complete"] = True
            _state["final_scene_count"] = len(fs)
        except Exception:
            pass
    if (DATA_DIR / "formatted_prompts.json").exists() and not _state["stage4_complete"]:
        _state["stage4_complete"] = True


async def _save_state():
    (DATA_DIR / "state.json").write_text(json.dumps(_state, indent=2))


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_state_from_disk()
    yield


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(title="Stick Animation Pipeline", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic models ──────────────────────────────────────────────────────────
class ScenesPayload(BaseModel):
    scenes_json: str


class PromptUpdatePayload(BaseModel):
    prompt: str


class AssemblePayload(BaseModel):
    format: str = "both"  # "portrait" | "landscape" | "both"


# ─── Stage 1 — Transcript Parse ───────────────────────────────────────────────
@app.post("/api/parse-transcript")
async def parse_transcript(transcript: UploadFile = File(...), video: UploadFile = File(...)):
    txt_bytes = await transcript.read()
    txt_content = txt_bytes.decode("utf-8", errors="replace")

    mp4_bytes = await video.read()
    mp4_path = INPUTS_DIR / (video.filename or "audio.mp4")
    async with aiofiles.open(mp4_path, "wb") as f:
        await f.write(mp4_bytes)

    try:
        segments = transcript_parser.parse_transcript(txt_content, video.filename or "audio.mp4")
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    async with aiofiles.open(DATA_DIR / "raw_segments.json", "w") as f:
        await f.write(json.dumps(segments, indent=2))

    _state["stage1_complete"] = True
    _state["segment_count"] = len(segments)
    _state["mp4_filename"] = mp4_path.name
    await _save_state()

    return {"segments": segments, "count": len(segments)}


# ─── Stage 2a — Generate Claude Prompt ───────────────────────────────────────
@app.get("/api/generate-claude-prompt")
async def generate_claude_prompt():
    seg_file = DATA_DIR / "raw_segments.json"
    if not seg_file.exists():
        raise HTTPException(status_code=400, detail="No transcript parsed yet. Complete Stage 1 first.")
    segments = json.loads(seg_file.read_text())
    prompt = sb.build_claude_prompt(segments)
    return {"prompt": prompt}


# ─── Stage 2b — Process Claude Response ──────────────────────────────────────
@app.post("/api/process-scenes")
async def process_scenes(body: ScenesPayload):
    try:
        scenes = sb.validate_claude_response(body.scenes_json)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    async with aiofiles.open(DATA_DIR / "scenes.json", "w") as f:
        await f.write(json.dumps(scenes, indent=2))

    _state["stage2_complete"] = True
    _state["scene_count"] = len(scenes)

    # Auto-run scene splitting
    final_scenes = sb.split_scenes(scenes)
    async with aiofiles.open(DATA_DIR / "final_scenes.json", "w") as f:
        await f.write(json.dumps(final_scenes, indent=2))
    _state["stage3_complete"] = True
    _state["final_scene_count"] = len(final_scenes)
    await _save_state()

    return {"scenes": scenes, "final_scenes": final_scenes, "scene_count": len(scenes), "final_scene_count": len(final_scenes)}


# ─── Stage 3 — Split Scenes (explicit endpoint) ───────────────────────────────
@app.post("/api/split-scenes")
async def split_scenes_endpoint():
    scenes_file = DATA_DIR / "scenes.json"
    if not scenes_file.exists():
        raise HTTPException(status_code=400, detail="No scenes processed yet.")
    scenes = json.loads(scenes_file.read_text())
    final = sb.split_scenes(scenes)
    async with aiofiles.open(DATA_DIR / "final_scenes.json", "w") as f:
        await f.write(json.dumps(final, indent=2))
    _state["stage3_complete"] = True
    _state["final_scene_count"] = len(final)
    await _save_state()
    return {"final_scenes": final, "count": len(final)}


# ─── Stage 4 — Format Prompts ────────────────────────────────────────────────
@app.post("/api/format-prompts")
async def format_prompts():
    fs_file = DATA_DIR / "final_scenes.json"
    if not fs_file.exists():
        raise HTTPException(status_code=400, detail="No final scenes yet. Complete Stage 3 first.")
    scenes = json.loads(fs_file.read_text())

    # Preserve locks from existing formatted_prompts.json if it exists
    existing_locked: dict[int, str] = {}
    fp_file = DATA_DIR / "formatted_prompts.json"
    if fp_file.exists():
        try:
            old = json.loads(fp_file.read_text())
            existing_locked = {p["scene_id"]: p["formatted_prompt"] for p in old if p.get("locked")}
        except Exception:
            pass

    formatted = pf.format_all_prompts(scenes)
    for p in formatted:
        if p["scene_id"] in existing_locked:
            p["formatted_prompt"] = existing_locked[p["scene_id"]]
            p["locked"] = True
            p["char_count"] = len(p["formatted_prompt"])

    async with aiofiles.open(fp_file, "w") as f:
        await f.write(json.dumps(formatted, indent=2))

    _state["stage4_complete"] = True
    await _save_state()
    return {"formatted_prompts": formatted, "count": len(formatted)}


# ─── Stage 4 — Update Single Prompt ──────────────────────────────────────────
@app.put("/api/update-prompt/{scene_id}")
async def update_prompt(scene_id: int, body: PromptUpdatePayload):
    fp_file = DATA_DIR / "formatted_prompts.json"
    if not fp_file.exists():
        raise HTTPException(status_code=400, detail="No formatted prompts yet.")
    prompts = json.loads(fp_file.read_text())
    updated = pf.update_prompt(prompts, scene_id, body.prompt)
    async with aiofiles.open(fp_file, "w") as f:
        await f.write(json.dumps(updated, indent=2))
    return {"scene_id": scene_id, "updated": True}


# ─── Stage 5 — Generate Single Image ─────────────────────────────────────────
@app.post("/api/generate-image/{scene_id}")
async def generate_single_image(scene_id: int, request_obj: dict = None):
    from fastapi import Request
    fp_file = DATA_DIR / "formatted_prompts.json"
    if not fp_file.exists():
        raise HTTPException(status_code=400, detail="No formatted prompts yet.")
    prompts = json.loads(fp_file.read_text())
    target = next((p for p in prompts if p["scene_id"] == scene_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found.")
    return {"message": "Use POST /api/generate-image/{scene_id} with X-OpenRouter-Key header"}


@app.post("/api/generate-image/{scene_id}/run")
async def run_generate_single_image(scene_id: int, api_key: str):
    fp_file = DATA_DIR / "formatted_prompts.json"
    if not fp_file.exists():
        raise HTTPException(status_code=400, detail="No formatted prompts yet.")
    prompts = json.loads(fp_file.read_text())
    target = next((p for p in prompts if p["scene_id"] == scene_id), None)
    if not target:
        raise HTTPException(status_code=404, detail=f"Scene {scene_id} not found.")

    result = {"scene_id": scene_id, "success": False, "error": None}

    async def noop_cb(event):
        pass

    r = await ig.generate_image_for_scene(scene_id, target["formatted_prompt"], api_key, IMAGES_DIR, noop_cb)
    if r["success"]:
        filename = ig._scene_filename(scene_id)
        return {"scene_id": scene_id, "success": True, "url": f"/api/outputs/images/{filename}"}
    else:
        raise HTTPException(status_code=500, detail=r.get("error", "Generation failed"))


# ─── Stage 5 — Generate All Images ───────────────────────────────────────────
async def _sse_broadcast(event: dict):
    dead = set()
    for q in _sse_subscribers:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead.add(q)
    for q in dead:
        _sse_subscribers.discard(q)


@app.post("/api/generate-all-images")
async def generate_all_images_endpoint(api_key: str):
    fp_file = DATA_DIR / "formatted_prompts.json"
    if not fp_file.exists():
        raise HTTPException(status_code=400, detail="No formatted prompts yet.")
    prompts = json.loads(fp_file.read_text())

    # Use a fan-out queue that pushes to all SSE subscribers
    relay_queue: asyncio.Queue = asyncio.Queue()

    async def relay():
        while True:
            event = await relay_queue.get()
            await _sse_broadcast(event)
            if event.get("type") in ("done", "error"):
                break

    async def run():
        try:
            summary = await ig.generate_all_images(prompts, api_key, IMAGES_DIR, relay_queue)
            _state["stage5_complete"] = True
            _state["images_generated"] = summary["completed"]
            _state["images_failed"] = summary["failed"]
            await _save_state()
        except Exception as e:
            await relay_queue.put({"type": "error", "message": str(e)})

    asyncio.create_task(relay())
    asyncio.create_task(run())
    return {"message": "Generation started", "total": len(prompts)}


# ─── Stage 5 — SSE Progress ───────────────────────────────────────────────────
@app.get("/api/generation-progress")
async def generation_progress():
    queue: asyncio.Queue = asyncio.Queue()
    _sse_subscribers.add(queue)

    async def event_generator():
        try:
            while True:
                event = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield {"data": json.dumps(event)}
                if event.get("type") in ("done", "error"):
                    break
        except asyncio.TimeoutError:
            yield {"data": json.dumps({"type": "heartbeat"})}
        finally:
            _sse_subscribers.discard(queue)

    return EventSourceResponse(event_generator())


# ─── Stage 6 — Assemble Video ────────────────────────────────────────────────
@app.websocket("/ws/ffmpeg-progress")
async def ffmpeg_progress_ws(websocket: WebSocket):
    await websocket.accept()
    queue: asyncio.Queue = asyncio.Queue()
    _ws_subscribers.add(queue)

    # Replay buffered logs for reconnecting clients
    for line in _ffmpeg_log_buffer:
        try:
            await websocket.send_text(line)
        except Exception:
            _ws_subscribers.discard(queue)
            return

    try:
        while True:
            msg = await asyncio.wait_for(queue.get(), timeout=30.0)
            await websocket.send_text(msg)
            parsed = json.loads(msg)
            if parsed.get("type") in ("done", "error"):
                break
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        _ws_subscribers.discard(queue)


async def _ws_broadcast(msg: str):
    _ffmpeg_log_buffer.append(msg)
    if len(_ffmpeg_log_buffer) > 500:
        _ffmpeg_log_buffer.pop(0)
    dead = set()
    for q in _ws_subscribers:
        try:
            q.put_nowait(msg)
        except asyncio.QueueFull:
            dead.add(q)
    for q in dead:
        _ws_subscribers.discard(q)


@app.post("/api/assemble-video")
async def assemble_video_endpoint(body: AssemblePayload):
    global _assembly_running
    if _assembly_running:
        raise HTTPException(status_code=409, detail="Assembly already in progress.")

    fs_file = DATA_DIR / "final_scenes.json"
    if not fs_file.exists():
        raise HTTPException(status_code=400, detail="No final scenes yet.")
    final_scenes = json.loads(fs_file.read_text())

    if not _state.get("mp4_filename"):
        raise HTTPException(status_code=400, detail="No audio file found. Complete Stage 1 first.")
    mp4_path = INPUTS_DIR / _state["mp4_filename"]
    if not mp4_path.exists():
        raise HTTPException(status_code=400, detail=f"Audio file not found: {mp4_path}")

    _ffmpeg_log_buffer.clear()
    _assembly_running = True

    async def run():
        global _assembly_running
        try:
            result = await va.assemble_video(
                final_scenes, IMAGES_DIR, mp4_path, VIDEOS_DIR, _ws_broadcast, body.format
            )
            _state["stage6_complete"] = True
            _state["video_portrait_ready"] = result.get("portrait") is not None
            _state["video_landscape_ready"] = result.get("landscape") is not None
            await _save_state()
        except BaseException as e:
            await _ws_broadcast(json.dumps({"type": "error", "message": f"{type(e).__name__}: {e}"}))
        finally:
            _assembly_running = False

    asyncio.create_task(run())
    return {"message": "Assembly started", "format": body.format}


# ─── State ────────────────────────────────────────────────────────────────────
@app.get("/api/assemble-log")
async def get_assemble_log():
    return {"log": _ffmpeg_log_buffer}


@app.get("/api/state")
async def get_state():
    return _state


# ─── Static file serving ──────────────────────────────────────────────────────
@app.get("/api/outputs/images/{filename}")
async def serve_image(filename: str):
    file_path = IMAGES_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(file_path)


@app.get("/api/outputs/videos/{filename}")
async def serve_video(filename: str):
    file_path = VIDEOS_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(file_path)
