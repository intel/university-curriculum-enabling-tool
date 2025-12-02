import argparse
import os
import sys
import subprocess  # nosec
from openvino_tokenizers import convert_tokenizer, connect_models
from transformers import AutoTokenizer
import jinja2
import json
import shutil
import tempfile
import openvino as ov

# Templates
embedding_graph_template = """input_stream: "REQUEST_PAYLOAD:input"
output_stream: "RESPONSE_PAYLOAD:output"
node {
  calculator: "OpenVINOModelServerSessionCalculator"
  output_side_packet: "SESSION:tokenizer"
  node_options: {
    [type.googleapis.com / mediapipe.OpenVINOModelServerSessionCalculatorOptions]: {
      servable_name: "{{model_name}}_tokenizer_model"
    }
  }
}
node {
  calculator: "OpenVINOModelServerSessionCalculator"
  output_side_packet: "SESSION:embeddings"
  node_options: {
    [type.googleapis.com / mediapipe.OpenVINOModelServerSessionCalculatorOptions]: {
      servable_name: "{{model_name}}_embeddings_model"
    }
  }
}
node {
  input_side_packet: "TOKENIZER_SESSION:tokenizer"
  input_side_packet: "EMBEDDINGS_SESSION:embeddings"
  calculator: "EmbeddingsCalculator"
  input_stream: "REQUEST_PAYLOAD:input"
  output_stream: "RESPONSE_PAYLOAD:output"
  node_options: {
    [type.googleapis.com / mediapipe.EmbeddingsCalculatorOptions]: {
      normalize_embeddings: {% if not normalize %}false{% else %}true{% endif%},
    }
  }
}
"""

rerank_graph_template = """input_stream: "REQUEST_PAYLOAD:input"
output_stream: "RESPONSE_PAYLOAD:output"
node {
  calculator: "OpenVINOModelServerSessionCalculator"
  output_side_packet: "SESSION:tokenizer"
  node_options: {
    [type.googleapis.com / mediapipe.OpenVINOModelServerSessionCalculatorOptions]: {
      servable_name: "{{model_name}}_tokenizer_model"
    }
  }
}
node {
  calculator: "OpenVINOModelServerSessionCalculator"
  output_side_packet: "SESSION:rerank"
  node_options: {
    [type.googleapis.com / mediapipe.OpenVINOModelServerSessionCalculatorOptions]: {
      servable_name: "{{model_name}}_rerank_model"
    }
  }
}
node {
    input_side_packet: "TOKENIZER_SESSION:tokenizer"
    input_side_packet: "RERANK_SESSION:rerank"
    calculator: "RerankCalculator"
    input_stream: "REQUEST_PAYLOAD:input"
    output_stream: "RESPONSE_PAYLOAD:output"
}
"""

text_generation_graph_template = """input_stream: "HTTP_REQUEST_PAYLOAD:input"
output_stream: "HTTP_RESPONSE_PAYLOAD:output"

node: {
    name: "LLMExecutor"
    calculator: "HttpLLMCalculator"
    input_stream: "LOOPBACK:loopback"
    input_stream: "HTTP_REQUEST_PAYLOAD:input"
    input_side_packet: "LLM_NODE_RESOURCES:llm"
    output_stream: "LOOPBACK:loopback"
    output_stream: "HTTP_RESPONSE_PAYLOAD:output"
    input_stream_info: {
        tag_index: 'LOOPBACK:0',
        back_edge: true
    }
    node_options: {
            [type.googleapis.com / mediapipe.LLMCalculatorOptions]: {
                    {%- if pipeline_type %}
                    pipeline_type: {{pipeline_type}},{% endif %}
                    models_path: "{{model_path}}",
                    plugin_config: '{{plugin_config}}',
                    enable_prefix_caching: {% if not enable_prefix_caching %}false{% else %} true{% endif%},
                    cache_size: {{cache_size|default("10", true)}},
                    {%- if max_num_batched_tokens %}
                    max_num_batched_tokens: {{max_num_batched_tokens}},{% endif %}
                    {%- if not dynamic_split_fuse %}
                    dynamic_split_fuse: false, {% endif %}
                    max_num_seqs: {{max_num_seqs|default("256", true)}},
                    device: "{{target_device|default("CPU", true)}}",
                    {%- if draft_model_dir_name %}
                    # Speculative decoding configuration
                    draft_models_path: "./{{draft_model_dir_name}}",{% endif %}
                    {%- if tool_parser %}
                    tool_parser: "{{tool_parser}}",{% endif %}
                    {%- if enable_tool_guided_generation %}
                    enable_tool_guided_generation: {% if not enable_tool_guided_generation %}false{% else %} true{% endif%},{% endif %}
            }
    }
    input_stream_handler {
        input_stream_handler: "SyncSetInputStreamHandler",
        options {
            [mediapipe.SyncSetInputStreamHandlerOptions.ext] {
                sync_set {
                    tag_index: "LOOPBACK:0"
                }
            }
        }
    }
}"""

embeddings_subconfig_template = """{
    "model_config_list": [
    { "config":
	    {
                "name": "{{model_name}}_tokenizer_model",
                "base_path": "tokenizer"
            }
	},
    { "config":
	    {
                "name": "{{model_name}}_embeddings_model",
                "base_path": "embeddings",
                "target_device": "{{target_device|default("CPU", true)}}",
                "plugin_config": { "NUM_STREAMS": "{{num_streams|default(1, true)}}" }
            }
	}
   ]
}"""

