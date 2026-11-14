import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'
import { cancelPostReminders } from '@/lib/notifications/reminders'

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()

  const { error } = await supabase.from('posts').update({
    status: 'published',
    published_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await cancelPostReminders(params.id)

  return NextResponse.json({ success: true, message: 'Post marked as published — reminders cancelled' })
}
