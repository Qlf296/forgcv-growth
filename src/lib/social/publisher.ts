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

// Get the stored access token for a platform from Supabase, fallback to env var
async function getPlatformToken(platform: string): Promise<{ token: string | null; accountId?: string; personUrn?: string }> {
  const supabase = createSupabaseServer()
  const { data } = await supabase
    .from('social_accounts')
    .select('access_token_encrypted, platform_account_id, is_connected')
    .eq('platform', platform)
    .single()

  if (data?.access_token_encrypted && data.is_connected) {
    return {
      token: data.access_token_encrypted,
      accountId: data.platform_account_id || undefined,
      personUrn: data.platform_account_id?.startsWith('urn:') ? data.platform_account_id : undefined,
    }
  }

  // Env var fallback
  const envMap: Record<string, string | undefined> = {
    instagram: process.env.INSTAGRAM_ACCESS_TOKEN,
    linkedin: process.env.LINKEDIN_ACCESS_TOKEN,
    twitter: process.env.TWITTER_ACCESS_TOKEN,
    reddit: undefined,
    tiktok: process.env.TIKTOK_ACCESS_TOKEN,
  }
  return { token: envMap[platform] || null, accountId: data?.platform_account_id || undefined }
}

export async function publishPost(post: Post): Promise<PublishResult> {
  const supabase = createSupabaseServer()

  await supabase.from('posts').update({
    status: 'publishing',
    updated_at: new Date().toISOString(),
  }).eq('id', post.id)

  let result: { success: boolean; post_id?: string; error?: string }

  try {
    switch (post.platform) {
      case 'instagram': {
        const { token, accountId } = await getPlatformToken('instagram')
        if (!token || !accountId) {
          result = { success: false, error: 'Instagram not connected — visit /api/auth/connect/instagram' }
          break
        }
        const caption = buildInstagramCaption(post)
        if (post.format === 'reel' && post.media_urls?.[0]) {
          result = await publishInstagramReel(post.media_urls[0], caption, undefined, token, accountId)
        } else if (post.format === 'carousel' && post.media_urls?.length) {
          result = await publishInstagramCarousel(post.media_urls, caption, token, accountId)
        } else {
          result = { success: false, error: 'Instagram post requires media URLs (reel or carousel)' }
        }
        break
      }

      case 'linkedin': {
        const { token, personUrn } = await getPlatformToken('linkedin')
        if (!token) {
          result = { success: false, error: 'LinkedIn not connected — visit /api/auth/connect/linkedin' }
          break
        }
        const text = buildLinkedInText(post)
        const urn = personUrn || process.env.LINKEDIN_PERSON_URN
        result = await publishLinkedInPost(text, urn, token)
        break
      }

      case 'reddit': {
        const { subreddit, title, text } = parseRedditContent(post)
        result = await submitRedditPost(subreddit, title, text)
        break
      }

      case 'tiktok': {
        const { token } = await getPlatformToken('tiktok')
        // Inject token via env override for TikTok
        if (token) process.env.TIKTOK_ACCESS_TOKEN = token
        result = await publishTikTok(post.media_urls?.[0] || '', post.caption || '')
        if (!result.success && (result as { assisted_payload?: unknown }).assisted_payload) {
          await supabase.from('posts').update({
            status: 'failed',
            failure_reason: 'TikTok — assisted publishing required (upload manually)',
          }).eq('id', post.id)
          return {
            post_id_db: post.id,
            platform: post.platform,
            success: false,
            error: 'TikTok requires manual upload — content prepared in dashboard',
          }
        }
        break
      }

      case 'twitter': {
        const { token } = await getPlatformToken('twitter')
        if (!token) {
          result = { success: false, error: 'Twitter not connected — visit /api/auth/connect/twitter' }
          break
        }
        result = await publishTwitterPost(post, token)
        break
      }

      default:
        result = { success: false, error: `Platform ${post.platform} not supported` }
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
        status: 'failed',
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
  const hashtags = (post.hashtags || []).map((h: string) => `#${h}`).join(' ')
  return `${post.caption}\n\n${hashtags}`.trim()
}

function buildLinkedInText(post: Post): string {
  return post.caption || ''
}

function parseRedditContent(post: Post): { subreddit: string; title: string; text: string } {
  const subredditMatch = post.caption?.match(/r\/([a-zA-Z0-9_]+)/)
  const subreddit = subredditMatch ? subredditMatch[1] : 'resumes'
  return { subreddit, title: post.title || 'ForgCV — Free CV Builder', text: post.caption || '' }
}

async function publishTwitterPost(
  post: Post,
  token: string
): Promise<{ success: boolean; post_id?: string; error?: string }> {
  try {
    const res = await fetch('https://api.twitter.com/2/tweets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: (post.caption || '').substring(0, 280) }),
    })
    const data = await res.json() as { data?: { id: string }; detail?: string }
    if (data.data?.id) return { success: true, post_id: data.data.id }
    return { success: false, error: data.detail || 'Twitter post failed' }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

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

  await supabase.from('campaigns').update({
    status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', campaignId)

  return { scheduled, failed }
}

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
    results.push(await publishPost(post as Post))
  }
  return results
}
