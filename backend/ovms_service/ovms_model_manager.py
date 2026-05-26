#!/usr/bin/env python3
"""
OVMS Model Manager

Handles model downloads and configuration based on environment variables.
Automatically detects task type (embeddings, reranking, text_generation) from env variable names.
"""
import os
import sys
import json
import shutil
import subprocess # nosec
from pathlib import Path
from typing import Dict, Optional, Literal
from huggingface_hub import snapshot_download, list_repo_files

from export_model import (
    export_text_generation_model,
    export_embeddings_model,
    export_rerank_model,
)
from util import (
    validate_and_sanitize_cache_dir,
    create_cache_directory,
    validate_and_sanitize_model_id,
    sanitize_parsed_args,
    break_taint_chain,
)

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


TaskType = Literal["embeddings", "reranking", "text_generation"]


def detect_task_from_env_var(env_var_name: str) -> TaskType:
    env_var_upper = env_var_name.upper()
    if "EMBEDDING" in env_var_upper:
        return "embeddings"
    elif "RERANK" in env_var_upper:
        return "reranking"
    else:
        return "text_generation"


def detect_task_from_model_id(model_id: str) -> TaskType:
    model_lower = model_id.lower()

    reranking_patterns = ["rerank", "bge-reranker", "cross-encoder"]
    if any(pattern in model_lower for pattern in reranking_patterns):
        return "reranking"

    embedding_patterns = [
        "bge-", "gte-", "e5-", "embedding", "embed",
        "sentence-transformers", "all-minilm", "all-mpnet",
    ]
    if any(pattern in model_lower for pattern in embedding_patterns):
        return "embeddings"

    return "text_generation"


def is_sentence_transformer_model(model_id: str) -> bool:
    """
    Check if a model is a SentenceTransformer model by inspecting
    its files on HuggingFace Hub.
    """
    try:
        repo_files = list(list_repo_files(model_id))

        st_indicators = [
            "modules.json",
            "sentence_bert_config.json",
            "1_Pooling/config.json",
        ]

        for indicator in st_indicators:
            if indicator in repo_files:
                print(f"  Detected SentenceTransformer model (found: {indicator})")
                return True

        return False

    except Exception as e:
        print(f"  Warning: Could not check model type remotely: {e}")
        # Fall back to pattern matching
        model_lower = model_id.lower()
        st_patterns = [
            "sentence-transformers/",
            "bge-", "gte-", "e5-",
            "all-minilm", "all-mpnet",
        ]
        return any(p in model_lower for p in st_patterns)


