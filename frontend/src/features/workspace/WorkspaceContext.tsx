import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { errorMessage } from '../../lib/api';
import { uid } from '../../lib/utils';
import type { Project, ProjectDocument, Task, WorkspaceData } from '../../types';
import { useAuth } from '../auth/AuthContext';
import {
  createProject,
  loadWorkspace,
  persistTask,
  removeDocument,
  removeProject,
  removeTask,
  saveProject,
  uploadProjectDocument,
  type ProjectInput,
} from './workspaceApi';

type Toast = { id: string; message: string; tone: 'success' | 'error' };

interface WorkspaceContextValue extends WorkspaceData {
  selectedProjectId: string;
  selectProject: (id: string) => void;
  selectedProject: Project | undefined;
  projectsLoading: boolean;
  projectsError: string;
  reloadProjects: () => Promise<void>;
  addProject: (project: ProjectInput) => Promise<string>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uploadDocument: (projectId: string, file: File) => Promise<ProjectDocument>;
  deleteDocument: (id: string) => Promise<void>;
  saveTask: (task: Task | Omit<Task, 'id'>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  notify: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: string) => void;
}

const Context = createContext<WorkspaceContextValue | null>(null);
const emptyData = (): WorkspaceData => ({ projects: [], documents: [], tasks: [] });

// Keyed by user in App: switching accounts discards previous in-memory data.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const preferenceKey = `projectdocumentai-preview-${user?.id || 'guest'}-selected`;
  const [data, setData] = useState<WorkspaceData>(emptyData);
  const [selectedProjectId, selectProject] = useState(() => {
    try { return localStorage.getItem(preferenceKey) || ''; } catch { return ''; }
  });
  const [projectsLoading, setProjectsLoading] = useState(!!user);
  const [projectsError, setProjectsError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const storageWarning = useRef(false);
  const mounted = useRef(true);

  const dismissToast = useCallback((id: string) => {
    setToasts(current => current.filter(toast => toast.id !== id));
  }, []);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = uid();
    setToasts(current => [...current.slice(-2), { id, message, tone }]);
    timers.current.push(setTimeout(() => dismissToast(id), 5000));
  }, [dismissToast]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const reloadProjects = useCallback(async () => {
    if (!user) return;
    setProjectsLoading(true);
    setProjectsError('');
    try {
      const workspace = await loadWorkspace();
      if (mounted.current) setData(workspace);
    } catch (error) {
      if (mounted.current) setProjectsError(errorMessage(error));
    } finally {
      if (mounted.current) setProjectsLoading(false);
    }
  }, [user]);

  useEffect(() => { void reloadProjects(); }, [reloadProjects]);

  useEffect(() => {
    if (!user || projectsLoading || projectsError) return;
    try {
      localStorage.setItem(preferenceKey, selectedProjectId);
    } catch {
      if (!storageWarning.current) {
        notify('Browser preferences cannot be saved. Your projects, tasks, and documents remain saved on the server.', 'error');
        storageWarning.current = true;
      }
    }
  }, [selectedProjectId, preferenceKey, user, projectsLoading, projectsError, notify]);

  useEffect(() => {
    if (!projectsLoading && !projectsError && !data.projects.some(project => project.id === selectedProjectId)) {
      selectProject(data.projects[0]?.id || '');
    }
  }, [data.projects, selectedProjectId, projectsLoading, projectsError]);

  const value = useMemo<WorkspaceContextValue>(() => ({
    ...data,
    selectedProjectId,
    selectProject,
    projectsLoading,
    projectsError,
    reloadProjects,
    selectedProject: data.projects.find(project => project.id === selectedProjectId),
    notify,
    toasts,
    dismissToast,
    addProject: async input => {
      const project = await createProject(input);
      if (!mounted.current) return project.id;
      setData(current => ({ ...current, projects: [project, ...current.projects] }));
      selectProject(project.id);
      notify('Your project was saved.');
      return project.id;
    },
    updateProject: async project => {
      const saved = await saveProject(project);
      if (!mounted.current) return;
      setData(current => ({
        ...current,
        projects: current.projects.map(item => item.id === saved.id ? saved : item),
      }));
      notify('Project details updated.');
    },
    deleteProject: async id => {
      await removeProject(id);
      if (!mounted.current) return;
      setData(current => ({
        projects: current.projects.filter(item => item.id !== id),
        documents: current.documents.filter(item => item.projectId !== id),
        tasks: current.tasks.filter(item => item.projectId !== id),
      }));
      notify('Project deleted.');
    },
    uploadDocument: async (projectId, file) => {
      const document = await uploadProjectDocument(projectId, file);
      if (mounted.current) {
        setData(current => ({ ...current, documents: [document, ...current.documents] }));
        notify(`${document.name} was uploaded.`);
      }
      return document;
    },
    deleteDocument: async id => {
      await removeDocument(id);
      if (mounted.current) {
        setData(current => ({
          ...current,
          documents: current.documents.filter(document => document.id !== id),
        }));
        notify('Document deleted.');
      }
    },
    saveTask: async task => {
      const id = 'id' in task ? task.id : undefined;
      const existing = !!id && data.tasks.some(item => item.id === id);
      const saved = await persistTask(task, existing);
      if (mounted.current) {
        setData(current => ({
          ...current,
          tasks: existing
            ? current.tasks.map(item => item.id === saved.id ? saved : item)
            : [saved, ...current.tasks],
        }));
        notify('Task saved.');
      }
    },
    deleteTask: async id => {
      await removeTask(id);
      if (mounted.current) {
        setData(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== id) }));
        notify('Task deleted.');
      }
    },
  }), [data, selectedProjectId, notify, toasts, dismissToast, projectsLoading, projectsError, reloadProjects]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useWorkspace() {
  const context = useContext(Context);
  if (!context) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return context;
}
