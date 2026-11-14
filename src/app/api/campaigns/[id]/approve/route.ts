import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'
import { scheduleApprovedCampaign } from '@/lib/social/publisher'

// POST /api/campaigns/[id]/approve
// One-click approval: approve all posts in a campaign
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const campaignId = params.id

  try {
    // Verify campaign exists and is awaiting approval
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, status, date')
      .eq('id', campaignId)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    if (campaign.status === 'published') {
      return NextResponse.json({ error: 'Campaign already published' }, { status: 400 })
    }

    // Approve all awaiting_approval posts
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('campaign_id', campaignId)
      .eq('status', 'awaiting_approval')
      .select()

    if (postsError) {
      return NextResponse.json({ error: postsError.message }, { status: 500 })
    }

    // Schedule all approved posts
    const { scheduled, failed } = await scheduleApprovedCampaign(campaignId)

    return NextResponse.json({
      success: true,
      campaign_id: campaignId,
      posts_approved: posts?.length || 0,
      posts_scheduled: scheduled,
      posts_failed_to_schedule: failed,
      message: `Campaign approved! ${scheduled} posts scheduled for publishing.`,
    })

  } catch (err) {
    console.error('[Approve] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
