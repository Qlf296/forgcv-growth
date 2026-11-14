import { runAgent, FORGCV_CONTEXT, buildDateContext, parseJSON } from './base'
import type { PostBrief } from './cmo'

export interface WrittenPost {
  platform: string
  format: string
  title: string
  caption: string
  hashtags: string[]
  cta: string
  destination_url: string
  scheduled_time: string
  objective: string
  target_audience: string
  expected_kpi: string
  strategy_explanation: string
  media_description: string
  media_type: 'image' | 'video' | 'carousel' | 'text'
  media_urls?: string[]
  media_preview_url?: string
  carousel_slides?: CarouselSlide[]
  video_script?: VideoScript
}

export interface CarouselSlide {
  slide_number: number
  headline: string
  body: string
  visual_description: string
}

export interface VideoScript {
  hook: string
  body: string[]
  cta: string
  duration_seconds: number
  visual_directions: string[]
  voiceover_text: string
  on_screen_text: string[]
}

const FORGCV_BRAND_VOICE = `
Brand voice: Professional yet approachable. Helpful, not salesy.
Never say "FREE" in all-caps. Use "free" naturally.
Avoid jargon. Write for non-native English speakers.
Always accurate — never exaggerate features.
CTA should feel natural, not forced.
`.trim()

// ── Instagram Specialist ─────────────────────────────────────
export async function runInstagramAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  const system = `
You are ForgCV's Instagram & Visual Content Specialist.
${FORGCV_CONTEXT}
${FORGCV_BRAND_VOICE}

Instagram best practices:
- Carousels: 5-10 slides, strong first slide hook, educational value, save-worthy
- Reels: Hook in first 1.5 seconds, 15-45 seconds, trending audio suggestion
- Captions: 150-300 words, hook first line, storytelling, clear CTA at end
- Hashtags: 5-10 relevant tags, mix of niche and broader
- Always ends with a question to boost comments
`.trim()

  const user = `
${buildDateContext(date)}
Brief from CMO: ${JSON.stringify(brief, null, 2)}

Create the complete Instagram ${brief.format} content.
For carousels: provide 5-7 slides with headlines and body text.
For reels: provide a 25-45 second video script.

Return ONLY valid JSON matching the WrittenPost interface with:
- Full caption (hook + body + CTA + hashtags note)
- hashtags array (5-10 items without #)
- media_type and carousel_slides or video_script
- media_description (what the visual should look like for image generation)
`

  const { content } = await runAgent('instagram', system, user, 3500)
  const parsed = parseJSON<WrittenPost>(content)
  if (!parsed) throw new Error('Instagram agent: invalid JSON')
  return { ...parsed, platform: 'instagram' }
}

// ── LinkedIn Specialist ──────────────────────────────────────
export async function runLinkedInAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  const system = `
You are ForgCV's LinkedIn B2C & B2B Specialist.
${FORGCV_CONTEXT}
${FORGCV_BRAND_VOICE}

LinkedIn best practices:
- Posts: 150-300 words, professional tone, storytelling, data-backed
- Start with a bold statement or surprising fact
- Use line breaks generously (1-2 sentences per paragraph)
- End with a question or poll suggestion
- Professional hashtags (3-5 max)
- Carousels (documents): 5-8 slides, educational, shareable
`.trim()

  const user = `
${buildDateContext(date)}
Brief from CMO: ${JSON.stringify(brief, null, 2)}

Create a professional LinkedIn post or carousel.
Return ONLY valid JSON matching the WrittenPost interface.
`

  const { content } = await runAgent('linkedin', system, user, 2048)
  const parsed = parseJSON<WrittenPost>(content)
  if (!parsed) throw new Error('LinkedIn agent: invalid JSON')
  return { ...parsed, platform: 'linkedin' }
}

