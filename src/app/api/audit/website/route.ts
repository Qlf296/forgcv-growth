import { NextResponse } from 'next/server'
import { runWebsiteAudit } from '@/lib/intelligence/website-audit'
import { createSupabaseServer } from '@/lib/db/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const body = await request.json().catch(() => ({})) as { manual?: boolean }

  const isAuthorized =
    (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) ||
    body.manual === true

  if (!isAuthorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await runWebsiteAudit()
    return NextResponse.json({ success: true, audit: result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET() {
  const supabase = createSupabaseServer()
  const today = new Date().toISOString().slice(0, 10)

  const { data } = await supabase.from('website_audits')
    .select('*').eq('date', today).single()

  return NextResponse.json({ audit: data || null })
}
