import re
from pathlib import Path


def _ts_to_seconds(ts: str) -> float:
    ts = ts.strip().replace(",", ".")
    # Handle (123.4s) format
    if ts.startswith("(") and ts.endswith("s)"):
        return float(ts[1:-2])
    parts = ts.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    elif len(parts) == 2:
        m, s = parts
        return int(m) * 60 + float(s)
    return float(parts[0])


def _infer_segment_end(segments: list[dict]) -> list[dict]:
    if not segments:
        return segments
    for i in range(len(segments) - 1):
        segments[i]["end"] = segments[i + 1]["start"]
        segments[i]["duration"] = segments[i]["end"] - segments[i]["start"]
    # Last segment: use average duration of previous, or 5s default
    if len(segments) > 1:
        avg = sum(s["duration"] for s in segments[:-1]) / (len(segments) - 1)
    else:
        avg = 5.0
    segments[-1]["end"] = segments[-1]["start"] + avg
    segments[-1]["duration"] = avg
    return segments


def _build_segments(raw: list[tuple[float, str]]) -> list[dict]:
    segs = []
    for i, (start, text) in enumerate(raw):
        segs.append({"id": i, "start": start, "end": 0.0, "text": text.strip(), "duration": 0.0})
    return _infer_segment_end(segs)


def parse_transcript(txt_content: str, mp4_filename: str = "") -> list[dict]:
    lines = [l.strip() for l in txt_content.splitlines() if l.strip()]

    # Priority 1: WebVTT/SRT  [HH:MM:SS.mmm --> HH:MM:SS.mmm] text
    SRT_PATTERN = re.compile(
        r"\[?(\d{1,2}:\d{2}:\d{2}[.,]\d+)\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d+)\]?\s*(.*)"
    )
    srt_matches = []
    for line in lines:
        m = SRT_PATTERN.match(line)
        if m:
            srt_matches.append(m)
    if srt_matches:
        segs = []
        for i, m in enumerate(srt_matches):
            start = _ts_to_seconds(m.group(1))
            end = _ts_to_seconds(m.group(2))
            text = m.group(3).strip()
            segs.append({"id": i, "start": start, "end": end, "text": text, "duration": round(end - start, 3)})
        return segs

    # Priority 2: Bracket timestamp  [HH:MM:SS] text  or  [MM:SS] text
    BRACKET_PATTERN = re.compile(r"^\[(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?)\]\s*(.*)")
    bracket_raw = []
    for line in lines:
        m = BRACKET_PATTERN.match(line)
        if m:
            bracket_raw.append((_ts_to_seconds(m.group(1)), m.group(2)))
    if len(bracket_raw) >= 2:
        return _build_segments(bracket_raw)

    # Priority 3: Bare timestamp  HH:MM:SS text
    BARE_PATTERN = re.compile(r"^(\d{1,2}:\d{2}:\d{2}(?:[.,]\d+)?)\s+(.*)")
    bare_raw = []
    for line in lines:
        m = BARE_PATTERN.match(line)
        if m:
            bare_raw.append((_ts_to_seconds(m.group(1)), m.group(2)))
    if len(bare_raw) >= 2:
        return _build_segments(bare_raw)

    # Priority 4: Seconds notation  (123.4s) text
    SECS_PATTERN = re.compile(r"^\((\d+(?:\.\d+)?s?)\)\s*(.*)")
    secs_raw = []
    for line in lines:
        m = SECS_PATTERN.match(line)
        if m:
            raw_ts = m.group(1)
            if not raw_ts.endswith("s"):
                raw_ts += "s"
            secs_raw.append((_ts_to_seconds(f"({raw_ts})"), m.group(2)))
    if len(secs_raw) >= 2:
        return _build_segments(secs_raw)

    # Fallback: plain text with no timestamps
    # Split on blank lines into paragraphs, estimate timing at 130 wpm
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", txt_content.strip()) if p.strip()]
    if paragraphs:
        WORDS_PER_SECOND = 130 / 60
        cursor = 0.0
        segs = []
        for i, para in enumerate(paragraphs):
            word_count = max(1, len(para.split()))
            duration = word_count / WORDS_PER_SECOND
            segs.append({
                "id": i,
                "start": round(cursor, 3),
                "end": round(cursor + duration, 3),
                "text": para,
                "duration": round(duration, 3),
            })
            cursor += duration
        return segs

    raise ValueError(
        "Could not parse transcript. Supported formats: [HH:MM:SS] text, "
        "HH:MM:SS text, (123.4s) text, SRT/WebVTT, or plain paragraphs separated by blank lines."
    )
