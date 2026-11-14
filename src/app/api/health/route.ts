import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createSupabaseServer()
  const tz = 'Europe/Amsterdam'
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: tz })

  const [campaignResult, pendingRemResult, eventsResult, webhookResult] = await Promise.allSettled([
    supabase.from('campaigns').select('id, status, theme, created_at').eq('date', today).single(),
    supabase.from('reminders').select('id').eq('status', 'pending')
      .lte('scheduled_at', now.toISOString()),
    supabase.from('system_events').select('event_type, status, message, created_at')
      .order('created_at', { ascending: false }).limit(8),
    process.env.TELEGRAM_BOT_TOKEN
      ? fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getWebhookInfo`)
          .then(r => r.json())
          .catch(() => null)
      : Promise.resolve(null),
  ])

  const campaign = campaignResult.status === 'fulfilled' ? campaignResult.value.data : null
  const pendingReminders = pendingRemResult.status === 'fulfilled' ? (pendingRemResult.value.data?.length || 0) : 0
  const recentEvents = eventsResult.status === 'fulfilled' ? (eventsResult.value.data || []) : []
  const webhookInfo = webhookResult.status === 'fulfilled' ? webhookResult.value : null

  const nextBriefing = new Date(now)
  nextBriefing.setUTCHours(6, 0, 0, 0)
  if (nextBriefing <= now) nextBriefing.setDate(nextBriefing.getDate() + 1)

  return NextResponse.json({
    status: 'healthy',
    timestamp: now.toISOString(),
    today: {
      campaign_status: campaign?.status || 'none',
      campaign_id: campaign?.id || null,
      campaign_theme: campaign?.theme || null,
    },
    scheduler: {
      next_briefing_utc: nextBriefing.toISOString(),
      next_briefing_local: nextBriefing.toLocaleString('en-US', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short',
      }),
      overdue_reminders: pendingReminders,
    },
    database: {
      connected: true,
      recent_events: recentEvents,
    },
    ai: {
      providers: [
        'OpenRouter — anthropic/claude-haiku-4.5',
        'Groq — qwen/qwen3.8-27b',
        'Gemini — gemini-2.5-flash',
      ],
    },
    telegram: {
      configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      bot_username: '@ForgCVBot',
      webhook_url: (webhookInfo as { result?: { url?: string } })?.result?.url || null,
      webhook_active: !!(webhookInfo as { result?: { url?: string } })?.result?.url,
    },
  })
}
