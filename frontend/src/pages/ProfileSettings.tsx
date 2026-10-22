import { useEffect, useState, type FormEvent } from 'react';
import { Avatar, Button } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth, type User } from '../features/auth/AuthContext';
import { useWorkspace } from '../features/workspace/WorkspaceContext';

interface ConnectionStatus { configured: boolean; geminiConfigured: boolean; mongodbConfigured: boolean; model: string; embeddingModel: string; note: string }

export function ProfileSettings() {
  const { user, updateUser } = useAuth();
  const { notify, reloadProjects } = useWorkspace();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [busy, setBusy] = useState('');
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  useEffect(() => { let live = true; api<ConnectionStatus>('/ai/status').then(s => { if (live) setStatus(s); })
    .catch(e => { if (live) setStatusError(errorMessage(e)); }); return () => { live = false; }; }, []);
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy('profile');
    try { updateUser(await api<User>('/auth/me', { method: 'PUT', body: JSON.stringify({ name }) }));
      await reloadProjects(); notify('Profile updated.'); }
    catch (e) { notify(errorMessage(e), 'error'); } finally { setBusy(''); }
  }
  async function savePassword(event: FormEvent) {
    event.preventDefault(); setBusy('password');
    try { await api('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrent(''); setNew(''); notify('Password updated. Other sessions have been signed out.'); }
    catch (e) { notify(errorMessage(e), 'error'); } finally { setBusy(''); }
  }
  return <div className="settings-grid">
      <section className="panel settings-panel"><h2>Profile</h2><div className="profile-summary"><Avatar name={user?.name || ''} /><span>{user?.email}</span></div>
        <form className="settings-form" onSubmit={saveProfile}><label>Full name<input value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={80} required autoComplete="name" /></label>
          <label>Email address<input value={user?.email || ''} readOnly type="email" /></label>
          <Button disabled={!!busy || !name.trim()} type="submit">{busy === 'profile' ? 'Saving...' : 'Save profile'}</Button></form>
      </section>
      <section className="panel settings-panel"><h2>Change password</h2><p>Changing your password signs out your other sessions.</p>
        <form className="settings-form" onSubmit={savePassword}>
          <label>Current password<input type="password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required autoComplete="current-password" minLength={8} maxLength={128} /></label>
          <label>New password<input type="password" value={newPassword} onChange={e => setNew(e.target.value)} required autoComplete="new-password" minLength={8} maxLength={128} /></label>
          <Button disabled={!!busy} type="submit">{busy === 'password' ? 'Updating...' : 'Update password'}</Button></form>
      </section>
      <section className="panel settings-panel"><h2>AI connections</h2>
        {statusError && <p role="alert">{statusError}</p>}
        {status && <><dl className="connection-list"><dt>Gemini</dt><dd>{status.geminiConfigured ? 'Configured' : 'Setup required'}</dd>
          <dt>MongoDB Atlas</dt><dd>{status.mongodbConfigured ? 'Configured' : 'Setup required'}</dd>
          <dt>Chat model</dt><dd>{status.model}</dd><dt>Embedding model</dt><dd>{status.embeddingModel}</dd></dl>
          <p>{status.note}</p></>}
        <p>Set your credentials in the backend environment file. See the project README for setup instructions. Credentials are never stored in the browser.</p>
        <p>AI requests send your questions and relevant project content to Gemini. Atlas stores document chunks, embeddings, and chat history.</p>
      </section>
    </div>;
}
