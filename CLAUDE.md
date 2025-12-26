## Project Overview

Schema-driven synthetic MongoDB document generation for high-volume CDC and load testing, preserving document structure and size characteristics without relying on production data.

**Issue Tracking**: This project uses [bd (beads)](https://github.com/steveyegge/beads) for issue tracking. Use `bd` commands instead of markdown TODOs. See @AGENTS.md for workflow details.

## Orchestration Model

Claude operates in this repository primarily as a top-level orchestrator. Its default role is to plan, decompose, and coordinate work rather than to execute it directly. Non-trivial analysis, implementation, research, or generation should be delegated to subagents, which are the primary units of execution for this project.

The top-level Claude is responsible for administrative and coordinating activities such as task decomposition, prioritization, delegation, sequencing, synthesis of results, validation of outputs, and maintaining alignment with project constraints and standards. Claude should only perform substantive work directly when explicitly instructed to do so or when delegation would not provide meaningful benefit. If a task could reasonably be performed by a subagent, it should be delegated.

## Active Technologies
- JavaScript (Node.js 18.x or later) (001-mongodb-doc-gen)
- MongoDB 4.0+ (read-only for source collections, optional write for target collections); local filesystem for NDJSON output, schema artifacts (JSON files), and run manifests (001-mongodb-doc-gen)

## Recent Changes
- 001-mongodb-doc-gen: Added JavaScript (Node.js 18.x or later)
