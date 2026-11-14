// Reddit API Integration
// Requires: Reddit app at reddit.com/prefs/apps (script type)
// IMPORTANT: Reddit requires genuine community participation — never spam

const BASE_URL = 'https://www.reddit.com'
const OAUTH_URL = 'https://oauth.reddit.com'

let _accessToken: string | null = null
let _tokenExpiry = 0

async function getAccessToken(): Promise<string | null> {
  if (_accessToken && Date.now() < _tokenExpiry) return _accessToken

  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  const username = process.env.REDDIT_USERNAME
  const password = process.env.REDDIT_PASSWORD

  if (!clientId || !clientSecret || !username || !password) return null

  try {
    const res = await fetch(`${BASE_URL}/api/v1/access_token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ForgCV-Growth-Bot/1.0',
      },
      body: `grant_type=password&username=${username}&password=${encodeURIComponent(password)}`,
    })

    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (data.access_token) {
      _accessToken = data.access_token
      _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000
      return _accessToken
    }
  } catch {}

  return null
}

export interface RedditStatus {
  connected: boolean
  can_publish: boolean
  username?: string
  note?: string
  error?: string
}

export async function checkRedditConnection(): Promise<RedditStatus> {
  const clientId = process.env.REDDIT_CLIENT_ID

  if (!clientId) {
    return {
      connected: false,
      can_publish: false,
      note: 'Reddit app not configured. Create a "script" type app at reddit.com/prefs/apps',
    }
  }

  const token = await getAccessToken()
  if (!token) {
    return { connected: false, can_publish: false, error: 'Authentication failed' }
  }

  try {
    const res = await fetch(`${OAUTH_URL}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ForgCV-Growth-Bot/1.0',
      },
    })
    const data = await res.json() as { name: string }
    return { connected: true, can_publish: true, username: data.name }
  } catch (err) {
    return { connected: false, can_publish: false, error: String(err) }
  }
}

export async function submitRedditPost(
  subreddit: string,
  title: string,
  text: string
): Promise<{ success: boolean; post_id?: string; url?: string; error?: string }> {
  const token = await getAccessToken()
  if (!token) return { success: false, error: 'Reddit not authenticated' }

  try {
    const res = await fetch(`${OAUTH_URL}/api/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': process.env.REDDIT_USER_AGENT || 'ForgCV-Growth-Bot/1.0',
      },
      body: new URLSearchParams({
        kind: 'self',
        sr: subreddit,
        title,
        text,
        resubmit: 'false',
        nsfw: 'false',
      }).toString(),
    })

    const data = await res.json() as {
      json?: {
        data?: { id: string; url: string }
        errors?: [string, string, string][]
      }
    }

    const errors = data.json?.errors
    if (errors && errors.length > 0) {
      return { success: false, error: errors.map(e => e[1]).join(', ') }
    }

    return {
      success: true,
      post_id: data.json?.data?.id,
      url: data.json?.data?.url,
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