rerank_subconfig_template = """{
    "model_config_list": [
    { "config":
	    {
                "name": "{{model_name}}_tokenizer_model",
                "base_path": "tokenizer"
            }
	},
    { "config":
	    {
                "name": "{{model_name}}_rerank_model",
                "base_path": "rerank",
                "target_device": "{{target_device|default("CPU", true)}}",
                "plugin_config": { "NUM_STREAMS": "{{num_streams|default(1, true)}}" }
            }
	}
   ]
}"""


def get_optimum_cli_path():
    """
    Get the path to optimum-cli, checking the virtual environment first.
    """
    # Check if we're in a virtual environment
    if hasattr(sys, "real_prefix") or (
        hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix
    ):
        # We're in a virtual environment
        venv_bin = os.path.dirname(sys.executable)
        if os.name == "nt":  # if running on Windows
            optimum_cli_filename = "optimum-cli.exe"
        else:
            optimum_cli_filename = "optimum-cli"
        optimum_cli_path = os.path.join(venv_bin, optimum_cli_filename)
        if os.path.isfile(optimum_cli_path):
            return optimum_cli_path

    # Fall back to system PATH
    return "optimum-cli"


def get_huggingface_cli_path():
    """
    Get the path to huggingface-cli, preferring the virtualenv installation.
    """
    # Check virtualenv first
    if hasattr(sys, "real_prefix") or (
        hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix
    ):
        venv_bin = os.path.dirname(sys.executable)
        hf_cli = os.path.join(venv_bin, "huggingface-cli")
        if os.path.isfile(hf_cli):
            return hf_cli

    # fall back to PATH
    return shutil.which("huggingface-cli") or "huggingface-cli"


