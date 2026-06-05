import asyncio
import json
import shutil
from pathlib import Path
from typing import Callable, Awaitable

PORTRAIT_FILTER = (
    "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,"
    "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=#FAF7F2[v]"
)
LANDSCAPE_FILTER = (
    "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,"
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=#FAF7F2[v]"
)

def _ffmpeg_bin() -> str:
    return shutil.which("ffmpeg") or "ffmpeg"


def _ts_to_seconds(ts: str) -> float:
    parts = ts.strip().split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    elif len(parts) == 2:
        return int(parts[0]) * 60 + float(parts[1])
    return float(parts[0])


def build_ffmpeg_concat_list(scenes: list[dict], images_dir: Path) -> Path:
    concat_path = images_dir / "concat.txt"
    lines = []
    for scene in scenes:
        filename = f"scene_{scene['scene_id']:03d}.png"
        start = _ts_to_seconds(scene["start"])
        end = _ts_to_seconds(scene["end"])
        duration = max(0.1, end - start)
        lines.append(f"file '{filename}'")
        lines.append(f"duration {duration:.3f}")
    # Repeat last image without duration to avoid black frame
    if scenes:
        last_filename = f"scene_{scenes[-1]['scene_id']:03d}.png"
        lines.append(f"file '{last_filename}'")
    concat_path.write_text("\n".join(lines), encoding="utf-8")
    return concat_path


async def _run_ffmpeg_with_streaming(
    cmd: list[str],
    ws_send: Callable[[str], Awaitable[None]],
    label: str,
    cwd: Path = None,
) -> int:
    import subprocess as _sp
    import json as _json

    def _run_sync() -> tuple[int, list[str]]:
        proc = _sp.Popen(
            cmd,
            stdout=_sp.PIPE,
            stderr=_sp.PIPE,
            cwd=str(cwd) if cwd else None,
        )
        _, stderr_bytes = proc.communicate()
        lines = stderr_bytes.decode("utf-8", errors="replace").splitlines()
        return proc.returncode, lines

    loop = asyncio.get_running_loop()
    rc, lines = await loop.run_in_executor(None, _run_sync)
    for line in lines:
        await ws_send(_json.dumps({"type": "log", "label": label, "line": line}))
    return rc


async def extract_audio_async(
    mp4_path: Path,
    output_dir: Path,
    ws_send: Callable[[str], Awaitable[None]],
) -> Path:
    audio_path = output_dir / "audio.aac"
    ffmpeg = _ffmpeg_bin()
    cmd = [ffmpeg, "-y", "-i", str(mp4_path), "-vn", "-acodec", "copy", str(audio_path)]
    import json as _json
    await ws_send(_json.dumps({"type": "stage", "label": "Extracting audio..."}))
    rc = await _run_ffmpeg_with_streaming(cmd, ws_send, "audio")
    if rc != 0:
        # Fallback to re-encode
        cmd_fallback = [
            ffmpeg, "-y", "-i", str(mp4_path),
            "-vn", "-acodec", "aac", "-b:a", "192k", str(audio_path),
        ]
        rc2 = await _run_ffmpeg_with_streaming(cmd_fallback, ws_send, "audio-encode")
        if rc2 != 0:
            raise RuntimeError("FFmpeg failed to extract audio.")
    return audio_path


async def _build_video(
    concat_path: Path,
    audio_path: Path,
    output_path: Path,
    filter_chain: str,
    ws_send: Callable[[str], Awaitable[None]],
    label: str,
    images_dir: Path,
) -> None:
    import json as _json
    await ws_send(_json.dumps({"type": "stage", "label": f"Building {label} video..."}))
    cmd = [
        _ffmpeg_bin(), "-y",
        "-f", "concat", "-safe", "0",
        "-i", "concat.txt",
        "-i", str(audio_path),
        "-filter_complex", filter_chain,
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-r", "24", "-preset", "fast", "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        "-shortest",
        str(output_path),
    ]
    rc = await _run_ffmpeg_with_streaming(cmd, ws_send, label, cwd=images_dir)
    if rc != 0:
        raise RuntimeError(f"FFmpeg failed building {label} video (exit code {rc}).")


async def assemble_video(
    final_scenes: list[dict],
    images_dir: Path,
    mp4_input_path: Path,
    output_dir: Path,
    ws_send: Callable[[str], Awaitable[None]],
    fmt: str = "both",
) -> dict:
    import json as _json

    concat_path = build_ffmpeg_concat_list(final_scenes, images_dir)
    audio_path = await extract_audio_async(mp4_input_path, output_dir, ws_send)

    portrait_path = output_dir / "final_video_portrait.mp4"
    landscape_path = output_dir / "final_video_landscape.mp4"

    if fmt in ("portrait", "both"):
        await _build_video(concat_path, audio_path, portrait_path, PORTRAIT_FILTER, ws_send, "portrait", images_dir)

    if fmt in ("landscape", "both"):
        await _build_video(concat_path, audio_path, landscape_path, LANDSCAPE_FILTER, ws_send, "landscape", images_dir)

    result = {
        "portrait": f"/api/outputs/videos/final_video_portrait.mp4" if fmt in ("portrait", "both") else None,
        "landscape": f"/api/outputs/videos/final_video_landscape.mp4" if fmt in ("landscape", "both") else None,
    }
    await ws_send(_json.dumps({"type": "done", **result}))
    return result
