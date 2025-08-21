# University Curriculum Enabling Tool

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

University Curriculum Enabling Tool is an advanced application leveraging fine-tuned Language Models and Retrieval Augmented Generation (RAG) technology to support diverse academic needs:

- **Curriculum Builder:** Designed for faculty, this tool streamlines the creation and refinement of course content, enabling the development of tailored curricula and continuous improvement of teaching materials.
- **Expert Advisor:** Lecturers can customize and enhance their teaching resources, generate assignments, quizzes, and research prompts, and access tools to support effective course delivery.
- **Learning Companion:** Students benefit from personalized learning experiences, including practice quizzes, material summarization, and interactive note-taking, both within and beyond the content provided by lecturers.

Powered by Intel CPUs and GPUs, the tool ensures accurate, contextually relevant responses, making it a valuable asset for curriculum development, teaching, and student learning.

## System Requirements

### Software Requirements

- **Operating System**: 

  | Type        | Version                   |
  |-------------|---------------------------|
  | Linux       | Ubuntu 24.04 Desktop LTS  |

### Hardware Requirements

- **CPU**: Intel® Core™ Ultra Processor (Products formerly Meteor Lake-UH) and above
- **RAM**: Minimum: 32GB, Recommended: 64GB 
- **Storage**: 256GB free space
- **GPU**: At least one of the following:

  |     Type    | Model                     | Recommended For                 |
  |-------------|---------------------------|---------------------------------|
  | Integrated  | Intel® Arc™ Graphics      | Basic usage                     |
  | Discrete    | Intel® Arc™ A770 Graphics | Enhanced performance            |

### Local Ports Usage
> These ports are only used on the local machine (localhost/127.0.0.1) and don't need to be exposed externally.

| Port        | Service                   | Required For                    |
|-------------|---------------------------|---------------------------------|
| 8080        | Web Interface             | Application UI access           |
| 8016        | Backend                   | Internal REST API               |
| 11434       | Ollama Model Serving      | LLM inference and embeddings    |

## Disclaimer

> **Important Notice:** This software is currently in pre-production status, designed to run locally on a single system only. For more stable version, please refer to our latest tagged pre-release.

## Quick Start

> **Pre-requisite:** Follow the [Edge Developer Kit Reference Scripts](https://github.com/intel/edge-developer-kit-reference-scripts) to install the necessary drivers and compute-related packages for Intel® GPUs 

1. **Setup** - Install system dependencies:

   > **Note:** Setup requires administrator privileges as it installs system-level dependencies.

   ```bash
   sudo ./setup.sh
   ```

2. **Install** - Install the application from sources to build and package the application
   ```bash
   ./install.sh
   ```

3. **Continue Installation** - Go to the generated distribution package directory (follow the instruction from previous command):

4. **Run** - Start the application:
   ```bash
   ./run.sh
   ```

5. **Access** - Open the web interface at http://localhost:8080

6. **Stop** - To stop the application, run:
   ```bash
   ./stop.sh
   ```

7. **Uninstall** - To remove the application, run:
   ```bash
   ./uninstall.sh
   ```

## Disclaimer
Intel is committed to respecting human rights and avoiding causing or contributing to adverse impacts on human rights. See [Intel’s Global Human Rights Principles](https://www.intel.com/content/dam/www/central-libraries/us/en/documents/policy-human-rights.pdf). Intel’s products and software are intended only to be used in applications that do not cause or contribute to adverse impacts on human rights. Users should comply with all requirements to notify relevant parties that AI was used in the production of materials, as mandated by their employers or professional standards.
