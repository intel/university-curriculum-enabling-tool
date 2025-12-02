import os
import threading
import subprocess  # nosec
import sys
import signal
import atexit
import argparse
from pathlib import Path
from typing import Optional
import time
from huggingface_hub import snapshot_download
from export_model import export_text_generation_model
from util import (
    validate_and_sanitize_cache_dir,
    create_cache_directory,
    validate_and_sanitize_model_id,
    validate_and_sanitize_target_device,
)
import json
import re

os.environ["TOKENIZERS_PARALLELISM"] = "false"

# Global variable to track the OVMS subprocess for cleanup
ovms_process = None
cleanup_in_progress = threading.Lock()


def setup_ovms_environment():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Resolve OVMS directory relative to the project layout and normalize to absolute path
    ovms_dir = os.path.abspath(
        os.path.join(os.path.dirname(script_dir), "..", "thirdparty", "ovms")
    )
    env = os.environ.copy()

    if sys.platform.startswith("win"):
        # Windows-specific environment variables
        ovms_exe = os.path.join(ovms_dir, "ovms.exe")

        # Prefer the embedded Python inside thirdparty/ovms/python if present
        python_dir = os.path.abspath(os.path.join(ovms_dir, "python"))

        # Build an ordered list of candidate PATH entries (only include existing dirs)
        existing_path = env.get("PATH", "")
        candidates = [
            ovms_dir,
            os.path.join(ovms_dir, "ovms"),
            python_dir,
            os.path.join(python_dir, "Scripts"),
        ]
        new_path_parts = [p for p in candidates if p and os.path.exists(p)]
        if existing_path:
            new_path_parts.append(existing_path)
        if new_path_parts:
            env["PATH"] = os.pathsep.join(new_path_parts)

        # Set PYTHONHOME to the python root (helps embedded Python locate its stdlib)
        if os.path.exists(python_dir):
            env["PYTHONHOME"] = python_dir

            # Prefer the embedded Python "Lib" and its site-packages for PYTHONPATH.
            # Important: do NOT inherit the host PYTHONPATH here — mixing the host
            # interpreter's stdlib/site-packages with the embedded runtime can lead
            # to incompatible imports and symbol collisions. Only fall back to
            # the embedded python root if the expected Lib paths are missing.
            python_lib = os.path.join(python_dir, "Lib")
            site_packages = os.path.join(python_lib, "site-packages")
            py_paths = [p for p in [python_lib, site_packages] if os.path.exists(p)]
            if py_paths:
                env["PYTHONPATH"] = os.pathsep.join(py_paths)
            else:
                # If the embedded "Lib" isn't present, set PYTHONPATH to the
                # python_dir itself as a best-effort fallback (still avoids
                # pulling in the user's global PYTHONPATH).
                env["PYTHONPATH"] = python_dir
        else:
            # Fallback: if no embedded python directory exists, still try the
            # thirdparty/ovms/python path (not the nested ovms/ovms/python).
            fallback = os.path.abspath(os.path.join(ovms_dir, "python"))
            env["PYTHONPATH"] = fallback

        print("[DEBUG]: Windows env var set")
        print(f"[DEBUG]: PATH={env.get('PATH')}")
        print(f"[DEBUG]: PYTHONHOME={env.get('PYTHONHOME')}")
        print(f"[DEBUG]: PYTHONPATH={env.get('PYTHONPATH')}")
    else:
        ovms_exe = "ovms"
        env["LD_LIBRARY_PATH"] = os.path.join(ovms_dir, "lib")
        env["PATH"] = f"{os.path.join(ovms_dir, 'bin')}"
        env["PYTHONPATH"] = os.path.join(ovms_dir, "lib", "python")

    # Check if http/HTTP and https/HTTPS proxies are set in the environment
    for proxy_var in ["http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY"]:
        if proxy_var in os.environ:
            env[proxy_var] = os.environ[proxy_var]
    return ovms_exe, env


