"""LangChain Gemini embeddings with normalized, dimension-checked vectors."""

import math

from langchain_google_genai import GoogleGenerativeAIEmbeddings


class GeminiRetrievalEmbeddings(GoogleGenerativeAIEmbeddings):
    # The parent assigns RETRIEVAL_DOCUMENT and RETRIEVAL_QUERY respectively.
    # gemini-embedding-001 requires normalization for reduced dimensions.
    def _normalize(self, vector: list[float]) -> list[float]:
        if self.output_dimensionality and len(vector) != self.output_dimensionality:
            raise ValueError('Gemini returned a vector with unexpected dimensions.')
        norm = math.hypot(*vector)
        if not math.isfinite(norm) or norm == 0:
            raise ValueError('Gemini returned an invalid embedding vector.')
        return [value / norm for value in vector]

    def embed_documents(self, texts: list[str], **kwargs) -> list[list[float]]:
        vectors = super().embed_documents(texts, **kwargs)
        if len(vectors) != len(texts):
            raise ValueError('Gemini did not return one embedding per document chunk.')
        return [self._normalize(vector) for vector in vectors]

    def embed_query(self, text: str, **kwargs) -> list[float]:
        return self._normalize(super().embed_query(text, **kwargs))
