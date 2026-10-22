import type { FormEventHandler } from 'react';
import { ArrowUp, RotateCcw } from 'lucide-react';
import { IconButton } from '../../components/ui';
import type { ProjectDocument } from '../../types';
import { modeOptions, type ChatMode } from './chatTypes';

interface ChatComposerProps {
  input: string;
  setInput: (value: string) => void;
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
  documentId: string;
  setDocumentId: (id: string) => void;
  projectDocuments: ProjectDocument[];
  busy: boolean;
  loading: boolean;
  historyError: string;
  configured: boolean | null;
  messageCount: number;
  error: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onClear: () => void;
}

export function ChatComposer({
  input,
  setInput,
  mode,
  setMode,
  documentId,
  setDocumentId,
  projectDocuments,
  busy,
  loading,
  historyError,
  configured,
  messageCount,
  error,
  onSubmit,
  onClear,
}: ChatComposerProps) {
  const activeMode = modeOptions.find(option => option.value === mode) ?? modeOptions[0];
  const cannotSend = busy || loading || !!historyError || configured !== true
    || (mode === 'summary' ? !documentId : !input.trim());

  return <div className="chat-composer-area">
    {error && <p role="alert" className="form-error">{error}</p>}
    <form className="chat-composer" onSubmit={onSubmit}>
      <textarea
        aria-label="Message ProjectDocumentAI"
        value={input}
        onChange={event => setInput(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder={mode === 'summary' ? 'Choose a document, then select Send to summarize it.' : 'Ask about this project...'}
        rows={1}
        maxLength={4000}
        disabled={busy || mode === 'summary'}
      />
      <button type="submit" aria-label="Send message" disabled={cannotSend}><ArrowUp size={20} /></button>
    </form>
    <div className="assistant-controls assistant-controls-compact">
      <label className="assistant-mode-select">
        <span>Ask about</span>
        <select
          aria-label="Assistant mode"
          value={mode}
          disabled={busy}
          onChange={event => setMode(event.target.value as ChatMode)}
        >
          {modeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {mode === 'summary' && <label>
        <span>Document</span>
        <select
          aria-label="Document"
          value={documentId}
          onChange={event => setDocumentId(event.target.value)}
          disabled={busy}
        >
          <option value="">Choose a document</option>
          {projectDocuments.filter(document => document.processingStatus === 'ready').map(document =>
            <option key={document.id} value={document.id}>{document.name}</option>)}
        </select>
      </label>}
      <span className="assistant-mode-description" aria-live="polite">{activeMode.help}</span>
      <IconButton
        label="Clear conversation"
        disabled={!messageCount || busy || loading}
        onClick={onClear}
      ><RotateCcw size={17} /></IconButton>
    </div>
    <p className="chat-disclaimer">AI can make mistakes. Check cited sources and project records. Conversations are saved in your account.</p>
  </div>;
}
