// LinkedIn API Integration
// Requires: LinkedIn Developer App with w_member_social permission

const BASE_URL = 'https://api.linkedin.com/v2'

export interface LinkedInStatus {
  connected: boolean
  can_publish: boolean
  person_urn?: string
  name?: string
  error?: string
  note?: string
}

export async function checkLinkedInConnection(): Promise<LinkedInStatus> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN

  if (!token) {
    return {
      connected: false,
      can_publish: false,
      note: 'LINKEDIN_ACCESS_TOKEN not configured. Create app at linkedin.com/developers. Required permission: w_member_social',
    }
  }

  try {
    const res = await fetch(`${BASE_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      return { connected: false, can_publish: false, error: 'Token invalid or expired' }
    }

    const data = await res.json() as { id: string; localizedFirstName: string; localizedLastName: string }
    return {
      connected: true,
      can_publish: true,
      person_urn: `urn:li:person:${data.id}`,
      name: `${data.localizedFirstName} ${data.localizedLastName}`,
    }
  } catch (err) {
    return { connected: false, can_publish: false, error: String(err) }
  }
}

export async function publishLinkedInPost(
  text: string,
  personUrn?: string
): Promise<{ success: boolean; post_id?: string; error?: string }> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN
  const urn = personUrn || process.env.LINKEDIN_PERSON_URN

  if (!token || !urn) {
    return { success: false, error: 'LinkedIn not configured' }
  }

  try {
    const body = {
      author: urn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }

    const res = await fetch(`${BASE_URL}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json() as { message: string }
      return { success: false, error: err.message }
    }

    const id = res.headers.get('x-restli-id')
    return { success: true, post_id: id || undefined }

  } catch (err) {
    return { success: false, error: String(err) }
  }
}
