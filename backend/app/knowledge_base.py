from typing import List
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

def embed_text(text: str) -> np.ndarray:
    np.random.seed(abs(hash(text)) % (10 ** 8))
    return np.random.rand(768)

class KnowledgeBase:
    def __init__(self, docs: List[str] = None):
        self.docs = docs or []
        self.doc_embeddings = np.vstack([embed_text(d) for d in self.docs]) if self.docs else np.array([])

    def add_document(self, doc: str):
        self.docs.append(doc)
        emb = embed_text(doc)
        if self.doc_embeddings.size == 0:
            self.doc_embeddings = emb.reshape(1, -1)
        else:
            self.doc_embeddings = np.vstack([self.doc_embeddings, emb])

    def query(self, query_text: str, top_k=3) -> List[str]:
        if self.doc_embeddings.size == 0:
            return []
        query_embedding = embed_text(query_text).reshape(1, -1)
        similarities = cosine_similarity(query_embedding, self.doc_embeddings)[0]
        top_indices = similarities.argsort()[-top_k:][::-1]
        return [self.docs[i] for i in top_indices]
