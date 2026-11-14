import { NextResponse } from 'next/server'
import { publishScheduledPosts } from '@/lib/social/publisher'

// POST /api/webhooks/cron
// Called by Vercel Cron every 15 minutes to publish scheduled posts
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = await publishScheduledPosts()

    const published = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    console.log(`[Cron] Published: ${published}, Failed: ${failed}`)

    return NextResponse.json({
      processed: results.length,
      published,
      failed,
      timestamp: new Date().toISOString(),
    })

  } catch (err) {
    console.error('[Cron] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
