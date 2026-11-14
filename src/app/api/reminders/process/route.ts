import { NextResponse } from 'next/server'
import { processReminders } from '@/lib/notifications/reminders'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')

  if (process.env.CRON_SECRET && authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processReminders()
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() })
  } catch (err) {
    console.error('[Reminders] Process error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
