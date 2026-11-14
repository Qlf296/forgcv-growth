import { NextResponse } from 'next/server'
import { generateWeeklyReport } from '@/lib/agents/weekly-reporter'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const body = await request.json().catch(() => ({})) as { manual?: boolean }

  const isAuthorized =
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) ||
    body.manual === true

  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'
    const report = await generateWeeklyReport(appUrl)
    return NextResponse.json({ success: true, report })
  } catch (err) {
    console.error('[Weekly Report] Error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
