"""Extract text with real PDF page numbers; DOCX/TXT use chunk locations."""

from io import BytesIO

from docx import Document as open_docx
from pypdf import PdfReader

MAX_EXTRACTED_CHARS = 1_000_000


def extract_pages(file_type: str, payload: bytes) -> list[dict]:
    if file_type == 'PDF':
        if not payload.startswith(b'%PDF-'):
            raise ValueError('Invalid PDF')
        reader = PdfReader(BytesIO(payload))
        pages = [{'page': i + 1, 'text': page.extract_text() or ''} for i, page in enumerate(reader.pages)]
    elif file_type == 'DOCX':
        if not payload.startswith(b'PK'):
            raise ValueError('Invalid DOCX')
        doc = open_docx(BytesIO(payload))
        text = '\n'.join([p.text for p in doc.paragraphs] +
                         [cell.text for table in doc.tables for row in table.rows for cell in row.cells])
        pages = [{'page': None, 'text': text}]
    else:
        pages = [{'page': None, 'text': payload.decode('utf-8-sig')}]
    if sum(len(page['text']) for page in pages) > MAX_EXTRACTED_CHARS:
        raise ValueError('Document exceeds extraction limit')
    return pages


def split_pages(pages: list[dict]) -> list[dict]:
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    splitter = RecursiveCharacterTextSplitter(chunk_size=1200, chunk_overlap=180)
    chunks = []
    for page in pages:
        for text in splitter.split_text(page['text']):
            chunks.append({'text': text, 'page': page.get('page'), 'chunk': len(chunks) + 1})
    return chunks
