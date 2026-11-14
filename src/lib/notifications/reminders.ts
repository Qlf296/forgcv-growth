import { createSupabaseServer } from '@/lib/db/server'
import { sendPostReminder } from './telegram'
import type { Post } from '@/types'

export async function schedulePostReminders(campaignId: string): Promise<void> {
  const supabase = createSupabaseServer()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, scheduled_at')
    .eq('campaign_id', campaignId)
    .in('status', ['scheduled', 'approved'])

  if (!posts?.length) return

  for (const post of posts) {
    // Cancel any existing pending reminders for this post
    await supabase.from('reminders')
      .update({ status: 'cancelled' })
      .eq('post_id', post.id)
      .eq('status', 'pending')

    const scheduledAt = new Date(post.scheduled_at)

    // Evening = 19:00 UTC (20:00 Amsterdam), on the same calendar day
    const evening = new Date(scheduledAt)
    evening.setUTCHours(19, 0, 0, 0)
    // If evening is in the past relative to scheduled, push to same day 19:00 UTC
    if (evening <= scheduledAt) {
      // Already past evening — still create it, processor will skip if post is done
    }

    const reminders = [
      { reminder_type: 'initial', scheduled_at: scheduledAt.toISOString() },
      { reminder_type: 'followup_30m', scheduled_at: new Date(scheduledAt.getTime() + 30 * 60_000).toISOString() },
      { reminder_type: 'followup_2h', scheduled_at: new Date(scheduledAt.getTime() + 2 * 3_600_000).toISOString() },
      { reminder_type: 'evening', scheduled_at: evening.toISOString() },
    ]

    await supabase.from('reminders').insert(
      reminders.map(r => ({
        post_id: post.id,
        campaign_id: campaignId,
        ...r,
        status: 'pending',
      }))
    )
  }
}

export async function cancelPostReminders(postId: string): Promise<void> {
  const supabase = createSupabaseServer()
  await supabase.from('reminders')
    .update({ status: 'cancelled' })
    .eq('post_id', postId)
    .eq('status', 'pending')
}

export async function rescheduleReminder(postId: string, minutesFromNow: number): Promise<void> {
  const supabase = createSupabaseServer()
  await cancelPostReminders(postId)

  const { data: post } = await supabase
    .from('posts').select('campaign_id').eq('id', postId).single()
  if (!post) return

  await supabase.from('reminders').insert({
    post_id: postId,
    campaign_id: post.campaign_id,
    reminder_type: 'followup_30m',
    scheduled_at: new Date(Date.now() + minutesFromNow * 60_000).toISOString(),
    status: 'pending',
  })
}

export async function processReminders(): Promise<{ sent: number; skipped: number; errors: number }> {
  const supabase = createSupabaseServer()
  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'

  const { data: dueReminders } = await supabase
    .from('reminders')
    .select('*, posts(*), campaigns(theme)')
    .eq('status', 'pending')
    .lte('scheduled_at', now.toISOString())
    .limit(20)

  if (!dueReminders?.length) return { sent: 0, skipped: 0, errors: 0 }

  let sent = 0, skipped = 0, errors = 0

  for (const reminder of dueReminders) {
    try {
      const post = reminder.posts as Post | null
      const campaign = reminder.campaigns as { theme: string } | null

      // Post already done — cancel all its reminders
      if (!post || ['published', 'cancelled', 'failed'].includes(post.status)) {
        await supabase.from('reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
        skipped++
        continue
      }

      const isFollowUp = reminder.reminder_type !== 'initial'
      const result = await sendPostReminder(
        post as Post & { utm_source?: string },
        campaign?.theme || 'Campaign',
        appUrl,
        isFollowUp
      )

      if (result.ok) {
        await supabase.from('reminders').update({
          status: 'sent',
          sent_at: now.toISOString(),
          telegram_message_id: result.message_id ?? null,
        }).eq('id', reminder.id)
        sent++
      } else {
        errors++
      }
    } catch (err) {
      console.error('[Reminders] Error:', err)
      errors++
    }
  }

  // Log to system_events
  await supabase.from('system_events').insert({
    event_type: 'reminders_processed',
    status: errors > 0 ? 'warning' : 'success',
    message: `Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}`,
    metadata: { sent, skipped, errors },
  })

  return { sent, skipped, errors }
}