def cleanup_ovms_process():
    """
    Cleanup function to gracefully terminate the OVMS subprocess.
    """
    global ovms_process

    # Prevent multiple cleanup attempts
    if not cleanup_in_progress.acquire(blocking=False):
        return

    try:
        if ovms_process is not None and ovms_process.poll() is None:
            print("Shutting down OVMS subprocess...")
            try:
                # Send SIGTERM first for graceful shutdown
                if hasattr(ovms_process, "terminate"):
                    ovms_process.terminate()
                    print("Sent SIGTERM to OVMS process...")

                # Wait for up to 10 seconds for graceful shutdown
                try:
                    ovms_process.wait(timeout=10)
                    print("OVMS process terminated gracefully.")
                except subprocess.TimeoutExpired:
                    # If graceful termination fails, send SIGKILL
                    print(
                        "OVMS process didn't terminate gracefully, sending SIGKILL..."
                    )
                    if hasattr(ovms_process, "kill"):
                        ovms_process.kill()
                        # Wait a bit more for the kill to take effect
                        ovms_process.wait(timeout=5)
                    print("OVMS process force killed.")

            except subprocess.TimeoutExpired:
                print(
                    "OVMS process didn't respond to SIGKILL, may be in unrecoverable state"
                )
            except Exception as e:
                print(f"Error during OVMS cleanup: {e}")
            finally:
                ovms_process = None
    finally:
        cleanup_in_progress.release()


def signal_handler(signum, frame):
    """
    Signal handler for graceful shutdown.
    """
    print(f"Received signal {signum}, initiating shutdown...")

    # Avoid recursive signal handling
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)

    cleanup_ovms_process()

    # Give a moment for cleanup to complete
    time.sleep(1)

    print("Shutdown complete.")
    os._exit(0)  # Use os._exit to avoid potential atexit issues


def download_model(model_id: str, model_dir: str):
    """
    Download the model from Hugging Face Hub if it is not already present.
    """
    try:
        print(f"Downloading model: {model_id}...")
        path = snapshot_download(repo_id=model_id, cache_dir=model_dir)
        return path
    except Exception as e:
        print(f"Error downloading {model_id}: {e}")
        raise RuntimeError(f"Failed to download model {model_id}")


