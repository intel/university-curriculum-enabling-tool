import os
import json
import tempfile
from pptx import Presentation
from pptx.util import Inches
from .constants import SLIDE_WIDTH, SLIDE_HEIGHT
from .localization import set_language, t
from .slide_counter import calculate_total_slides
from .sections import (
    create_title_slide,
    create_agenda_slide,
    create_learning_outcomes_slide,
    create_key_terms_slide,
    create_content_slides,
    create_activity_slides,
    create_quiz_slides,
    create_discussion_slides,
    create_further_readings_slides,
    create_facilitation_notes_slide,
    create_closing_slide,
)


def build_full_presentation(content, language="en"):
    set_language(language)
    total_slides = calculate_total_slides(content)
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_WIDTH)
    prs.slide_height = Inches(SLIDE_HEIGHT)
    create_title_slide(prs, content)
    create_agenda_slide(prs, content, total_slides)
    create_learning_outcomes_slide(prs, content, total_slides)
    create_key_terms_slide(prs, content, total_slides)
    create_content_slides(prs, content, total_slides)
    create_activity_slides(prs, content, total_slides)
    create_quiz_slides(prs, content, total_slides)
    create_discussion_slides(prs, content, total_slides)
    create_further_readings_slides(prs, content, total_slides)
    facilitation_slide = create_facilitation_notes_slide(prs, content, total_slides)
    if facilitation_slide:
        total_slides += 1  # update for closing slide numbering if needed
    create_closing_slide(prs, content, total_slides, total_slides)
    return prs


def create_pptx(content: dict, output_path: str, language: str = "en"):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    normalized_output_path = os.path.abspath(output_path)
    allowed_output = os.path.abspath(os.path.join(base_dir, "..", "output"))
    parent = os.path.dirname(normalized_output_path)
    is_temp = parent.startswith(os.path.abspath(tempfile.gettempdir()))
    is_out = normalized_output_path.startswith(allowed_output)
    if not (is_temp or is_out):
        raise ValueError(
            "Security violation: Output path must be in allowed directories"
        )
    prs = build_full_presentation(content, language)
    prs.save(normalized_output_path)


def cli_build(content_path, output_path, language="en"):
    with open(content_path, "r") as f:
        content = json.load(f)
    create_pptx(content, output_path, language)
