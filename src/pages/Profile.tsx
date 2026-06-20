import { useEffect, useState } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SectionLabel } from '../components/ui/SectionLabel'
import { Avatar } from '../components/ui/Avatar'
import { useAuth } from '../hooks/useAuth'
import { profileApi } from '../lib/api'

type UrlStatus = 'empty' | 'invalid' | 'loading' | 'ok' | 'error'

export function Profile() {
  const { user, refresh } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [urlStatus, setUrlStatus] = useState<UrlStatus>('empty')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<null | 'saved' | string>(null)

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName ?? '')
      setAvatarUrl(user.avatarUrl ?? '')
    }
  }, [user])

  // Validate + preload the URL so we only preview images that actually load.
  useEffect(() => {
    const v = avatarUrl.trim()
    if (!v) {
      setUrlStatus('empty')
      return
    }
    if (!/^https?:\/\/.+/i.test(v)) {
      setUrlStatus('invalid')
      return
    }
    setUrlStatus('loading')
    let active = true
    const img = new Image()
    img.referrerPolicy = 'no-referrer' // match how the Avatar <img> loads Google pictures
    img.onload = () => active && setUrlStatus('ok')
    img.onerror = () => active && setUrlStatus('error')
    img.src = v
    return () => {
      active = false
    }
  }, [avatarUrl])

  const trimmedName = displayName.trim()
  const trimmedAvatar = avatarUrl.trim()
  const avatarOk = trimmedAvatar === '' || urlStatus === 'ok'
  const avatarChanged = trimmedAvatar !== (user?.avatarUrl ?? '')
  const dirty =
    trimmedName !== '' &&
    avatarOk &&
    (trimmedName !== (user?.displayName ?? '') || avatarChanged)

  // Preview the URL only once it's a loaded image; otherwise fall back to initials.
  const previewSrc = urlStatus === 'ok' ? trimmedAvatar : null
  const initial = (trimmedName || user?.email || '?').charAt(0).toUpperCase()

  function touch() {
    setStatus(null)
  }

  async function handleSave() {
    setSaving(true)
    setStatus(null)
    try {
      await profileApi.update({ displayName: trimmedName, avatarUrl: trimmedAvatar || null })
      await refresh()
      setStatus('saved')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="mb-8 mt-10">
        <div className="mb-2.5 font-mono text-xs uppercase tracking-[0.18em] text-accent">
          ● Account
        </div>
        <h1 className="font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[44px] lg:text-[54px] lg:leading-none">
          Profile
        </h1>
      </div>

      <Card className="max-w-2xl">
        {/* live preview header */}
        <div className="flex items-center gap-5 border-b border-dashed border-line pb-6">
          <div className="flex flex-col items-center gap-2">
            <Avatar initial={initial} src={previewSrc} size={76} />
            <span className="whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
              paste image URL ↓
            </span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-display text-[24px] font-bold leading-tight">
                {trimmedName || '—'}
              </div>
              {dirty && (
                <span className="rounded-full border border-accent px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                  ● preview · unsaved
                </span>
              )}
            </div>
            <div className="font-mono text-[13px] text-ink-soft">{user?.email}</div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {/* avatar */}
          <div>
            <SectionLabel>Avatar</SectionLabel>
            <input
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value)
                touch()
              }}
              placeholder="Image URL (leave empty to use your initials)"
              className="mt-2.5 w-full rounded-xl border border-line bg-paper px-4 py-3 font-mono text-[13px] outline-none transition focus:border-accent"
            />
            {/* cue only while the user is editing the avatar */}
            {avatarChanged && (
              <div className="mt-1.5 font-mono text-[11px]">
                {urlStatus === 'empty' && (
                  <span className="text-ink-soft">
                    Avatar cleared — initials will be used (not saved yet).
                  </span>
                )}
                {urlStatus === 'invalid' && (
                  <span className="text-accent">
                    ✗ Not a valid URL (must start with http:// or https://).
                  </span>
                )}
                {urlStatus === 'loading' && <span className="text-ink-soft">Checking image…</span>}
                {urlStatus === 'ok' && (
                  <span className="text-accent-2">✓ Valid image — preview above (not saved yet).</span>
                )}
                {urlStatus === 'error' && (
                  <span className="text-accent">✗ Couldn't load that image — check the URL.</span>
                )}
              </div>
            )}
          </div>

          {/* display name */}
          <div>
            <SectionLabel>Display name</SectionLabel>
            <input
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value)
                touch()
              }}
              maxLength={50}
              placeholder="Your display name"
              className="mt-2.5 w-full rounded-xl border border-line bg-paper px-4 py-3 text-[15px] outline-none transition focus:border-accent"
            />
            <p className="mt-1.5 font-mono text-[11px] text-ink-soft">
              Shown to opponents in duels and on the leaderboard.{' '}
              <span>({trimmedName.length}/50 characters max)</span>
            </p>
          </div>

          {/* email (read-only) */}
          <div>
            <SectionLabel>Email</SectionLabel>
            <div className="mt-2.5 rounded-xl border border-line bg-black/[0.03] px-4 py-3 font-mono text-[13px] text-ink-soft dark:bg-white/[0.03]">
              {user?.email}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button onClick={handleSave} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            {status === 'saved' && <span className="font-mono text-sm text-accent-2">✓ saved</span>}
            {status && status !== 'saved' && (
              <span className="font-mono text-sm text-accent">{status}</span>
            )}
          </div>
        </div>
      </Card>
    </>
  )
}
