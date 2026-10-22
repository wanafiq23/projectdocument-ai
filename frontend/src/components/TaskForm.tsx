import { useState, type FormEvent } from 'react';
import { Check, Plus } from 'lucide-react';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { useAuth } from '../features/auth/AuthContext';
import { dateOffset } from '../lib/utils';
import { errorMessage } from '../lib/api';
import type { Priority, Task, TaskStatus } from '../types';
import { Button, Modal } from './ui';

export function TaskForm({ task, onClose, defaultStatus = 'To Do' }: { task?: Task; onClose: () => void; defaultStatus?: TaskStatus }) {
  const { user } = useAuth();
  const { projects, selectedProjectId, saveTask } = useWorkspace();
  const [projectId, setProjectId] = useState(task?.projectId || selectedProjectId || projects[0]?.id || '');
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'Medium');
  const [status, setStatus] = useState<TaskStatus>(task?.status || defaultStatus);
  const [dueDate, setDueDate] = useState(task?.dueDate || dateOffset(3));
  const [assignee, setAssignee] = useState(task?.assignee || user?.name || 'You');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !projectId || busy) return;
    setBusy(true);
    setError('');
    try {
      await saveTask({ ...(task ? { id: task.id } : {}), projectId, title: title.trim(), description: description.trim(), priority, status, dueDate, assignee });
      onClose();
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return <Modal title={task ? 'Edit task' : 'One step closer'} description={task ? 'Update the details and keep things moving.' : 'Turn a good plan into a clear next step.'} onClose={onClose}>
    <form className="form-stack" onSubmit={event => void submit(event)}>
      {error && <p role="alert" className="form-error">{error}</p>}
      <label>Task title<input autoFocus required maxLength={120} placeholder="What needs to get done?" value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Description<textarea rows={3} maxLength={1000} placeholder="Add a little context…" value={description} onChange={event => setDescription(event.target.value)} /></label>
      <label>Project<select aria-label="Project" value={projectId} onChange={event => setProjectId(event.target.value)} required>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <div className="form-row">
        <label>Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value as TaskStatus)}>{['To Do', 'In Progress', 'Done'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Priority<select aria-label="Priority" value={priority} onChange={event => setPriority(event.target.value as Priority)}>{['Low', 'Medium', 'High'].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="form-row">
        <label>Due date<input type="date" value={dueDate} required onChange={event => setDueDate(event.target.value)} /></label>
        <label>Assignee<select aria-label="Assignee" value={assignee} onChange={event => setAssignee(event.target.value)}>{[...new Set([user?.name || 'You', task?.assignee || user?.name || 'You'])].map(value => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="modal-actions">
        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={busy || !title.trim() || !projectId}>{task ? <Check size={16} /> : <Plus size={16} />}{busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}</Button>
      </div>
    </form>
  </Modal>;
}
