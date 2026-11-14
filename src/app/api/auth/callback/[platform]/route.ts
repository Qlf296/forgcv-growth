import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'
export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'

export async function GET(
  request: Request,
  { params }: { params: { platform: string } }
) {
  const { platform } = params
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${APP_URL}/dashboard?connect_error=${platform}&reason=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${APP_URL}/dashboard?connect_error=${platform}&reason=no_code`)
  }

  try {
    switch (platform) {
      case 'linkedin': return await handleLinkedIn(code)
      case 'instagram': return await handleInstagram(code)
      case 'twitter': return await handleTwitter(code, url.searchParams.get('state') || '')
      case 'reddit': return await handleReddit(code)
      case 'tiktok': return await handleTikTok(code)
      default:
        return NextResponse.redirect(`${APP_URL}/dashboard?connect_error=unknown_platform`)
    }
  } catch (err) {
    console.error(`[OAuth callback ${platform}]`, err)
    return NextResponse.redirect(`${APP_URL}/dashboard?connect_error=${platform}&reason=${encodeURIComponent(String(err))}`)
  }
}

async function handleLinkedIn(code: string) {
  const clientId = process.env.LINKEDIN_CLIENT_ID!
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/auth/callback/linkedin`

  const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; error?: string }
  if (!tokenData.access_token) throw new Error(tokenData.error || 'No access token')

  // Get profile info
  const profileRes = await fetch('https://api.linkedin.com/v2/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profile = await profileRes.json() as { id: string; localizedFirstName: string; localizedLastName: string }

  const supabase = createSupabaseServer()
  await supabase.from('social_accounts').update({
    is_connected: true,
    can_publish: true,
    connection_status: 'connected',
    access_token_encrypted: tokenData.access_token,
    platform_account_id: `urn:li:person:${profile.id}`,
    display_name: `${profile.localizedFirstName} ${profile.localizedLastName}`,
    updated_at: new Date().toISOString(),
  }).eq('platform', 'linkedin')

  return NextResponse.redirect(`${APP_URL}/dashboard?connected=linkedin`)
}

async function handleInstagram(code: string) {
  const appId = process.env.META_APP_ID!
  const appSecret = process.env.META_APP_SECRET!
  const redirectUri = `${APP_URL}/api/auth/callback/instagram`

  // Exchange code for short-lived token
  const tokenRes = await fetch('https://graph.facebook.com/v19.0/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }),
  })
  const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } }
  if (!tokenData.access_token) throw new Error(tokenData.error?.message || 'No token')

  // Exchange for long-lived token (60 days)
  const longTokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  )
  const longToken = await longTokenRes.json() as { access_token?: string }
  const finalToken = longToken.access_token || tokenData.access_token

  // Get Instagram business account ID
  const pagesRes = await fetch(
    `https://graph.facebook.com/v19.0/me/accounts?access_token=${finalToken}`
  )
  const pages = await pagesRes.json() as { data?: Array<{ id: string; name: string; access_token: string }> }
  const page = pages.data?.[0]
  if (!page) throw new Error('No Facebook page found — Instagram requires a connected Facebook Page')

  const igRes = await fetch(
    `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
  )
  const igData = await igRes.json() as { instagram_business_account?: { id: string } }
  const igAccountId = igData.instagram_business_account?.id
  if (!igAccountId) throw new Error('No Instagram Business Account linked to this Facebook Page')

  // Get Instagram profile
  const igProfileRes = await fetch(
    `https://graph.facebook.com/v19.0/${igAccountId}?fields=username,followers_count&access_token=${page.access_token}`
  )
  const igProfile = await igProfileRes.json() as { username?: string; followers_count?: number }

  const supabase = createSupabaseServer()
  await supabase.from('social_accounts').update({
    is_connected: true,
    can_publish: true,
    connection_status: 'connected',
    access_token_encrypted: page.access_token,
    platform_account_id: igAccountId,
    username: igProfile.username || 'forgcv',
    display_name: igProfile.username || 'ForgCV',
    follower_count: igProfile.followers_count || 0,
    updated_at: new Date().toISOString(),
  }).eq('platform', 'instagram')

  return NextResponse.redirect(`${APP_URL}/dashboard?connected=instagram`)
}

async function handleTwitter(code: string, state: string) {
  const clientId = process.env.TWITTER_CLIENT_ID!
  const redirectUri = `${APP_URL}/api/auth/callback/twitter`

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: state,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string }
  if (!tokenData.access_token) throw new Error(tokenData.error || 'No access token')

  // Get user info
  const userRes = await fetch('https://api.twitter.com/2/users/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const user = await userRes.json() as { data?: { id: string; username: string; name: string } }

  const supabase = createSupabaseServer()
  await supabase.from('social_accounts').update({
    is_connected: true,
    can_publish: true,
    connection_status: 'connected',
    access_token_encrypted: tokenData.access_token,
    refresh_token_encrypted: tokenData.refresh_token || null,
    platform_account_id: user.data?.id,
    username: user.data?.username || 'forgcv',
    display_name: user.data?.name || 'ForgCV',
    updated_at: new Date().toISOString(),
  }).eq('platform', 'twitter')

  return NextResponse.redirect(`${APP_URL}/dashboard?connected=twitter`)
}

async function handleReddit(code: string) {
  const clientId = process.env.REDDIT_CLIENT_ID!
  const clientSecret = process.env.REDDIT_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/auth/callback/reddit`

  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'ForgCV-Growth-Bot/1.0',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string }
  if (!tokenData.access_token) throw new Error(tokenData.error || 'No access token')

  const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'ForgCV-Growth-Bot/1.0',
    },
  })
  const me = await meRes.json() as { name?: string; id?: string }

  const supabase = createSupabaseServer()
  await supabase.from('social_accounts').update({
    is_connected: true,
    can_publish: true,
    connection_status: 'connected',
    access_token_encrypted: tokenData.access_token,
    refresh_token_encrypted: tokenData.refresh_token || null,
    platform_account_id: me.id,
    username: me.name || 'forgcv',
    display_name: me.name || 'ForgCV',
    updated_at: new Date().toISOString(),
  }).eq('platform', 'reddit')

  return NextResponse.redirect(`${APP_URL}/dashboard?connected=reddit`)
}

async function handleTikTok(code: string) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY!
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!
  const redirectUri = `${APP_URL}/api/auth/callback/tiktok`

  const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })

  const tokenData = await tokenRes.json() as { access_token?: string; refresh_token?: string; error?: string }
  if (!tokenData.access_token) throw new Error(tokenData.error || 'No access token')

  const supabase = createSupabaseServer()
  await supabase.from('social_accounts').update({
    is_connected: true,
    can_publish: false,
    connection_status: 'platform_review_required',
    access_token_encrypted: tokenData.access_token,
    refresh_token_encrypted: tokenData.refresh_token || null,
    connection_notes: 'TikTok API connected. Direct publishing requires Content Posting API approval from TikTok (2–4 weeks).',
    updated_at: new Date().toISOString(),
  }).eq('platform', 'tiktok')

  return NextResponse.redirect(`${APP_URL}/dashboard?connected=tiktok`)
}
