import type { Post } from '@/types'
import { createSupabaseServer } from '@/lib/db/server'
import { publishInstagramCarousel, publishInstagramReel } from './instagram'
import { publishLinkedInPost } from './linkedin'
import { submitRedditPost } from './reddit'
import { publishTikTok } from './tiktok'
import { sendPublishNotification } from '@/lib/notifications/telegram'

export interface PublishResult {
  post_id_db: string
  platform: string
  success: boolean
  platform_post_id?: string
  error?: string
}

export async function publishPost(post: Post): Promise<PublishResult> {
  const supabase = createSupabaseServer()

  // Mark as publishing
  await supabase.from('posts').update({
    status: 'publishing',
    updated_at: new Date().toISOString(),
  }).eq('id', post.id)

  let result: { success: boolean; post_id?: string; error?: string }

  try {
    switch (post.platform) {
      case 'instagram': {
        const caption = buildInstagramCaption(post)
        if (post.format === 'reel' && post.media_urls[0]) {
          result = await publishInstagramReel(post.media_urls[0], caption)
        } else if (post.format === 'carousel') {
          result = await publishInstagramCarousel(post.media_urls, caption)
        } else {
          result = { success: false, error: `Unsupported format: ${post.format}` }
        }
        break
      }

      case 'linkedin': {
        const text = buildLinkedInText(post)
        result = await publishLinkedInPost(text)
        break
      }

      case 'reddit': {
        const { subreddit, text } = parseRedditContent(post)
        result = await submitRedditPost(subreddit, post.title, text)
        break
      }

      case 'tiktok': {
        result = await publishTikTok(post.media_urls[0] || '', post.caption)
        // TikTok may return assisted_payload — store it
        if (!result.success && (result as { assisted_payload?: unknown }).assisted_payload) {
          await supabase.from('posts').update({
            status: 'failed',
            failure_reason: 'TikTok API pending review — assisted publishing required',
          }).eq('id', post.id)

          return {
            post_id_db: post.id,
            platform: post.platform,
            success: false,
            error: 'TikTok requires manual upload — video prepared in dashboard',
          }
        }
        break
      }

      case 'twitter': {
        result = await publishTwitterPost(post)
        break
      }

      default:
        result = { success: false, error: `Platform ${post.platform} not yet integrated` }
    }

    if (result.success) {
      await supabase.from('posts').update({
        status: 'published',
        platform_post_id: result.post_id,
        published_at: new Date().toISOString(),
      }).eq('id', post.id)

      await sendPublishNotification(post, true)
    } else {
      const retryCount = (post.retry_count || 0) + 1
      await supabase.from('posts').update({
        status: retryCount < 3 ? 'failed' : 'failed',
        failure_reason: result.error,
        retry_count: retryCount,
      }).eq('id', post.id)

      await sendPublishNotification({ ...post, failure_reason: result.error }, false)
    }

    return {
      post_id_db: post.id,
      platform: post.platform,
      success: result.success,
      platform_post_id: result.post_id,
      error: result.error,
    }

  } catch (err) {
    const error = String(err)
    await supabase.from('posts').update({
      status: 'failed',
      failure_reason: error,
      retry_count: (post.retry_count || 0) + 1,
    }).eq('id', post.id)

    return { post_id_db: post.id, platform: post.platform, success: false, error }
  }
}

function buildInstagramCaption(post: Post): string {
  const hashtags = post.hashtags.map((h: string) => `#${h}`).join(' ')
  return `${post.caption}\n\n${hashtags}`
}

function buildLinkedInText(post: Post): string {
  return post.caption
}

function parseRedditContent(post: Post): { subreddit: string; text: string } {
  // Extract subreddit from metadata or default
  const subredditMatch = post.caption.match(/r\/([a-zA-Z0-9_]+)/)
  const subreddit = subredditMatch ? subredditMatch[1] : 'resumes'
  return { subreddit, text: post.caption }
}

async function publishTwitterPost(post: Post): Promise<{ success: boolean; post_id?: string; error?: string }> {
  const { default: axios } = await import('axios')
  const token = process.env.TWITTER_ACCESS_TOKEN

  if (!token) return { success: false, error: 'Twitter not configured' }

  try {
    const res = await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: post.caption.substring(0, 280) },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return { success: true, post_id: res.data?.data?.id }
  } catch (err: unknown) {
    const e = err as { response?: { data?: { detail?: string } } }
    return { success: false, error: e.response?.data?.detail || String(err) }
  }
}

// Schedule all approved posts for a campaign
export async function scheduleApprovedCampaign(campaignId: string): Promise<{ scheduled: number; failed: number }> {
  const supabase = createSupabaseServer()

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'approved')

  if (!posts?.length) return { scheduled: 0, failed: 0 }

  let scheduled = 0
  let failed = 0

  for (const post of posts) {
    const { error } = await supabase.from('posts').update({
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    }).eq('id', post.id)

    if (error) failed++
    else scheduled++
  }

  // Also update campaign status
  await supabase.from('campaigns').update({
    status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', campaignId)

  return { scheduled, failed }
}

// Check and publish posts that are due
export async function publishScheduledPosts(): Promise<PublishResult[]> {
  const supabase = createSupabaseServer()
  const now = new Date()

  const { data: posts } = await supabase
    .from('posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString())
    .lt('retry_count', 3)

  if (!posts?.length) return []

  const results: PublishResult[] = []
  for (const post of posts) {
    const result = await publishPost(post as Post)
    results.push(result)
  }

  return results
}
