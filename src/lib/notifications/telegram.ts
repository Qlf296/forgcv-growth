import type { Campaign, Post } from '@/types'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export interface TelegramResult {
  ok: boolean
  message_id?: number
}

interface InlineKeyboard {
  inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>>
}

async function sendTelegramMessage(
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML',
  replyMarkup?: InlineKeyboard
): Promise<TelegramResult> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] Not configured — skipping')
    return { ok: false }
  }
  try {
    const body: Record<string, unknown> = {
      chat_id: CHAT_ID,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    }
    if (replyMarkup) body.reply_markup = replyMarkup

    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      console.error('[Telegram] Send failed:', await res.text())
      return { ok: false }
    }
    const data = await res.json() as { result?: { message_id: number } }
    return { ok: true, message_id: data.result?.message_id }
  } catch (err) {
    console.error('[Telegram] Network error:', err)
    return { ok: false }
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
  }).catch(() => {})
}

export async function editMessageReplyMarkup(messageId: number, replyMarkup: InlineKeyboard): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) return
  await fetch(`${TELEGRAM_API}/editMessageReplyMarkup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, message_id: messageId, reply_markup: replyMarkup }),
  }).catch(() => {})
}

export async function sendDailyBriefing(campaign: Campaign, appUrl: string): Promise<TelegramResult> {
  const date = new Date(campaign.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })

  const statusEmoji: Record<string, string> = {
    instagram: '📸', tiktok: '🎵', linkedin: '💼', reddit: '🤖', twitter: '🐦',
  }

  const pendingPosts = campaign.posts?.filter(p => p.status === 'awaiting_approval') || []

  const postsLines = pendingPosts.map(p => {
    const time = new Date(p.scheduled_at).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
    })
    const preview = (p.title || p.caption || '').slice(0, 55)
    return `${statusEmoji[p.platform] || '📱'} <b>${p.platform.toUpperCase()}</b> ${time}\n   <i>${preview}...</i>`
  }).join('\n\n')

  const perf = campaign.performance_yesterday
  const perfSection = perf
    ? `\n📊 <b>Yesterday</b>\n👥 ${perf.website_visitors} visitors · ${perf.cv_starts} CV starts · ${perf.pdf_downloads} downloads\n`
    : '\n📊 <b>Performance:</b> Building baseline — no historical data yet.\n'

  const message = `🌅 <b>ForgCV — Daily Growth Briefing</b>
📅 ${date}
${perfSection}
🎯 <b>Objective</b>
${campaign.objective}

📋 <b>Theme:</b> <i>${campaign.theme}</i>
👥 <b>Audience:</b> ${campaign.target_audience || 'Job seekers worldwide'}

📱 <b>${pendingPosts.length} post${pendingPosts.length !== 1 ? 's' : ''} ready for your approval</b>

${postsLines}

📝 ${(campaign.strategy_summary || '').slice(0, 220)}...

──────────────────
<i>Tap a button below to manage this campaign ↓</i>`

  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve All Posts', callback_data: `approve:${campaign.id}` },
        { text: '🔄 Request Changes', callback_data: `changes:${campaign.id}` },
      ],
      [
        { text: '❌ Reject Plan', callback_data: `reject:${campaign.id}` },
        { text: '📊 Open Dashboard', url: `${appUrl}/dashboard` },
      ],
    ],
  }

  return sendTelegramMessage(message, 'HTML', keyboard)
}

export async function sendPostReminder(
  post: Post & { utm_source?: string },
  theme: string,
  appUrl: string,
  isFollowUp = false
): Promise<TelegramResult> {
  const time = new Date(post.scheduled_at).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  })
  const statusEmoji: Record<string, string> = {
    instagram: '📸', tiktok: '🎵', linkedin: '💼', reddit: '🤖', twitter: '🐦',
  }
  const hashtags = (post.hashtags || []).slice(0, 10).map((h: string) => `#${h}`).join(' ')
  const captionPreview = (post.caption || '').slice(0, 400)
  const hasMore = (post.caption?.length || 0) > 400

  const steps = getPublishingSteps(post.platform, post.format)

  const header = isFollowUp
    ? `⏰ <b>REMINDER</b> — ${statusEmoji[post.platform] || '📱'}`
    : `${statusEmoji[post.platform] || '📱'}`

  const message = `${header} <b>${post.platform.toUpperCase()} POST READY</b>
⏰ <b>${time}</b> · ${post.format} · Campaign: <i>${theme}</i>
──────────────────
📝 <b>Caption</b>
${captionPreview}${hasMore ? '\n<i>...see dashboard for full text</i>' : ''}

🏷️ <b>Hashtags</b>
<code>${hashtags}</code>

🔗 <b>CTA:</b> ${post.cta || '—'}
🌐 <b>Link:</b> ${post.destination_url || 'https://forgcv.com'}

📋 <b>How to publish</b>
${steps}
──────────────────
<a href="${appUrl}/dashboard">View full content in dashboard ↗</a>`

  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Mark as Published', callback_data: `published:${post.id}` },
        { text: '⏭️ Skip', callback_data: `skip:${post.id}` },
      ],
      [
        { text: '⏰ Remind +30 min', callback_data: `remind:${post.id}:30` },
        { text: '⏰ Remind +2 hours', callback_data: `remind:${post.id}:120` },
      ],
      [{ text: '📊 Open Dashboard', url: `${appUrl}/dashboard` }],
    ],
  }

  return sendTelegramMessage(message, 'HTML', keyboard)
}

