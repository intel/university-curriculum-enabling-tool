#!/usr/bin/env python3
# Copyright (C) 2025 Intel Corporation
# SPDX-License-Identifier: Apache-2.0
"""Minimal backward-compatible wrapper for the modular PPTX builder.

All implementation details have moved to the ``pptx_builder`` package. This
file is intentionally tiny so existing scripts that still run
``python backend/generate_pptx.py`` continue to work.

Preferred (new) usage::

    from pptx_builder.builder import create_pptx

"""
from __future__ import annotations

import os
import re
import sys
from typing import Any, Dict

from pptx_builder.builder import cli_build as _cli_build, create_pptx as _create_pptx

__all__ = ["create_pptx", "main"]


def main() -> None:  # pragma: no cover - thin glue
    if len(sys.argv) not in (3, 4):
        print("Usage: python generate_pptx.py <content_key> <output_name> [lang]")
        sys.exit(1)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    allowed_content = {
        "default": os.path.join(base_dir, "content", "default_content.json")
    }

    content_key, output_name = sys.argv[1], sys.argv[2]
    language = sys.argv[3] if len(sys.argv) == 4 else "en"

    if content_key not in allowed_content:
        print("Unknown content key")
        sys.exit(1)
    if not re.match(r"^[a-zA-Z0-9_\-]+$", output_name):
        print("Invalid output name. Only alphanumeric, underscore, hyphen allowed.")
        sys.exit(1)
    if not output_name.endswith(".pptx"):
        output_name += ".pptx"

    out_dir = os.path.join(base_dir, "output")
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.abspath(os.path.join(out_dir, output_name))
    if not output_path.startswith(os.path.abspath(out_dir)):
        print("Security violation: Output path outside of allowed directory")
        sys.exit(1)

    _cli_build(allowed_content[content_key], output_path, language)
    print(f"PowerPoint presentation saved to {output_path}")


def create_pptx(
    content: Dict[str, Any], output_path: str, language: str = "en"
) -> None:
    """Re-export of the real builder function for legacy import paths."""
    _create_pptx(content, output_path, language)


if __name__ == "__main__":  # pragma: no cover
    main()
