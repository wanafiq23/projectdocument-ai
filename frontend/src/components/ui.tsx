import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, ChevronDown, FileText, Folder, LoaderCircle, Search, X, type LucideIcon } from 'lucide-react';
import { initials, slug } from '../lib/utils';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import type { ProjectDocument } from '../types';
import { errorMessage } from '../lib/api';

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`button button-${variant} ${className}`} {...props}>{children}</button>;
}
export function IconButton({ children, label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}>{children}</button>;
}
export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone || (typeof children === 'string' ? slug(children) : 'neutral')}`}><span className="badge-dot" />{children}</span>;
}
export function Avatar({ name, index = 0, small = false }: { name: string; index?: number; small?: boolean }) {
  return <span title={name} aria-label={name} className={`avatar avatar-${index % 4} ${small ? 'avatar-small' : ''}`}>{initials(name)}</span>;
}
export function FileIcon({ type }: { type: ProjectDocument['type'] }) {
  return <span className={`file-icon file-${type.toLowerCase()}`}><FileText size={22} strokeWidth={1.5} /><span>{type}</span></span>;
}
export function SearchInput({ value, onChange, placeholder = 'Search…', label }: { value: string; onChange: (value: string) => void; placeholder?: string; label?: string }) {
  return <div className="search-input"><Search size={17} /><input aria-label={label || placeholder} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />{value && <button type="button" aria-label="Clear search" onClick={() => onChange('')}><X size={14} /></button>}</div>;
}
export function ProjectSelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { projects } = useWorkspace();
  const [query, setQuery] = useState('');
  const visible = !query.trim() ? projects : projects.filter(project => project.id === value || `${project.name} ${project.description}`.toLowerCase().includes(query.trim().toLowerCase()));
  const choose = (next: string) => { setQuery(''); onChange(next); };
  return <>{projects.length > 4 && <label className="project-search"><Search size={14} /><span className="sr-only">Search projects</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects" aria-label="Search projects" />{query && <button type="button" aria-label="Clear project search" onClick={() => setQuery('')}><X size={13} /></button>}</label>}<div className="select-wrap project-select"><Folder size={16} /><select aria-label="Select project" value={value} onChange={event => choose(event.target.value)}>{visible.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}{!projects.length && <option value="">No projects yet</option>}</select><ChevronDown size={15} /></div></>;
}
export function EmptyState({ icon: Icon = Folder, title, description, children }: { icon?: LucideIcon; title: string; description: string; children?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={27} strokeWidth={1.5} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Modal({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={headingId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}><div className="modal-header"><div><h2 id={headingId}>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={20} /></IconButton></div>{children}</dialog>;
}
export function ConfirmDialog({ title, description, onClose, onConfirm, confirmLabel = 'Delete' }: { title: string; description: string; onClose: () => void; onConfirm: () => void | Promise<void>; confirmLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) onClose(); };
  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  };
  return <Modal title={title} description={description} onClose={close}>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="modal-actions"><Button variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button variant="danger" disabled={busy} onClick={() => void confirm()}>{busy ? 'Please wait…' : confirmLabel}</Button></div>
  </Modal>;
}
export function Toasts() {
  const { toasts, dismissToast } = useWorkspace();
  return <div className="toast-stack" aria-live="polite">{toasts.map(toast => <div key={toast.id} className={`toast toast-${toast.tone}`}><span className="toast-icon">{toast.tone === 'success' ? <Check size={17} /> : <X size={17} />}</span><p>{toast.message}</p><IconButton label="Dismiss notification" onClick={() => dismissToast(toast.id)}><X size={16} /></IconButton></div>)}</div>;
}
export function Spinner() { return <LoaderCircle className="spin" size={17} />; }
