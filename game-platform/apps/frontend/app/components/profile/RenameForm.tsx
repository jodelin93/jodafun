'use client';

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { renameMe, ServerMessageError } from '../../lib/users';
import { useT } from '../../i18n/I18nProvider';
import { profileMessages, renameErrorKey } from '../../i18n/messages/profile';

export default function RenameForm({ currentName }: { currentName: string }) {
  const t = useT(profileMessages);
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
      if (err instanceof ServerMessageError) {
        const key = renameErrorKey(err.message);
        setError(key ? t(key) : err.message);
      } else {
        setError(t('saveNameFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3">
      {open ? (
        <form onSubmit={submit} className="max-w-md">
          <label htmlFor="rename" className="field-label">
            {t('yourName')}
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
            {t('nameRules')}
          </p>
          {error && (
            <p className="mt-2 text-sm font-semibold text-signal" role="alert">
              {error}
            </p>
          )}
          <div className="mt-3 flex gap-3">
            <button type="submit" className="btn-gold btn-sm" disabled={saving}>
              {saving ? t('saving') : t('save')}
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
              {t('cancel')}
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
          {t('changeName')}
        </button>
      )}
      <p className="mt-2 text-sm text-chalk" aria-live="polite">
        {saved ? t('nameSaved') : ''}
      </p>
    </div>
  );
}
