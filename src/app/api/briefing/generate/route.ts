import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { generateDailyCampaign } from '@/lib/agents/orchestrator'
import { createSupabaseServer } from '@/lib/db/server'
import { sendDailyBriefing } from '@/lib/notifications/telegram'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

// POST /api/briefing/generate
// Called by Vercel Cron at 06:00 UTC (= 07:00 Amsterdam)
// Also callable manually from dashboard with { manual: true }
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    // Read body once
    const body = await request.json().catch(() => ({})) as { manual?: boolean; date?: string }

    // Auth: allow cron secret OR explicit manual flag from dashboard
    const isAuthorized =
      (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
      body.manual === true

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const tz = 'Europe/Amsterdam'
    const now = toZonedTime(new Date(), tz)
    const campaignDate = body.date || format(now, 'yyyy-MM-dd')

    const supabase = createSupabaseServer()

    // Check if campaign already exists for today
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('date', campaignDate)
      .single()

    if (existing) {
      if (existing.status !== 'failed') {
        return NextResponse.json({
          message: 'Campaign already exists',
          campaign_id: existing.id,
          status: existing.status,
        })
      }
      // Delete failed campaign so we can regenerate cleanly
      await supabase.from('campaigns').delete().eq('id', existing.id)
    }

    // Get yesterday's performance data
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd')

    const { data: perfData } = await supabase
      .from('daily_performance')
      .select('*')
      .eq('date', yesterdayStr)
      .single()

    // Generate campaign
    console.log(`[Briefing] Generating campaign for ${campaignDate}`)
    const result = await generateDailyCampaign(campaignDate, perfData || undefined)

    // Fetch full campaign for Telegram notification
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*, posts(*)')
      .eq('id', result.campaign_id)
      .single()

    if (campaign) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'
      await sendDailyBriefing(campaign, appUrl)
    }

    return NextResponse.json({
      success: true,
      campaign_id: result.campaign_id,
      posts_created: result.posts_created,
      date: campaignDate,
    })

  } catch (err) {
    console.error('[Briefing] Generation failed:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET /api/briefing/today — returns today's campaign if it exists
export async function GET() {
  const supabase = createSupabaseServer()
  const tz = 'Europe/Amsterdam'
  const now = toZonedTime(new Date(), tz)
  const today = format(now, 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('campaigns')
    .select('*, posts(*)')
    .eq('date', today)
    .single()

  if (error || !data) {
    return NextResponse.json({ campaign: null, message: 'No campaign for today yet' })
  }

  return NextResponse.json({ campaign: data })
}
