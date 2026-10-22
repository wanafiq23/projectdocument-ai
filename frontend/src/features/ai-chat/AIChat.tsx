import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, ConfirmDialog, Modal } from '../../components/ui';
import { DocumentPreview } from '../../components/DocumentPreview';
import { api, errorMessage } from '../../lib/api';
import type { ChatMessage, Citation, ProjectDocument } from '../../types';
import { useAuth } from '../auth/AuthContext';
import { useWorkspace } from '../workspace/WorkspaceContext';
import { ChatComposer } from './ChatComposer';
import { ChatMessageList } from './ChatMessageList';
import { citationLocation } from './MessageText';
import type { ChatMode } from './chatTypes';

export function AIChat() {
  const { selectedProjectId } = useWorkspace();
  return <ChatSession key={selectedProjectId} />;
}

function ChatSession() {
  const { user } = useAuth();
  const { documents, selectedProjectId } = useWorkspace();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('documents');
  const [documentId, setDocumentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [clearing, setClearing] = useState(false);
  const [citation, setCitation] = useState<Citation | null>(null);
  const [preview, setPreview] = useState<ProjectDocument | null>(null);
  const mounted = useRef(true);
  const sending = useRef(false);
  const retry = useRef<{ signature: string; id: string } | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const projectDocuments = documents.filter(document => document.projectId === selectedProjectId);
  const messagesPath = `/ai/projects/${selectedProjectId}/messages`;

  useEffect(() => {
    mounted.current = true;
    if (!selectedProjectId) {
      setLoading(false);
      return () => { mounted.current = false; };
    }

    const controller = new AbortController();
    api<ChatMessage[]>(messagesPath, { signal: controller.signal })
      .then(items => {
        if (mounted.current && !controller.signal.aborted) setMessages(items);
      })
      .catch(requestError => {
        if (mounted.current && !controller.signal.aborted) setHistoryError(errorMessage(requestError));
      })
      .finally(() => {
        if (mounted.current && !controller.signal.aborted) setLoading(false);
      });

    api<{ configured: boolean }>('/ai/status', { signal: controller.signal })
      .then(status => {
        if (mounted.current && !controller.signal.aborted) setConfigured(status.configured);
      })
      .catch(requestError => {
        if (mounted.current && !controller.signal.aborted) setError(errorMessage(requestError));
      });

    return () => {
      mounted.current = false;
      controller.abort();
    };
    // This component is keyed by project; history is loaded once for each mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messagesPath, selectedProjectId]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = mode === 'summary'
      ? `Summarize ${projectDocuments.find(document => document.id === documentId)?.name || 'this document'}`
      : input.trim();
    if (!text || sending.current || !selectedProjectId || (mode === 'summary' && !documentId)) return;

    sending.current = true;
    setBusy(true);
    setError('');
    const signature = JSON.stringify({ text, mode, documentId });
    const requestId = retry.current?.signature === signature ? retry.current.id : crypto.randomUUID();
    retry.current = { signature, id: requestId };

    try {
      const pair = await api<ChatMessage[]>(messagesPath, {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          mode,
          documentId: mode === 'summary' ? documentId : null,
          requestId,
        }),
      });
      if (mounted.current) {
        setMessages(current => {
          const ids = new Set(current.map(message => message.id));
          return [...current, ...pair.filter(message => !ids.has(message.id))];
        });
        setInput('');
        retry.current = null;
      }
    } catch (requestError) {
      if (mounted.current) setError(errorMessage(requestError));
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function clear() {
    await api(messagesPath, { method: 'DELETE' });
    if (mounted.current) {
      setMessages([]);
      retry.current = null;
      setHistoryError('');
    }
  }

  const citationDocument = citation
    ? projectDocuments.find(document => document.id === citation.documentId)
    : undefined;

  return <div className="chat-page chat-page-drawer">
    {configured === false && <div className="info-banner ai-setup-banner">
      <span><strong>Connect AI to ask questions.</strong> Add your Gemini and Atlas details in Settings.</span>
      <Link to="/settings">Open settings</Link>
    </div>}
    <div className="chat-workspace">
      <ChatMessageList
        messages={messages}
        userName={user?.name || 'You'}
        projectDocuments={projectDocuments}
        loading={loading}
        historyError={historyError}
        busy={busy}
        endRef={end}
        onSelectCitation={setCitation}
      />
      <ChatComposer
        input={input}
        setInput={setInput}
        mode={mode}
        setMode={setMode}
        documentId={documentId}
        setDocumentId={setDocumentId}
        projectDocuments={projectDocuments}
        busy={busy}
        loading={loading}
        historyError={historyError}
        configured={configured}
        messageCount={messages.length}
        error={error}
        onSubmit={send}
        onClear={() => setClearing(true)}
      />
    </div>
    {clearing && <ConfirmDialog
      title="Clear this conversation?"
      description="This deletes your saved chat history for this project."
      confirmLabel="Clear conversation"
      onClose={() => setClearing(false)}
      onConfirm={clear}
    />}
    {citation && <Modal
      title={citation.name}
      description={citationLocation(citation.location)}
      onClose={() => setCitation(null)}
    >
      <div className="citation-preview">
        <blockquote>{citation.excerpt}</blockquote>
        {citationDocument
          ? <Button onClick={() => { setPreview(citationDocument); setCitation(null); }}>View document</Button>
          : <p className="citation-unavailable-note">
            Document removed. The saved citation excerpt is still available, but the original file can no longer be opened.
          </p>}
      </div>
    </Modal>}
    {preview && <DocumentPreview document={preview} onClose={() => setPreview(null)} />}
  </div>;
}
