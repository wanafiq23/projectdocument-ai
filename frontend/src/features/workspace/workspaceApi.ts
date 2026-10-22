import { api } from '../../lib/api';
import type { Project, ProjectDocument, Task, WorkspaceData } from '../../types';

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'members'>;

export async function loadWorkspace(): Promise<WorkspaceData> {
  const [projects, tasks, documents] = await Promise.all([
    api<Project[]>('/projects'),
    api<Task[]>('/tasks'),
    api<ProjectDocument[]>('/documents'),
  ]);
  return { projects, tasks, documents };
}

export function createProject(input: ProjectInput) {
  return api<Project>('/projects', { method: 'POST', body: JSON.stringify(input) });
}

export function saveProject(project: Project) {
  const { id, createdAt: _createdAt, members: _members, ...input } = project;
  return api<Project>(`/projects/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

export function removeProject(id: string) {
  return api<void>(`/projects/${id}`, { method: 'DELETE' });
}

export function uploadProjectDocument(projectId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return api<ProjectDocument>(`/documents/projects/${projectId}`, { method: 'POST', body: form });
}

export function removeDocument(id: string) {
  return api<void>(`/documents/${id}`, { method: 'DELETE' });
}

export function persistTask(task: Task | Omit<Task, 'id'>, existing: boolean) {
  const { id, ...input } = task as Task;
  return api<Task>(existing ? `/tasks/${id}` : '/tasks', {
    method: existing ? 'PUT' : 'POST',
    body: JSON.stringify(input),
  });
}

export function removeTask(id: string) {
  return api<void>(`/tasks/${id}`, { method: 'DELETE' });
}
