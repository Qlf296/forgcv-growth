'use client'

import { useEffect, useState, useCallback } from 'react'
import { formatTime, formatDate, PLATFORM_ICONS, STATUS_COLORS } from '@/lib/utils'
import type { Campaign, Post } from '@/types'

// ── Types ────────────────────────────────────────────────────
type Tab = 'today' | 'studio' | 'calendar' | 'accounts' | 'learning' | 'system'

interface AccountStatus {
  connected: boolean
  can_publish: boolean
  username?: string
  note?: string
  error?: string
}

interface AccountsData {
  statuses: Record<string, AccountStatus>
  summary: { total: number; connected: number; publishable: number; action_required: number }
}

interface HealthData {
  status: string
  today: { campaign_status: string; campaign_id: string | null; campaign_theme: string | null }
  scheduler: { next_briefing_local: string; overdue_reminders: number }
  database: { connected: boolean; recent_events: SystemEvent[] }
  ai: { providers: string[] }
  telegram: { configured: boolean; bot_username: string; webhook_url: string | null; webhook_active: boolean }
}

interface SystemEvent {
  event_type: string
  status: 'success' | 'warning' | 'error' | 'info'
  message: string
  created_at: string
}

interface HistoryCampaign {
  id: string
  date: string
  status: string
  theme: string
  posts: { platform: string; status: string; scheduled_at: string }[]
}

