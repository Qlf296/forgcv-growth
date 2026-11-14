// Instagram Graph API — requires Meta Developer App + Instagram Professional Account

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

export async function checkInstagramConnection(
  token?: string,
  accountId?: string
): Promise<InstagramStatus> {
  const t = token || process.env.INSTAGRAM_ACCESS_TOKEN
  const id = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID

  if (!t || !id) {
    return {
      connected: false,
      can_publish: false,
      note: 'Not connected. Click "Connect" to link your Instagram Business Account.',
    }
  }

  try {
    const res = await fetch(
      `${BASE_URL}/${id}?fields=id,username,followers_count,media_count&access_token=${t}`
    )
    if (!res.ok) {
      const err = await res.json() as { error: { message: string } }
      return { connected: false, can_publish: false, error: err.error?.message }
    }
    const data = await res.json() as { id: string; username: string; followers_count: number }
    return { connected: true, can_publish: true, username: data.username, account_id: data.id, follower_count: data.followers_count }
  } catch (err) {
    return { connected: false, can_publish: false, error: String(err) }
  }
}

export async function publishInstagramCarousel(
  imageUrls: string[],
  caption: string,
  token?: string,
  accountId?: string
): Promise<{ success: boolean; post_id?: string; error?: string }> {
  const t = token || process.env.INSTAGRAM_ACCESS_TOKEN
  const id = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (!t || !id) return { success: false, error: 'Instagram not configured' }

  try {
    const childIds: string[] = []
    for (const url of imageUrls) {
      const res = await fetch(`${BASE_URL}/${id}/media`, {
        method: 'POST',
        body: new URLSearchParams({ image_url: url, is_carousel_item: 'true', access_token: t }),
      })
      const data = await res.json() as { id?: string; error?: { message: string } }
      if (!data.id) return { success: false, error: data.error?.message || 'Failed to upload image' }
      childIds.push(data.id)
    }

    const carouselRes = await fetch(`${BASE_URL}/${id}/media`, {
      method: 'POST',
      body: new URLSearchParams({ media_type: 'CAROUSEL', children: childIds.join(','), caption, access_token: t }),
    })
    const carouselData = await carouselRes.json() as { id?: string; error?: { message: string } }
    if (!carouselData.id) return { success: false, error: carouselData.error?.message }

    const publishRes = await fetch(`${BASE_URL}/${id}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: carouselData.id, access_token: t }),
    })
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
    return publishData.id ? { success: true, post_id: publishData.id } : { success: false, error: publishData.error?.message }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

export async function publishInstagramReel(
  videoUrl: string,
  caption: string,
  coverUrl?: string,
  token?: string,
  accountId?: string
): Promise<{ success: boolean; post_id?: string; error?: string }> {
  const t = token || process.env.INSTAGRAM_ACCESS_TOKEN
  const id = accountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID
  if (!t || !id) return { success: false, error: 'Instagram not configured' }

  try {
    const params: Record<string, string> = { media_type: 'REELS', video_url: videoUrl, caption, access_token: t }
    if (coverUrl) params.cover_url = coverUrl

    const res = await fetch(`${BASE_URL}/${id}/media`, { method: 'POST', body: new URLSearchParams(params) })
    const data = await res.json() as { id?: string; error?: { message: string } }
    if (!data.id) return { success: false, error: data.error?.message }

    // Poll for processing
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 10000))
      const statusRes = await fetch(`${BASE_URL}/${data.id}?fields=status_code&access_token=${t}`)
      const status = await statusRes.json() as { status_code?: string }
      if (status.status_code === 'FINISHED') break
      if (status.status_code === 'ERROR') return { success: false, error: 'Video processing failed' }
    }

    const publishRes = await fetch(`${BASE_URL}/${id}/media_publish`, {
      method: 'POST',
      body: new URLSearchParams({ creation_id: data.id, access_token: t }),
    })
    const publishData = await publishRes.json() as { id?: string; error?: { message: string } }
    return publishData.id ? { success: true, post_id: publishData.id } : { success: false, error: publishData.error?.message }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
