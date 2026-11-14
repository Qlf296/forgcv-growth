import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'

export async function GET(
  _request: Request,
  { params }: { params: { platform: string } }
) {
  const { platform } = params

  switch (platform) {
    case 'linkedin': {
      const clientId = process.env.LINKEDIN_CLIENT_ID
      if (!clientId) return NextResponse.json({ error: 'LINKEDIN_CLIENT_ID not set' }, { status: 500 })
      const url = new URL('https://www.linkedin.com/oauth/v2/authorization')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/linkedin`)
      url.searchParams.set('scope', 'w_member_social r_liteprofile r_emailaddress')
      url.searchParams.set('state', 'forgcv-linkedin')
      return NextResponse.redirect(url.toString())
    }

    case 'instagram': {
      const appId = process.env.META_APP_ID
      if (!appId) return NextResponse.json({ error: 'META_APP_ID not set' }, { status: 500 })
      const url = new URL('https://www.facebook.com/v19.0/dialog/oauth')
      url.searchParams.set('client_id', appId)
      url.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/instagram`)
      url.searchParams.set('scope', 'instagram_basic,instagram_content_publish,instagram_manage_insights,pages_show_list')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', 'forgcv-instagram')
      return NextResponse.redirect(url.toString())
    }

    case 'twitter': {
      const clientId = process.env.TWITTER_CLIENT_ID
      if (!clientId) return NextResponse.json({ error: 'TWITTER_CLIENT_ID not set' }, { status: 500 })
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      const url = new URL('https://twitter.com/i/oauth2/authorize')
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/twitter`)
      url.searchParams.set('scope', 'tweet.read tweet.write users.read offline.access')
      url.searchParams.set('state', verifier)
      url.searchParams.set('code_challenge', challenge)
      url.searchParams.set('code_challenge_method', 'S256')
      return NextResponse.redirect(url.toString())
    }

    case 'reddit': {
      const clientId = process.env.REDDIT_CLIENT_ID
      if (!clientId) return NextResponse.json({ error: 'REDDIT_CLIENT_ID not set' }, { status: 500 })
      const url = new URL('https://www.reddit.com/api/v1/authorize')
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('state', 'forgcv-reddit')
      url.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/reddit`)
      url.searchParams.set('duration', 'permanent')
      url.searchParams.set('scope', 'submit read identity')
      return NextResponse.redirect(url.toString())
    }

    case 'tiktok': {
      const clientKey = process.env.TIKTOK_CLIENT_KEY
      if (!clientKey) return NextResponse.json({ error: 'TIKTOK_CLIENT_KEY not set' }, { status: 500 })
      const url = new URL('https://www.tiktok.com/v2/auth/authorize/')
      url.searchParams.set('client_key', clientKey)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('scope', 'user.info.basic,video.publish,video.upload')
      url.searchParams.set('redirect_uri', `${APP_URL}/api/auth/callback/tiktok`)
      url.searchParams.set('state', 'forgcv-tiktok')
      return NextResponse.redirect(url.toString())
    }

    default:
      return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })
  }
}

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from({ length: 128 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
