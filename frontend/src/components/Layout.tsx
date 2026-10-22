import { Outlet, useLocation } from 'react-router-dom';
import { useWorkspace } from '../features/workspace/WorkspaceContext';
import { Toasts } from './ui';

export function Layout() {
  const { projectsLoading, projectsError, reloadProjects } = useWorkspace();
  const { pathname } = useLocation();
  const isLogin = pathname === '/login';

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <main id="main-content" className="main-content" tabIndex={-1}>
      {!isLogin && projectsLoading
        ? <div className="workspace-loading" role="status">Loading your projects…</div>
        : !isLogin && projectsError
          ? <div className="panel empty-state">
              <h2>Your projects couldn’t load</h2>
              <p role="alert">{projectsError}</p>
              <button className="button button-primary" onClick={() => void reloadProjects()}>Try again</button>
            </div>
          : <Outlet />}
    </main>
    <Toasts />
  </div>;
}
