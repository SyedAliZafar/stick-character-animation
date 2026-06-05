import asyncio
import base64
import requests
from pathlib import Path
from typing import Callable, Awaitable

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
_SEMAPHORE = asyncio.Semaphore(3)


def _scene_filename(scene_id: int) -> str:
    return f"scene_{scene_id:03d}.png"


def _generate_image_openrouter(prompt: str, api_key: str) -> bytes:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "google/gemini-2.5-flash-image",
        "messages": [{"role": "user", "content": prompt}],
        "response_modalities": ["IMAGE", "TEXT"],
    }
    response = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=120)

    if not response.ok:
        raise RuntimeError(f"OpenRouter HTTP {response.status_code}: {response.text[:500]}")

    data = response.json()

    # Surface any API-level error object
    if "error" in data:
        raise RuntimeError(f"OpenRouter error: {data['error']}")

    choices = data.get("choices")
    if not choices:
        raise RuntimeError(f"No choices in response: {str(data)[:500]}")

    msg = choices[0]["message"]

    # gemini-2.5-flash-image returns image in msg["images"]
    for img_part in msg.get("images") or []:
        if img_part.get("type") == "image_url":
            data_url = img_part["image_url"]["url"]
            return base64.b64decode(data_url.split(",", 1)[1])

    content = msg.get("content", "")

    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get("type") == "image_url":
                    data_url = part["image_url"]["url"]
                    return base64.b64decode(data_url.split(",", 1)[1])
                if part.get("type") == "image" and part.get("data"):
                    return base64.b64decode(part["data"])

    if isinstance(content, str) and content.startswith("data:image"):
        return base64.b64decode(content.split(",", 1)[1])

    raise RuntimeError(
        f"No image data found in response. msg keys: {list(msg.keys())}"
    )


async def generate_image_for_scene(
    scene_id: int,
    prompt: str,
    api_key: str,
    output_dir: Path,
    progress_callback: Callable[[dict], Awaitable[None]],
) -> dict:
    async with _SEMAPHORE:
        await progress_callback({"type": "progress", "scene_id": scene_id, "status": "generating"})
        loop = asyncio.get_event_loop()
        try:
            img_bytes = await loop.run_in_executor(None, _generate_image_openrouter, prompt, api_key)
            filename = _scene_filename(scene_id)
            file_path = output_dir / filename
            file_path.write_bytes(img_bytes)
            await progress_callback({
                "type": "image_ready",
                "scene_id": scene_id,
                "url": f"/api/outputs/images/{filename}",
            })
            return {"scene_id": scene_id, "success": True, "file_path": str(file_path)}
        except Exception as e:
            error_msg = str(e)
            await progress_callback({"type": "image_error", "scene_id": scene_id, "error": error_msg})
            return {"scene_id": scene_id, "success": False, "error": error_msg}


async def generate_all_images(
    formatted_prompts: list[dict],
    api_key: str,
    output_dir: Path,
    progress_queue: asyncio.Queue,
) -> dict:
    total = len(formatted_prompts)

    async def push(event: dict):
        # Inject running totals
        await progress_queue.put(event)

    await progress_queue.put({"type": "started", "total": total})

    tasks = [
        generate_image_for_scene(
            p["scene_id"],
            p["formatted_prompt"],
            api_key,
            output_dir,
            push,
        )
        for p in formatted_prompts
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    succeeded = 0
    failed_ids = []
    for r in results:
        if isinstance(r, Exception):
            failed_ids.append(-1)
        elif r.get("success"):
            succeeded += 1
        else:
            failed_ids.append(r["scene_id"])

    summary = {"type": "done", "completed": succeeded, "failed": failed_ids, "total": total}
    await progress_queue.put(summary)
    return summary
