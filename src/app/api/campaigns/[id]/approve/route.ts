import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'
import { scheduleApprovedCampaign } from '@/lib/social/publisher'
import { schedulePostReminders } from '@/lib/notifications/reminders'
import { sendCampaignApprovedConfirmation } from '@/lib/notifications/telegram'
import type { Post } from '@/types'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const campaignId = params.id

  try {
    const { data: campaign } = await supabase
      .from('campaigns').select('id, status').eq('id', campaignId).single()

    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (campaign.status === 'published') return NextResponse.json({ error: 'Already published' }, { status: 400 })

    // Mark all awaiting-approval posts as approved
    const { data: posts, error: postsError } = await supabase
      .from('posts').update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId).eq('status', 'awaiting_approval').select()

    if (postsError) return NextResponse.json({ error: postsError.message }, { status: 500 })

    // Schedule posts (approved → scheduled)
    const { scheduled, failed } = await scheduleApprovedCampaign(campaignId)

    // Create Telegram reminder records
    await schedulePostReminders(campaignId)

    // Send Telegram confirmation with schedule
    const { data: scheduledPosts } = await supabase.from('posts').select('*')
      .eq('campaign_id', campaignId).eq('status', 'scheduled')

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'
    if (scheduledPosts?.length) {
      await sendCampaignApprovedConfirmation(scheduledPosts as Post[], appUrl)
    }

    // Log event
    await supabase.from('system_events').insert({
      event_type: 'campaign_approved',
      status: 'success',
      message: `Campaign ${campaignId} approved. ${scheduled} posts scheduled.`,
    })

    return NextResponse.json({
      success: true,
      campaign_id: campaignId,
      posts_approved: posts?.length || 0,
      posts_scheduled: scheduled,
      posts_failed: failed,
      message: `Campaign approved! ${scheduled} posts scheduled with Telegram reminders.`,
    })
  } catch (err) {
    console.error('[Approve] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