def run_optimum_command(command_args):
    """
    Run optimum-cli command with proper error handling.
    """
    optimum_cli = get_optimum_cli_path()
    full_command = [optimum_cli] + command_args

    try:
        process = subprocess.Popen(
            full_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        for line in process.stdout:
            print(line, end="")  # or handle line however you want
        for line in process.stderr:
            print(line, end="")  # or handle line however you want

        process.stderr.close()
        process.stdout.close()
        process.wait()
        return process.returncode
    except subprocess.CalledProcessError as e:
        print(f"Command failed: {' '.join(full_command)}")
        print(f"Error: {e.stderr}")
        return e.returncode
    except FileNotFoundError as e:
        print(
            f"optimum-cli not found. Please make sure optimum[openvino] is installed."
        )
        print(f"Tried to run: {' '.join(full_command)}")
        return 1


def export_rerank_tokenizer(source_model, destination_path, max_length):
    hf_tokenizer = AutoTokenizer.from_pretrained(source_model)
    hf_tokenizer.model_max_length = max_length
    hf_tokenizer.save_pretrained(destination_path)
    ov_tokenizer = convert_tokenizer(hf_tokenizer, add_special_tokens=False)
    ov.save_model(
        ov_tokenizer, os.path.join(destination_path, "openvino_tokenizer.xml")
    )


def set_rt_info(model_folder_path, model_filename, config_filename):
    model = ov.Core().read_model(os.path.join(model_folder_path, model_filename))
    config_path = os.path.join(model_folder_path, config_filename)

    # Only set rt_info if config file exists
    if os.path.exists(config_path):
        with open(config_path, "r") as config_file:
            config_data = json.load(config_file)
            for key, value in config_data.items():
                try:
                    model.set_rt_info(value, ["model_info", key])
                except Exception as e:
                    model.set_rt_info(str(value), ["model_info", key])
    else:
        print(f"Warning: Config file {config_filename} not found, skipping rt_info")

    temp_model_name = model_filename.replace(".xml", "_temp.xml")
    ov.save_model(model, os.path.join(model_folder_path, temp_model_name))
    del model
    shutil.move(
        os.path.join(model_folder_path, temp_model_name),
        os.path.join(model_folder_path, model_filename),
    )
    shutil.move(
        os.path.join(model_folder_path, temp_model_name.replace(".xml", ".bin")),
        os.path.join(model_folder_path, model_filename.replace(".xml", ".bin")),
    )


def get_models_max_context(tmpdirname, config_filename):
    with open(os.path.join(tmpdirname, config_filename), "r") as config_file:
        config_data = json.load(config_file)
        if config_data["max_position_embeddings"] is not None:
            return config_data["max_position_embeddings"]
        if config_data["n_positions"] is not None:
            return config_data["n_positions"]
        return None


def add_servable_to_config(config_path, mediapipe_name, base_path):
    print(config_path, mediapipe_name, base_path)
    if not os.path.isfile(config_path):
        print("Creating new config file")
        with open(config_path, "w") as config_file:
            json.dump(
                {"mediapipe_config_list": [], "model_config_list": []},
                config_file,
                indent=4,
            )
    with open(config_path, "r") as config_file:
        config_data = json.load(config_file)
        if "mediapipe_config_list" not in config_data:
            config_data["mediapipe_config_list"] = []
        mp_list = config_data["mediapipe_config_list"]
        updated = False
        for mp_config in mp_list:
            if mp_config["name"] == mediapipe_name:
                mp_config["base_path"] = base_path
                updated = True
        if not updated:
            mp_list.append({"name": mediapipe_name, "base_path": base_path})
    with open(config_path, "w") as config_file:
        json.dump(config_data, config_file, indent=4)
    print("Added servable to config file", config_path)


def add_models_to_config(config_path, model_configs):
    """
    Add model_config_list entries to OVMS config.json

    Args:
        config_path: Path to config.json
        model_configs: List of model config dictionaries
    """
    if not os.path.isfile(config_path):
        with open(config_path, "w") as config_file:
            json.dump(
                {"mediapipe_config_list": [], "model_config_list": []},
                config_file,
                indent=4,
            )

    with open(config_path, "r") as config_file:
        config_data = json.load(config_file)
        if "model_config_list" not in config_data:
            config_data["model_config_list"] = []

        model_list = config_data["model_config_list"]

        # Add or update each model config
        for new_model in model_configs:
            model_name = new_model["config"]["name"]
            updated = False
            for i, existing_model in enumerate(model_list):
                if existing_model.get("config", {}).get("name") == model_name:
                    model_list[i] = new_model
                    updated = True
                    break
            if not updated:
                model_list.append(new_model)

    with open(config_path, "w") as config_file:
        json.dump(config_data, config_file, indent=4)
    print(f"Added {len(model_configs)} model(s) to config file", config_path)


def export_text_generation_model(
    model_repository_path,
    source_model,
    model_name,
    precision,
    task_parameters,
    config_file_path,
    tools_model_type=None,
    overwrite_models=False,
):
    model_path = os.path.join(".", "")
    ### Export model
    if os.path.isfile(
        os.path.join(source_model, "openvino_model.xml")
    ) or os.path.isfile(os.path.join(source_model, "openvino_language_model.xml")):
        print("OV model is source folder. Skipping conversion.")
        llm_model_path = os.path.join(model_repository_path, model_name)

        # Copy all files from source to destination
        if os.path.exists(llm_model_path) and not overwrite_models:
            print(f"Model already exists at {llm_model_path}, skipping copy")
        else:
            os.makedirs(llm_model_path, exist_ok=True)
            # Copy all files from the source model directory
            for item in os.listdir(source_model):
                source_item = os.path.join(source_model, item)
                dest_item = os.path.join(llm_model_path, item)
                if os.path.isfile(source_item):
                    shutil.copy2(source_item, dest_item)
                elif os.path.isdir(source_item):
                    if os.path.exists(dest_item):
                        shutil.rmtree(dest_item)
                    shutil.copytree(source_item, dest_item)
        model_path = llm_model_path
    elif source_model.startswith("OpenVINO/"):
        if precision:
            print(
                "Precision change is not supported for OpenVINO models. Parameter --weight-format {} will be ignored.".format(
                    precision
                )
            )
        venv_bin = os.path.dirname(sys.executable)
        huggingface_cli_path = os.path.join(venv_bin, "huggingface-cli")
        hf_cli = get_huggingface_cli_path()
        cmd = [
            hf_cli,
            "download",
            source_model,
            "--local-dir",
            os.path.join(model_repository_path, model_name),
        ]
        print("Running huggingface-cli:", cmd)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            error_msg = (
                f"Failed to download OpenVINO model '{source_model}' using huggingface-cli.\n"
                f"Command: {cmd}\n"
                f"Exit code: {result.returncode}\n"
                f"Stdout: {result.stdout.strip()}\n"
                f"Stderr: {result.stderr.strip()}\n"
                "Please check your internet connection, model name, and HuggingFace access permissions."
            )
            print(error_msg)
            raise RuntimeError(error_msg)
    else:  # assume HF model name or local pytorch model folder
        llm_model_path = os.path.join(model_repository_path, model_name)
        print("Exporting LLM model to ", llm_model_path)
        if not os.path.isdir(llm_model_path) or overwrite_models:
            if task_parameters["target_device"] == "NPU":
                if precision != "int4":
                    print("NPU target device requires int4 precision. Changing to int4")
                    precision = "int4"
                if task_parameters["extra_quantization_params"] == "":
                    print(
                        "Using default quantization parameters for NPU: --sym --ratio 1.0 --group-size -1"
                    )
                    task_parameters["extra_quantization_params"] = (
                        "--sym --ratio 1.0 --group-size -1"
                    )
            if task_parameters["extra_quantization_params"] is None:
                task_parameters["extra_quantization_params"] = ""

            # Prepare optimum-cli command arguments
            command_args = [
                "export",
                "openvino",
                "--model",
                source_model,
                "--weight-format",
                precision,
            ]

            # Add extra quantization params if present (before --trust-remote-code)
            if task_parameters["extra_quantization_params"]:
                command_args.extend(
                    task_parameters["extra_quantization_params"].split()
                )

            # Add trust-remote-code flag
            command_args.append("--trust-remote-code")

            # Add output path (positional, must be last)
            command_args.append(llm_model_path)

            if run_optimum_command(command_args):
                raise ValueError("Failed to export llm model", source_model)

            # Check if tokenizer and detokenizer were created, if not, export them
            if not os.path.isfile(
                os.path.join(llm_model_path, "openvino_detokenizer.xml")
            ):
                print(
                    "Tokenizer and detokenizer not found in the exported model. Exporting tokenizer and detokenizer from HF model"
                )
                convert_tokenizer_cmd = [
                    "convert_tokenizer",
                    "--with-detokenizer",
                    "-o",
                    llm_model_path,
                    source_model,
                ]
                result = subprocess.run(
                    convert_tokenizer_cmd, capture_output=True, text=True
                )
                if result.returncode != 0:
                    print(f"Warning: Failed to export tokenizer: {result.stderr}")
                    print(f"Tokenizer stdout: {result.stdout}")
                    raise ValueError(
                        "Failed to export tokenizer and detokenizer", source_model
                    )
    ### Export draft model for speculative decoding
    draft_source_model = task_parameters.get("draft_source_model", None)
    draft_model_dir_name = None
    if draft_source_model:
        draft_model_dir_name = draft_source_model.replace(
            "/", "-"
        )  # flatten the name so we don't create nested directory structure
        draft_llm_model_path = os.path.join(
            model_repository_path, model_name, draft_model_dir_name
        )
        if os.path.isfile(os.path.join(draft_llm_model_path, "openvino_model.xml")):
            print("OV model is source folder. Skipping conversion.")
        elif source_model.startswith("OpenVINO/"):
            if precision:
                print(
                    "Precision change is not supported for OpenVINO models. Parameter --weight-format {} will be ignored.".format(
                        precision
                    )
                )
            hf_cli = get_huggingface_cli_path()
            cmd = [
                hf_cli,
                "download",
                source_model,
                "--local-dir",
                os.path.join(model_repository_path, model_name),
            ]
            print("Running huggingface-cli (draft):", cmd)
            res = subprocess.run(cmd, capture_output=True, text=True)
            if res.returncode != 0:
                print("huggingface-cli error stdout:", res.stdout)
                print("huggingface-cli error stderr:", res.stderr)
                raise ValueError("Failed to download llm model", source_model)
        else:  # assume HF model name or local pytorch model folder
            print("Exporting draft LLM model to ", draft_llm_model_path)
            if not os.path.isdir(draft_llm_model_path) or overwrite_models:
                # Prepare command args for run_optimum_command helper
                draft_command_args = [
                    "export",
                    "openvino",
                    "--model",
                    draft_source_model,
                    "--weight-format",
                    precision,
                    "--trust-remote-code",
                    draft_llm_model_path,  # output path (positional, must be last)
                ]

                print("Running optimum-cli for draft export:", draft_command_args)
                if run_optimum_command(draft_command_args):
                    raise ValueError(
                        "Failed to export draft llm model", draft_source_model
                    )

    ### Prepare plugin config string for jinja rendering
    plugin_config = {}
    if task_parameters["kv_cache_precision"] is not None:
        plugin_config["KV_CACHE_PRECISION"] = task_parameters["kv_cache_precision"]
    if task_parameters["max_prompt_len"] is not None:
        if task_parameters["target_device"] != "NPU":
            raise ValueError("max_prompt_len is only supported for NPU target device")
        if task_parameters["max_prompt_len"] <= 0:
            raise ValueError("max_prompt_len should be a positive integer")
        plugin_config["MAX_PROMPT_LEN"] = task_parameters["max_prompt_len"]
    if task_parameters["ov_cache_dir"] is not None:
        plugin_config["CACHE_DIR"] = task_parameters["ov_cache_dir"]

    if task_parameters["prompt_lookup_decoding"]:
        plugin_config["prompt_lookup"] = True

    # Additional plugin properties for HETERO
    if "HETERO" in task_parameters["target_device"]:
        if task_parameters["pipeline_type"] is None:
            raise ValueError(
                "pipeline_type should be specified for HETERO target device. It should be set to either LM or VLM"
            )
        if task_parameters["pipeline_type"] not in ["LM", "VLM"]:
            raise ValueError(
                "pipeline_type should be either LM or VLM for HETERO target device"
            )
        plugin_config["MODEL_DISTRIBUTION_POLICY"] = "PIPELINE_PARALLEL"

    plugin_config_str = json.dumps(plugin_config)
    task_parameters["plugin_config"] = plugin_config_str

    os.makedirs(os.path.join(model_repository_path, model_name), exist_ok=True)
    # Patch: Add tool_parser and enable_tool_guided_generation to template context if set
    tool_parser = task_parameters.get("tool_parser", None)
    enable_tool_guided_generation = task_parameters.get(
        "enable_tool_guided_generation", False
    )

    # Remove None values for template rendering
    render_params = dict(task_parameters)
    if tool_parser:
        render_params["tool_parser"] = tool_parser
    if enable_tool_guided_generation:
        render_params["enable_tool_guided_generation"] = enable_tool_guided_generation

    gtemplate = jinja2.Environment(
        loader=jinja2.BaseLoader, autoescape=True
    ).from_string(text_generation_graph_template)
    print("task_parameters", task_parameters)

    # Set models_path to the absolute model directory (matching pre-converted style)
    abs_model_path = os.path.abspath(os.path.join(model_repository_path, model_name))
    model_path_escaped = abs_model_path.replace("\\", "/")
    draft_model_dir_escaped = (
        draft_model_dir_name.replace("\\", "/") if draft_model_dir_name else None
    )

    graph_content = gtemplate.render(
        model_path=model_path_escaped,
        draft_model_dir_name=draft_model_dir_escaped,
        **render_params,
    )
    with open(os.path.join(model_repository_path, model_name, "graph.pbtxt"), "w") as f:
        f.write(graph_content)
    print(
        "Created graph {}".format(
            os.path.join(model_repository_path, model_name, "graph.pbtxt")
        )
    )

    if tools_model_type is not None:
        print("Adding tuned chat template")
        template_mapping = {
            "phi4": "tool_chat_template_phi4_mini.jinja",
            "llama3": "tool_chat_template_llama3.1_json.jinja",
            "hermes3": "tool_chat_template_hermes.jinja",
            "qwen3": None,
        }
        template_name = template_mapping[tools_model_type]
        if template_name is not None:
            template_path = os.path.join(
                model_repository_path, model_name, "template.jinja"
            )
            import requests

            response = requests.get(
                "https://raw.githubusercontent.com/vllm-project/vllm/refs/tags/v0.9.0/examples/"
                + template_name
            )
            print(response.raise_for_status())
            with open(template_path, "wb") as f:
                f.write(response.content)
            print(f"Downloaded tuned chat template to {template_path}")
    else:
        # For non-tool models, rename chat_template.jinja to template.jinja if it exists
        # This ensures OVMS can find the chat template (it looks for template.jinja)
        chat_template_path = os.path.join(
            model_repository_path, model_name, "chat_template.jinja"
        )
        template_path = os.path.join(
            model_repository_path, model_name, "template.jinja"
        )
        if os.path.isfile(chat_template_path):
            shutil.move(chat_template_path, template_path)
            print(
                f"Renamed chat_template.jinja to template.jinja for OVMS compatibility"
            )

    add_servable_to_config(
        config_file_path,
        model_name,
        os.path.relpath(
            os.path.join(model_repository_path, model_name),
            os.path.dirname(config_file_path),
        ),
    )


def export_embeddings_model(
    model_repository_path,
    source_model,
    model_name,
    precision,
    task_parameters,
    version,
    config_file_path,
    truncate=True,
    overwrite_models=False,
):
    """
    Export an embeddings model to the model repository

    Args:
        model_repository_path: Path to the repository where the model will be exported
        source_model: Source model name or path
        model_name: Target model name
        precision: Weight format precision (e.g., 'int8')
        task_parameters: Dictionary containing all task specific parameters
        version: Version of the model
        config_file_path: Path to the configuration file
        truncate: Whether to truncate prompts
        overwrite_models: Whether to overwrite existing models
    """
    if os.path.isfile(os.path.join(source_model, "openvino_model.xml")):
        print("OV model is source folder. Skipping conversion.")
        os.makedirs(
            os.path.join(model_repository_path, model_name, "embeddings", version),
            exist_ok=True,
        )
        os.makedirs(
            os.path.join(model_repository_path, model_name, "tokenizer", version),
            exist_ok=True,
        )
        shutil.copy(
            os.path.join(source_model, "openvino_tokenizer.xml"),
            os.path.join(
                model_repository_path, model_name, "tokenizer", version, "model.xml"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_tokenizer.bin"),
            os.path.join(
                model_repository_path, model_name, "tokenizer", version, "model.bin"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_model.xml"),
            os.path.join(
                model_repository_path, model_name, "embeddings", version, "model.xml"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_model.bin"),
            os.path.join(
                model_repository_path, model_name, "embeddings", version, "model.bin"
            ),
        )
    else:  # assume HF model
        set_max_context_length = ""
        with tempfile.TemporaryDirectory() as tmpdirname:
            embeddings_path = os.path.join(
                model_repository_path, model_name, "embeddings", version
            )
            print("Exporting embeddings model to ", embeddings_path)
            if not os.path.isdir(embeddings_path) or overwrite_models:
                command_args = [
                    "export",
                    "openvino",
                    "--disable-convert-tokenizer",
                    "--model",
                    source_model,
                    "--task",
                    "feature-extraction",
                    "--weight-format",
                    precision,
                    "--trust-remote-code",
                    "--library",
                    "sentence_transformers",
                    tmpdirname,
                ]
                if run_optimum_command(command_args):
                    raise ValueError("Failed to export embeddings model", source_model)
                set_rt_info(tmpdirname, "openvino_model.xml", "config.json")
                if truncate:
                    max_context_length = get_models_max_context(
                        tmpdirname, "config.json"
                    )
                    if max_context_length is not None:
                        set_max_context_length = "--max_length " + str(
                            get_models_max_context(tmpdirname, "config.json")
                        )
                os.makedirs(embeddings_path, exist_ok=True)
                shutil.move(
                    os.path.join(tmpdirname, "openvino_model.xml"),
                    os.path.join(embeddings_path, "model.xml"),
                )
                shutil.move(
                    os.path.join(tmpdirname, "openvino_model.bin"),
                    os.path.join(embeddings_path, "model.bin"),
                )
            tokenizer_path = os.path.join(
                model_repository_path, model_name, "tokenizer", version
            )
            print("Exporting tokenizer to ", tokenizer_path)
            if not os.path.isdir(tokenizer_path) or overwrite_models:
                # Use Python API instead of shell command for convert_tokenizer
                try:
                    # Load the tokenizer
                    hf_tokenizer = AutoTokenizer.from_pretrained(source_model)

                    # Convert to OpenVINO tokenizer
                    max_length = None
                    if set_max_context_length:
                        # Extract max_length from string like "--max_length 512"
                        max_length = int(set_max_context_length.split()[-1])

                    ov_tokenizer = convert_tokenizer(
                        hf_tokenizer, with_detokenizer=False, max_length=max_length
                    )

                    # Save to temporary directory
                    ov.save_model(
                        ov_tokenizer, os.path.join(tmpdirname, "openvino_tokenizer.xml")
                    )
                except Exception as e:
                    raise ValueError(
                        f"Failed to export tokenizer model: {e}", source_model
                    )

                set_rt_info(
                    tmpdirname, "openvino_tokenizer.xml", "tokenizer_config.json"
                )
                os.makedirs(tokenizer_path, exist_ok=True)
                shutil.move(
                    os.path.join(tmpdirname, "openvino_tokenizer.xml"),
                    os.path.join(tokenizer_path, "model.xml"),
                )
                shutil.move(
                    os.path.join(tmpdirname, "openvino_tokenizer.bin"),
                    os.path.join(tokenizer_path, "model.bin"),
                )
    gtemplate = jinja2.Environment(
        loader=jinja2.BaseLoader, autoescape=True
    ).from_string(embedding_graph_template)
    graph_content = gtemplate.render(model_name=model_name, **task_parameters)
    with open(os.path.join(model_repository_path, model_name, "graph.pbtxt"), "w") as f:
        f.write(graph_content)
    print(
        "Created graph {}".format(
            os.path.join(model_repository_path, model_name, "graph.pbtxt")
        )
    )
    stemplate = jinja2.Environment(
        loader=jinja2.BaseLoader, autoescape=True
    ).from_string(embeddings_subconfig_template)
    subconfig_content = stemplate.render(model_name=model_name, **task_parameters)
    with open(
        os.path.join(model_repository_path, model_name, "subconfig.json"), "w"
    ) as f:
        f.write(subconfig_content)
    print(
        "Created subconfig {}".format(
            os.path.join(model_repository_path, model_name, "subconfig.json")
        )
    )

    # Add MediaPipe graph to config
    add_servable_to_config(
        config_file_path,
        model_name,
        os.path.relpath(
            os.path.join(model_repository_path, model_name),
            os.path.dirname(config_file_path),
        ),
    )

    # Add model_config_list entries for tokenizer and embeddings models
    model_configs = [
        {
            "config": {
                "name": f"{model_name}_tokenizer_model",
                "base_path": os.path.relpath(
                    os.path.join(model_repository_path, model_name, "tokenizer"),
                    os.path.dirname(config_file_path),
                ),
            }
        },
        {
            "config": {
                "name": f"{model_name}_embeddings_model",
                "base_path": os.path.relpath(
                    os.path.join(model_repository_path, model_name, "embeddings"),
                    os.path.dirname(config_file_path),
                ),
                "target_device": task_parameters.get("target_device", "CPU"),
                "plugin_config": {
                    "NUM_STREAMS": str(task_parameters.get("num_streams", 1))
                },
            }
        },
    ]
    add_models_to_config(config_file_path, model_configs)


def export_rerank_model(
    model_repository_path,
    source_model,
    model_name,
    precision,
    task_parameters,
    version,
    config_file_path,
    max_doc_length,
    overwrite_models=False,
):
    """
    Export a rerank model to the model repository

    Args:
        model_repository_path: Path to the repository where the model will be exported
        source_model: Source model name or path
        model_name: Target model name
        precision: Weight format precision (e.g., 'int8')
        task_parameters: Dictionary containing all task specific parameters
        version: Version of the model
        config_file_path: Path to the configuration file
        max_doc_length: Maximum document length in tokens
        overwrite_models: Whether to overwrite existing models
    """
    if os.path.isfile(os.path.join(source_model, "openvino_model.xml")):
        print("OV model is source folder. Skipping conversion.")
        os.makedirs(
            os.path.join(model_repository_path, model_name, "rerank", version),
            exist_ok=True,
        )
        os.makedirs(
            os.path.join(model_repository_path, model_name, "tokenizer", version),
            exist_ok=True,
        )
        shutil.copy(
            os.path.join(source_model, "openvino_tokenizer.xml"),
            os.path.join(
                model_repository_path, model_name, "tokenizer", version, "model.xml"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_tokenizer.bin"),
            os.path.join(
                model_repository_path, model_name, "tokenizer", version, "model.bin"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_model.xml"),
            os.path.join(
                model_repository_path, model_name, "rerank", version, "model.xml"
            ),
        )
        shutil.copy(
            os.path.join(source_model, "openvino_model.bin"),
            os.path.join(
                model_repository_path, model_name, "rerank", version, "model.bin"
            ),
        )
    else:  # assume HF model name
        with tempfile.TemporaryDirectory() as tmpdirname:
            embeddings_path = os.path.join(
                model_repository_path, model_name, "rerank", version
            )
            print("Exporting rerank model to ", embeddings_path)
            if not os.path.isdir(embeddings_path) or overwrite_models:
                command_args = [
                    "export",
                    "openvino",
                    "--disable-convert-tokenizer",
                    "--model",
                    source_model,
                    "--task",
                    "text-classification",
                    "--weight-format",
                    precision,
                    "--trust-remote-code",
                    tmpdirname,
                ]
                if run_optimum_command(command_args):
                    raise ValueError("Failed to export rerank model", source_model)
                set_rt_info(tmpdirname, "openvino_model.xml", "config.json")
                os.makedirs(embeddings_path, exist_ok=True)
                shutil.move(
                    os.path.join(tmpdirname, "openvino_model.xml"),
                    os.path.join(embeddings_path, "model.xml"),
                )
                shutil.move(
                    os.path.join(tmpdirname, "openvino_model.bin"),
                    os.path.join(embeddings_path, "model.bin"),
                )
            tokenizer_path = os.path.join(
                model_repository_path, model_name, "tokenizer", version
            )
            print("Exporting tokenizer to ", tokenizer_path)
            if not os.path.isdir(tokenizer_path) or overwrite_models:
                export_rerank_tokenizer(source_model, tmpdirname, max_doc_length)
                set_rt_info(
                    tmpdirname, "openvino_tokenizer.xml", "tokenizer_config.json"
                )
                os.makedirs(tokenizer_path, exist_ok=True)
                shutil.move(
                    os.path.join(tmpdirname, "openvino_tokenizer.xml"),
                    os.path.join(tokenizer_path, "model.xml"),
                )
                shutil.move(
                    os.path.join(tmpdirname, "openvino_tokenizer.bin"),
                    os.path.join(tokenizer_path, "model.bin"),
                )
    gtemplate = jinja2.Environment(
        loader=jinja2.BaseLoader, autoescape=True
    ).from_string(rerank_graph_template)
    graph_content = gtemplate.render(model_name=model_name, **task_parameters)
    with open(os.path.join(model_repository_path, model_name, "graph.pbtxt"), "w") as f:
        f.write(graph_content)
    print(
        "Created graph {}".format(
            os.path.join(model_repository_path, model_name, "graph.pbtxt")
        )
    )
    stemplate = jinja2.Environment(
        loader=jinja2.BaseLoader, autoescape=True
    ).from_string(rerank_subconfig_template)
    subconfig_content = stemplate.render(model_name=model_name, **task_parameters)
    with open(
        os.path.join(model_repository_path, model_name, "subconfig.json"), "w"
    ) as f:
        f.write(subconfig_content)
    print(
        "Created subconfig {}".format(
            os.path.join(model_repository_path, model_name, "subconfig.json")
        )
    )
    add_servable_to_config(
        config_file_path,
        model_name,
        os.path.relpath(
            os.path.join(model_repository_path, model_name),
            os.path.dirname(config_file_path),
        ),
    )


def add_common_arguments(parser):
    parser.add_argument(
        "--model_repository_path",
        required=False,
        default="models",
        help="Where the model should be exported to",
        dest="model_repository_path",
    )
    parser.add_argument(
        "--source_model",
        required=True,
        help="HF model name or path to the local folder with PyTorch or OpenVINO model",
        dest="source_model",
    )
    parser.add_argument(
        "--model_name",
        required=False,
        default=None,
        help="Model name that should be used in the deployment. Equal to source_model if HF model name is used",
        dest="model_name",
    )
    parser.add_argument(
        "--weight-format",
        default="int8",
        help="precision of the exported model",
        dest="precision",
    )
    parser.add_argument(
        "--config_file_path",
        default="config.json",
        help="path to the config file",
        dest="config_file_path",
    )
    parser.add_argument(
        "--overwrite_models",
        default=False,
        action="store_true",
        help="Overwrite the model if it already exists in the models repository",
        dest="overwrite_models",
    )
    parser.add_argument(
        "--target_device",
        default="CPU",
        help="CPU, GPU, NPU or HETERO, default is CPU",
        dest="target_device",
    )


def main():
    """Main function to handle command line arguments and execute model exports"""
    parser = argparse.ArgumentParser(
        description="Export Hugging face models to OVMS models repository including all configuration for deployments"
    )

    subparsers = parser.add_subparsers(
        help="subcommand help", required=True, dest="task"
    )
    parser_text = subparsers.add_parser(
        "text_generation", help="export model for chat and completion endpoints"
    )
    add_common_arguments(parser_text)
    parser_text.add_argument(
        "--pipeline_type",
        default=None,
        choices=["LM", "LM_CB", "VLM", "VLM_CB", "AUTO"],
        help="Type of the pipeline to be used. AUTO is used by default",
        dest="pipeline_type",
    )
    parser_text.add_argument(
        "--kv_cache_precision",
        default=None,
        choices=["u8"],
        help="u8 or empty (model default). Reduced kv cache precision to u8 lowers the cache size consumption.",
        dest="kv_cache_precision",
    )
    parser_text.add_argument(
        "--tool_parser",
        default="hermes3",
        choices=["llama3", "phi4", "hermes3", "mistral", "qwen3coder", "gptoss"],
        help="Set the type of the tool parser for tool calls extraction",
        dest="tool_parser",
    )
    parser_text.add_argument(
        "--enable_tool_guided_generation",
        action="store_true",
        help="Enables enforcing tool schema during generation. Requires setting tool_parser",
        dest="enable_tool_guided_generation",
    )
    parser_text.add_argument(
        "--extra_quantization_params",
        help='Add advanced quantization parameters. Check optimum-intel documentation. Example: "--sym --group-size -1 --ratio 1.0 --awq --scale-estimation --dataset wikitext2"',
        dest="extra_quantization_params",
    )
    parser_text.add_argument(
        "--enable_prefix_caching",
        action="store_true",
        help="This algorithm is used to cache the prompt tokens.",
        dest="enable_prefix_caching",
    )
    parser_text.add_argument(
        "--disable_dynamic_split_fuse",
        action="store_false",
        help="The maximum number of tokens that can be batched together.",
        dest="dynamic_split_fuse",
    )
    parser_text.add_argument(
        "--max_num_batched_tokens",
        default=None,
        help="empty or integer. The maximum number of tokens that can be batched together.",
        dest="max_num_batched_tokens",
    )
    parser_text.add_argument(
        "--max_num_seqs",
        default=None,
        help="256 by default. The maximum number of sequences that can be processed together.",
        dest="max_num_seqs",
    )
    parser_text.add_argument(
        "--cache_size", default=10, type=int, help="cache size in GB", dest="cache_size"
    )
    parser_text.add_argument(
        "--draft_source_model",
        required=False,
        default=None,
        help="HF model name or path to the local folder with PyTorch or OpenVINO draft model. "
        "Using this option will create configuration for speculative decoding",
        dest="draft_source_model",
    )
    parser_text.add_argument(
        "--draft_model_name",
        required=False,
        default=None,
        help="Draft model name that should be used in the deployment. "
        "Equal to draft_source_model if HF model name is used. Available only in draft_source_model has been specified.",
        dest="draft_model_name",
    )
    parser_text.add_argument(
        "--max_prompt_len",
        required=False,
        type=int,
        default=None,
        help="Sets NPU specific property for maximum number of tokens in the prompt. "
        "Not effective if target device is not NPU",
        dest="max_prompt_len",
    )
    parser_text.add_argument(
        "--ov_cache_dir",
        required=False,
        default=None,
        help="OpenVINO cache directory for compiled models",
        dest="ov_cache_dir",
    )
    parser_text.add_argument(
        "--prompt_lookup_decoding",
        action="store_true",
        help="Enable prompt lookup decoding optimization",
        dest="prompt_lookup_decoding",
    )

    parser_embeddings = subparsers.add_parser(
        "embeddings", help="export model for embeddings endpoint"
    )
    add_common_arguments(parser_embeddings)
    parser_embeddings.add_argument(
        "--skip_normalize",
        default=True,
        action="store_false",
        help="Skip normalize the embeddings.",
        dest="normalize",
    )
    parser_embeddings.add_argument(
        "--truncate",
        default=False,
        action="store_true",
        help="Truncate the prompts to fit to the embeddings model",
        dest="truncate",
    )
    parser_embeddings.add_argument(
        "--num_streams",
        default=1,
        type=int,
        help="The number of parallel execution streams to use for the model. Use at least 2 on 2 socket CPU systems.",
        dest="num_streams",
    )
    parser_embeddings.add_argument(
        "--version", default=1, type=int, help="version of the model", dest="version"
    )

    parser_rerank = subparsers.add_parser(
        "rerank", help="export model for rerank endpoint"
    )
    add_common_arguments(parser_rerank)
    parser_rerank.add_argument(
        "--num_streams",
        default="1",
        help="The number of parallel execution streams to use for the model. Use at least 2 on 2 socket CPU systems.",
        dest="num_streams",
    )
    parser_rerank.add_argument(
        "--max_doc_length",
        default=16000,
        type=int,
        help="Maximum length of input documents in tokens",
        dest="max_doc_length",
    )
    parser_rerank.add_argument(
        "--version", default="1", help="version of the model", dest="version"
    )

    args = vars(parser.parse_args())

    if not os.path.isdir(args["model_repository_path"]):
        raise ValueError(
            f"The model repository path '{args['model_repository_path']}' is not a valid directory."
        )
    if args["source_model"] is None:
        args["source_model"] = args["model_name"]
    if args["model_name"] is None:
        args["model_name"] = args["source_model"]
    if args["model_name"] is None and args["source_model"] is None:
        raise ValueError("Either model_name or source_model should be provided")

    ### Speculative decoding specific
    if args["task"] == "text_generation":
        if args["draft_source_model"] is None:
            args["draft_source_model"] = args["draft_model_name"]
        if args["draft_model_name"] is None:
            args["draft_model_name"] = args["draft_source_model"]
    ###

    template_parameters = {
        k: v
        for k, v in args.items()
        if k
        not in [
            "model_repository_path",
            "source_model",
            "model_name",
            "precision",
            "version",
            "config_file_path",
            "overwrite_models",
        ]
    }
    print("template params:", template_parameters)

    if args["task"] == "text_generation":
        export_text_generation_model(
            args["model_repository_path"],
            args["source_model"],
            args["model_name"],
            args["precision"],
            template_parameters,
            args["config_file_path"],
            tools_model_type=None,  # Not exposed as CLI argument
            overwrite_models=args["overwrite_models"],
        )

    elif args["task"] == "embeddings":
        export_embeddings_model(
            args["model_repository_path"],
            args["source_model"],
            args["model_name"],
            args["precision"],
            template_parameters,
            str(args["version"]),
            args["config_file_path"],
            args["truncate"],
            args["overwrite_models"],
        )

    elif args["task"] == "rerank":
        export_rerank_model(
            args["model_repository_path"],
            args["source_model"],
            args["model_name"],
            args["precision"],
            template_parameters,
            str(args["version"]),
            args["config_file_path"],
            args["max_doc_length"],
            args["overwrite_models"],
        )


if __name__ == "__main__":
    main()
