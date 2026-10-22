import { useRef, useState, type DragEvent } from 'react';
import { CheckCircle2, CircleAlert, Clock3, FileText, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import { DocumentPreview } from './DocumentPreview';
import { ConfirmDialog, IconButton, Spinner } from './ui';
import { api, errorMessage } from '../lib/api';
import { fileSize, validDocumentFiles } from '../lib/utils';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import type { ProjectDocument } from '../types';

export function WorkspaceDocumentSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { documents, selectedProjectId, uploadDocument, deleteDocument, notify, reloadProjects } = useWorkspace();
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [indexing, setIndexing] = useState('');
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<ProjectDocument | null>(null);
  const [deleting, setDeleting] = useState<ProjectDocument | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const projectDocs = documents.filter(document => document.projectId === selectedProjectId);

  async function upload(files: File[]) {
    if (!selectedProjectId || busy.current || !files.length) return;
    busy.current = true;
    setUploading(true);
    try {
      const selectedFiles = validDocumentFiles(files, message => notify(message, 'error'));
      for (const [index, file] of selectedFiles.entries()) {
        setUploadStatus(selectedFiles.length > 1 ? `${index + 1} of ${selectedFiles.length}: ${file.name}` : file.name);
        try { await uploadDocument(selectedProjectId, file); }
        catch (failure) { notify(`${file.name}: ${errorMessage(failure)}`, 'error'); }
      }
    } finally {
      busy.current = false;
      setUploading(false);
      setUploadStatus('');
      if (input.current) input.current.value = '';
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void upload(Array.from(event.dataTransfer.files));
  }

  async function indexForAI(document: ProjectDocument) {
    setIndexing(document.id);
    try {
      const result = await api<ProjectDocument>(`/documents/${document.id}/index`, { method: 'POST' });
      notify(result.indexingStatus === 'indexed' ? 'Document indexed. AI search may take a moment to update.' : result.indexingError || 'Indexing failed.', result.indexingStatus === 'indexed' ? 'success' : 'error');
      await reloadProjects();
    } catch (failure) {
      notify(errorMessage(failure), 'error');
    } finally {
      setIndexing('');
    }
  }

  return <>
    <div className="studio-sidebar-heading"><span>KNOWLEDGE BASE</span><strong>{projectDocs.length}</strong></div>
    <input ref={input} className="sr-only" tabIndex={-1} type="file" multiple accept=".pdf,.docx,.txt" aria-label="Upload documents from library" onChange={event => void upload(Array.from(event.target.files || []))} />
    <button type="button" className={`studio-upload ${projectDocs.length ? 'is-compact' : ''} ${uploading ? 'is-uploading' : ''} ${dragging ? 'is-dragging' : ''}`} disabled={uploading}
      onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={drop}>
      {uploading ? <Spinner /> : <UploadCloud size={projectDocs.length ? 17 : 22} />}<strong>{uploading ? 'Uploading and processing…' : projectDocs.length ? 'Add documents' : 'Drop files here'}</strong><span aria-live="polite">{uploading ? uploadStatus : projectDocs.length ? 'PDF, DOCX, TXT' : 'or select PDF, DOCX, TXT'}</span>
    </button>
    <div className="studio-document-list">
      {projectDocs.map(document => {
        const isIndexing = indexing === document.id || document.indexingStatus === 'indexing';
        const state = document.processingStatus === 'failed'
          ? { className: 'failed', label: 'Processing failed', detail: document.processingError || 'Document processing failed.' }
          : document.processingStatus === 'empty'
            ? { className: 'failed', label: 'No readable text', detail: document.processingError || 'No readable text was found.' }
            : isIndexing
              ? { className: 'processing', label: 'Indexing…', detail: 'Preparing this document for AI search.' }
              : document.indexingStatus === 'indexed'
                ? { className: 'indexed', label: 'AI ready', detail: 'Available for AI search.' }
                : document.indexingStatus === 'failed'
                  ? { className: 'failed', label: 'Indexing failed', detail: document.indexingError || 'Indexing failed.' }
                  : document.indexingStatus === 'not_configured'
                    ? { className: 'pending', label: 'AI setup needed', detail: document.indexingError || 'Configure AI search before indexing.' }
                    : { className: 'pending', label: 'Ready to index', detail: 'Select Index for AI to make this document searchable.' };
        return <div className="studio-document" key={document.id}>
        <button type="button" className="studio-document-preview" aria-label={`View ${document.name}`} onClick={() => { setPreview(document); onNavigate?.(); }}>
          <FileText size={17} /><span><strong>{document.name}</strong><small>{document.type} · {fileSize(document.size)}</small></span>
        </button>
        <div className="studio-document-meta">
          <i className={`document-index-state state-${state.className}`} title={state.detail}>{isIndexing ? <Spinner /> : state.className === 'indexed' ? <CheckCircle2 size={14} /> : state.className === 'failed' ? <CircleAlert size={14} /> : <Clock3 size={14} />}<em>{state.label}</em></i>
          <span className="studio-document-actions">
            {document.processingStatus === 'ready' && document.indexingStatus !== 'indexed' && <IconButton className="studio-document-action" label={`${document.indexingStatus === 'failed' ? 'Retry indexing' : 'Index'} ${document.name}`} disabled={!!indexing} onClick={() => void indexForAI(document)}>{indexing === document.id ? <Spinner /> : <RefreshCw size={14} />}<span>{document.indexingStatus === 'failed' ? 'Retry' : 'Index for AI'}</span></IconButton>}
            <IconButton label={`Delete ${document.name}`} className="studio-document-action delete-action" onClick={() => setDeleting(document)}><Trash2 size={14} /><span>Delete</span></IconButton>
          </span>
        </div>
      </div>;})}
    </div>
    {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
    {deleting && <ConfirmDialog title="Remove this document?" description={`“${deleting.name}” and its indexed content will be deleted from this project.`} onClose={() => setDeleting(null)} onConfirm={() => deleteDocument(deleting.id)} />}
  </>;
}
