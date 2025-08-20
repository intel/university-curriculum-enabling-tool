# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0

import torch
from PIL import Image, ImageStat, ImageFilter
import os
from transformers import BlipProcessor, BlipForConditionalGeneration
from io import BytesIO
import numpy as np
from scipy.ndimage import label, find_objects

# Load the model and processor
processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base", revision="82a37760796d32b1411fe092ab5d4e227313294b")
model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base", revision="82a37760796d32b1411fe092ab5d4e227313294b")


def is_unrelated_image(image):
    stat = ImageStat.Stat(image)
    mean_colors = stat.mean
    stddev_colors = stat.stddev

    # 1. Mostly a single color (low stddev)
    if max(stddev_colors) < 30:  # Reduced threshold for more sensitivity
        return True

    # 2. Mostly black or white
    if all(m > 245 for m in mean_colors) or all(m < 10 for m in mean_colors):  # Adjusted thresholds
        return True

    # 3. Very few unique grayscale values
    gray = image.convert("L")
    arr = np.array(gray)
    vals, counts = np.unique(arr, return_counts=True)
    if len(vals) < 20:  # Increased threshold for more sensitivity
        return True

    # 4. Large uniform background with a single simple shape
    dominant_val = vals[np.argmax(counts)]
    dominant_ratio = np.max(counts) / arr.size

    # Adaptive thresholding for better separation
    thresh = np.percentile(arr, 50)
    mask_fg = (arr != dominant_val).astype(np.uint8)
    mask_thresh = (arr > thresh).astype(np.uint8)
    mask_combined = np.logical_or(mask_fg, mask_thresh).astype(np.uint8)

    # Connected component analysis
    labeled, num_features = label(mask_combined)
    fg_pixels = np.sum(mask_combined)

    # Improved: Filter if a single (or very few) compact shape(s) on a dominant background
    if 1 <= num_features <= 3 and 0 < fg_pixels < 0.15 * arr.size and dominant_ratio > 0.90:  # Adjusted thresholds
        slices = find_objects(labeled)
        if slices:
            largest = max(slices, key=lambda s: (s[0].stop-s[0].start)*(s[1].stop-s[1].start))
            h = largest[0].stop - largest[0].start
            w = largest[1].stop - largest[1].start
            aspect = min(h, w) / max(h, w)
            area_ratio = (h * w) / arr.size
            # Stricter compactness and area check
            if aspect > 0.7 and area_ratio < 0.4:  # Adjusted thresholds
                border_touch = (
                    largest[0].start == 0 or largest[1].start == 0 or
                    largest[0].stop == arr.shape[0] or largest[1].stop == arr.shape[1]
                )
                if not border_touch:
                    return True

    # 5. Edge analysis: very few or very many edges (low information or noise)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge_arr = np.array(edges)
    strong_edges = np.sum(edge_arr > 50)
    if strong_edges < 50 or strong_edges > 0.6 * arr.size:  # Adjusted thresholds
        return True

    # 6. Optional: Check for low color diversity in RGB
    rgb_arr = np.array(image.convert("RGB"))
    unique_colors = len(np.unique(rgb_arr.reshape(-1, 3), axis=0))
    if unique_colors < 30:  # Adjusted threshold
        return True

    return False



def generate_dynamic_caption(image_bytes: bytes):
    """
    Generates a dynamic caption for the given image using BLIP.

    Args:
        image_bytes (bytes): Binary data of the image.

    Returns:
        str or None: The generated caption if the image passes checks, otherwise None.
    """
    from io import BytesIO
    image = Image.open(BytesIO(image_bytes)).convert("RGB")

    # Check if the image dimensions are too small
    min_width, min_height = 100, 100  # Set your minimum width and height
    if image.width < min_width or image.height < min_height:
        print(f"DEBUG: Discarding image (bytes): dimensions too small ({image.width}x{image.height})")
        return None

    # Check if the image is unrelated based on its color distribution
    if is_unrelated_image(image):
        print(f"DEBUG: Discarding image (bytes): unrelated image based on color analysis")
        return None

    inputs = processor(images=image, return_tensors="pt")
    out = model.generate(**inputs)
    caption = processor.decode(out[0], skip_special_tokens=True)
    print(f"DEBUG: Accepting image (bytes): caption '{caption}'")
    return caption