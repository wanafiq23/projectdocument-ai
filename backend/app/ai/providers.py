"""Connections to MongoDB Atlas, Gemini, and the LangChain vector store."""

from functools import cached_property

from fastapi import HTTPException


class ProviderMixin:
    @property
    def configured(self):
        return bool(
            self.settings.mongodb_uri
            and self.settings.mongodb_uri.get_secret_value()
            and self.settings.gemini_api_key
            and self.settings.gemini_api_key.get_secret_value()
        )

    def require_configured(self):
        if not self.configured:
            raise HTTPException(
                503,
                'AI setup is required. Add GEMINI_API_KEY and MONGODB_URI in backend/.env, then restart the API.',
            )

    @cached_property
    def mongo(self):
        if not self.settings.mongodb_uri or not self.settings.mongodb_uri.get_secret_value():
            raise HTTPException(503, 'MongoDB is not configured. Add MONGODB_URI in backend/.env.')
        from pymongo import MongoClient

        return MongoClient(
            self.settings.mongodb_uri.get_secret_value(),
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=5000,
            socketTimeoutMS=60000,
            appname='ProjectDocumentAI',
        )

    @property
    def database(self):
        return self.mongo[self.settings.mongodb_database]

    @cached_property
    def embeddings(self):
        self.require_configured()
        from .gemini import GeminiRetrievalEmbeddings

        return GeminiRetrievalEmbeddings(
            model=self.settings.gemini_embedding_model,
            output_dimensionality=self.settings.embedding_dimensions,
            api_key=self.settings.gemini_api_key.get_secret_value(),
            vertexai=False,
            client_args={'timeout': 45.0},
        )

    @cached_property
    def llm(self):
        self.require_configured()
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=self.settings.gemini_chat_model,
            api_key=self.settings.gemini_api_key.get_secret_value(),
            vertexai=False,
            temperature=None,
            timeout=45,
            max_retries=1,
            max_tokens=4096,
        )

    @cached_property
    def vector_store(self):
        from langchain_mongodb import MongoDBAtlasVectorSearch

        return MongoDBAtlasVectorSearch(
            collection=self.database.chunks,
            embedding=self.embeddings,
            index_name=self.settings.mongodb_vector_index,
            text_key='text',
            embedding_key='embedding',
            relevance_score_fn='cosine',
            auto_create_index=False,
        )

    def close(self):
        if 'mongo' in self.__dict__:
            self.mongo.close()
