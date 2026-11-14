import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { createSupabaseServer } from '@/lib/db/server'

// GET /api/campaigns — list all campaigns
export async function GET(request: Request) {
  const supabase = createSupabaseServer()
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '10')

  const { data, error } = await supabase
    .from('campaigns')
    .select('*, posts(id, platform, status, scheduled_at, title, format)')
    .order('date', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ campaigns: data })
}
