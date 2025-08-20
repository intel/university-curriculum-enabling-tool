# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

import torch
from transformers import CLIPProcessor, CLIPModel
from PIL import Image
from io import BytesIO

# Load the CLIP model and processor
model = CLIPModel.from_pretrained("openai/clip-vit-base-patch16", revision="57c216476eefef5ab752ec549e440a49ae4ae5f3")
processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch16", revision="57c216476eefef5ab752ec549e440a49ae4ae5f3")

def generate_image_embedding(image_bytes: bytes):
    """
    Generates an embedding for the given image using CLIP.

    Args:
        image_bytes (bytes): Binary data of the image.

    Returns:
        list: The embedding vector for the image.
    """
    image = Image.open(BytesIO(image_bytes)).convert("RGB")
    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model.get_image_features(**inputs)
    embedding = outputs[0].tolist()
    return embedding