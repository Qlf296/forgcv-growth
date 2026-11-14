import { NextResponse } from 'next/server'
import { publishScheduledPosts } from '@/lib/social/publisher'

export const dynamic = 'force-dynamic'

// POST /api/publish/now
// Called by dashboard "Publish Now" button OR external cron (cron-job.org / Supabase pg_cron)
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // Allow both CRON_SECRET header AND direct calls from dashboard (no secret)
  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await publishScheduledPosts()
    const published = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      processed: results.length,
      published,
      failed,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
