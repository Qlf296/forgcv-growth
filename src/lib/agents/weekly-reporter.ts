import { runAgent, FORGCV_CONTEXT, parseJSON } from './base'
import { createSupabaseServer } from '@/lib/db/server'
import { sendWeeklyReport } from '@/lib/notifications/telegram'

interface WeeklyReportData {
  week_start: string
  week_end: string
  total_campaigns: number
  total_posts_planned: number
  total_posts_published: number
  publish_rate: number
  top_platform: string
  report_text: string
  recommendations: string[]
}

export async function generateWeeklyReport(appUrl: string): Promise<WeeklyReportData> {
  const supabase = createSupabaseServer()
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const weekStart = weekAgo.toISOString().slice(0, 10)
  const weekEnd = now.toISOString().slice(0, 10)

  const [campaignsResult, postsResult] = await Promise.all([
    supabase.from('campaigns').select('id, date, status, theme')
      .gte('date', weekStart).lte('date', weekEnd).order('date'),
    supabase.from('posts').select('platform, status, format, created_at')
      .gte('created_at', weekAgo.toISOString()),
  ])

  const campaigns = campaignsResult.data || []
  const posts = postsResult.data || []

  const totalPlanned = posts.length
  const totalPublished = posts.filter(p => p.status === 'published').length
  const publishRate = totalPlanned > 0 ? Math.round((totalPublished / totalPlanned) * 100) : 0

  const platformCounts: Record<string, number> = {}
  posts.filter(p => p.status === 'published').forEach(p => {
    platformCounts[p.platform] = (platformCounts[p.platform] || 0) + 1
  })
  const topPlatform = Object.entries(platformCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'None'

  let reportText = `Week of ${weekStart} to ${weekEnd}\n\n📊 ${totalPublished}/${totalPlanned} posts published (${publishRate}% publish rate)\n🏆 Top platform: ${topPlatform}`
  let recommendations: string[] = [
    'Connect remaining social accounts to increase reach',
    'Review published posts performance on each platform',
  ]

  try {
    const { content } = await runAgent(
      'analyst',
      `You are a marketing analyst for ForgCV (${FORGCV_CONTEXT}). Write a brief weekly report.`,
      `Weekly Marketing Report: ${weekStart} to ${weekEnd}

Campaigns run: ${campaigns.length}
Posts planned: ${totalPlanned}
Posts published: ${totalPublished} (${publishRate}%)
Top platform: ${topPlatform}

Themes this week:
${campaigns.map(c => `- ${c.theme}`).join('\n') || 'None'}

Platform performance:
${Object.entries(platformCounts).map(([p, c]) => `- ${p}: ${c} published`).join('\n') || 'No published posts'}

Write a 3-paragraph weekly report covering what was accomplished, what worked/didn't work, and recommendations for next week. Keep it actionable and specific to ForgCV's growth goals.

Return JSON: {"report_text": "...", "recommendations": ["...", "..."]}`,
      1500
    )
    const parsed = parseJSON<{ report_text: string; recommendations: string[] }>(content)
    if (parsed?.report_text) {
      reportText = parsed.report_text
      recommendations = parsed.recommendations || recommendations
    }
  } catch (err) {
    console.error('[WeeklyReport] AI fallback to basic report:', err)
  }

  const data: WeeklyReportData = {
    week_start: weekStart, week_end: weekEnd,
    total_campaigns: campaigns.length,
    total_posts_planned: totalPlanned,
    total_posts_published: totalPublished,
    publish_rate: publishRate,
    top_platform: topPlatform,
    report_text: reportText,
    recommendations,
  }

  await supabase.from('weekly_reports').upsert({
    week_start: weekStart,
    week_end: weekEnd,
    report_text: reportText,
    report_data: data as unknown as Record<string, unknown>,
  }, { onConflict: 'week_start' })

  const telegramText = `📈 <b>Week ${weekStart}</b>\n\n${reportText}\n\n💡 <b>Next week:</b>\n${recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
  await sendWeeklyReport(telegramText, appUrl)

  await supabase.from('system_events').insert({
    event_type: 'weekly_report',
    status: 'success',
    message: `Weekly report generated: ${totalPublished}/${totalPlanned} posts published (${publishRate}%)`,
  })

  return data
}
