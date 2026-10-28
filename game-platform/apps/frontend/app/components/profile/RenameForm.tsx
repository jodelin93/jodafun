'use client';

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { renameMe } from '../../lib/users';

export default function RenameForm({ currentName }: { currentName: string }) {
  const { refreshSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await renameMe(value);
      await refreshSession();
      setOpen(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your name. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      {open ? (
        <form onSubmit={submit} className="max-w-md">
          <label htmlFor="rename" className="field-label">
            Your name
          </label>
          <input
            id="rename"
            className="field"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            autoFocus
          />
          <p className="mt-1.5 text-sm text-chalk">
            2 to 20 characters: letters, digits, spaces, hyphens, underscores and dots. Names can&apos;t start with Guest.
          </p>
          {error && (
            <p className="mt-2 text-sm font-semibold text-signal" role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button type="submit" className="btn-gold btn-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-quiet btn-sm"
              onClick={() => {
                setOpen(false);
                setError(null);
                setValue(currentName);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="btn-quiet btn-sm"
          onClick={() => {
            setValue(currentName);
            setSaved(false);
            setOpen(true);
          }}
        >
          Change name
        </button>
      )}
      <p className="mt-2 text-sm text-chalk" aria-live="polite">
        {saved ? 'Name saved' : ''}
      </p>
    </div>
  );
}
