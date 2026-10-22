import { useState, type FormEvent } from 'react';
import { ArrowRight, BrainCircuit, Check, Eye, EyeOff, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { useAuth } from '../features/auth/AuthContext';
import { errorMessage } from '../lib/api';

export function LoginRegister() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { user, login, register, connectionError, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    setBusy(true); setError('');
    try {
      const email = String(values.get('email') || '');
      const password = String(values.get('password') || '');
      if (mode === 'register') await register(String(values.get('name') || ''), email, password);
      else await login(email, password);
      form.reset();
      navigate('/workspace', { replace: true });
    } catch (failure) { setError(errorMessage(failure)); setBusy(false); }
  };
  if (user) return <Navigate to="/workspace" replace />;
  return <div className="auth-page"><div className="auth-story"><div className="auth-mini-brand"><BrainCircuit size={22} /><span>A little more connected.</span></div><div className="auth-story-body"><span className="auth-eyebrow">BIG IDEAS NEED A LITTLE SPACE.</span><h1>Bring your work<br />into <em>focus.</em></h1><p>Your projects, your knowledge, and your next great idea. Finally, in one place.</p><div className="auth-illustration" aria-hidden="true"><div className="auth-orbit orbit-a" /><div className="auth-orbit orbit-b" /><div className="auth-center"><BrainCircuit size={41} strokeWidth={1.3} /></div><div className="floating-note note-one"><span className="note-check"><Check size={14} /></span><div><strong>A clear next step</strong><span>One task at a time</span></div></div><div className="floating-note note-two"><Sparkles size={18} /><span>Ideas, connected.</span></div><div className="auth-small-dot dot-a" /><div className="auth-small-dot dot-b" /></div><div className="auth-benefits"><span><Check size={15} />Projects with purpose</span><span><Check size={15} />Knowledge in reach</span><span><Check size={15} />A clearer way forward</span></div></div><div className="auth-story-footer"><span className="auth-footer-line" /><p>A calmer place to do meaningful work.</p></div></div><div className="auth-form-panel"><span className="auth-demo-label"><span />LOCAL WORKSPACE</span><div className="auth-form-content"><div className="auth-tabs" role="tablist" aria-label="Account form"><button role="tab" id="login-tab" aria-controls="account-form" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} disabled={busy} onClick={() => { setMode('login'); setError(''); }}>Log in</button><button role="tab" id="register-tab" aria-controls="account-form" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} disabled={busy} onClick={() => { setMode('register'); setError(''); }}>Create an account</button></div><div className="auth-form-heading"><h2>{mode === 'login' ? 'Good to see you again.' : 'Make space for your ideas.'}</h2><p>{mode === 'login' ? 'Your next great idea is right where you left it.' : 'A clearer workspace is just a few details away.'}</p></div><form key={mode} id="account-form" role="tabpanel" aria-labelledby={`${mode}-tab`} className="form-stack auth-form" onSubmit={submit}>{(error || connectionError) && <div className="form-error" role="alert">{error || connectionError}{connectionError && <button type="button" className="text-button" onClick={() => void refresh()}>Retry connection</button>}</div>}{mode === 'register' && <label>Full name<div className="input-with-icon"><UserRound size={17} /><input name="name" placeholder="Your full name" autoComplete="name" required minLength={2} maxLength={80} /></div></label>}<label>Email address<div className="input-with-icon"><Mail size={17} /><input name="email" type="email" placeholder="you@example.com" autoComplete="email" required /></div></label><label>Password<div className="input-with-icon"><LockKeyhole size={17} /><input name="password" type={showPassword ? 'text' : 'password'} placeholder={mode === 'login' ? 'Enter your password' : 'At least 8 characters'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} maxLength={128} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label><Button type="submit" disabled={busy} className="auth-submit">{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}<ArrowRight size={17} /></Button><p className="auth-privacy">Your account and projects are saved locally.<br />Passwords are securely hashed.</p></form><div className="auth-divider"><span />{mode === 'login' ? 'New to ProjectDocumentAI?' : 'Already have an account?'}<span /></div><Button variant="secondary" disabled={busy} className="auth-explore" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Create your account' : 'Log in instead'}</Button></div><div className="auth-local-note"><LockKeyhole size={13} />Localhost only. Your workspace, on your device.</div></div></div>;
}