def extract_base_model_from_sentence_transformer(
    model_id: str,
    hf_cache_dir: str,
) -> str:
    """
    Extract the underlying HuggingFace transformer model from a
    SentenceTransformer wrapper and save it to a stable directory.

    optimum-cli cannot handle SentenceTransformer wrapper models directly.
    This extracts the base BertModel so optimum-cli can process it.

    Returns the path to the extracted base model.
    """
    print(f"  Extracting base transformer from SentenceTransformer: {model_id}", flush=True)

    safe_name = model_id.replace("/", "_")
    base_model_dir = os.path.join(hf_cache_dir, f"_st_base_{safe_name}")

    if os.path.exists(base_model_dir) and os.listdir(base_model_dir):
        print(f"  Using cached base model extraction: {base_model_dir}", flush=True)
        return base_model_dir

    os.makedirs(base_model_dir, exist_ok=True)

    safe_base_model_dir = base_model_dir.replace("\\", "/")

    extract_script = f"""
import sys
import os

try:
    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer

    model_id = "{model_id}"
    output_dir = "{safe_base_model_dir}"

    print(f"Loading SentenceTransformer: {{model_id}}", flush=True)
    st_model = SentenceTransformer(model_id)

    transformer_module = st_model[0]
    base_model = transformer_module.auto_model
    tokenizer = transformer_module.tokenizer

    print(f"Saving base model to: {{output_dir}}", flush=True)
    base_model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)

    print(f"Base model architecture: {{type(base_model).__name__}}", flush=True)
    print("Extraction complete", flush=True)
    sys.exit(0)

except ImportError:
    print("sentence-transformers not available, trying direct AutoModel load...", flush=True)
    from transformers import AutoModel, AutoTokenizer

    model = AutoModel.from_pretrained("{model_id}")
    tokenizer = AutoTokenizer.from_pretrained("{model_id}")

    model.save_pretrained("{safe_base_model_dir}")
    tokenizer.save_pretrained("{safe_base_model_dir}")
    print("Direct AutoModel extraction complete", flush=True)
    sys.exit(0)

except Exception as e:
    print(f"Extraction failed: {{e}}", file=sys.stderr, flush=True)
    import traceback
    traceback.print_exc()
    sys.exit(1)
"""

    script_path = os.path.join(hf_cache_dir, "_extract_st_base.py")

    # Fix: explicit utf-8 encoding for Windows file writing
    with open(script_path, "w", encoding="utf-8") as f:
        f.write(extract_script)

    venv_python = sys.executable

    try:
        process = subprocess.Popen(
            [venv_python, script_path],
            stdout=sys.stdout,
            stderr=sys.stderr,
            text=True,
            encoding="utf-8",
        )

        try:
            returncode = process.wait(timeout=600)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
            raise RuntimeError(
                "Model extraction timed out after 600 seconds."
            )

    finally:
        if os.path.exists(script_path):
            os.remove(script_path)

    if returncode != 0:
        shutil.rmtree(base_model_dir, ignore_errors=True)
        raise RuntimeError(
            f"Failed to extract base model from SentenceTransformer "
            f"(exit code {returncode}). Check logs above for details."
        )

    print(f"  ✓ Base model extracted to: {base_model_dir}", flush=True)

    return base_model_dir
    