// ── Main Dashboard ───────────────────────────────────────────
export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>('today')
  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [accounts, setAccounts] = useState<AccountsData | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [history, setHistory] = useState<HistoryCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [approving, setApproving] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const error = params.get('connect_error')
    if (connected) showToast(`✅ ${connected.charAt(0).toUpperCase() + connected.slice(1)} connected!`)
    if (error) showToast(`❌ Failed to connect ${error}: ${params.get('reason') || 'unknown error'}`)
    if (connected || error) window.history.replaceState({}, '', '/dashboard')
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [campaignRes, accountsRes, healthRes, historyRes] = await Promise.all([
        fetch('/api/briefing/generate', { method: 'GET' }).then(r => r.json()).catch(() => null),
        fetch('/api/accounts/status').then(r => r.json()).catch(() => null),
        fetch('/api/health').then(r => r.json()).catch(() => null),
        fetch('/api/campaigns?limit=10').then(r => r.json()).catch(() => null),
      ])
      if (campaignRes?.campaign) setCampaign(campaignRes.campaign as Campaign)
      if (accountsRes) setAccounts(accountsRes as AccountsData)
      if (healthRes) setHealth(healthRes as HealthData)
      if (historyRes?.campaigns) setHistory(historyRes.campaigns as HistoryCampaign[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function generateCampaign() {
    setGenerating(true)
    showToast('Generating today\'s campaign with AI agents...')
    try {
      const res = await fetch('/api/briefing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true }),
      })
      const data = await res.json() as { success?: boolean; error?: string; message?: string }
      if (data.success || data.message) {
        showToast('✅ Campaign generated!')
        await loadData()
      } else {
        showToast(`❌ Error: ${data.error}`)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function approveCampaign() {
    if (!campaign) return
    setApproving(true)
    showToast('Approving campaign and scheduling reminders...')
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/approve`, { method: 'POST' })
      const data = await res.json() as { message?: string; error?: string }
      showToast(data.message || data.error || 'Done')
      await loadData()
    } finally {
      setApproving(false)
    }
  }

  async function runWebsiteAudit() {
    showToast('Running website audit...')
    const res = await fetch('/api/audit/website', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual: true }),
    })
    const data = await res.json() as { success?: boolean }
    showToast(data.success ? '✅ Website audit complete' : '❌ Audit failed')
    await loadData()
  }

  async function setupTelegramWebhook() {
    showToast('Registering Telegram webhook...')
    const res = await fetch('/api/telegram/setup', { method: 'POST' })
    const data = await res.json() as { success?: boolean; description?: string }
    showToast(data.success ? '✅ Telegram webhook registered!' : `❌ Failed: ${data.description}`)
    await loadData()
  }

  async function generateWeeklyReport() {
    showToast('Generating weekly report...')
    const res = await fetch('/api/reports/weekly', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual: true }),
    })
    const data = await res.json() as { success?: boolean }
    showToast(data.success ? '✅ Weekly report sent to Telegram!' : '❌ Report generation failed')
  }

  const pendingPosts = campaign?.posts?.filter(p => p.status === 'awaiting_approval') || []
  const scheduledPosts = campaign?.posts?.filter(p => p.status === 'scheduled') || []
  const publishedPosts = campaign?.posts?.filter(p => p.status === 'published') || []

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'today', label: '🌅 Today', badge: pendingPosts.length || undefined },
    { id: 'studio', label: '✏️ Studio' },
    { id: 'calendar', label: '📅 Calendar' },
    { id: 'accounts', label: '📱 Accounts' },
    { id: 'learning', label: '📚 Learning' },
    { id: 'system', label: '⚙️ System' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg brand-gradient flex items-center justify-center text-white font-bold text-xs">F</div>
            <span className="font-semibold text-white text-sm">ForgCV Growth</span>
            <span className="hidden md:block text-slate-500 text-xs">Command Center</span>
          </div>
          <div className="flex items-center gap-3">
            <a href="https://forgcv.com" target="_blank" rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-indigo-400 transition-colors">forgcv.com ↗</a>
            <div className="text-xs text-slate-600 hidden md:block">{today}</div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0 scrollbar-hide">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
              {tab.badge ? (
                <span className="bg-yellow-500 text-black text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-slate-800 border border-slate-600 rounded-lg px-4 py-2 text-sm text-white shadow-xl max-w-md text-center">
          {toast}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'today' && (
          <TodayTab
            campaign={campaign}
            accounts={accounts}
            pendingPosts={pendingPosts}
            scheduledPosts={scheduledPosts}
            publishedPosts={publishedPosts}
            loading={loading}
            generating={generating}
            approving={approving}
            onGenerate={generateCampaign}
            onApprove={approveCampaign}
            onUpdate={loadData}
            showToast={showToast}
          />
        )}

        {activeTab === 'studio' && (
          <StudioTab
            campaign={campaign}
            loading={loading}
            onUpdate={loadData}
            showToast={showToast}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarTab history={history} loading={loading} />
        )}

        {activeTab === 'accounts' && (
          <AccountsTab accounts={accounts} loading={loading} />
        )}

        {activeTab === 'learning' && <LearningTab />}

        {activeTab === 'system' && (
          <SystemTab
            health={health}
            loading={loading}
            onAudit={runWebsiteAudit}
            onSetupWebhook={setupTelegramWebhook}
            onWeeklyReport={generateWeeklyReport}
          />
        )}
      </main>
    </div>
  )
}

// ── Today Tab ────────────────────────────────────────────────
function TodayTab({
  campaign, accounts, pendingPosts, scheduledPosts, publishedPosts,
  loading, generating, approving, onGenerate, onApprove, onUpdate, showToast,
}: {
  campaign: Campaign | null
  accounts: AccountsData | null
  pendingPosts: Post[]
  scheduledPosts: Post[]
  publishedPosts: Post[]
  loading: boolean
  generating: boolean
  approving: boolean
  onGenerate: () => void
  onApprove: () => void
  onUpdate: () => void
  showToast: (m: string) => void
}) {
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Awaiting Approval" value={pendingPosts.length} color="text-yellow-400" />
        <StatCard label="Scheduled" value={scheduledPosts.length} color="text-blue-400" />
        <StatCard label="Published Today" value={publishedPosts.length} color="text-green-400" />
        <StatCard
          label="Accounts Ready"
          value={`${accounts?.summary?.publishable ?? '—'}/${accounts?.summary?.total ?? 5}`}
          color={accounts?.summary?.publishable === accounts?.summary?.total ? 'text-green-400' : 'text-orange-400'}
        />
      </div>

      {/* Campaign */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Today&apos;s Campaign</h2>
          <div className="flex gap-2">
            {!campaign && (
              <button onClick={onGenerate} disabled={generating}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
                {generating ? '⚡ Generating...' : '⚡ Generate Campaign'}
              </button>
            )}
            {pendingPosts.length > 0 && (
              <button onClick={onApprove} disabled={approving}
                className="px-4 py-1.5 brand-gradient hover:opacity-90 disabled:opacity-50 rounded-lg text-xs font-bold text-white transition-opacity">
                {approving ? '⏳ Approving...' : `✅ Approve ${pendingPosts.length} Posts`}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : !campaign ? (
          <div className="card p-10 text-center">
            <div className="text-4xl mb-3">🌅</div>
            <h3 className="text-base font-medium mb-1">No campaign yet today</h3>
            <p className="text-slate-400 text-sm mb-5">AI agents will analyze the market and create today&apos;s posts.</p>
            <button onClick={onGenerate} disabled={generating}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl font-medium text-sm transition-colors">
              {generating ? '⚡ Generating...' : '⚡ Generate Today\'s Campaign'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="card p-5">
              <div className="flex items-start gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                  campaign.status === 'ready_for_review' ? 'bg-yellow-900/50 text-yellow-400' :
                  campaign.status === 'approved' ? 'bg-blue-900/50 text-blue-400' :
                  campaign.status === 'published' ? 'bg-green-900/50 text-green-400' :
                  'bg-slate-800 text-slate-400'
                }`}>{campaign.status.replace(/_/g, ' ').toUpperCase()}</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-2">{campaign.theme}</h3>
              <p className="text-slate-400 text-sm mt-1">{campaign.objective}</p>
              {campaign.strategy_summary && (
                <p className="text-slate-300 text-sm mt-3 pt-3 border-t border-slate-800">
                  {campaign.strategy_summary}
                </p>
              )}
            </div>
            {campaign.posts?.map(post => (
              <PostCard key={post.id} post={post} onUpdate={onUpdate} showToast={showToast} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Studio Tab ───────────────────────────────────────────────
function StudioTab({ campaign, loading, onUpdate, showToast }: {
  campaign: Campaign | null
  loading: boolean
  onUpdate: () => void
  showToast: (m: string) => void
}) {
  if (loading) return <div className="card p-8 text-center text-slate-400 text-sm">Loading...</div>
  if (!campaign?.posts?.length) {
    return (
      <div className="card p-10 text-center">
        <div className="text-4xl mb-3">✏️</div>
        <p className="text-slate-400 text-sm">No content yet. Generate today&apos;s campaign first.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-slate-400 text-sm">{campaign.posts.length} posts generated for today</p>
      {campaign.posts.map(post => (
        <PostCard key={post.id} post={post} onUpdate={onUpdate} showToast={showToast} compact={false} />
      ))}
    </div>
  )
}

// ── Post Card ────────────────────────────────────────────────
function PostCard({ post, onUpdate, showToast, compact }: {
  post: Post
  onUpdate: () => void
  showToast: (m: string) => void
  compact: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [caption, setCaption] = useState(post.caption || '')
  const [expanded, setExpanded] = useState(!compact)
  const [saving, setSaving] = useState(false)
  const [marking, setMarking] = useState(false)

  const scheduledTime = formatTime(post.scheduled_at)
  const hashtags = (post.hashtags || []).map((h: string) => `#${h}`).join(' ')

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`✓ ${label} copied to clipboard`)
    } catch {
      showToast('Copy failed — please select and copy manually')
    }
  }

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
    showToast('✅ Caption saved')
  }

  async function markPublished() {
    setMarking(true)
    await fetch(`/api/posts/${post.id}/mark-published`, { method: 'POST' })
    setMarking(false)
    onUpdate()
    showToast('✅ Marked as published — reminders cancelled')
  }

  async function cancelPost() {
    if (!confirm('Skip this post?')) return
    await fetch(`/api/posts/${post.id}`, { method: 'DELETE' })
    onUpdate()
    showToast('⏭️ Post skipped')
  }

  const canMarkPublished = ['scheduled', 'approved', 'awaiting_approval'].includes(post.status)
  const isPublished = post.status === 'published'

  return (
    <div className={`card overflow-hidden ${isPublished ? 'opacity-70' : ''}`}>
      {/* Header row */}
      <div
        className="p-4 flex items-center gap-3 cursor-pointer"
        onClick={() => compact && setExpanded(e => !e)}
      >
        <span className="text-xl flex-shrink-0">{PLATFORM_ICONS[post.platform] || '📱'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm capitalize">{post.platform}</span>
            <span className="text-xs text-slate-500">{post.format}</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs text-slate-500">{scheduledTime}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[post.status] || 'bg-slate-700 text-slate-300'}`}>
              {post.status.replace(/_/g, ' ')}
            </span>
          </div>
          {compact && !expanded && (
            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{post.title || post.caption?.slice(0, 80)}</p>
          )}
        </div>
        {compact && (
          <span className="text-slate-600 text-xs">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {/* Expanded content */}
      {(!compact || expanded) && (
        <div className="px-4 pb-4 space-y-4 border-t border-slate-800 pt-4">
          {/* Title */}
          {post.title && (
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wide">Title</span>
              <p className="text-sm font-medium text-white mt-1">{post.title}</p>
            </div>
          )}

          {/* Caption */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500 uppercase tracking-wide">Caption</span>
              <div className="flex gap-2">
                <button onClick={() => copyText(post.caption || '', 'Caption')}
                  className="text-xs text-indigo-400 hover:text-indigo-300">Copy</button>
                {!editing && post.status !== 'published' && (
                  <button onClick={() => { setEditing(true); setCaption(post.caption || '') }}
                    className="text-xs text-slate-400 hover:text-slate-200">Edit</button>
                )}
              </div>
            </div>
            {editing ? (
              <div>
                <textarea
                  value={caption}
                  onChange={e => setCaption(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 resize-none h-40"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={saveEdit} disabled={saving}
                    className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md">
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="text-xs px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed bg-slate-900 rounded-lg p-3">
                {post.caption || '—'}
              </p>
            )}
          </div>

          {/* Hashtags */}
          {hashtags && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500 uppercase tracking-wide">Hashtags</span>
                <button onClick={() => copyText(hashtags, 'Hashtags')}
                  className="text-xs text-indigo-400 hover:text-indigo-300">Copy</button>
              </div>
              <p className="text-xs text-indigo-400 bg-slate-900 rounded-lg p-2 font-mono leading-relaxed">{hashtags}</p>
            </div>
          )}

          {/* CTA + Link */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {post.cta && (
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wide">Call to Action</span>
                <p className="text-sm text-slate-300 mt-1">{post.cta}</p>
              </div>
            )}
            {post.destination_url && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 uppercase tracking-wide">Link (with UTM)</span>
                  <button onClick={() => copyText(post.destination_url, 'URL')}
                    className="text-xs text-indigo-400 hover:text-indigo-300">Copy</button>
                </div>
                <a href={post.destination_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-400 hover:underline break-all mt-1 block">
                  {post.destination_url}
                </a>
              </div>
            )}
          </div>

          {/* Strategy */}
          {post.strategy_explanation && (
            <details className="text-sm">
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 uppercase tracking-wide">Strategy & KPI</summary>
              <div className="mt-2 text-slate-400 text-xs space-y-1 pl-2 border-l border-slate-700">
                <p><span className="text-slate-500">Objective:</span> {post.objective}</p>
                <p><span className="text-slate-500">KPI:</span> {post.expected_kpi}</p>
                <p><span className="text-slate-500">Audience:</span> {post.target_audience}</p>
                <p>{post.strategy_explanation}</p>
              </div>
            </details>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-800">
            {canMarkPublished && !isPublished && (
              <button onClick={markPublished} disabled={marking}
                className="text-xs px-3 py-1.5 bg-green-800 hover:bg-green-700 text-green-200 rounded-lg font-medium transition-colors">
                {marking ? '⏳...' : '✅ Mark as Published'}
              </button>
            )}
            {post.status !== 'published' && post.status !== 'cancelled' && (
              <button onClick={cancelPost}
                className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg transition-colors">
                ⏭️ Skip
              </button>
            )}
            {isPublished && post.published_at && (
              <span className="text-xs text-green-400">
                ✅ Published {formatTime(post.published_at)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Calendar Tab ─────────────────────────────────────────────
function CalendarTab({ history, loading }: { history: HistoryCampaign[]; loading: boolean }) {
  if (loading) return <div className="card p-8 text-center text-slate-400 text-sm">Loading...</div>
  if (!history.length) return (
    <div className="card p-10 text-center">
      <p className="text-slate-400 text-sm">No campaign history yet.</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm">Last {history.length} campaigns</p>
      {history.map(c => {
        const published = c.posts?.filter(p => p.status === 'published').length || 0
        const total = c.posts?.length || 0
        return (
          <div key={c.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">{formatDate(c.date)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    c.status === 'published' ? 'bg-green-900/50 text-green-400' :
                    c.status === 'approved' ? 'bg-blue-900/50 text-blue-400' :
                    c.status === 'ready_for_review' ? 'bg-yellow-900/50 text-yellow-400' :
                    'bg-slate-800 text-slate-400'
                  }`}>{c.status.replace(/_/g, ' ')}</span>
                </div>
                <p className="text-xs text-slate-400">{c.theme}</p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white">{published}/{total}</span>
                <div className="text-xs text-slate-500">published</div>
              </div>
            </div>
            {c.posts?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.posts.map((p, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded-full ${
                    p.status === 'published' ? 'bg-green-900/50 text-green-400' :
                    p.status === 'cancelled' ? 'bg-slate-800 text-slate-500 line-through' :
                    'bg-slate-800 text-slate-400'
                  }`}>
                    {PLATFORM_ICONS[p.platform] || '📱'} {p.platform}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Accounts Tab ─────────────────────────────────────────────
function AccountsTab({ accounts, loading }: { accounts: AccountsData | null; loading: boolean }) {
  const platforms = ['instagram', 'linkedin', 'twitter', 'reddit', 'tiktok']

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-1">Social Accounts</h2>
        <p className="text-slate-400 text-sm">Connect your accounts to enable automated publishing reminders.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[1,2,3,4,5].map(i => <div key={i} className="card p-6 animate-pulse h-32" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {platforms.map(platform => {
            const status = accounts?.statuses?.[platform]
            const isTikTok = platform === 'tiktok'
            return (
              <div key={platform} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{PLATFORM_ICONS[platform] || '📱'}</span>
                    <div>
                      <div className="font-medium capitalize">{platform === 'twitter' ? 'X / Twitter' : platform}</div>
                      <div className={`text-xs font-medium mt-0.5 ${
                        status?.can_publish ? 'text-green-400' :
                        status?.connected ? 'text-yellow-400' : 'text-slate-500'
                      }`}>
                        {status?.can_publish ? '🟢 Ready to publish' :
                          status?.connected ? '🟡 Connected (limited access)' : '🔴 Not connected'}
                      </div>
                      {status?.username && <div className="text-xs text-slate-500 mt-0.5">@{status.username}</div>}
                    </div>
                  </div>
                  {!status?.can_publish && (
                    <a
                      href={`/api/auth/connect/${platform}`}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                        isTikTok
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      }`}
                      title={isTikTok ? 'TikTok API requires 2–4 week approval' : `Connect ${platform}`}
                    >
                      {isTikTok ? '⏳ Pending API' : '＋ Connect'}
                    </a>
                  )}
                  {status?.can_publish && (
                    <a href={`/api/auth/connect/${platform}`}
                      className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                      Reconnect
                    </a>
                  )}
                </div>
                {status?.note && (
                  <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-800">{status.note}</p>
                )}
                {!status?.can_publish && (
                  <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-400">
                    {platform === 'instagram' && 'Create a Meta Developer App → Add Instagram product → Redirect: forgcv-growth.vercel.app/api/auth/callback/instagram'}
                    {platform === 'linkedin' && 'Create LinkedIn App at linkedin.com/developers/apps → Redirect: forgcv-growth.vercel.app/api/auth/callback/linkedin'}
                    {platform === 'twitter' && 'Create Twitter App at developer.twitter.com → OAuth 2.0 Read+Write → Redirect: forgcv-growth.vercel.app/api/auth/callback/twitter'}
                    {platform === 'reddit' && 'Create "script" app at reddit.com/prefs/apps → Redirect: forgcv-growth.vercel.app/api/auth/callback/reddit'}
                    {platform === 'tiktok' && 'Apply for Content Posting API at developers.tiktok.com — approval takes 2–4 weeks'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="card p-5 bg-indigo-950/30 border border-indigo-900/50">
        <h3 className="font-medium text-sm mb-2">🔑 How to add credentials to Vercel</h3>
        <p className="text-slate-400 text-xs mb-3">After creating developer apps, add their client IDs and secrets to Vercel:</p>
        <ol className="text-xs text-slate-400 space-y-1.5">
          <li>1. Go to <a href="https://vercel.com/qlf296s-projects/forgcv-growth/settings/environment-variables" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Vercel Environment Variables ↗</a></li>
          <li>2. Add: <code className="bg-slate-800 px-1 rounded">LINKEDIN_CLIENT_ID</code>, <code className="bg-slate-800 px-1 rounded">LINKEDIN_CLIENT_SECRET</code></li>
          <li>3. Add: <code className="bg-slate-800 px-1 rounded">META_APP_ID</code>, <code className="bg-slate-800 px-1 rounded">META_APP_SECRET</code></li>
          <li>4. Add: <code className="bg-slate-800 px-1 rounded">TWITTER_CLIENT_ID</code>, <code className="bg-slate-800 px-1 rounded">TWITTER_CLIENT_SECRET</code></li>
          <li>5. Add: <code className="bg-slate-800 px-1 rounded">REDDIT_CLIENT_ID</code>, <code className="bg-slate-800 px-1 rounded">REDDIT_CLIENT_SECRET</code></li>
          <li>6. Redeploy, then click &quot;Connect&quot; above for each platform</li>
        </ol>
      </div>
    </div>
  )
}

// ── Learning Tab ─────────────────────────────────────────────
function LearningTab() {
  const [open, setOpen] = useState<string | null>('instagram')

  const guides = [
    {
      id: 'instagram',
      title: '📸 Instagram',
      subtitle: 'Reels · Carousels · Static Images',
      content: `**Formats:** Reel (vertical 9:16, 15–90s), Carousel (up to 10 slides), Static Image (square or 4:5)

**Caption:** 2,200 characters max. Put your hook in the first line (shown before "more"). Use line breaks for readability. Add your CTA before hashtags.

**Hashtags:** 5–10 is optimal. Put them in the first comment, not the caption. Mix niche tags (#cvbuilder) with broader ones (#jobsearch).

**Best times (Amsterdam):** Mon–Fri 09:00–11:00 (Reels), 11:00–13:00 (Carousels). Avoid weekends for professional content.

**To publish manually:**
1. Open Instagram → tap ＋
2. For Reels: select Reel → upload vertical video
3. For Carousel: select Post → tap the layers icon to add multiple images
4. Paste the caption (from Studio tab → Copy)
5. Add hashtags in the first comment after posting

**KPIs to track:** Reach, Saves (most important!), Profile visits, Website clicks from bio.`,
    },
    {
      id: 'linkedin',
      title: '💼 LinkedIn',
      subtitle: 'Posts · Carousels · Articles',
      content: `**Formats:** Text post (best for personal stories), Document carousel (PDF slides), Article (long-form).

**Caption:** 3,000 characters max. First 3 lines must hook. Use short paragraphs (1–2 sentences). End with a question for engagement.

**Hashtags:** 3–5 max. Professional, topic-specific. Add at the end.

**Best times (Amsterdam):** Tue–Thu 07:30–09:00 (morning commute), 11:30–13:00 (lunch). Avoid weekends.

**To publish manually:**
1. Open LinkedIn → click "Start a post"
2. Paste the caption
3. For carousel: upload PDF → it becomes a swipeable document
4. Add image if relevant
5. Click Post

**KPIs to track:** Impressions, Reactions, Comments, Reposts, Profile views, Website clicks.`,
    },
    {
      id: 'reddit',
      title: '🤖 Reddit',
      subtitle: 'Community-first · Value-first',
      content: `**Critical rule:** Reddit detects promotional posts instantly. ALWAYS provide genuine value first.

**Target subreddits:** r/resumes, r/jobs, r/careerguidance, r/jobsearch, r/GetEmployed, r/cscareerquestions

**Format:** Text post (best), not a link post. Write naturally like a community member.

**When to mention ForgCV:** Only when directly relevant and helpful. Example: "I used a free tool called ForgCV which helped me..." — natural, not promotional.

**Before posting:** Read the subreddit's rules. Check the top posts to understand tone. Never post the same content to multiple subreddits.

**To publish manually:**
1. Go to the subreddit (r/resumes, etc.)
2. Click "Create Post" → Text
3. Paste the title then body from your content
4. Submit — do NOT add a link to forgcv.com in the post text unless it's genuinely helpful

**KPIs to track:** Upvotes, Comments, Awards, Profile click-throughs.`,
    },
    {
      id: 'twitter',
      title: '🐦 X / Twitter',
      subtitle: 'Tweets · Threads',
      content: `**Character limit:** 280 per tweet. For threads: number each tweet (1/ 2/ 3/).

**Format:** Single tweet (punchy, one insight), Thread (3–7 tweets, educational), Quote tweet.

**Best times (Amsterdam):** Mon–Fri 08:00–10:00, 17:00–19:00.

**Hashtags:** 1–2 max, only if they add discoverability. Don't hashtag-stuff.

**To publish manually:**
1. Open X → click ＋ or compose
2. For single tweet: paste text (check it's under 280 chars)
3. For thread: click ＋ after each tweet to add the next one
4. Add image if relevant
5. Post

**KPIs to track:** Impressions, Engagements (clicks + likes + RTs), Profile visits, Link clicks.`,
    },
    {
      id: 'tiktok',
      title: '🎵 TikTok',
      subtitle: 'Short videos · Trending content',
      content: `**Status:** TikTok Content Posting API requires a 2–4 week approval process. Content is prepared in the system for when API access is granted or for manual upload.

**Specs:** Vertical video only (9:16), 1080×1920px, 15–60 seconds optimal, max 10 minutes.

**Hook:** First 1–2 seconds must stop the scroll. Use a bold claim, surprising stat, or visual shock.

**Captions:** 2,200 characters. Brief, with 3–5 hashtags. Add link in bio.

**Trending sounds:** Use the TikTok Discover page → Sounds to find trending audio before posting.

**To publish manually:**
1. Open TikTok → tap ＋
2. Record or upload your video
3. Trim as needed
4. Add caption and hashtags
5. Update your bio link to forgcv.com (or use a Linktree)
6. Post

**KPIs to track:** Views, Watch time %, Profile visits, Bio link clicks, Follows.`,
    },
  ]

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold mb-1">Platform Publishing Guides</h2>
        <p className="text-slate-400 text-sm">Step-by-step instructions for publishing on each platform manually.</p>
      </div>
      {guides.map(guide => (
        <div key={guide.id} className="card overflow-hidden">
          <button
            className="w-full p-4 flex items-center justify-between text-left"
            onClick={() => setOpen(open === guide.id ? null : guide.id)}
          >
            <div>
              <span className="font-semibold text-sm">{guide.title}</span>
              <span className="text-xs text-slate-400 ml-2">{guide.subtitle}</span>
            </div>
            <span className="text-slate-500 text-xs">{open === guide.id ? '▲' : '▼'}</span>
          </button>
          {open === guide.id && (
            <div className="px-4 pb-4 border-t border-slate-800 pt-4">
              <div className="text-sm text-slate-300 space-y-3 leading-relaxed">
                {guide.content.split('\n\n').map((para, i) => {
                  if (para.startsWith('**') && para.includes(':**')) {
                    const [title, ...rest] = para.split('\n')
                    return (
                      <div key={i}>
                        <p className="font-semibold text-white text-xs uppercase tracking-wide mb-1">
                          {title.replace(/\*\*/g, '')}
                        </p>
                        {rest.map((line, j) => (
                          <p key={j} className="text-slate-400 text-xs leading-relaxed">{line}</p>
                        ))}
                      </div>
                    )
                  }
                  return <p key={i} className="text-slate-400 text-xs leading-relaxed">{para}</p>
                })}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── System Tab ───────────────────────────────────────────────
function SystemTab({ health, loading, onAudit, onSetupWebhook, onWeeklyReport }: {
  health: HealthData | null
  loading: boolean
  onAudit: () => void
  onSetupWebhook: () => void
  onWeeklyReport: () => void
}) {
  const statusDot = (ok: boolean) => ok
    ? <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
    : <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />

  const eventColor: Record<string, string> = {
    success: 'text-green-400', warning: 'text-yellow-400', error: 'text-red-400', info: 'text-blue-400',
  }

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="card p-8 text-center text-slate-400 text-sm">Loading system status...</div>
      ) : (
        <>
          {/* Status cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                {statusDot(true)}
                <span className="text-xs text-slate-400">Supabase</span>
              </div>
              <div className="text-sm font-medium text-white">Connected</div>
              <div className="text-xs text-slate-500">EU-West · PostgreSQL 17</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                {statusDot(!!health?.telegram.webhook_active)}
                <span className="text-xs text-slate-400">Telegram</span>
              </div>
              <div className="text-sm font-medium text-white">
                {health?.telegram.webhook_active ? 'Webhook Active' : 'Webhook Missing'}
              </div>
              <div className="text-xs text-slate-500">{health?.telegram.bot_username}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                {statusDot(!!health?.today.campaign_id)}
                <span className="text-xs text-slate-400">Today&apos;s Campaign</span>
              </div>
              <div className="text-sm font-medium text-white capitalize">
                {health?.today.campaign_status || 'None'}
              </div>
              <div className="text-xs text-slate-500 truncate">{health?.today.campaign_theme || '—'}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                <span className="text-xs text-slate-400">Next Briefing</span>
              </div>
              <div className="text-sm font-medium text-white">{health?.scheduler.next_briefing_local || '07:00'}</div>
              <div className="text-xs text-slate-500">Amsterdam time</div>
            </div>
          </div>

          {/* AI Providers */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3">🤖 AI Provider Cascade</h3>
            <div className="space-y-2">
              {health?.ai.providers.map((p, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-5 h-5 rounded-full bg-indigo-900/60 flex items-center justify-center text-xs text-indigo-400 font-bold flex-shrink-0">{i + 1}</span>
                  <span className="text-slate-300">{p}</span>
                  <span className="text-xs text-green-400 ml-auto">Active</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reminders */}
          {(health?.scheduler.overdue_reminders ?? 0) > 0 && (
            <div className="card p-4 bg-yellow-900/20 border border-yellow-800">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-yellow-400 font-medium text-sm">
                    ⏰ {health?.scheduler.overdue_reminders} overdue reminder(s)
                  </span>
                  <p className="text-xs text-slate-400 mt-0.5">These will be sent at the next cron execution (every 30 min).</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3">⚡ Manual Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button onClick={onSetupWebhook}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
                <div className="text-sm font-medium">📡 Register Telegram Webhook</div>
                <div className="text-xs text-slate-400 mt-0.5">Connect bot to receive button presses</div>
              </button>
              <button onClick={onAudit}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
                <div className="text-sm font-medium">🌐 Run Website Audit</div>
                <div className="text-xs text-slate-400 mt-0.5">Check forgcv.com page status</div>
              </button>
              <button onClick={onWeeklyReport}
                className="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
                <div className="text-sm font-medium">📈 Generate Weekly Report</div>
                <div className="text-xs text-slate-400 mt-0.5">AI analysis + send to Telegram</div>
              </button>
            </div>
          </div>

          {/* System events log */}
          {health?.database.recent_events && health.database.recent_events.length > 0 && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm mb-3">📋 Recent System Events</h3>
              <div className="space-y-2">
                {health.database.recent_events.map((evt, i) => (
                  <div key={i} className="flex items-start gap-3 text-xs">
                    <span className={`font-medium flex-shrink-0 ${eventColor[evt.status] || 'text-slate-400'}`}>
                      {evt.status === 'success' ? '✓' : evt.status === 'error' ? '✗' : evt.status === 'warning' ? '⚠' : 'ℹ'}
                    </span>
                    <span className="text-slate-500 flex-shrink-0 font-mono">
                      {new Date(evt.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })}
                    </span>
                    <span className="text-slate-300">{evt.event_type}</span>
                    <span className="text-slate-500 ml-auto truncate max-w-xs">{evt.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vercel crons */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3">⏰ Scheduled Jobs (Vercel Crons)</h3>
            <div className="space-y-2">
              {[
                { cron: '0 6 * * *', label: 'Daily Campaign Generation', time: '07:00 Amsterdam', path: '/api/briefing/generate' },
                { cron: '*/30 * * * *', label: 'Publication Reminders', time: 'Every 30 min', path: '/api/reminders/process' },
              ].map((job, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-2 border-b border-slate-800 last:border-0">
                  <code className="bg-slate-800 px-2 py-0.5 rounded text-indigo-300 font-mono">{job.cron}</code>
                  <span className="text-slate-300">{job.label}</span>
                  <span className="text-slate-500 ml-auto">{job.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3">🔗 Infrastructure Links</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard/project/xetxxauohhipckeoghkn' },
                { label: 'Vercel Deployment', url: 'https://vercel.com/qlf296s-projects/forgcv-growth' },
                { label: 'Vercel Env Variables', url: 'https://vercel.com/qlf296s-projects/forgcv-growth/settings/environment-variables' },
                { label: 'Telegram Bot', url: 'https://t.me/ForgCVBot' },
                { label: 'forgcv.com', url: 'https://forgcv.com' },
                { label: 'GitHub Repo', url: 'https://github.com/Qlf296/forgcv-growth' },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
                  {link.label} ↗
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Shared components ────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  )
}
