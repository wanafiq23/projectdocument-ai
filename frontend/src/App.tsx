import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AccountSettingsDialog } from './components/AccountSettingsDialog';
import { ProjectWorkspace } from './pages/ProjectWorkspace';
import { LoginRegister } from './pages/LoginRegister';
import { WorkspaceProvider, useWorkspace } from './features/workspace/WorkspaceContext';
import { AuthProvider, useAuth } from './features/auth/AuthContext';

function RouteEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = pathname.startsWith('/projects/') || pathname === '/workspace' ? 'Project Workspace' : ({ '/settings': 'Profile / Settings', '/login': 'Login / Register' } as Record<string, string>)[pathname];
    document.title = `${page || 'Workspace'} · ProjectDocumentAI`;
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
function ProtectedRoutes() {
  const { user } = useAuth();
  return user ? <><Outlet /><AccountSettingsDialog /></> : <Navigate to="/login" replace />;
}

function WorkspaceEntry() {
  const { projects, selectedProjectId, projectsLoading } = useWorkspace();
  if (projectsLoading) return <div className="connection-screen" role="status">Opening your workspace...</div>;
  const projectId = selectedProjectId || projects[0]?.id;
  return projectId ? <Navigate to={`/projects/${projectId}`} replace /> : <ProjectWorkspace />;
}

function ProjectTabRedirect({ tab }: { tab: 'tasks' | 'documents' | 'chat' | 'settings' }) {
  const { projects, selectedProjectId } = useWorkspace();
  const projectId = selectedProjectId || projects[0]?.id;
  const base = projectId ? `/projects/${projectId}` : '/workspace';
  const target = tab === 'chat' ? base : `${base}?${tab === 'settings' ? 'settings=open' : tab === 'documents' ? 'library=open' : 'tab=tasks'}`;
  return <Navigate to={target} replace />;
}

function WorkspaceRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="connection-screen" role="status">Connecting to your local workspace…</div>;
  return <WorkspaceProvider key={user?.id || 'guest'}><RouteEffects /><Routes>
    <Route element={<Layout />}>
      <Route path="/login" element={<LoginRegister />} />
      <Route element={<ProtectedRoutes />}>
        <Route path="/workspace" element={<WorkspaceEntry />} />
        <Route path="/dashboard" element={<Navigate to="/workspace" replace />} />
        <Route path="/projects" element={<Navigate to="/workspace" replace />} />
        <Route path="/projects/:projectId" element={<ProjectWorkspace />} />
        <Route path="/settings" element={<ProjectTabRedirect tab="settings" />} />
        <Route path="/documents" element={<ProjectTabRedirect tab="documents" />} />
        <Route path="/tasks" element={<ProjectTabRedirect tab="tasks" />} />
        <Route path="/chat" element={<ProjectTabRedirect tab="chat" />} />
      </Route>
      <Route path="*" element={<Navigate to={user ? '/workspace' : '/login'} replace />} />
    </Route>
  </Routes></WorkspaceProvider>;
}

export default function App() {
  return <BrowserRouter><AuthProvider><WorkspaceRoutes /></AuthProvider></BrowserRouter>;
}
