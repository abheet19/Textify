"""Pinned, real semantic vectors on CPU. No hosted embedding API or runtime download."""

from __future__ import annotations

import math
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock

from fastapi import HTTPException

MODEL_NAME = "BAAI/bge-small-en-v1.5"
MODEL_REVISION = "52398278842ec682c6f32300af41344b1c0b0bb2"
DIMENSIONS = 384
_inference = Lock()
_initialization = Lock()


@lru_cache(maxsize=1)
def _load_model():
    from fastembed import TextEmbedding

    model_path = Path(os.getenv("TEXTIFY_LOCAL_MODEL_PATH", "/opt/textify-model"))
    if not (model_path / "model_optimized.onnx").is_file():
        raise RuntimeError("The pinned local model is missing from the image.")
    return TextEmbedding(
        model_name=MODEL_NAME,
        specific_model_path=str(model_path),
        local_files_only=True,
        threads=1,
    )


def warm_model():
    # lru_cache alone does not serialize concurrent first calls.
    with _initialization:
        return _load_model()


def local_embed(texts: list[str], *, query: bool = False) -> list[list[float]]:
    if not _inference.acquire(blocking=False):
        raise HTTPException(429, "Indexing is busy. Try again shortly.", headers={"Retry-After": "5"})
    try:
        model = warm_model()
        iterator = model.query_embed(texts, batch_size=1) if query else model.passage_embed(texts, batch_size=1)
        vectors = [[float(value) for value in vector] for vector in iterator]
        if len(vectors) != len(texts) or any(
            len(vector) != DIMENSIONS or not all(math.isfinite(value) for value in vector) for vector in vectors
        ):
            raise RuntimeError("Local embeddings failed their shape check.")
        return vectors
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(503, "Local semantic indexing is unavailable. No document data was stored.") from error
    finally:
        _inference.release()
