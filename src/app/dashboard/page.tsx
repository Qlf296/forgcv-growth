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
  const [message, setMessage] = useState('')

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })

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
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{PLATFORM_ICONS[platform] || '📱'}</span>
        <span className="font-medium text-sm capitalize">{platform}</span>
      </div>
      <div className={`text-xs font-medium ${
        status.can_publish ? 'text-green-400' :
        status.connected ? 'text-yellow-400' : 'text-red-400'
      }`}>
        {status.can_publish ? '✓ Ready' :
         status.connected ? '⚠ Limited' : '✗ Not connected'}
      </div>
      {status.username && (
        <div className="text-xs text-slate-500 mt-0.5">@{status.username}</div>
      )}
    </div>
  )
}

function SetupGuide({ accounts }: { accounts: AccountsData | null }) {
  const steps = [
    {
      title: 'Configure Environment',
      description: 'Copy .env.example to .env.local and fill in your API keys.',
      done: false,
      action: 'See .env.example in the project root',
    },
    {
      title: 'Set up Telegram Notifications',
      description: 'Create a Telegram bot at t.me/BotFather. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to .env.local.',
      done: false,
      action: 'Visit t.me/BotFather',
    },
    {
      title: 'Connect Instagram',
      description: 'You need a Professional Instagram account + Meta Developer App. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID.',
      done: accounts?.statuses?.instagram?.can_publish || false,
      action: 'developers.facebook.com',
    },
    {
      title: 'Connect LinkedIn',
      description: 'Create a LinkedIn app with w_member_social permission. Set LINKEDIN_ACCESS_TOKEN.',
      done: accounts?.statuses?.linkedin?.can_publish || false,
      action: 'linkedin.com/developers',
    },
    {
      title: 'Connect Reddit',
      description: 'Create a script-type app at reddit.com/prefs/apps. Set REDDIT_CLIENT_ID, SECRET, USERNAME, PASSWORD.',
      done: accounts?.statuses?.reddit?.can_publish || false,
      action: 'reddit.com/prefs/apps',
    },
    {
      title: 'Set up Supabase',
      description: 'Create a free project at supabase.com. Run the SQL migration. Set SUPABASE_URL and keys.',
      done: false,
      action: 'supabase.com',
    },
    {
      title: 'Deploy to Vercel',
      description: 'Connect the GitHub repo to Vercel. Add all environment variables. Enable Cron Jobs for 07:00 briefing.',
      done: false,
      action: 'vercel.com',
    },
  ]

  return (
    <div className="card divide-y divide-slate-800">
      {steps.map((step, i) => (
        <div key={i} className="p-4 flex items-start gap-4">
          <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
            step.done ? 'bg-green-900 text-green-400' : 'bg-slate-800 text-slate-500'
          }`}>
            {step.done ? '✓' : i + 1}
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{step.title}</div>
            <div className="text-xs text-slate-400 mt-0.5">{step.description}</div>
          </div>
          <div className="text-xs text-indigo-400 flex-shrink-0">{step.action}</div>
        </div>
      ))}
    </div>
  )
}