class OVMSModelManager:
    """Manages OVMS model downloads, conversions, and configuration."""

    def __init__(self):
        home_dir = os.path.expanduser("~")
        ucet_dir = os.path.join(home_dir, ".ucet")

        self.hf_cache_dir = os.path.join(ucet_dir, "models", "huggingface")
        self.ovms_cache_dir = os.path.join(ucet_dir, "models", "ovms")
        self.config_path = os.path.join(self.ovms_cache_dir, "config.json")

        self.hf_cache_dir = validate_and_sanitize_cache_dir(self.hf_cache_dir)
        self.ovms_cache_dir = validate_and_sanitize_cache_dir(self.ovms_cache_dir)
        create_cache_directory(self.hf_cache_dir)
        create_cache_directory(self.ovms_cache_dir)

        self._ensure_config_exists()

    def _ensure_config_exists(self):
        """Create config.json if it doesn't exist."""
        if not os.path.exists(self.config_path):
            minimal_config = {"mediapipe_config_list": [], "model_config_list": []}
            with open(self.config_path, "w") as f:
                json.dump(minimal_config, f, indent=2)
            print(f"Created new config file at {self.config_path}")

    def download_model(self, model_id: str) -> str:
        """Download model from HuggingFace Hub."""
        print(f"Downloading model: {model_id}...")
        validated_model_id = validate_and_sanitize_model_id(model_id)

        path = snapshot_download(
            repo_id=validated_model_id, cache_dir=self.hf_cache_dir
        )
        print(f"✓ Model downloaded to: {path}")
        return path

    def export_model(
        self,
        model_id: str,
        task: TaskType,
        precision: str = "int8",
        device: str = "CPU",
        max_doc_length: int = 16000,
        downloaded_path: Optional[str] = None,
    ) -> str:
        """
        Export model to OpenVINO IR format with proper directory structure.
        """
        validated_model_id = validate_and_sanitize_model_id(model_id)
        source_model = validated_model_id

        if downloaded_path and (
            os.path.isfile(os.path.join(downloaded_path, "openvino_model.xml"))
            or os.path.isfile(
                os.path.join(downloaded_path, "openvino_language_model.xml")
            )
        ):
            # Pre-converted OpenVINO model — use downloaded path directly
            source_model = downloaded_path
            print(f"Using pre-converted OpenVINO model from: {downloaded_path}")

        elif task in ("embeddings", "reranking") and not downloaded_path:
            try:
                if is_sentence_transformer_model(validated_model_id):
                    print(
                        f"SentenceTransformer model detected for '{validated_model_id}'.\n"
                        f"Extracting base transformer model before OpenVINO export..."
                    )
                    source_model = extract_base_model_from_sentence_transformer(
                        validated_model_id,
                        self.hf_cache_dir,
                    )
                    print(f"Using extracted base model path: {source_model}")
            except Exception as e:
                print(
                    f"Warning: SentenceTransformer extraction failed: {e}\n"
                    f"Falling back to direct model ID export (may fail)."
                )

        model_provider = model_id.split("/")[0] if "/" in model_id else "local"
        model_name = model_id.split("/")[-1] if "/" in model_id else model_id
        model_dir = os.path.join(self.ovms_cache_dir, model_provider, model_name)

        print(f"Exporting model to: {model_dir}")
        print(f"Task: {task}, Precision: {precision}, Device: {device}")

        task_parameters = {
            "target_device": device,
            "pipeline_type": "LM" if task == "text_generation" else None,
            "kv_cache_precision": None,
            "extra_quantization_params": None,
            "enable_prefix_caching": task == "text_generation",
            "dynamic_split_fuse": task == "text_generation",
            "max_num_batched_tokens": None,
            "max_num_seqs": "256" if task == "text_generation" else None,
            "cache_size": 10 if task == "text_generation" else None,
            "draft_source_model": None,
            "draft_model_name": None,
            "max_prompt_len": None,
            "ov_cache_dir": None,
            "prompt_lookup_decoding": None,
            "tool_parser": "hermes3" if task == "text_generation" else None,
            "enable_tool_guided_generation": (
                True if task == "text_generation" else False
            ),
        }

        if task == "embeddings":
            export_embeddings_model(
                source_model=source_model,      # Extracted base model or HF ID
                model_name=model_id,            # Keep original ID for OVMS config
                model_repository_path=self.ovms_cache_dir,
                precision=precision,
                task_parameters=task_parameters,
                version="1",
                config_file_path=self.config_path,
                truncate=True,
                overwrite_models=False,
            )
        elif task == "reranking":
            export_rerank_model(
                source_model=source_model,      # Extracted base model or HF ID
                model_name=model_id,            # Keep original ID for OVMS config
                model_repository_path=self.ovms_cache_dir,
                precision=precision,
                task_parameters=task_parameters,
                version="1",
                config_file_path=self.config_path,
                max_doc_length=max_doc_length,
                overwrite_models=False,
            )
        else:
            export_text_generation_model(
                source_model=source_model,
                model_name=model_id,
                model_repository_path=self.ovms_cache_dir,
                precision=precision,
                task_parameters=task_parameters,
                config_file_path=self.config_path,
            )

        print(f"✓ Model exported successfully to {model_dir}")
        return model_dir

    def ensure_model_available(
        self,
        model_id: str,
        task: Optional[TaskType] = None,
        precision: str = "int8",
        device: str = "CPU",
        max_doc_length: int = 16000,
    ) -> Dict[str, str]:
        """
        Ensure model is downloaded, exported, and configured for OVMS.
        """
        if task is None:
            task = detect_task_from_model_id(model_id)
            print(f"Auto-detected task: {task}")

        if self.is_model_configured(model_id):
            print(f"✓ Model {model_id} is already configured")
            return {"status": "already_configured", "model_id": model_id, "task": task}

        downloaded_path = None
        if model_id.startswith("OpenVINO/"):
            print(f"Downloading pre-converted OpenVINO model: {model_id}")
            try:
                downloaded_path = self.download_model(model_id)
            except Exception as e:
                raise RuntimeError(f"Failed to download pre-converted model: {e}")
        else:
            print(
                f"Non-OpenVINO HuggingFace model detected - will use optimum-cli for conversion"
            )

        try:
            model_dir = self.export_model(
                model_id, task, precision, device, max_doc_length, downloaded_path
            )
        except Exception as e:
            raise RuntimeError(f"Failed to export model: {e}")

        return {
            "status": "success",
            "model_id": model_id,
            "task": task,
            "model_dir": model_dir,
        }

    def is_model_configured(self, model_id: str) -> bool:
        """Check if model is already in OVMS config."""
        if not os.path.exists(self.config_path):
            return False

        with open(self.config_path, "r") as f:
            config = json.load(f)

        for entry in config.get("mediapipe_config_list", []):
            if entry.get("name") == model_id:
                return True

        return False

    def get_config(self) -> Dict:
        """Get current OVMS configuration."""
        with open(self.config_path, "r") as f:
            return json.load(f)

    def list_models(self) -> Dict:
        """List all configured models."""
        config = self.get_config()
        return {
            "mediapipe_models": [
                entry["name"] for entry in config.get("mediapipe_config_list", [])
            ],
            "direct_models": [
                entry["config"]["name"]
                for entry in config.get("model_config_list", [])
            ],
        }


