STYLE_TEMPLATE = (
    "Off-white warm paper background (#FAF7F2) with 3-5% film grain noise overlay. "
    "Black thick outlines on warm paper. Stick figure character with large circular head, "
    "oval eyes, round pupils. Expression: {emotional_tone}. Scene: {visual_description}. "
    "Clean minimal hand-drawn illustration, no color fill, light grey elliptical ground shadow beneath character."
)


def format_single_prompt(scene: dict) -> str:
    style = STYLE_TEMPLATE.format(
        emotional_tone=scene["emotional_tone"],
        visual_description=scene["visual_description"],
    )
    return f"{style}\n\n{scene['image_prompt']}"


def format_all_prompts(scenes: list[dict]) -> list[dict]:
    result = []
    for scene in scenes:
        formatted = format_single_prompt(scene)
        result.append({
            "scene_id": scene["scene_id"],
            "original_prompt": scene["image_prompt"],
            "formatted_prompt": formatted,
            "locked": False,
            "char_count": len(formatted),
        })
    return result


def update_prompt(formatted_prompts: list[dict], scene_id: int, new_text: str) -> list[dict]:
    updated = []
    for p in formatted_prompts:
        if p["scene_id"] == scene_id:
            updated.append({
                **p,
                "formatted_prompt": new_text,
                "locked": True,
                "char_count": len(new_text),
            })
        else:
            updated.append(p)
    return updated
