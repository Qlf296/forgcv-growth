import type { Campaign, Post } from '@/types'

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

async function sendTelegramMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] Not configured — skipping notification')
    return false
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: false,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[Telegram] Send failed:', err)
      return false
    }

    return true
  } catch (err) {
    console.error('[Telegram] Network error:', err)
    return false
  }
}

export async function sendDailyBriefing(
  campaign: Campaign,
  appUrl: string
): Promise<boolean> {
  const date = new Date(campaign.date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })

  const statusEmoji: Record<string, string> = {
    instagram: '📸',
    tiktok: '🎵',
    linkedin: '💼',
    reddit: '🤖',
    twitter: '🐦',
    facebook: '📘',
  }

  const postsLines = campaign.posts
    .filter(p => p.status === 'awaiting_approval')
    .map(p => {
      const time = new Date(p.scheduled_at).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Amsterdam',
      })
      return `${statusEmoji[p.platform] || '📱'} <b>${p.platform.toUpperCase()}</b> ${time} — ${p.title}`
    })
    .join('\n')

  const perf = campaign.performance_yesterday
  const perfSection = perf
    ? `\n📊 <b>Yesterday</b>\n👥 Visitors: ${perf.website_visitors} | CV starts: ${perf.cv_starts}\n`
    : ''

  const message = `
🌅 <b>ForgCV Daily Briefing</b>
${date} · 07:00 Europe/Amsterdam

${perfSection}
🎯 <b>Today's Goal</b>
${campaign.objective}

📋 <b>Theme:</b> ${campaign.theme}

📱 <b>${campaign.posts.filter(p => p.status === 'awaiting_approval').length} posts ready for approval</b>
${postsLines}

✅ <a href="${appUrl}/dashboard">Open Dashboard &amp; Approve Campaign</a>

<i>Reply /status for system status</i>
`.trim()

  return sendTelegramMessage(message)
}

export async function sendPublishNotification(post: Post, success: boolean): Promise<boolean> {
  const emoji = success ? '✅' : '❌'
  const status = success ? 'Published' : 'Failed'
  const time = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })

  const message = `${emoji} <b>${status}</b> — ${post.platform.toUpperCase()} ${time}
${post.title}
${!success && post.failure_reason ? `\nReason: ${post.failure_reason}` : ''}`

  return sendTelegramMessage(message)
}

export async function sendSystemAlert(title: string, message: string): Promise<boolean> {
  return sendTelegramMessage(`⚠️ <b>System Alert: ${title}</b>\n${message}`)
}
