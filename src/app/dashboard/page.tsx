'use client'

import { useEffect, useState } from 'react'
import { formatTime, PLATFORM_ICONS, STATUS_COLORS } from '@/lib/utils'
import type { Campaign, Post } from '@/types'

interface AccountStatus {
  connected: boolean
  can_publish: boolean
  username?: string
  note?: string
  error?: string
  api_status?: string
}

interface AccountsData {
  statuses: Record<string, AccountStatus>
  summary: { total: number; connected: number; publishable: number; action_required: number }
}

export default function DashboardPage() {
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [accounts, setAccounts] = useState<AccountsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [message, setMessage] = useState('')

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })

  // Show success toast after OAuth connect redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('connect_error')
    if (connected) setMessage(`✅ ${connected.charAt(0).toUpperCase() + connected.slice(1)} connected successfully!`)
    if (error) setMessage(`❌ Failed to connect ${error}: ${params.get('reason') || 'unknown error'}`)
    if (connected || error) window.history.replaceState({}, '', '/dashboard')
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [campaignRes, accountsRes] = await Promise.all([
        fetch('/api/briefing/generate', { method: 'GET' }).then(r => r.json()).catch(() => null),
        fetch('/api/accounts/status').then(r => r.json()).catch(() => null),
      ])

      if (campaignRes?.campaign) setCampaign(campaignRes.campaign)
      if (accountsRes) setAccounts(accountsRes)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  async function generateCampaign() {
    setGenerating(true)
    setMessage('Generating today\'s campaign with AI agents...')
    try {
      const res = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      })
      const data = await res.json() as { success?: boolean; message?: string; error?: string }
      if (data.success || data.message) {
        setMessage('Campaign generated! Reloading...')
        await loadData()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function publishNow() {
    setPublishing(true)
    setMessage('Publishing scheduled posts...')
    try {
      const res = await fetch('/api/publish/now', { method: 'POST' })
      const data = await res.json() as { published?: number; failed?: number; processed?: number }
      setMessage(`Published: ${data.published} posts | Failed: ${data.failed}`)
      await loadData()
    } finally {
      setPublishing(false)
    }
  }

  async function approveCampaign() {
    if (!campaign) return
    setApproving(true)
    setMessage('Approving campaign and scheduling posts...')
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/approve`, { method: 'POST' })
      const data = await res.json() as { message?: string; error?: string }
      setMessage(data.message || data.error || 'Done')
      await loadData()
    } finally {
      setApproving(false)
    }
  }

  const pendingPosts = campaign?.posts?.filter(p => p.status === 'awaiting_approval') || []
  const scheduledPosts = campaign?.posts?.filter(p => p.status === 'scheduled') || []
  const publishedPosts = campaign?.posts?.filter(p => p.status === 'published') || []

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg brand-gradient flex items-center justify-center text-white font-bold text-sm">F</div>
            <div>
              <span className="font-semibold text-white">ForgCV</span>
              <span className="text-slate-400 text-sm ml-2">Growth Command Center</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://forgcv.com" target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-white transition-colors">
              forgcv.com ↗
            </a>
            <div className="text-xs text-slate-500">{today}</div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">

        {/* Status message */}
        {message && (
          <div className="bg-indigo-900/50 border border-indigo-700 rounded-lg p-4 text-sm text-indigo-200">
            {message}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pending Approval" value={pendingPosts.length} color="text-yellow-400" />
          <StatCard label="Scheduled Today" value={scheduledPosts.length} color="text-blue-400" />
          <StatCard label="Published Today" value={publishedPosts.length} color="text-green-400" />
          <StatCard label="Connected Accounts"
            value={`${accounts?.summary?.connected ?? '—'}/${accounts?.summary?.total ?? 5}`}
            color={accounts?.summary?.connected === accounts?.summary?.total ? 'text-green-400' : 'text-orange-400'} />
        </div>

        {/* Today's Campaign */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Today&apos;s Campaign</h2>
            <div className="flex gap-2">
              {scheduledPosts.length > 0 && (
                <button
                  onClick={publishNow}
                  disabled={publishing}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  {publishing ? '📤 Publishing...' : `📤 Publish Now (${scheduledPosts.length})`}
                </button>
              )}
              {!campaign && (
                <button
                  onClick={generateCampaign}
                  disabled={generating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                >
                  {generating ? '⚡ Generating...' : '⚡ Generate Campaign'}
                </button>
              )}
              {pendingPosts.length > 0 && (
                <button
                  onClick={approveCampaign}
                  disabled={approving}
                  className="px-6 py-2 brand-gradient hover:opacity-90 disabled:opacity-50 rounded-lg text-sm font-bold text-white transition-opacity shadow-lg shadow-indigo-900/50"
                >
                  {approving ? '⏳ Approving...' : `✅ Approve & Schedule ${pendingPosts.length} Posts`}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="card p-8 text-center text-slate-400">Loading...</div>
          ) : !campaign ? (
            <div className="card p-12 text-center">
              <div className="text-4xl mb-4">🌅</div>
              <h3 className="text-lg font-medium mb-2">No campaign yet</h3>
              <p className="text-slate-400 text-sm mb-6">Click &quot;Generate Campaign&quot; to have the AI agents create today&apos;s marketing plan.</p>
              <button onClick={generateCampaign} disabled={generating}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-medium transition-colors">
                {generating ? '⚡ Generating...' : '⚡ Generate Today\'s Campaign'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Campaign header */}
              <div className="card p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        campaign.status === 'ready_for_review' ? 'bg-yellow-900/50 text-yellow-400' :
                        campaign.status === 'approved' ? 'bg-blue-900/50 text-blue-400' :
                        campaign.status === 'published' ? 'bg-green-900/50 text-green-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {campaign.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white">{campaign.theme || 'Today\'s Campaign'}</h3>
                    <p className="text-slate-400 mt-1 text-sm">{campaign.objective}</p>
                  </div>
                </div>
                {campaign.strategy_summary && (
                  <p className="mt-4 text-slate-300 text-sm border-t border-slate-800 pt-4">
                    {campaign.strategy_summary}
                  </p>
                )}
              </div>

              {/* Posts grid */}
              <div className="grid gap-4">
                {campaign.posts?.map(post => (
                  <PostCard key={post.id} post={post} onUpdate={loadData} />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Social Accounts */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Social Accounts</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {accounts && Object.entries(accounts.statuses).map(([platform, status]) => (
              <AccountCard key={platform} platform={platform} status={status} />
            ))}
            {!accounts && [1,2,3,4,5].map(i => (
              <div key={i} className="card p-4 animate-pulse h-24" />
            ))}
          </div>
          {accounts && accounts.summary.action_required > 0 && (
            <div className="mt-3 p-4 bg-orange-900/20 border border-orange-800 rounded-lg text-sm text-orange-300">
              <strong>{accounts.summary.action_required} account(s) need setup.</strong> Check the setup guide below to connect your social accounts.
            </div>
          )}
        </section>

        {/* Setup Guide */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Setup Guide</h2>
          <SetupGuide accounts={accounts} />
        </section>

      </main>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}

function PostCard({ post, onUpdate }: { post: Post; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false)
  const [caption, setCaption] = useState(post.caption)
  const [saving, setSaving] = useState(false)

  async function saveEdit() {
    setSaving(true)
    await fetch(`/api/posts/${post.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption }),
    })
    setSaving(false)
    setEditing(false)
    onUpdate()
  }

  async function cancelPost() {
    if (!confirm('Cancel this post?')) return
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    onUpdate()
  }

  const scheduledTime = formatTime(post.scheduled_at)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-2xl">{PLATFORM_ICONS[post.platform] || '📱'}</span>
          <div>
            <div className="font-medium capitalize text-sm">{post.platform}</div>
            <div className="text-xs text-slate-500">{post.format} · {scheduledTime}</div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-white mb-1">{post.title}</div>

          {editing ? (
            <div className="mt-2">
              <textarea
                value={caption}
                onChange={e => setCaption(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 resize-none h-32"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={saveEdit} disabled={saving}
                  className="text-xs px-3 py-1 bg-indigo-600 rounded-md">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="text-xs px-3 py-1 bg-slate-700 rounded-md">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 line-clamp-2">{post.caption}</p>
          )}

          {post.hashtags?.length > 0 && !editing && (
            <div className="mt-1 text-xs text-indigo-400">
              {post.hashtags.slice(0, 5).map((h: string) => `#${h}`).join(' ')}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status] || 'bg-slate-700 text-slate-300'}`}>
            {post.status.replace(/_/g, ' ')}
          </span>

          {post.status === 'awaiting_approval' && (
            <div className="flex gap-1">
              <button onClick={() => setEditing(true)}
                className="text-xs px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded-md transition-colors">
                Edit
              </button>
              <button onClick={cancelPost}
                className="text-xs px-2 py-1 bg-red-900/50 hover:bg-red-900 text-red-300 rounded-md transition-colors">
                Cancel
              </button>
            </div>
          )}

          {post.failure_reason && (
            <div className="text-xs text-red-400 max-w-32 text-right">{post.failure_reason}</div>
          )}
        </div>
      </div>

      {post.expected_kpi && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500">
          <span className="text-slate-400">Target KPI:</span> {post.expected_kpi}
        </div>
      )}

      {post.destination_url && (
        <div className="mt-1 text-xs">
          <span className="text-slate-500">→ </span>
          <a href={post.destination_url} target="_blank" rel="noopener noreferrer"
            className="text-indigo-400 hover:underline">{post.destination_url}</a>
        </div>
      )}
    </div>
  )
}

function AccountCard({ platform, status }: { platform: string; status: AccountStatus }) {
  const connectUrl = `/api/auth/connect/${platform}`
  const isTikTok = platform === 'tiktok'

  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xl">{PLATFORM_ICONS[platform] || '📱'}</span>
        <span className="font-medium text-sm capitalize">{platform}</span>
      </div>
      <div className={`text-xs font-medium ${
        status.can_publish ? 'text-green-400' :
        status.connected ? 'text-yellow-400' : 'text-slate-500'
      }`}>
        {status.can_publish ? '✓ Ready to publish' :
         status.connected ? '⚠ Connected, limited' : '○ Not connected'}
      </div>
      {status.username && (
        <div className="text-xs text-slate-500">@{status.username}</div>
      )}
      {!status.can_publish && (
        <a
          href={connectUrl}
          className="mt-auto text-xs text-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors font-medium"
          title={isTikTok ? 'TikTok requires API audit approval (2–4 weeks)' : `Connect ${platform}`}
        >
          {isTikTok ? '⏳ Audit Pending' : '＋ Connect'}
        </a>
      )}
      {status.can_publish && (
        <a href={connectUrl} className="text-xs text-slate-600 hover:text-slate-400 text-center transition-colors">
          Reconnect
        </a>
      )}
    </div>
  )
}

function SetupGuide({ accounts }: { accounts: AccountsData | null }) {
  const steps = [
    {
      title: 'AI Engine',
      description: 'OpenRouter → Groq → Gemini cascade — Nexora keys configured.',
      done: true,
      href: null,
      cta: null,
    },
    {
      title: 'Supabase Database',
      description: 'PostgreSQL running in EU West (eu-west-1). All tables migrated.',
      done: true,
      href: 'https://supabase.com/dashboard/project/xetxxauohhipckeoghkn',
      cta: 'Open Dashboard',
    },
    {
      title: 'Telegram Notifications',
      description: 'Daily briefing at 07:00 Amsterdam via @ForgCVBot.',
      done: true,
      href: 'https://t.me/ForgCVBot',
      cta: 'Open Bot',
    },
    {
      title: 'Vercel Deployment + Cron',
      description: 'Live at forgcv-growth.vercel.app — cron runs at 06:00 UTC.',
      done: true,
      href: 'https://vercel.com/qlf296s-projects/forgcv-growth',
      cta: 'Open Vercel',
    },
    {
      title: 'Instagram',
      description: accounts?.statuses?.instagram?.can_publish
        ? `Connected as @${accounts.statuses.instagram.username}`
        : 'Create Meta Developer App → Instagram product → get Page access token.',
      done: accounts?.statuses?.instagram?.can_publish || false,
      href: accounts?.statuses?.instagram?.can_publish ? null : 'https://developers.facebook.com',
      cta: accounts?.statuses?.instagram?.can_publish ? null : 'Create Meta App',
      connectHref: '/api/auth/connect/instagram',
    },
    {
      title: 'LinkedIn',
      description: accounts?.statuses?.linkedin?.can_publish
        ? `Connected — ready to publish`
        : 'Create LinkedIn Developer App with w_member_social permission.',
      done: accounts?.statuses?.linkedin?.can_publish || false,
      href: accounts?.statuses?.linkedin?.can_publish ? null : 'https://www.linkedin.com/developers/apps/new',
      cta: accounts?.statuses?.linkedin?.can_publish ? null : 'Create LinkedIn App',
      connectHref: '/api/auth/connect/linkedin',
    },
    {
      title: 'Reddit',
      description: accounts?.statuses?.reddit?.can_publish
        ? `Connected as @${accounts.statuses.reddit.username}`
        : 'Create a "script" type app at reddit.com/prefs/apps, then click Connect.',
      done: accounts?.statuses?.reddit?.can_publish || false,
      href: accounts?.statuses?.reddit?.can_publish ? null : 'https://www.reddit.com/prefs/apps',
      cta: accounts?.statuses?.reddit?.can_publish ? null : 'Create Reddit App',
      connectHref: '/api/auth/connect/reddit',
    },
    {
      title: 'Twitter / X',
      description: accounts?.statuses?.twitter?.can_publish
        ? `Connected — ready to publish`
        : 'Create app at developer.twitter.com with read+write OAuth 2.0 permissions.',
      done: accounts?.statuses?.twitter?.can_publish || false,
      href: accounts?.statuses?.twitter?.can_publish ? null : 'https://developer.twitter.com/en/portal/projects-and-apps',
      cta: accounts?.statuses?.twitter?.can_publish ? null : 'Create X App',
      connectHref: '/api/auth/connect/twitter',
    },
    {
      title: 'TikTok',
      description: 'Create TikTok Developer app and apply for Content Posting API — approval takes 2–4 weeks.',
      done: accounts?.statuses?.tiktok?.can_publish || false,
      href: 'https://developers.tiktok.com',
      cta: 'Apply for API',
      connectHref: '/api/auth/connect/tiktok',
    },
  ]

  return (
    <div className="card divide-y divide-slate-800">
      {steps.map((step, i) => (
        <div key={i} className="p-4 flex items-start gap-4">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
            step.done ? 'bg-green-900/60 text-green-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {step.done ? '✓' : i + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm">{step.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{step.description}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            {step.href && (
              <a href={step.href} target="_blank" rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap">
                {step.cta} ↗
              </a>
            )}
            {(step as { connectHref?: string }).connectHref && !step.done && (
              <a href={(step as { connectHref?: string }).connectHref}
                className="text-xs px-3 py-1 bg-indigo-700 hover:bg-indigo-600 text-white rounded-md transition-colors whitespace-nowrap">
                Connect →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
