import { useEffect, useState } from 'react';
import { Download, FileText, Info } from 'lucide-react';
import { fileSize, formatDate } from '../lib/utils';
import { apiBlob, errorMessage } from '../lib/api';
import type { ProjectDocument } from '../types';
import { Button, FileIcon, Modal } from './ui';

export function DocumentPreview({ document, onClose }: { document: ProjectDocument; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void apiBlob(`/documents/${document.id}/file`).then(blob => {
      objectUrl = URL.createObjectURL(blob);
      if (active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(failure => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [document.id]);

  return <Modal title={document.name} onClose={onClose} wide>
    <div className="preview-meta"><FileIcon type={document.type} /><div><strong>{document.type} document</strong><span>{fileSize(document.size)} · Added {formatDate(document.uploadedAt)}</span></div>{url && <a className="button button-secondary" href={url} download={document.name}><Download size={16} />Download</a>}</div>
    {document.processingStatus !== 'ready' && <div className="info-banner"><Info size={16} />{document.processingError || 'No text was found in this document.'}</div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {document.type === 'PDF' && url ? <iframe className="pdf-preview" src={url} title={`Preview of ${document.name}`} />
      : document.content ? <div className="document-paper"><FileText size={24} /><pre>{document.content}</pre></div>
      : <div className="empty-state"><span className="empty-icon"><FileText size={28} /></span><h3>{url ? 'The original file is ready' : 'Loading the original file'}</h3><p>{document.type === 'DOCX' ? 'Download the DOCX file to open it locally.' : 'No extracted text is available for preview.'}</p></div>}
    <div className="modal-actions"><Button variant="secondary" onClick={onClose}>Close preview</Button></div>
  </Modal>;
}
