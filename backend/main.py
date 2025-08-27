# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

from fastapi import FastAPI, HTTPException, File, UploadFile
from pydantic import BaseModel
import fitz  # PyMuPDF
from pathlib import Path
import os
import shutil
import glob
from generate_caption import generate_dynamic_caption
from generate_image_embedding import generate_image_embedding
from fastapi.responses import FileResponse, JSONResponse
from generate_pptx import create_pptx 
from starlette.background import BackgroundTask
import tempfile
import imagehash
from PIL import Image
import io

app = FastAPI()

# Get the root directory of the project dynamically
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = BASE_DIR / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

@app.post("/parse")
async def parse_pdf(file: UploadFile = File(...)):
    """
    Endpoint to parse a PDF file uploaded via multipart/form-data.
    Extracts images, generates captions and embeddings, and returns the data.
    """
    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=".pdf") as temp_file:
            temp_file.write(await file.read())
            temp_file_path = temp_file.name

            print(f"DEBUG : Temporary PDF file created at: {temp_file_path}")
            # Open the PDF file using PyMuPDF
            pdf_file = fitz.open(str(temp_file_path))
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
                            image_data.append({
                                "filename": image_name,
                                "embedding": embedding,
                                "order": image_order,
                                "image_bytes": image_bytes.hex()
                            })
                            image_order += 1
                    except Exception as e:
                        print(f"Error processing image {image_name}: {e}")

        # Prepare the response data
        response_data = {
            "name": file.filename,
            "details": f"Extracted {len(image_data)} images from the PDF.",
            "images": image_data,
            "text": extracted_text,
        }

        return JSONResponse(content=response_data)

    except Exception as e:
        print(f"Error processing PDF: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred while processing the PDF: {e}")

class PPTXRequest(BaseModel):
    content: dict

def validate_and_transform_content(content: dict) -> dict:
    """
    Validate and transform the incoming content to match the expected format
    used in the create_pptx function.

    Args:
        content (dict): The incoming content structure.

    Returns:
        dict: The transformed content structure.
    """
    # Ensure required keys exist with default values if missing
    transformed_content = {
        "title": content.get("title", "Untitled Presentation"),
        "contentType": content.get("contentType", "lecture"),
        "difficultyLevel": content.get("difficultyLevel", "intermediate"),
        "slides": content.get("slides", []),
        "activities": content.get("activities", []),
        "assessmentIdeas": content.get("assessmentIdeas", []),
        "keyTerms": content.get("keyTerms", []),
        "furtherReadings": content.get("furtherReadings", []),
        "learningOutcomes": content.get("learningOutcomes", []),
    }

    # Validate slides structure
    for slide in transformed_content["slides"]:
        slide.setdefault("title", "Untitled Slide")
        slide.setdefault("content", [])
        slide.setdefault("notes", "")

    # Validate activities structure
    for activity in transformed_content["activities"]:
        activity.setdefault("title", "Untitled Activity")
        activity.setdefault("description", "")
        activity.setdefault("type", "Exercise")
        activity.setdefault("duration", "20 minutes")
        activity.setdefault("instructions", [])
        activity.setdefault("materials", [])

    # Validate assessment ideas structure
    for idea in transformed_content["assessmentIdeas"]:
        idea.setdefault("type", "Assessment")
        idea.setdefault("exampleQuestions", [])
        for question in idea["exampleQuestions"]:
            question.setdefault("question", "Example question")
            question.setdefault("options", [])
            question.setdefault("correctAnswer", "")
            question.setdefault("explanation", "")

    # Validate key terms structure
    for term in transformed_content["keyTerms"]:
        term.setdefault("term", "Untitled Term")
        term.setdefault("definition", "No definition provided.")

    # Validate further readings structure
    for reading in transformed_content["furtherReadings"]:
        reading.setdefault("title", "Untitled Reading")
        reading.setdefault("author", "Unknown Author")
        reading.setdefault("readingDescription", "")

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
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pptx", dir=dir_slide) as temp_pptx_file:
            temp_pptx_path = temp_pptx_file.name

        print(temp_pptx_path)

        # Generate the PPTX file
        create_pptx(transformed_content, temp_pptx_path)
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
            background=BackgroundTask(cleanup_temp_file)
        )

    except Exception as e:
        print(f"Error generating PPTX: {e}")
        raise HTTPException(status_code=500, detail=f"An error occurred while generating the PPTX file: {e}")

if __name__ == "__main__":
    import uvicorn
    import os
    
    # Get host and port from environment variables with defaults
    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", 8016))
    
    print(f"Starting backend server on {host}:{port}")
    uvicorn.run(app, host=host, port=port)