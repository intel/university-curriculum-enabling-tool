import math, re, json
from .constants import (
    BULLET_MARKERS,
    SUB_BULLET_MARKERS,
    FOOTER_Y,
    CONTENT_START_Y,
    AVAILABLE_CONTENT_HEIGHT,
)


def clean_slide_title(title: str) -> str:
    if ":" in title:
        return title.split(":", 1)[1].strip()
    parts = title.split()
    if (
        len(parts) > 1
        and parts[0].lower() == "slide"
        and parts[1].replace(":", "").isdigit()
    ):
        return " ".join(parts[2:]).strip()
    return title.strip()


def clean_activity_title(title: str) -> str:
    if ":" in title:
        return title.split(":", 1)[1].strip()
    parts = title.split()
    if (
        len(parts) > 1
        and parts[0].lower() == "activity"
        and parts[1].replace(":", "").isdigit()
    ):
        return " ".join(parts[2:]).strip()
    return title.strip()


def detect_bullet_level(text: str):
    text = text.strip()
    for marker in BULLET_MARKERS:
        if text.startswith(marker):
            return True, 0, text[len(marker) :].strip()
    if text.startswith("  ") or text.startswith("\t"):
        stripped = text.lstrip()
        for marker in SUB_BULLET_MARKERS:
            if stripped.startswith(marker):
                return True, 1, stripped[len(marker) :].strip()
        return True, 1, stripped
    if re.match(r"^\d+\.\s", text):
        return False, 0, text
    return False, 0, text


def calculate_dynamic_spacing(
    items, available_height=AVAILABLE_CONTENT_HEIGHT, min_height=0.4
):
    if not items:
        return min_height
    count = len(items)
    return min(0.8, max(min_height, available_height / max(count, 1)))


def estimate_text_height(text: str, font_size: int, width: float):
    chars_per_inch = 120 / (font_size / 10)
    chars_per_line = max(1, int(chars_per_inch * width))
    lines = math.ceil(len(text) / chars_per_line)
    line_height = (font_size / 72) * 1.2
    return max(0.2, lines * line_height)


def check_content_overflow(y: float, h: float, footer=FOOTER_Y):
    return (y + h) > (footer - 0.2)


def extract_facilitation_content(text: str):
    clean_description = text
    facilitation_notes = ""
    learning_objectives = ""
    facilitation_patterns = [
        "Facilitation notes:",
        "Facilitation Notes:",
        "FACILITATION NOTES:",
        "Facilitator notes:",
        "Facilitator guidance:",
        "Facilitation tip:",
        "Catatan fasilitasi:",
        "Catatan Fasilitasi:",
        "Panduan Fasilitator:",
    ]
    for pattern in facilitation_patterns:
        if pattern in text:
            parts = text.split(pattern, 1)
            clean_description = parts[0].strip()
            facilitation_notes = parts[1].strip()
            break
    learning_patterns = [
        "Learning Objective:",
        "Learning Objectives:",
        "LEARNING OBJECTIVES:",
        "Success criteria:",
        "Tujuan Pembelajaran:",
        "Kriteria keberhasilan:",
    ]
    source = clean_description if facilitation_notes else text
    for pattern in learning_patterns:
        if pattern in source:
            parts = source.split(pattern, 1)
            clean_description = parts[0].strip()
            learning_objectives = parts[1].strip()
            break
    return clean_description, facilitation_notes, learning_objectives
