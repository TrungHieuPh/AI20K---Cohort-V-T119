"""Shared settings, embedder and Qdrant client used by ingest.py and retrieve.py.

Settings come from .env (see .env.example):
    EMBED_MODEL        default BAAI/bge-m3
    QDRANT_PATH        local storage folder, default .qdrant (relative to the repo root)
    QDRANT_URL         set this to use a Qdrant server instead of local mode
    QDRANT_COLLECTION  default labor_code__bge-m3__dieu

Local mode locks QDRANT_PATH: only one process can open the index at a time.
"""
from __future__ import annotations

import os
import uuid
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")

EMBED_MODEL = os.getenv("EMBED_MODEL") or "BAAI/bge-m3"
QDRANT_URL = os.getenv("QDRANT_URL") or None
QDRANT_PATH = Path(os.getenv("QDRANT_PATH") or ".qdrant")
if not QDRANT_PATH.is_absolute():
    QDRANT_PATH = REPO_ROOT / QDRANT_PATH
COLLECTION = os.getenv("QDRANT_COLLECTION") or "labor_code__bge-m3__dieu"

# Fixed namespace so a chunk_id always maps to the same point id (re-ingest never duplicates).
_ID_NAMESPACE = uuid.UUID("6f0c1c1e-3b7a-4f53-9a43-0d6c2f6d1a19")


def point_id(chunk_id: str) -> str:
    return str(uuid.uuid5(_ID_NAMESPACE, chunk_id))


class Embedder:
    """Real embedding model. Fails loudly; never falls back to fake vectors."""

    def __init__(self, model_name: str) -> None:
        from sentence_transformers import SentenceTransformer

        self.model_name = model_name
        self.model = SentenceTransformer(model_name)
        self.dimensions = self.model.get_embedding_dimension()

    def embed_documents(self, texts: list[str], batch_size: int = 4) -> list[list[float]]:
        vecs = self.model.encode(
            texts, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=True
        )
        return vecs.tolist()

    def embed_query(self, question: str) -> list[float]:
        return self.model.encode([question], normalize_embeddings=True)[0].tolist()


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    return Embedder(EMBED_MODEL)


@lru_cache(maxsize=1)
def get_client():
    from qdrant_client import QdrantClient

    if QDRANT_URL:
        return QdrantClient(url=QDRANT_URL, api_key=os.getenv("QDRANT_API_KEY") or None)
    return QdrantClient(path=str(QDRANT_PATH))