def start_model_serving(
    port: int = 3016,
    model_path: str = "",
    model_id: str = None,
    model_provider: str = None,
    device: str = "",
):
    global ovms_process

    print("Setting environment for model serving ...")
    ovms, env = setup_ovms_environment()

    if model_id:
        if model_provider == "OpenVINO":
            serving_command = [
                ovms,
                "--rest_port",
                str(port),
                "--source_model",
                model_id,
                "--model_repository_path",
                model_path,
                "--task",
                "text_generation",
                "--target_device",
                device,
                "--cache_size",
                "2",
                "--enable_tool_guided_generation",
                "store_true",
            ]
        else:
            serving_command = [
                ovms,
                "--rest_port",
                str(port),
                "--model_path",
                model_path,
                "--model_name",
                model_id,
            ]
    else:
        # This allows dynamic model loading - when models are added to this config, OVMS auto-reloads
        home_dir = os.path.expanduser("~")
        ucet_dir = os.path.join(home_dir, ".ucet")
        app_cache_dir = os.path.join(ucet_dir, "models", "ovms")
        os.makedirs(app_cache_dir, exist_ok=True)

        config_path = os.path.join(app_cache_dir, "config.json")

        # Create config file if it doesn't exist
        if not os.path.exists(config_path):
            minimal_config = {"mediapipe_config_list": [], "model_config_list": []}
            with open(config_path, "w") as f:
                json.dump(minimal_config, f, indent=2)
            print(f"Created new config file at {config_path}")
        else:
            # Look for target_device and overwrite it with parsed --device
            # Modify for embedding model
            with open(config_path, "r") as f:
                config_data = json.load(f)
                for model_cfg in config_data.get("model_config_list", []):
                    cfg = model_cfg.get("config", {})
                    if "target_device" in cfg:
                        print(
                            f"Overwriting target_device for model {cfg.get('name')} to {device}"
                        )
                        cfg["target_device"] = device

            with open(config_path, "w") as f:
                json.dump(config_data, f, indent=2)

            # Also update device in all graph.pbtxt files under app_cache_dir
            try:
                validated_device = validate_and_sanitize_target_device(device)

                device_re = re.compile(
                    r'(device\s*:\s*)(["\']?[\w.]+["\']?)', re.IGNORECASE
                )
                for root, dirs, files in os.walk(app_cache_dir):
                    if "graph.pbtxt" in files:
                        graph_path = os.path.join(root, "graph.pbtxt")
                        try:
                            with open(graph_path, "r") as gf:
                                content = gf.read()
                            new_content, count = device_re.subn(
                                f'\\1"{validated_device}"', content
                            )
                            if count > 0:
                                with open(graph_path, "w") as gf:
                                    gf.write(new_content)
                                print(
                                    f"Patched device in {graph_path} -> {validated_device}"
                                )
                        except Exception as e:
                            print(f"Warning: failed to patch {graph_path}: {e}")
            except Exception as e:
                print(f"Warning: error while updating device in graph.pbtxt files: {e}")

        serving_command = [
            ovms,
            "--rest_port",
            str(port),
            "--config_path",
            config_path,
        ]

    print(f"Starting model serving with target device {device}...")
    print(f"Command: {serving_command}")

    try:
        # Use Popen with output piped to current session for real-time monitoring
        ovms_process = subprocess.Popen(
            serving_command,
            text=True,
            env=env,
            preexec_fn=(
                os.setsid if hasattr(os, "setsid") else None
            ),  # Create new process group
            stdout=None,  # Inherit stdout from parent (shows in current session)
            stderr=None,  # Inherit stderr from parent (shows in current session)
            stdin=None,  # Inherit stdin from parent
        )
        print(f"OVMS process started with PID: {ovms_process.pid}")
        print("OVMS output will be displayed below (Ctrl+C to stop):")
        print("-" * 50)

        # Wait for the process to complete (this will block until the process is terminated)
        try:
            return_code = ovms_process.wait()
            print("-" * 50)
            print(f"OVMS process exited with code: {return_code}")

        except KeyboardInterrupt:
            print("\nReceived keyboard interrupt during process monitoring...")
            raise

    except subprocess.CalledProcessError as e:
        print(f"Model serving command failed with error: {e}")
        cleanup_ovms_process()
        raise RuntimeError("Failed to start model serving")
    except KeyboardInterrupt:
        print("Received keyboard interrupt, shutting down...")
        cleanup_ovms_process()
        sys.exit(0)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        cleanup_ovms_process()
        raise RuntimeError("Failed to start model serving")
    finally:
        # Ensure cleanup happens even if something goes wrong
        if ovms_process and ovms_process.poll() is None:
            cleanup_ovms_process()


def parse_args():
    parser = argparse.ArgumentParser(description="Text Generation Worker")
    parser.add_argument(
        "--model-id",
        type=str,
        required=False,
        help="Path to the model directory or Hugging Face model name",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=5950,
        help="Port for the worker to listen on",
    )
    parser.add_argument(
        "--device",
        type=str,
        default="CPU",
        help="Device to run the model on (e.g., CPU, GPU, NPU)",
    )
    return parser.parse_args()


