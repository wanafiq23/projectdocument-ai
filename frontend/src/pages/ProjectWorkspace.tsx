import { useEffect, useRef, useState, type DragEvent } from 'react';
import { BrainCircuit, FolderKanban, ListTodo, LogOut, Menu, MoreHorizontal, Pencil, Plus, Settings, Trash2, UploadCloud, X } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { WorkspaceDocumentSidebar } from '../components/WorkspaceDocumentSidebar';
import { ConfirmDialog, IconButton, ProjectSelect, Spinner } from '../components/ui';
import { ProjectForm } from '../components/ProjectForm';
import { Tasks } from './Tasks';
import { AIChat } from '../features/ai-chat/AIChat';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { useAuth } from '../features/auth/AuthContext';
import { errorMessage } from '../lib/api';
import { dateOffset, validDocumentFiles } from '../lib/utils';

function FirstDocumentUpload({ onCreateProject }: { onCreateProject: () => void }) {
  const { addProject, uploadDocument, notify } = useWorkspace();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');

  async function startWithFiles(files: File[]) {
    if (busy.current || !files.length) return;
    const validFiles = validDocumentFiles(files, message => notify(message, 'error'));
    if (!validFiles.length) return;

    busy.current = true;
    setUploading(true);
    let projectId = '';
    try {
      const firstName = validFiles[0].name.replace(/\.[^.]+$/, '').trim();
      projectId = await addProject({
        name: firstName.slice(0, 80) || 'My documents',
        description: 'Document and AI workspace.',
        category: 'General',
        status: 'Planning',
        dueDate: dateOffset(14),
      });
      for (const [index, file] of validFiles.entries()) {
        setUploadStatus(validFiles.length > 1 ? `Uploading ${index + 1} of ${validFiles.length}: ${file.name}` : `Uploading ${file.name}`);
        try { await uploadDocument(projectId, file); }
        catch (failure) { notify(`${file.name}: ${errorMessage(failure)}`, 'error'); }
      }
      navigate(`/projects/${projectId}`);
    } catch (failure) {
      notify(`Could not start your workspace: ${errorMessage(failure)}`, 'error');
    } finally {
      busy.current = false;
      setUploading(false);
      setUploadStatus('');
      if (input.current) input.current.value = '';
    }
  }

  function drop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    void startWithFiles(Array.from(event.dataTransfer.files));
  }

  return <main className="studio-empty-workspace first-upload-workspace">
    <input ref={input} className="sr-only" tabIndex={-1} type="file" multiple accept=".pdf,.docx,.txt" aria-label="Upload your first documents" onChange={event => void startWithFiles(Array.from(event.target.files || []))} />
    <span><UploadCloud size={30} /></span>
    <h1>Drop files to get started</h1>
    <p>Your first project will be created automatically and named after the first file.</p>
    <button type="button" className={`first-document-drop ${dragging ? 'is-dragging' : ''}`} disabled={uploading}
      onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)} onDrop={drop}>
      {uploading ? <Spinner /> : <UploadCloud size={21} />}
      <strong>{uploading ? 'Preparing your workspace...' : 'Drop files here or choose files'}</strong>
      <span aria-live="polite">{uploading ? uploadStatus : 'PDF, DOCX, or TXT · Up to 50 MB each'}</span>
    </button>
    <button type="button" className="first-project-alternative" disabled={uploading} onClick={onCreateProject}>Create a project instead</button>
  </main>;
}

