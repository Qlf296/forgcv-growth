// Instagram Graph API Integration
// Requires: Instagram Professional Account + Meta Developer App
// Permissions: instagram_basic, instagram_content_publish, instagram_manage_insights

const BASE_URL = 'https://graph.facebook.com/v19.0'

export interface InstagramStatus {
  connected: boolean
  can_publish: boolean
  username?: string
  account_id?: string
  follower_count?: number
  error?: string
  note?: string
}

export async function checkInstagramConnection(): Promise<InstagramStatus> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!token || !accountId) {
    return {
      connected: false,
      can_publish: false,
      note: 'INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID not configured. Set up Meta Developer App at developers.facebook.com',
    }
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${accountId}?fields=id,username,followers_count,media_count&access_token=${token}`
    )

    if (!res.ok) {
      const err = await res.json() as { error: { message: string } }
      return {
        connected: false,
        can_publish: false,
        error: err.error?.message || 'API error',
        note: 'Token may be expired. Refresh at Meta for Developers.',
      }
    }

    const data = await res.json() as { id: string; username: string; followers_count: number }
    return {
      connected: true,
      can_publish: true,
      username: data.username,
      account_id: data.id,
      follower_count: data.followers_count,
    }
  } catch (err) {
    return { connected: false, can_publish: false, error: String(err) }
  }
}

export interface InstagramPublishResult {
  success: boolean
  post_id?: string
  error?: string
}

export async function publishInstagramCarousel(
  imageUrls: string[],
  caption: string
): Promise<InstagramPublishResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!token || !accountId) {
    return { success: false, error: 'Instagram not configured' }
  }

  try {
    // Step 1: Create media containers for each image
    const childIds: string[] = []

    for (const url of imageUrls) {
      const res = await fetch(`${BASE_URL}/${accountId}/media`, {
        method: 'POST',
        body: new URLSearchParams({
          image_url: url,
          is_carousel_item: 'true',
          access_token: token,
        }),
      })
      const data = await res.json() as { id: string; error?: { message: string } }
      if (!data.id) return { success: false, error: data.error?.message || 'Failed to upload image' }
      childIds.push(data.id)
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(`${BASE_URL}/${accountId}/media`, {
      method: 'POST',
      body: new URLSearchParams({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        caption,
        access_token: token,
      }),
    })
    const carouselData = await carouselRes.json() as { id: string; error?: { message: string } }
    if (!carouselData.id) return { success: false, error: carouselData.error?.message }

    // Step 3: Publish
    const publishRes = await fetch(`${BASE_URL}/${accountId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({
        creation_id: carouselData.id,
        access_token: token,
      }),
    })
    const publishData = await publishRes.json() as { id: string; error?: { message: string } }

    if (publishData.id) {
      return { success: true, post_id: publishData.id }
    }

    return { success: false, error: publishData.error?.message || 'Publish failed' }

  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function publishInstagramReel(
  videoUrl: string,
  caption: string,
  coverUrl?: string
): Promise<InstagramPublishResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!token || !accountId) {
    return { success: false, error: 'Instagram not configured' }
  }

  try {
    const params: Record<string, string> = {
      media_type: 'REELS',
      video_url: videoUrl,
      caption,
      access_token: token,
    }
    if (coverUrl) params.cover_url = coverUrl

    const res = await fetch(`${BASE_URL}/${accountId}/media`, {
      method: 'POST',
      body: new URLSearchParams(params),
    })
    const data = await res.json() as { id: string; error?: { message: string } }
    if (!data.id) return { success: false, error: data.error?.message }

    // Poll for processing status
    let attempts = 0
    while (attempts < 10) {
      await new Promise(r => setTimeout(r, 10000))
      const statusRes = await fetch(`${BASE_URL}/${data.id}?fields=status_code&access_token=${token}`)
      const status = await statusRes.json() as { status_code: string }
      if (status.status_code === 'FINISHED') break
      if (status.status_code === 'ERROR') return { success: false, error: 'Video processing failed' }
      attempts++
    }

    const publishRes = await fetch(`${BASE_URL}/${accountId}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: data.id, access_token: token }),
    })
    const publishData = await publishRes.json() as { id: string; error?: { message: string } }

    return publishData.id
      ? { success: true, post_id: publishData.id }
      : { success: false, error: publishData.error?.message }

  } catch (err) {
    return { success: false, error: String(err) }
  }
}
