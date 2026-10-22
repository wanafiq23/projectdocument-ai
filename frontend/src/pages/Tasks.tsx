import { useState } from 'react';
import { CalendarDays, CheckCheck, Circle, GripVertical, LayoutGrid, List, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { TaskForm } from '../components/TaskForm';
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, IconButton, SearchInput } from '../components/ui';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { useAuth } from '../features/auth/AuthContext';
import { errorMessage } from '../lib/api';
import { dateOffset, formatDate, slug } from '../lib/utils';
import type { Priority, Task, TaskStatus } from '../types';

const statuses: TaskStatus[] = ['To Do', 'In Progress', 'Done'];

export function Tasks() {
  const { user } = useAuth();
  const { tasks, selectedProjectId, selectedProject, saveTask, deleteTask, notify } = useWorkspace();
  const [view, setView] = useState<'board' | 'list'>('list');
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<'all' | Priority>('all');
  const [mine, setMine] = useState(false);
  const [form, setForm] = useState<Task | 'new' | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus>('To Do');
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const projectTasks = tasks.filter(task => task.projectId === selectedProjectId);
  const visible = projectTasks.filter(task =>
    task.title.toLowerCase().includes(query.toLowerCase())
    && (priority === 'all' || task.priority === priority)
    && (!mine || task.assignee === user?.name)
  );

  const addTask = (status: TaskStatus = 'To Do') => { setInitialStatus(status); setForm('new'); };
  const move = (task: Task, status: TaskStatus) => {
    if (task.status !== status) void saveTask({ ...task, status }).catch(error => notify(errorMessage(error), 'error'));
  };
  const statusSelect = (task: Task) => <select className={`task-status-select status-${slug(task.status)}`} aria-label={`Status of ${task.title}`} value={task.status} onChange={event => move(task, event.target.value as TaskStatus)}>
    {statuses.map(status => <option key={status}>{status}</option>)}
  </select>;

  return <>
    <div className="task-summary-strip">
      <span><CheckCheck size={18} /><strong>{projectTasks.filter(task => task.status === 'Done').length}</strong> of {projectTasks.length} tasks completed</span>
      <div className="mini-progress"><span style={{ width: `${projectTasks.length ? projectTasks.filter(task => task.status === 'Done').length / projectTasks.length * 100 : 0}%` }} /></div>
      <p>{selectedProject?.name || 'Your next project'}</p>
    </div>

    <div className="tasks-toolbar tasks-toolbar-drawer">
      <Button className="drawer-new-task" disabled={!selectedProjectId} onClick={() => addTask()}><Plus size={16} />New task</Button>
      <div className="view-switch" aria-label="Task view">
        <button aria-pressed={view === 'board'} className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}><LayoutGrid size={16} />Board</button>
        <button aria-pressed={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}><List size={17} />List</button>
      </div>
      <div className="task-filters">
        <button className={`my-tasks-filter ${mine ? 'active' : ''}`} aria-pressed={mine} onClick={() => setMine(!mine)}>My tasks</button>
        <select aria-label="Filter by priority" className="filter-select" value={priority} onChange={event => setPriority(event.target.value as 'all' | Priority)}>
          <option value="all">All priorities</option>
          {(['High', 'Medium', 'Low'] as Priority[]).map(value => <option key={value}>{value}</option>)}
        </select>
        <SearchInput value={query} onChange={setQuery} placeholder="Search tasks…" />
      </div>
    </div>

    {view === 'board' ? <div className="kanban-board">{statuses.map(status =>
      <section className={`kanban-column column-${slug(status)} ${dropTarget === status ? 'drag-over' : ''}`} key={status}
        onDragOver={event => { if (dragged) { event.preventDefault(); setDropTarget(status); } }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null); }}
        onDrop={event => {
          event.preventDefault();
          const task = projectTasks.find(item => item.id === dragged);
          if (task) move(task, status);
          setDragged(null); setDropTarget(null);
        }}>
        <div className="kanban-column-header"><h2><span className={`status-dot dot-${slug(status)}`} />{status}<span className="count-pill">{visible.filter(task => task.status === status).length}</span></h2><IconButton label={`Add task to ${status}`} onClick={() => addTask(status)}><Plus size={17} /></IconButton></div>
        <div className="kanban-cards">
          {visible.filter(task => task.status === status).map(task => <article className={`task-card ${task.status === 'Done' ? 'task-card-done' : ''} ${dragged === task.id ? 'dragging' : ''}`} key={task.id} draggable
            onDragStart={event => { event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move'; setDragged(task.id); }}
            onDragEnd={() => { setDragged(null); setDropTarget(null); }}>
            <div className="task-card-top"><Badge tone={task.priority.toLowerCase()}>{task.priority} priority</Badge><div className="task-card-tools"><GripVertical size={15} className="drag-handle" /><IconButton label={`Delete ${task.title}`} onClick={() => setDeleting(task)}><Trash2 size={14} /></IconButton></div></div>
            <button className="task-card-title" onClick={() => setForm(task)}>{task.title}</button>
            <p>{task.description || 'A new step toward your project goals.'}</p>
            <div className="task-card-date"><CalendarDays size={14} /><span className={task.dueDate <= dateOffset(0) && task.status !== 'Done' ? 'due-soon' : ''}>{task.dueDate === dateOffset(0) ? 'Due today' : `Due ${formatDate(task.dueDate)}`}</span></div>
            <div className="task-card-footer">{statusSelect(task)}<Avatar name={task.assignee} index={task.assignee.length % 4} small /></div>
          </article>)}
          {!visible.some(task => task.status === status) && <div className="column-empty"><Circle size={23} strokeWidth={1.3} /><p>{status === 'Done' ? 'Good things take a few steps.' : 'A little breathing room.'}</p><span>{query || priority !== 'all' || mine ? 'No tasks match your filters.' : 'Add a task or move one here.'}</span></div>}
        </div>
        <button className="add-column-task" onClick={() => addTask(status)}><Plus size={15} />Add task</button>
      </section>)}</div>
      : <div className="panel"><div className="table-scroll">{visible.length
        ? <table className="data-table tasks-table"><thead><tr><th>Task name</th><th>Status</th><th>Priority</th><th>Due date</th><th>Assignee</th><th className="align-right">Actions</th></tr></thead><tbody>{visible.map(task => <tr key={task.id}>
          <td data-label="Task"><button className={`task-title-button ${task.status === 'Done' ? 'completed-text' : ''}`} onClick={() => setForm(task)}>{task.title}</button></td>
          <td data-label="Status">{statusSelect(task)}</td>
          <td data-label="Priority"><Badge>{task.priority}</Badge></td>
          <td data-label="Due date">{formatDate(task.dueDate)}</td>
          <td data-label="Assignee"><Avatar name={task.assignee} small /></td>
          <td data-label="Actions"><div className="table-actions"><IconButton label={`Edit ${task.title}`} onClick={() => setForm(task)}><Pencil size={16} /></IconButton><IconButton label={`Delete ${task.title}`} onClick={() => setDeleting(task)}><Trash2 size={16} /></IconButton></div></td>
        </tr>)}</tbody></table>
        : <EmptyState icon={SearchX} title="No tasks here just yet" description="Adjust your filters or add a new task." />}</div></div>}

    <p className="board-hint">{view === 'board' ? 'Move tasks between columns by dragging, or use the status selector on each card.' : 'Select a task title to edit the details, or update its status directly.'}</p>
    {form && <TaskForm task={form === 'new' ? undefined : form} defaultStatus={initialStatus} onClose={() => setForm(null)} />}
    {deleting && <ConfirmDialog title="Delete this task?" description={`“${deleting.title}” will be removed from your project.`} onClose={() => setDeleting(null)} onConfirm={() => deleteTask(deleting.id)} />}
  </>;
}
