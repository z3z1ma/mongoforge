# Investigation: Semantic Type Detection & Memory Efficiency

## The Current State: Why Stored Values are Required

Currently, **MongoForge** requires the `storeValues: true` flag during schema inference to enable semantic type detection (e.g., identifying a field as an `Email`, `URL`, or `UUID`). 

### 1. The Dependency Chain
*   **Library Level**: We use `mongodb-schema` for core inference. It only provides sample values for fields if `storeValues` is enabled.
*   **Inferencer Level**: The `Inferencer` performs a post-processing step called `applySemanticTypes`. This function iterates over the inferred schema, looks for the `values` array on string fields, and runs regex-based validators against those samples.
*   **Confidence Calculation**: To determine if a field is an email, it calculates a match ratio (e.g., `matchCount / sampleSize`). This currently requires the entire `values` array to be present in memory after the main inference pass is complete.

### 2. The Memory Problem
Storing sample values is the single largest contributor to memory consumption during discovery. For massive documents or large sample sizes, these `values` arrays grow linearly, eventually triggering the "JavaScript heap out of memory" error.

---

## The "Gap": Why not in the Generator?

The **Generator** (faker engine) is a **consumer** of the schema, not an analyzer of the source data.

*   **Role Separation**: The Generator's responsibility is to transform a `GenerationSchema` into synthetic data. It relies on the schema being "pre-annotated" with semantic formats (e.g., `"format": "email"`).
*   **Access**: By the time the Generator runs, the production source documents are no longer available. It cannot "learn" the semantic nature of a field during the generation phase; it must be told what to generate.

---

## The Solution: Streaming Semantic Detection

The reliance on stored values is an architectural artifact of the original non-streaming implementation. To close this gap and allow semantic detection with zero memory overhead, the logic should be moved into the **Single-Pass Streaming Profiler**.

### Implementation Strategy:
1.  **Semantic Accumulator**: Create a new accumulator in `src/lib/profiler/` that mirrors the logic in `NumericStatsAccumulator`.
2.  **Incremental Observation**: Update the `Profiler.observe(doc)` method to:
    *   Identify string fields during document traversal.
    *   Test those strings against the built-in `SemanticDetector` regexes (Email, URL, UUID, etc.).
    *   Increment a `matchCount` and `totalCount` for every potential semantic path.
3.  **Synthesizer Integration**: During the synthesis phase, instead of looking at the `InferredSchema` for semantic types, look at the `ConstraintsProfile` provided by the profiler.

### Benefits:
*   **Stable Memory**: Semantic detection becomes a set of running counters rather than a collection of sample strings.
*   **Full Fidelity**: We can detect semantic types even when `--no-store-values` is enabled.
*   **Performance**: Detection happens during the initial data pass, removing the need for a recursive post-processing traversal of the schema.

---

## Conclusion
The requirement for `storeValues` is a "foolish gap" caused by lazy post-processing. Moving detection logic upstream into the streaming profiler is the correct path to achieving high-fidelity schema discovery on arbitrary-sized production datasets.
