from .utils import clean_slide_title
from .constants import FOOTER_Y
import math


def calculate_total_slides(content):
    total = 0
    total += 1  # Title
    # Agenda slides
    agenda_items = []
    agenda_items.append(
        {
            "title": "Introduction",
            "items": ["Learning Outcomes", "Key Terms & Concepts"],
        }
    )
    content_slides = []
    for slide_content in content.get("slides", []):
        if slide_content.get("title", ""):
            title = clean_slide_title(slide_content.get("title", ""))
            if title:
                content_slides.append(title)
    if content_slides:
        agenda_items.append({"title": "Main Content", "items": content_slides})
    activities = []
    for activity in content.get("activities", []):
        activities.append(activity.get("title", ""))
    if activities:
        agenda_items.append({"title": "Activities", "items": activities})
    knowledge_items = []
    quiz_count = 0
    discussion_count = 0
    for idea in content.get("assessmentIdeas", []):
        idea_type = idea.get("type", "").lower()
        if "quiz" in idea_type:
            quiz_count += len(
                [q for q in idea.get("exampleQuestions", []) if q.get("options")]
            )
        elif "discussion" in idea_type:
            discussion_count += len(
                idea.get("exampleQuestions", []) if idea.get("exampleQuestions") else []
            )
    if quiz_count > 0:
        knowledge_items.append(f"Quiz Questions ({quiz_count})")
    if discussion_count > 0:
        knowledge_items.append(f"Discussion Questions ({discussion_count})")
    if knowledge_items:
        agenda_items.append({"title": "Test Your Knowledge", "items": knowledge_items})
    if content.get("furtherReadings", []):
        agenda_items.append(
            {"title": "Additional Resources", "items": ["Further Readings & Resources"]}
        )
    section_height = 0.5
    item_height = 0.35
    total_height_needed = 0
    for section in agenda_items:
        total_height_needed += section_height
        total_height_needed += len(section["items"]) * item_height
    available_height = FOOTER_Y - 1.2
    slides_needed = math.ceil(total_height_needed / available_height)
    total += slides_needed
    total += 1  # Learning outcomes
    key_terms = content.get("keyTerms", [])
    key_terms_per_slide = 4
    if key_terms:
        total += (len(key_terms) + key_terms_per_slide - 1) // key_terms_per_slide
    total += len(content.get("slides", []))
    total += len(content.get("activities", [])) * 2
    for idea in content.get("assessmentIdeas", []):
        if "quiz" in idea.get("type", "").lower():
            total += (
                len([q for q in idea.get("exampleQuestions", []) if q.get("options")])
                * 2
            )
    for idea in content.get("assessmentIdeas", []):
        if "discussion" in idea.get("type", "").lower():
            total += (
                len(
                    idea.get("exampleQuestions", [])
                    if idea.get("exampleQuestions")
                    else []
                )
                * 2
            )
    readings = content.get("furtherReadings", [])
    readings_per_slide = 2
    if readings:
        total += (len(readings) + readings_per_slide - 1) // readings_per_slide
    total += 1  # Closing
    has_facilitation_notes = False
    for activity in content.get("activities", []):
        description = activity.get("description", "")
        for pattern in [
            "Facilitation notes:",
            "Facilitation Notes:",
            "Facilitator notes:",
        ]:
            if pattern in description:
                has_facilitation_notes = True
                break
        if has_facilitation_notes:
            break
    if has_facilitation_notes:
        total += 1
    return total