def setup_model_from_env(env_var_name: str, model_id: str, **kwargs) -> Dict:
    """Helper function to setup a model based on environment variable."""
    task = detect_task_from_env_var(env_var_name)
    print(f"Setting up model from {env_var_name}: {model_id}")
    print(f"Detected task: {task}")

    manager = OVMSModelManager()
    return manager.ensure_model_available(model_id, task=task, **kwargs)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Download and prepare models for OVMS with automatic task detection"
    )
    parser.add_argument("model_id", nargs="?", help="HuggingFace model ID")
    parser.add_argument(
        "task", nargs="?", help="Task type (auto-detected if not provided)"
    )
    parser.add_argument(
        "--model-id", dest="model_id_arg", help="HuggingFace model ID (alternative)"
    )
    parser.add_argument(
        "--task",
        dest="task_arg",
        help="Task type (embeddings, reranking, text_generation)",
    )
    parser.add_argument(
        "--precision", default="int8", help="Model precision (default: int8)"
    )
    parser.add_argument(
        "--device", default="CPU", help="Target device (default: CPU)"
    )
    parser.add_argument(
        "--max-doc-length",
        dest="max_doc_length",
        type=int,
        default=16000,
        help="Maximum document length in tokens for reranking models (default: 16000)",
    )

    args = parser.parse_args()

    model_id = args.model_id or args.model_id_arg
    if not model_id:
        print("Error: model_id is required")
        print("Usage: python ovms_model_manager.py <model_id> [task]")
        print(
            "   or: python ovms_model_manager.py --model-id <model_id> [--task <task>]"
        )
        sys.exit(1)

    task = args.task or args.task_arg

    try:
        model_id, task, precision, device = sanitize_parsed_args(
            model_id, task, args.precision, args.device
        )
    except ValueError as e:
        print("Invalid arguments:", e)
        sys.exit(2)

    sanitized_model_id = break_taint_chain(model_id)

    print(f"{'='*60}")
    print(f"OVMS Model Manager")
    print(f"{'='*60}")
    print(f"Model ID: {sanitized_model_id}")
    print(f"Task: {task or 'auto-detect'}")
    print(f"Precision: {args.precision}")
    print(f"Device: {args.device}")
    print(f"Max Doc Length: {args.max_doc_length}")
    print(f"{'='*60}\n")

    try:
        manager = OVMSModelManager()
        result = manager.ensure_model_available(
            sanitized_model_id,
            task=task,
            precision=args.precision,
            device=args.device,
            max_doc_length=args.max_doc_length,
        )

        print(f"\n{'='*60}")
        print(f"✓ SUCCESS")
        print(f"{'='*60}")
        print(json.dumps(result, indent=2))
        print(f"{'='*60}\n")

    except Exception as e:
        print(f"\n{'='*60}")
        print(f"✗ ERROR")
        print(f"{'='*60}")
        print(f"{e}")
        print(f"{'='*60}\n")
        sys.exit(1)