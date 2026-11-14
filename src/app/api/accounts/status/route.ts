import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { checkInstagramConnection } from '@/lib/social/instagram'
import { checkLinkedInConnection } from '@/lib/social/linkedin'
import { checkRedditConnection } from '@/lib/social/reddit'
import { checkTikTokStatus } from '@/lib/social/tiktok'
import { createSupabaseServer } from '@/lib/db/server'

// GET /api/accounts/status — check all social account connections
export async function GET() {
  const [instagram, linkedin, reddit, tiktok] = await Promise.allSettled([
    checkInstagramConnection(),
    checkLinkedInConnection(),
    checkRedditConnection(),
    checkTikTokStatus(),
  ])

  const statuses = {
    instagram: instagram.status === 'fulfilled' ? instagram.value : { connected: false, can_publish: false, error: 'Check failed' },
    linkedin: linkedin.status === 'fulfilled' ? linkedin.value : { connected: false, can_publish: false, error: 'Check failed' },
    reddit: reddit.status === 'fulfilled' ? reddit.value : { connected: false, can_publish: false, error: 'Check failed' },
    tiktok: tiktok.status === 'fulfilled' ? tiktok.value : { connected: false, can_publish: false, error: 'Check failed' },
    twitter: {
      connected: !!process.env.TWITTER_ACCESS_TOKEN,
      can_publish: !!process.env.TWITTER_ACCESS_TOKEN,
      note: !process.env.TWITTER_ACCESS_TOKEN ? 'Configure TWITTER_ACCESS_TOKEN in .env' : undefined,
    },
  }

  // Update DB with current status
  const supabase = createSupabaseServer()

  for (const [platform, status] of Object.entries(statuses)) {
    await supabase.from('social_accounts').update({
      is_connected: status.connected,
      can_publish: status.can_publish,
      connection_status: status.connected
        ? (status.can_publish ? 'connected' : 'permission_required')
        : 'disconnected',
      updated_at: new Date().toISOString(),
    }).eq('platform', platform)
  }

  const connected = Object.values(statuses).filter(s => s.connected).length
  const publishable = Object.values(statuses).filter(s => s.can_publish).length

  return NextResponse.json({
    statuses,
    summary: {
      total: 5,
      connected,
      publishable,
      action_required: 5 - publishable,
    },
  })
}