// ── Reddit Specialist ────────────────────────────────────────
export async function runRedditAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  const system = `
You are ForgCV's Reddit Community Specialist.
${FORGCV_CONTEXT}
${FORGCV_BRAND_VOICE}

Reddit CRITICAL rules:
- NEVER post promotional content disguised as organic
- ALWAYS check and respect subreddit rules before posting
- Provide GENUINE value first — help people, don't sell
- Only mention ForgCV when directly relevant and helpful
- Write like a real community member, not a brand
- Use appropriate tone for each subreddit (professional for r/jobs, casual for r/resumes)

Allowed subreddits for genuine contribution:
r/resumes, r/jobs, r/careerguidance, r/jobsearch, r/GetEmployed, r/cscareerquestions
`.trim()

  const user = `
${buildDateContext(date)}
Brief from CMO: ${JSON.stringify(brief, null, 2)}

Write a genuine Reddit contribution. This should:
1. Identify the specific subreddit and explain why it's appropriate
2. Provide real value (answer a common question, share insights)
3. Only mention ForgCV if 100% natural and not promotional
4. Include a note about subreddit rules to check before posting

Return ONLY valid JSON. Set media_type to "text".
`

  const { content } = await runAgent('reddit', system, user, 2048)
  const parsed = parseJSON<WrittenPost>(content)
  if (!parsed) throw new Error('Reddit agent: invalid JSON')
  return { ...parsed, platform: 'reddit' }
}

// ── X/Twitter Specialist ─────────────────────────────────────
export async function runTwitterAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  const system = `
You are ForgCV's X (Twitter) Specialist.
${FORGCV_CONTEXT}
${FORGCV_BRAND_VOICE}

X/Twitter best practices:
- Tweets: max 280 chars, punchy, conversational
- Threads: 3-7 tweets, numbered, educational
- Hook tweet must stand alone
- End with link or question
- 1-3 hashtags max, only if they add value
`.trim()

  const user = `
${buildDateContext(date)}
Brief from CMO: ${JSON.stringify(brief, null, 2)}

Write a compelling X/Twitter post or thread.
If thread: provide each tweet as a separate item in a carousel_slides array (use headline for tweet text).
Return ONLY valid JSON.
`

  const { content } = await runAgent('twitter', system, user, 1500)
  const parsed = parseJSON<WrittenPost>(content)
  if (!parsed) throw new Error('Twitter agent: invalid JSON')
  return { ...parsed, platform: 'twitter' }
}

// ── TikTok Producer ──────────────────────────────────────────
export async function runTikTokAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  const system = `
You are ForgCV's TikTok & Short Video Producer.
${FORGCV_CONTEXT}
${FORGCV_BRAND_VOICE}

TikTok best practices:
- Hook: First 1-2 seconds must stop the scroll — use a bold claim or surprising stat
- Duration: 15-45 seconds optimal
- Script: Conversational, fast-paced, direct
- Subtitles: Every word must have an on-screen text
- CTA: "Link in bio" → https://forgcv.com
- Format: Vertical 9:16, 1080x1920

NOTE: TikTok API requires platform audit approval for public posting.
This content will be prepared for MANUAL UPLOAD or future API activation.
`.trim()

  const user = `
${buildDateContext(date)}
Brief from CMO: ${JSON.stringify(brief, null, 2)}

Create a complete TikTok video concept with:
1. Opening hook (first 2 seconds)
2. Full voiceover script
3. On-screen text for each moment
4. Visual direction notes
5. Caption and hashtags

Return ONLY valid JSON with video_script populated.
`

  const { content } = await runAgent('tiktok', system, user, 3000)
  const parsed = parseJSON<WrittenPost>(content)
  if (!parsed) throw new Error('TikTok agent: invalid JSON')
  return { ...parsed, platform: 'tiktok' }
}

// ── Quality Control ──────────────────────────────────────────
export interface QCResult {
  approved: boolean
  score: number // 0-100
  issues: string[]
  suggestions: string[]
  final_caption?: string // corrected if needed
}

export async function runQualityControl(post: WrittenPost): Promise<QCResult> {
  const system = `
You are the Quality Control specialist for ForgCV's marketing.
${FORGCV_CONTEXT}
Review every post before it enters the approval queue.

Check for:
1. Accuracy — no false claims about ForgCV features
2. Grammar and spelling — professional English
3. Brand voice consistency
4. Platform appropriateness
5. CTA correctness — links must go to forgcv.com pages
6. No copyright issues
7. No spam patterns
8. Appropriate hashtags

Return JSON: {approved: boolean, score: 0-100, issues: [], suggestions: [], final_caption: "corrected if needed"}
`.trim()

  const user = `Review this post:\n${JSON.stringify(post, null, 2)}`

  const { content } = await runAgent('quality_control', system, user, 1024)
  const parsed = parseJSON<QCResult>(content)
  return parsed || { approved: true, score: 80, issues: [], suggestions: [] }
}