function getPublishingSteps(platform: string, format: string): string {
  const steps: Record<string, string> = {
    instagram: `1. Open Instagram → tap ＋\n2. Select ${format === 'reel' ? 'Reel' : format === 'carousel' ? 'Post (multiple photos)' : 'Post'}\n3. Choose your media\n4. Paste the caption above\n5. Put hashtags in the first comment\n6. Tap <b>Share</b>`,
    linkedin: `1. Open LinkedIn → click <b>Start a post</b>\n2. Paste the caption above\n3. Add an image if relevant\n4. Click <b>Post</b>`,
    reddit: `1. Find the subreddit mentioned in the caption\n2. Click <b>Create Post</b>\n3. Paste the title and body text\n4. Submit (check subreddit rules first!)`,
    twitter: `1. Open X/Twitter → click compose ＋\n2. Paste the caption (max 280 chars for single tweet)\n3. Add image if relevant\n4. Click <b>Post</b>`,
    tiktok: `1. Open TikTok → tap ＋\n2. Record or upload your video\n3. Add the caption and hashtags\n4. Paste the link in your bio\n5. Post`,
  }
  return steps[platform] || `1. Open ${platform}\n2. Create a new post\n3. Paste the caption\n4. Publish`
}

export async function sendCampaignApprovedConfirmation(
  posts: (Post & { scheduled_at: string })[],
  appUrl: string
): Promise<TelegramResult> {
  const lines = posts.map(p => {
    const time = new Date(p.scheduled_at).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
    })
    const e: Record<string, string> = { instagram: '📸', tiktok: '🎵', linkedin: '💼', reddit: '🤖', twitter: '🐦' }
    return `${e[p.platform] || '📱'} ${p.platform.toUpperCase()} — ${time}`
  }).join('\n')

  return sendTelegramMessage(
    `✅ <b>Campaign Approved!</b>\n\n${posts.length} post${posts.length !== 1 ? 's' : ''} scheduled:\n${lines}\n\nYou'll receive individual Telegram reminders at each publication time with the full content and step-by-step instructions.\n\n<a href="${appUrl}/dashboard">Open Dashboard ↗</a>`,
    'HTML',
    { inline_keyboard: [[{ text: '📊 Open Dashboard', url: `${appUrl}/dashboard` }]] }
  )
}

export async function sendWeeklyReport(reportText: string, appUrl: string): Promise<TelegramResult> {
  return sendTelegramMessage(
    `📈 <b>ForgCV — Weekly Report</b>\n\n${reportText}\n\n<a href="${appUrl}/dashboard">View Full Analytics ↗</a>`,
    'HTML',
    { inline_keyboard: [[{ text: '📊 Open Dashboard', url: `${appUrl}/dashboard` }]] }
  )
}

export async function sendPublishNotification(post: Post, success: boolean): Promise<boolean> {
  const emoji = success ? '✅' : '❌'
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
  })
  const msg = `${emoji} <b>${success ? 'Published' : 'Failed'}</b> — ${post.platform.toUpperCase()} ${time}\n${post.title || ''}${!success && post.failure_reason ? `\n⚠️ ${post.failure_reason}` : ''}`
  const result = await sendTelegramMessage(msg)
  return result.ok
}

export async function sendSystemAlert(title: string, message: string): Promise<boolean> {
  const result = await sendTelegramMessage(`⚠️ <b>System Alert: ${title}</b>\n${message}`)
  return result.ok
}

export async function sendTelegramText(text: string): Promise<TelegramResult> {
  return sendTelegramMessage(text)
}