def prepare_model_env(
    model_id: str, model_dir: str, device: str = "CPU", precision: str = "int4"
):
    print(f"Preparing model environment for {model_id} ...")
    validated_model_id = validate_and_sanitize_model_id(model_id)
    config_file_path = os.path.join(model_dir, "config.json")

    if not os.path.exists(model_dir):
        os.makedirs(model_dir, exist_ok=True)

    try:
        task_parameters = {
            "target_device": device,
            "pipeline_type": "LM",
            "kv_cache_precision": None,
            "extra_quantization_params": None,
            "enable_prefix_caching": True,
            "dynamic_split_fuse": True,
            "max_num_batched_tokens": None,
            "max_num_seqs": "256",
            "cache_size": 10,
            "draft_source_model": None,
            "draft_model_name": None,
            "max_prompt_len": None,
            "ov_cache_dir": None,
            "prompt_lookup_decoding": None,
            "tool_parser": "hermes3",
            "enable_tool_guided_generation": True,
        }
        export_text_generation_model(
            source_model=validated_model_id,
            model_name=model_id,
            model_repository_path=model_dir,
            precision=precision,
            task_parameters=task_parameters,
            config_file_path=config_file_path,
        )
        print(f"Model exported successfully to {model_dir}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise RuntimeError(f"Failed to prepare model environment for {model_dir}")


def main():
    try:
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, signal_handler)  # Ctrl+C
        signal.signal(signal.SIGTERM, signal_handler)  # Termination signal

        # Register atexit handler but use a simpler version to avoid issues
        atexit.register(lambda: cleanup_ovms_process() if ovms_process else None)

        args = parse_args()
        model_id = args.model_id
        device = str(args.device).upper()
        serving_port = args.port

        # Sanity check for port for int and is between 5000-6000
        if not (5000 <= serving_port <= 6000):
            raise ValueError(
                f"Invalid port: {serving_port}. Port must be an integer between 5000 and 6000."
            )

        # Sanity check for device value
        base_device = device.split(":")[0].split(".")[0].upper()
        if base_device not in ["CPU", "GPU", "NPU", "HETERO"]:
            raise ValueError(
                f"Invalid device type: {device}. Supported devices are CPU, GPU, NPU, HETERO."
            )

        # Set up cache directories
        home_dir = os.path.expanduser("~")
        ucet_dir = os.path.join(home_dir, ".ucet")
        model_cache_dir = os.path.join(ucet_dir, "models", "huggingface")
        os.environ["HF_HOME"] = model_cache_dir
        app_cache_dir = os.path.join(ucet_dir, "models", "ovms")

        # Validate and sanitize the cache directories
        model_cache_dir = validate_and_sanitize_cache_dir(model_cache_dir)
        app_cache_dir = validate_and_sanitize_cache_dir(app_cache_dir)

        # Create the directories if they don't exist
        create_cache_directory(model_cache_dir)
        create_cache_directory(app_cache_dir)

        model_dir = app_cache_dir
        os.makedirs(model_dir, exist_ok=True)

        model_provider = None
        model_name = None
        validated_model_id = None
        if model_id:
            model_provider = model_id.split("/")[0] if "/" in model_id else "local"
            model_name = model_id.split("/")[-1]

            if not model_provider == "OpenVINO":
                try:
                    validated_model_id = validate_and_sanitize_model_id(model_id)
                    download_model(validated_model_id, model_cache_dir)
                except Exception as e:
                    print(f"Error downloading model {validated_model_id}: {e}")
                    raise RuntimeError(f"Failed to download model {validated_model_id}")

                # Convert model
                try:
                    prepare_model_env(
                        model_id=validated_model_id, model_dir=model_dir, device=device
                    )
                    model_dir = os.path.join(model_dir, model_provider, model_name)
                except Exception as e:
                    print(f"Error preparing model environment: {e}")
                    raise RuntimeError(f"Failed to prepare model environment: {e}")

        try:
            start_model_serving(
                port=serving_port,
                model_path=model_dir,
                model_id=model_id,
                model_provider=model_provider,
                device=device,
            )
        except Exception as e:
            print(f"Error starting model serving: {e}")
            raise RuntimeError(f"Failed to start model serving: {e}")

    except Exception as e:
        print(f"Fatal error in main: {e}")
        cleanup_ovms_process()
        sys.exit(1)
    except KeyboardInterrupt:
        print("Received keyboard interrupt in main, shutting down...")
        cleanup_ovms_process()
        sys.exit(0)


if __name__ == "__main__":
    main()
