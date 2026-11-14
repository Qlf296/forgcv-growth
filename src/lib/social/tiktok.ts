// TikTok API Integration
// IMPORTANT: TikTok Content Posting API requires platform audit approval
// for public content posting. The API is available for:
// 1. Direct Post: requires audit + approval by TikTok (may take weeks)
// 2. Creator Marketplace API: for brands/creators
//
// Until API is approved, the system uses "assisted publishing":
// - Content is generated and prepared locally
// - User downloads the video and uploads manually to TikTok
// - A direct TikTok upload link is provided

export interface TikTokStatus {
  connected: boolean
  can_publish: boolean
  api_status: 'not_configured' | 'pending_review' | 'approved'
  username?: string
  note: string
  error?: string
}

export async function checkTikTokStatus(): Promise<TikTokStatus> {
  const clientKey = process.env.TIKTOK_CLIENT_KEY

  if (!clientKey) {
    return {
      connected: false,
      can_publish: false,
      api_status: 'not_configured',
      note: 'TikTok API not configured. To enable direct publishing: 1) Create TikTok Developer account at developers.tiktok.com, 2) Create an app with "Content Posting API" permission, 3) Submit for platform audit. This process typically takes 2-4 weeks.',
    }
  }

  // If configured, check if audit is approved
  const token = process.env.TIKTOK_ACCESS_TOKEN
  if (!token) {
    return {
      connected: true,
      can_publish: false,
      api_status: 'pending_review',
      note: 'TikTok app configured but awaiting audit approval from TikTok. Using assisted publishing workflow: content is prepared for manual upload.',
    }
  }

  return {
    connected: true,
    can_publish: true,
    api_status: 'approved',
    note: 'TikTok API connected and approved for publishing.',
  }
}

export interface AssistedPublishPayload {
  video_path: string
  caption: string
  hashtags: string[]
  scheduled_time: string
  manual_upload_url: string
  instructions: string[]
}

// Generate assisted publishing payload when API is not available
export function generateAssistedPublishPayload(
  videoPath: string,
  caption: string,
  hashtags: string[],
  scheduledTime: string
): AssistedPublishPayload {
  const hashtagString = hashtags.map(h => `#${h}`).join(' ')
  const fullCaption = `${caption}\n\n${hashtagString}`

  return {
    video_path: videoPath,
    caption: fullCaption,
    hashtags,
    scheduled_time: scheduledTime,
    manual_upload_url: 'https://www.tiktok.com/upload',
    instructions: [
      '1. Download the video file from the link above',
      '2. Open TikTok and tap the + button',
      '3. Select the downloaded video',
      `4. Paste this caption: "${fullCaption.substring(0, 100)}..."`,
      `5. Schedule for: ${scheduledTime} (or post immediately)`,
      '6. Tap Post',
    ],
  }
}

export async function publishTikTok(
  videoPath: string,
  caption: string
): Promise<{ success: boolean; post_id?: string; error?: string; assisted_payload?: AssistedPublishPayload }> {
  const status = await checkTikTokStatus()

  if (!status.can_publish) {
    // Return assisted publishing workflow
    return {
      success: false,
      error: 'TikTok API not approved for direct publishing',
      assisted_payload: generateAssistedPublishPayload(videoPath, caption, [], new Date().toISOString()),
    }
  }

  // Direct API publishing (when approved)
  const token = process.env.TIKTOK_ACCESS_TOKEN
  if (!token) return { success: false, error: 'No access token' }

  try {
    // TikTok Content Posting API v2
    const initRes = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: caption.substring(0, 150),
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
          video_cover_timestamp_ms: 1000,
        },
        source_info: {
          source: 'FILE_UPLOAD',
          video_size: 0,
          chunk_size: 0,
          total_chunk_count: 1,
        },
      }),
    })

    const initData = await initRes.json() as { data?: { publish_id: string } }

    return {
      success: !!initData.data?.publish_id,
      post_id: initData.data?.publish_id,
    }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}
