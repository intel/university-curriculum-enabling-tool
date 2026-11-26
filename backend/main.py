# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0
from fastapi import BackgroundTasks, FastAPI, HTTPException, File, UploadFile
from pydantic import BaseModel
import fitz  # PyMuPDF
from pathlib import Path
import os
import re
import shutil
import glob
from generate_caption import generate_dynamic_caption
from generate_image_embedding import generate_image_embedding
from fastapi.responses import FileResponse, JSONResponse
from generate_pptx import create_pptx
from generate_pptx import create_pptx
from starlette.background import BackgroundTask
import tempfile
import imagehash
from PIL import Image
import io
import uuid
from typing import Dict
import json

# Maximum accepted request body size, in bytes (T11: oversized content).
MAX_REQUEST_BODY_BYTES = int(os.environ.get("MAX_REQUEST_BODY_BYTES", 50 * 1024 * 1024))


class MaxBodySizeMiddleware:
    """Rejects oversized request bodies before any parser or generator sees them."""

    def __init__(self, app, max_body_size: int):
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_body_size:
                    response = JSONResponse(
                        {"detail": "Request body exceeds the maximum allowed size."},
                        status_code=413,
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass

        total_size = 0

        async def guarded_receive():
            nonlocal total_size
            message = await receive()
            if message["type"] == "http.request":
                total_size += len(message.get("body", b"") or b"")
                if total_size > self.max_body_size:
                    raise HTTPException(
                        status_code=413,
                        detail="Request body exceeds the maximum allowed size.",
                    )
            return message

        await self.app(scope, guarded_receive, send)


app = FastAPI()
app.add_middleware(MaxBodySizeMiddleware, max_body_size=MAX_REQUEST_BODY_BYTES)

# Get the root directory of the project dynamically
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def process_pdf_to_file(job_id: str, pdf_path: str, filename: str):
    try:
        print(f"Processing job {job_id}")
        pdf_file = fitz.open(str(pdf_path))
        image_data = []
        image_order = 1
        seen_hashes = set()
        extracted_text = []

        for page_index in range(len(pdf_file)):
            page = pdf_file.load_page(page_index)
            extracted_text.append(page.get_text())

            # Extract images from the page
            image_list = page.get_images(full=True)
            for image_index, img in enumerate(image_list, start=1):
                xref = img[0]
                base_image = pdf_file.extract_image(xref)
                image_bytes = base_image["image"]
                image_ext = base_image["ext"]

                # Compute perceptual hash
                pil_img = Image.open(io.BytesIO(image_bytes))
                phash = str(imagehash.phash(pil_img))
                if phash in seen_hashes:
                    print(f"DEBUG: Skipping duplicate/similar image (hash: {phash})")
                    continue
                seen_hashes.add(phash)

                image_name = f"image{page_index+1}_{image_index}.{image_ext}"

                # Generate caption and embedding for the image
                try:
                    caption = generate_dynamic_caption(image_bytes)
                    if caption is not None:
                        embedding = generate_image_embedding(image_bytes)
                        image_data.append(
                            {
                                "filename": image_name,
                                "embedding": embedding,
                                "order": image_order,
                                "image_bytes": image_bytes.hex(),
                            }
                        )
                        image_order += 1
                except Exception as e:
                    print(f"Error processing image {image_name}: {e}")

        # Prepare the response data
        response_data = {
            "name": filename,
            "details": f"Extracted {len(image_data)} images from the PDF.",
            "images": image_data,
            "text": extracted_text,
        }

        temp_dir = tempfile.gettempdir()
        result_path = os.path.join(temp_dir, f"{job_id}.json")
        with open(result_path, "w") as f:
            json.dump(response_data, f)

    except Exception as e:
        print(f"Error in processing pdf job_id: {job_id}: {e}")

    finally:
        try:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)
        except Exception as cleanup_err:
            print(f"Warning: Failed to remove temporary PDF {pdf_path}: {cleanup_err}")


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...), background_tasks: BackgroundTasks = None
):
    try:
        # Generate job ID
        job_id = str(uuid.uuid4())
        tmp_dir = tempfile.gettempdir()
        tmp_path = os.path.join(tmp_dir, f"{job_id}_{file.filename}")

        # Save uploaded file to /tmp
        with open(tmp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Schedule background PDF processing
        background_tasks.add_task(process_pdf_to_file, job_id, tmp_path, file.filename)

        return {"jobID": job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {e}")


@app.get("/result/{job_id}")
def get_result(job_id: str):
    temp_dir = tempfile.gettempdir()
    result_path = os.path.join(temp_dir, f"{job_id}.json")
    if not os.path.exists(result_path):
        return JSONResponse(
            status_code=202, content={"message": "PDF processing not complete yet."}
        )

    with open(result_path, "r") as f:
        result = json.load(f)
        return result


class PPTXRequest(BaseModel):
    content: dict
    language: str | None = "en"


# Size limits guard against oversized/deeply-nested model output reaching the
# PPTX generator (T11: document and archive injection).
MAX_TITLE_LENGTH = 300
MAX_TEXT_LENGTH = 20_000
MAX_SHORT_FIELD_LENGTH = 100
MAX_SLIDES = 80
MAX_ACTIVITIES = 40
MAX_ASSESSMENT_IDEAS = 30
MAX_QUESTIONS_PER_IDEA = 50
MAX_KEY_TERMS = 150
MAX_FURTHER_READINGS = 80
MAX_LEARNING_OUTCOMES = 100
MAX_LIST_ITEMS = 100

_CONTROL_CHARS_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")
_UNSAFE_URI_SCHEME_RE = re.compile(r"(?i)\b(javascript|vbscript|data):")


def sanitize_text(value, max_length: int = MAX_TEXT_LENGTH) -> str:
    """Strip control characters and neutralize script-like URI schemes from untrusted text."""
    if not isinstance(value, str):
        return ""
    cleaned = _CONTROL_CHARS_RE.sub("", value)
    cleaned = _UNSAFE_URI_SCHEME_RE.sub("blocked-uri:", cleaned)
    return cleaned[:max_length]


def sanitize_text_list(value, max_items: int = MAX_LIST_ITEMS, max_length: int = MAX_TEXT_LENGTH):
    if not isinstance(value, list):
        return []
    return [sanitize_text(item, max_length) for item in value[:max_items] if isinstance(item, str)]


def as_dict_list(value, max_items: int):
    if not isinstance(value, list):
        return []
    return [item for item in value[:max_items] if isinstance(item, dict)]


def validate_and_transform_content(content: dict) -> dict:
    """
    Validate, size-limit, and sanitize the incoming content to match the
    expected format used in the create_pptx function.

    Treats all model/document content as untrusted: text fields are stripped of
    control characters and script-like URI schemes, and every list is capped to
    prevent oversized or deeply nested payloads.

    Args:
        content (dict): The incoming content structure.

    Returns:
        dict: The transformed content structure.
    """
    # Ensure required keys exist with default values if missing
    transformed_content = {
        "title": sanitize_text(content.get("title", ""), MAX_TITLE_LENGTH),
        "contentType": sanitize_text(content.get("contentType", "lecture"), MAX_SHORT_FIELD_LENGTH),
        "difficultyLevel": sanitize_text(
            content.get("difficultyLevel", "intermediate"), MAX_SHORT_FIELD_LENGTH
        ),
        "slides": as_dict_list(content.get("slides", []), MAX_SLIDES),
        "activities": as_dict_list(content.get("activities", []), MAX_ACTIVITIES),
        "assessmentIdeas": as_dict_list(content.get("assessmentIdeas", []), MAX_ASSESSMENT_IDEAS),
        "keyTerms": as_dict_list(content.get("keyTerms", []), MAX_KEY_TERMS),
        "furtherReadings": as_dict_list(content.get("furtherReadings", []), MAX_FURTHER_READINGS),
        "learningOutcomes": sanitize_text_list(
            content.get("learningOutcomes", []), MAX_LEARNING_OUTCOMES
        ),
    }

    # Validate slides structure
    for slide in transformed_content["slides"]:
        slide["title"] = sanitize_text(slide.get("title", ""), MAX_TITLE_LENGTH)
        slide["content"] = sanitize_text_list(slide.get("content", []))
        slide["notes"] = sanitize_text(slide.get("notes", ""))

    # Validate activities structure
    for activity in transformed_content["activities"]:
        activity["title"] = sanitize_text(activity.get("title", ""), MAX_TITLE_LENGTH)
        activity["description"] = sanitize_text(activity.get("description", ""))
        activity["type"] = sanitize_text(activity.get("type", "Exercise"), MAX_SHORT_FIELD_LENGTH)
        activity["duration"] = sanitize_text(
            activity.get("duration", "20 minutes"), MAX_SHORT_FIELD_LENGTH
        )
        activity["instructions"] = sanitize_text_list(activity.get("instructions", []))
        activity["materials"] = sanitize_text_list(activity.get("materials", []))

    # Validate assessment ideas structure
    for idea in transformed_content["assessmentIdeas"]:
        idea["type"] = sanitize_text(idea.get("type", "Assessment"), MAX_SHORT_FIELD_LENGTH)
        idea["exampleQuestions"] = as_dict_list(
            idea.get("exampleQuestions", []), MAX_QUESTIONS_PER_IDEA
        )
        for question in idea["exampleQuestions"]:
            question["question"] = sanitize_text(question.get("question", "Example question"))
            question["options"] = sanitize_text_list(question.get("options", []))
            question["correctAnswer"] = sanitize_text(question.get("correctAnswer", ""))
            question["explanation"] = sanitize_text(question.get("explanation", ""))

    # Validate key terms structure
    for term in transformed_content["keyTerms"]:
        term["term"] = sanitize_text(term.get("term", ""), MAX_TITLE_LENGTH)
        term["definition"] = sanitize_text(term.get("definition", ""))

    # Validate further readings structure
    for reading in transformed_content["furtherReadings"]:
        reading["title"] = sanitize_text(reading.get("title", ""), MAX_TITLE_LENGTH)
        reading["author"] = sanitize_text(reading.get("author", ""), MAX_TITLE_LENGTH)
        reading["readingDescription"] = sanitize_text(reading.get("readingDescription", ""))

    return transformed_content


@app.post("/generate-pptx")
async def generate_pptx(request: PPTXRequest):
    """Endpoint to generate a PowerPoint presentation."""
    # Use tempfile.gettempdir() for secure temporary directory
    dir_slide = tempfile.gettempdir()
    try:
        # Validate and transform the content
        transformed_content = validate_and_transform_content(request.content)

        # Create a temporary file for the PPTX
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=".pptx", dir=dir_slide
        ) as temp_pptx_file:
            temp_pptx_path = temp_pptx_file.name

        print(temp_pptx_path)

        # Generate the PPTX file
        lang = (request.language or "en").lower()
        if lang not in ["en", "id"]:
            lang = "en"
        create_pptx(transformed_content, temp_pptx_path, lang)
        print(f"Temporary PPTX file created at: {temp_pptx_path}")

        if not os.path.exists(temp_pptx_path):
            raise HTTPException(status_code=500, detail="Failed to generate PPTX file.")

        # Define a cleanup task to delete the temporary file after serving
        async def cleanup_temp_file():
            try:
                os.remove(temp_pptx_path)
                print(f"Temporary file {temp_pptx_path} deleted.")
            except Exception as e:
                print(f"Error deleting temporary file {temp_pptx_path}: {e}")

        # Serve the PPTX file as a response
        return FileResponse(
            path=temp_pptx_path,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename="generated_presentation.pptx",
            background=BackgroundTask(cleanup_temp_file),
        )

    except Exception as e:
        print(f"Error generating PPTX: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while generating the PPTX file: {e}",
        )


if __name__ == "__main__":
    import uvicorn
    import os

    # Get host and port from environment variables with defaults
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", 8016))

    print(f"Starting backend server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)