export function ProjectWorkspace() {
  const { projectId } = useParams();
  const { projects, selectedProjectId, selectProject, deleteProject, projectsLoading } = useWorkspace();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const project = projects.find(item => item.id === projectId);
  const tasksOpen = search.get('tab') === 'tasks';
  const libraryRequested = search.get('library') === 'open';

  useEffect(() => { if (project) selectProject(project.id); }, [project, selectProject]);
  useEffect(() => { setMobileLibrary(false); }, [projectId]);
  useEffect(() => { if (libraryRequested) setMobileLibrary(true); }, [libraryRequested]);
  useEffect(() => {
    const openLibrary = () => setMobileLibrary(true);
    window.addEventListener('projectdocumentai:open-library', openLibrary);
    return () => window.removeEventListener('projectdocumentai:open-library', openLibrary);
  }, []);
  useEffect(() => {
    if (!projectsLoading && projectId && !project && projects.length) navigate(`/projects/${selectedProjectId || projects[0].id}`, { replace: true });
  }, [navigate, project, projectId, projects, projectsLoading, selectedProjectId]);

  if (!project) return <div className="document-assistant-page empty-project-workspace">
    <aside className="project-studio-sidebar" aria-label="Project controls">
      <div className="studio-brand"><span><BrainCircuit size={20} /></span><div><strong>Document Assistant</strong></div></div>
      <span className="studio-sidebar-heading empty-project-label">PROJECT</span>
      <div className="empty-project-side-note"><UploadCloud size={20} /><strong>Start with a document</strong><p>Drop a file in the workspace and its project will be created for you.</p></div>
    </aside>
    <section className="project-studio-main">
      <header className="project-studio-header"><div className="studio-title"><h1>Project workspace</h1><span>Your documents and AI assistant in one place</span></div>
        <div className="studio-account"><span>{user?.name}</span><button type="button" className="studio-action" aria-label="Profile and settings" title="Profile and settings" onClick={openSettings}><Settings size={17} /><span>Settings</span></button><button type="button" className="studio-action" aria-label="Log out" title="Log out" onClick={() => void logout()}><LogOut size={17} /><span>Log out</span></button></div>
      </header>
      <FirstDocumentUpload onCreateProject={() => setCreating(true)} />
    </section>
    {creating && <ProjectForm onClose={() => setCreating(false)} />}
  </div>;

  function openTasks() {
    const next = new URLSearchParams(search);
    next.set('tab', 'tasks');
    next.delete('library');
    setSearch(next);
    setMobileLibrary(false);
  }

  function closeTasks() {
    const next = new URLSearchParams(search);
    next.delete('tab');
    setSearch(next, { replace: true });
  }

  function closeLibrary() {
    setMobileLibrary(false);
    if (search.has('library')) {
      const next = new URLSearchParams(search);
      next.delete('library');
      setSearch(next, { replace: true });
    }
  }

  function openSettings() {
    const next = new URLSearchParams(search);
    next.set('settings', 'open');
    setSearch(next);
  }

  return <div className="document-assistant-page">
    {mobileLibrary && <button className="studio-mobile-backdrop" aria-label="Close document library" onClick={closeLibrary} />}
    <aside className={`project-studio-sidebar ${mobileLibrary ? 'is-open' : ''}`} aria-label="Project document library">
      <div className="studio-brand"><span><BrainCircuit size={20} /></span><div><strong>Document Assistant</strong></div><IconButton label="Close document library" className="studio-close-library" onClick={closeLibrary}><X size={19} /></IconButton></div>
      <span className="studio-sidebar-heading studio-project-heading">PROJECT</span>
      <div className="studio-project-picker"><FolderKanban size={16} /><ProjectSelect value={project.id} onChange={id => navigate(`/projects/${id}`)} /></div>
      <div className="studio-project-actions"><button type="button" className="studio-project-command" aria-label="New project" onClick={() => setCreating(true)}><Plus size={15} /><span>New project</span></button><details className="studio-project-more"><summary className="studio-project-command" aria-label="More project actions"><MoreHorizontal size={16} /><span>More</span></summary><div><button type="button" onClick={event => { (event.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open'); setEditing(true); }}><Pencil size={15} /><span>Edit project</span></button><button type="button" className="studio-project-delete" onClick={event => { (event.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open'); setDeleting(true); }}><Trash2 size={15} /><span>Delete project</span></button></div></details></div>
      <button type="button" className="studio-tasks-command" aria-expanded={tasksOpen} onClick={openTasks}><ListTodo size={16} /><span>Tasks</span></button>
      <WorkspaceDocumentSidebar onNavigate={closeLibrary} />
    </aside>
    <section className="project-studio-main">
      <header className="project-studio-header">
        <IconButton label="Open document library" className="studio-open-library" onClick={() => setMobileLibrary(true)}><Menu size={20} /></IconButton>
        <div className="studio-title"><h1>{project.name}</h1><span>Ask your documents</span></div>
        <div className="studio-account"><span>{user?.name}</span><button type="button" className="studio-action" aria-label="Profile and settings" title="Profile and settings" onClick={openSettings}><Settings size={17} /><span>Settings</span></button><button type="button" className="studio-action" aria-label="Log out" title="Log out" onClick={() => void logout()}><LogOut size={17} /><span>Log out</span></button></div>
      </header>
      <main className="project-studio-content studio-view-assistant">
        {selectedProjectId !== project.id ? <p className="studio-opening" role="status">Opening project...</p> : <AIChat />}
      </main>
    </section>
    {tasksOpen && <><button className="workspace-drawer-backdrop" aria-label="Dismiss tasks" onClick={closeTasks} /><aside className="workspace-task-drawer" role="dialog" aria-modal="true" aria-labelledby="workspace-tasks-title"><header><div><strong id="workspace-tasks-title">Tasks</strong><span>{project.name}</span></div><IconButton label="Close tasks" onClick={closeTasks}><X size={19} /></IconButton></header><div className="workspace-task-content"><Tasks /></div></aside></>}
    {creating && <ProjectForm onClose={() => setCreating(false)} />}
    {editing && <ProjectForm project={project} onClose={() => setEditing(false)} />}
    {deleting && <ConfirmDialog title={`Delete ${project.name}?`} description="This permanently deletes the project, its tasks, documents, indexed content, and saved chat history." onClose={() => setDeleting(false)} onConfirm={async () => { const next = projects.find(item => item.id !== project.id); await deleteProject(project.id); navigate(next ? `/projects/${next.id}` : '/workspace', { replace: true }); }} />}
  </div>;
}
