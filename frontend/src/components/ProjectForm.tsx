import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { dateOffset } from '../lib/utils';
import type { Project, ProjectStatus } from '../types';
import { Button, Modal } from './ui';
import { errorMessage } from '../lib/api';

export function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { addProject, updateProject } = useWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [category, setCategory] = useState(project?.category || 'Design & Development');
  const [status, setStatus] = useState<ProjectStatus>(project?.status || 'Planning');
  const [dueDate, setDueDate] = useState(project?.dueDate || dateOffset(14));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const close = () => { if (!busy) onClose(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setError('');
    const input = { name: name.trim(), description: description.trim(), category, status, dueDate };
    try {
      if (project) await updateProject({ ...project, ...input });
      else { const id = await addProject(input); navigate(`/projects/${id}`); }
      onClose();
    } catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  };
  return <Modal title={project ? 'Edit project' : 'Start something great'} description={project ? 'Keep your project details up to date.' : 'Give your next idea a place to grow.'} onClose={close}><form onSubmit={submit} className="form-stack">{error && <p className="form-error" role="alert">{error}</p>}<label>Project name<input autoFocus required maxLength={80} placeholder="e.g. Website Redesign" value={name} onChange={event => setName(event.target.value)} /></label><label>Description<textarea rows={3} maxLength={500} placeholder="What are you working toward?" value={description} onChange={event => setDescription(event.target.value)} /></label><div className="form-row"><label>Category<select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}>{['Design & Development', 'Brand & Marketing', 'Product Development', 'Research & Insights', 'General'].map(value => <option key={value}>{value}</option>)}</select></label><label>Due date<input type="date" required value={dueDate} onChange={event => setDueDate(event.target.value)} /></label></div><label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as ProjectStatus)}>{['Planning', 'In Progress', 'Completed'].map(value => <option key={value}>{value}</option>)}</select></label><p className="form-note">Saved to your local PostgreSQL database.</p><div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={close}>Cancel</Button><Button type="submit" disabled={!name.trim() || busy}>{project ? <Check size={16} /> : <Plus size={16} />}{busy ? 'Saving…' : project ? 'Save changes' : 'Create project'}</Button></div></form></Modal>;
}
