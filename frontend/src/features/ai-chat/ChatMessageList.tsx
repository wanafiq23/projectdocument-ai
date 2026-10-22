import type { RefObject } from 'react';
import { BrainCircuit, FileText, Sparkles } from 'lucide-react';
import { Avatar, Spinner } from '../../components/ui';
import type { ChatMessage, Citation, ProjectDocument } from '../../types';
import { citationLocation, MessageText } from './MessageText';

interface ChatMessageListProps {
  messages: ChatMessage[];
  userName: string;
  projectDocuments: ProjectDocument[];
  loading: boolean;
  historyError: string;
  busy: boolean;
  endRef: RefObject<HTMLDivElement | null>;
  onSelectCitation: (citation: Citation) => void;
}

export function ChatMessageList({
  messages,
  userName,
  projectDocuments,
  loading,
  historyError,
  busy,
  endRef,
  onSelectCitation,
}: ChatMessageListProps) {
  return <div className="chat-scroll"><div className="chat-inner">
    {loading && <p role="status">Loading conversation...</p>}
    {historyError && <p role="alert" className="form-error">{historyError}</p>}
    {!messages.length && !loading && <div className="chat-welcome">
      <span className="chat-welcome-icon"><Sparkles size={28} /></span>
      <h2>Your project knowledge, within reach.</h2>
      <p>Document answers include sources. Database questions use your current project records.</p>
    </div>}
    <div className="message-list" aria-live="polite">{messages.map(message =>
      <article key={message.id} className={'chat-message message-' + message.role}>
        <span className="message-avatar">
          {message.role === 'assistant' ? <BrainCircuit size={20} /> : <Avatar name={userName || 'You'} small />}
        </span>
        <div className="message-content">
          <div className="message-meta">
            <strong>{message.role === 'assistant' ? 'Document Assistant' : 'You'}</strong>
            <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </div>
          <MessageText text={message.text} />
          {!!message.citations?.length && <div className="message-sources">
            <span className="sources-label">DOCUMENT SOURCES</span>
            <div>{message.citations.map((source, index) => {
              const available = projectDocuments.some(document => document.id === source.documentId);
              return <button
                key={index}
                className={`citation-card ${available ? '' : 'citation-card-unavailable'}`}
                onClick={() => onSelectCitation(source)}
              >
                <FileText size={17} />
                <span>
                  <strong>{source.sourceId ? `[${source.sourceId}] ` : ''}{source.name}</strong>
                  <small>{citationLocation(source.location)}</small>
                  {!available && <em className="citation-removed-label">Removed</em>}
                </span>
              </button>;
            })}</div>
          </div>}
          {!!message.toolsUsed?.length && <p className="tool-trace">
            Tools used: {Array.from(new Set(message.toolsUsed)).join(', ')}
          </p>}
        </div>
      </article>)}</div>
    {busy && <p role="status" className="assistant-working"><Spinner /> Reviewing project evidence...</p>}
    <div ref={endRef} />
  </div></div>;
}
