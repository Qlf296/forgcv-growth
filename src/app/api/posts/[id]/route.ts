import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'

// PATCH /api/posts/[id] — update post (edit caption, reschedule, cancel)
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()
  const body = await request.json() as Record<string, unknown>

  // Only allow safe fields to be updated
  const allowed = ['caption', 'scheduled_at', 'status', 'hashtags', 'title', 'cta']
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  // Prevent re-publishing already published posts
  if (updates.status === 'published') {
    return NextResponse.json({ error: 'Cannot manually mark as published' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('posts')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}

// DELETE /api/posts/[id] — cancel a post
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServer()

  const { data: post } = await supabase.from('posts').select('status').eq('id', params.id).single()

  if (post?.status === 'published') {
    return NextResponse.json({ error: 'Cannot cancel published post' }, { status: 400 })
  }

  const { error } = await supabase.from('posts').update({
    status: 'cancelled',
    updated_at: new Date().toISOString(),
  }).eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
