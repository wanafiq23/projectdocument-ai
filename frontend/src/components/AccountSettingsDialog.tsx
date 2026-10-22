import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ProfileSettings } from '../pages/ProfileSettings';
import { Modal } from './ui';

export function AccountSettingsDialog() {
  const [search, setSearch] = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (search.get('settings') === 'open') setOpen(true); }, [search]);
  function close() {
    setOpen(false);
    const next = new URLSearchParams(search);
    next.delete('settings');
    setSearch(next, { replace: true });
  }
  return open ? <Modal title="Profile / Settings" description="Manage your account and AI connections." onClose={close} wide><ProfileSettings /></Modal> : null;
}
