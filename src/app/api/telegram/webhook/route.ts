import { NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/db/server'
import {
  answerCallbackQuery,
  editMessageReplyMarkup,
  sendCampaignApprovedConfirmation,
  sendTelegramText,
} from '@/lib/notifications/telegram'
import {
  schedulePostReminders,
  cancelPostReminders,
  rescheduleReminder,
} from '@/lib/notifications/reminders'
import { scheduleApprovedCampaign } from '@/lib/social/publisher'
import type { Post } from '@/types'

export const dynamic = 'force-dynamic'

interface TelegramUpdate {
  callback_query?: {
    id: string
    data: string
    from: { id: number }
    message?: { message_id: number; chat: { id: number } }
  }
  message?: {
    text: string
    from: { id: number }
    chat: { id: number }
  }
}

export async function POST(request: Request) {
  try {
    const update = await request.json() as TelegramUpdate
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://forgcv-growth.vercel.app'
    const authorizedId = process.env.TELEGRAM_CHAT_ID

    // ── Inline button callbacks ───────────────────────────────
    if (update.callback_query) {
      const { id: cbId, data, from, message } = update.callback_query

      if (authorizedId && from.id.toString() !== authorizedId) {
        await answerCallbackQuery(cbId, '❌ Unauthorized')
        return NextResponse.json({ ok: true })
      }

      const parts = data.split(':')
      const action = parts[0]

      switch (action) {

        case 'approve': {
          const campaignId = parts[1]
          await answerCallbackQuery(cbId, '⏳ Approving campaign...')
          const supabase = createSupabaseServer()

          await supabase.from('posts').update({ status: 'approved', updated_at: new Date().toISOString() })
            .eq('campaign_id', campaignId).eq('status', 'awaiting_approval')

          await scheduleApprovedCampaign(campaignId)
          await schedulePostReminders(campaignId)

          const { data: posts } = await supabase.from('posts').select('*')
            .eq('campaign_id', campaignId).eq('status', 'scheduled')

          if (message?.message_id) {
            await editMessageReplyMarkup(message.message_id, {
              inline_keyboard: [[
                { text: '✅ Approved ✓', callback_data: 'noop' },
                { text: '📊 Open Dashboard', url: `${appUrl}/dashboard` },
              ]],
            })
          }

          if (posts?.length) {
            await sendCampaignApprovedConfirmation(posts as Post[], appUrl)
          }

          await supabase.from('system_events').insert({
            event_type: 'campaign_approved_telegram',
            status: 'success',
            message: `Campaign ${campaignId} approved via Telegram`,
          })
          break
        }

        case 'reject': {
          const campaignId = parts[1]
          await answerCallbackQuery(cbId, '❌ Campaign rejected')
          const supabase = createSupabaseServer()

          await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaignId)
          await supabase.from('posts').update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('campaign_id', campaignId).in('status', ['awaiting_approval', 'approved'])

          if (message?.message_id) {
            await editMessageReplyMarkup(message.message_id, {
              inline_keyboard: [[{ text: '❌ Rejected', callback_data: 'noop' }]],
            })
          }
          await sendTelegramText('❌ Campaign rejected and cancelled.\n\nSend /today to generate a new plan or open the dashboard to regenerate.')
          break
        }

        case 'changes': {
          await answerCallbackQuery(cbId, '🔄 Opening dashboard')
          await sendTelegramText(
            `🔄 <b>Request Changes</b>\n\nOpen the dashboard to edit individual posts:\n\n<a href="${appUrl}/dashboard">${appUrl}/dashboard</a>\n\nUse the Edit button on each post to modify the caption, then approve the campaign.`
          )
          break
        }

        case 'published': {
          const postId = parts[1]
          await answerCallbackQuery(cbId, '🎉 Marked as published!')
          const supabase = createSupabaseServer()

          await supabase.from('posts').update({
            status: 'published',
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', postId)

          await cancelPostReminders(postId)

          if (message?.message_id) {
            await editMessageReplyMarkup(message.message_id, {
              inline_keyboard: [[
                { text: '✅ Published ✓', callback_data: 'noop' },
                { text: '📊 Dashboard', url: `${appUrl}/dashboard` },
              ]],
            })
          }
          break
        }

        case 'skip': {
          const postId = parts[1]
          await answerCallbackQuery(cbId, '⏭️ Post skipped')
          const supabase = createSupabaseServer()

          await supabase.from('posts').update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          }).eq('id', postId)

          await cancelPostReminders(postId)

          if (message?.message_id) {
            await editMessageReplyMarkup(message.message_id, {
              inline_keyboard: [[{ text: '⏭️ Skipped', callback_data: 'noop' }]],
            })
          }
          break
        }

        case 'remind': {
          const postId = parts[1]
          const minutes = parseInt(parts[2] || '30', 10)
          await answerCallbackQuery(cbId, `⏰ Reminder set for +${minutes} min`)
          await rescheduleReminder(postId, minutes)

          if (message?.message_id) {
            await editMessageReplyMarkup(message.message_id, {
              inline_keyboard: [
                [{ text: `⏰ Reminder set (+${minutes}min)`, callback_data: 'noop' }],
                [
                  { text: '✅ Mark as Published', callback_data: `published:${postId}` },
                  { text: '⏭️ Skip', callback_data: `skip:${postId}` },
                ],
              ],
            })
          }
          break
        }

        case 'noop':
          await answerCallbackQuery(cbId, '')
          break

        default:
          await answerCallbackQuery(cbId, '')
      }
    }

    // ── Text commands ─────────────────────────────────────────
    if (update.message?.text) {
      const { text, from } = update.message
      if (authorizedId && from.id.toString() !== authorizedId) {
        return NextResponse.json({ ok: true })
      }
      if (text.startsWith('/')) {
        await handleCommand(text.trim().toLowerCase().split('@')[0], appUrl)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Telegram Webhook] Error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }
}

async function handleCommand(command: string, appUrl: string): Promise<void> {
  const supabase = createSupabaseServer()
  const tz = 'Europe/Amsterdam'
  const now = new Date()
  const today = now.toLocaleDateString('en-CA', { timeZone: tz })

  if (command === '/start' || command === '/help') {
    await sendTelegramText(
      `👋 <b>ForgCV Growth Bot</b>\n\nYour autonomous marketing assistant.\n\n<b>Commands:</b>\n/today — Today's campaign status\n/status — System health\n/pending — Pending publications\n/analytics — This week's stats\n/instagram — Instagram status\n/linkedin — LinkedIn status\n/reddit — Reddit status\n/twitter — X/Twitter status\n/tiktok — TikTok status\n/help — Show this menu\n\n<a href="${appUrl}/dashboard">📊 Open Dashboard</a>`
    )
    return
  }

  if (command === '/status') {
    const { data: campaign } = await supabase.from('campaigns')
      .select('status, theme').eq('date', today).single()
    const { data: accounts } = await supabase.from('social_accounts')
      .select('platform, is_connected, can_publish')
    const { data: pendingRem } = await supabase.from('reminders')
      .select('id').eq('status', 'pending').lte('scheduled_at', now.toISOString())

    const campaignLine = campaign
      ? `📋 ${campaign.theme?.slice(0, 50)}\n   Status: ${campaign.status}`
      : '📋 No campaign for today'

    const accountLines = (accounts || []).map(a =>
      `${a.can_publish ? '🟢' : a.is_connected ? '🟡' : '🔴'} ${a.platform}`
    ).join(' · ')

    const overdueCount = pendingRem?.length || 0

    await sendTelegramText(
      `⚙️ <b>System Status</b>\n\n${campaignLine}\n\n📱 Accounts: ${accountLines}\n⏰ Overdue reminders: ${overdueCount}\n🤖 AI: OpenRouter → Groq → Gemini\n📊 DB: Supabase EU-West\n\n<a href="${appUrl}/dashboard">Open Dashboard</a>`
    )
    return
  }

  if (command === '/today') {
    const { data: campaign } = await supabase.from('campaigns')
      .select('*, posts(*)').eq('date', today).single()

    if (!campaign) {
      await sendTelegramText(`📅 No campaign today yet.\n\n<a href="${appUrl}/dashboard">Generate one in the dashboard ↗</a>`)
      return
    }

    type PostRow = { platform: string; status: string; scheduled_at: string }
    const statusLines = (campaign.posts as PostRow[] || []).map(p => {
      const time = new Date(p.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
      const icon = p.status === 'published' ? '✅' : p.status === 'cancelled' ? '⏭️' : p.status === 'scheduled' ? '⏰' : '⏳'
      return `${icon} ${p.platform.toUpperCase()} — ${time} (${p.status})`
    }).join('\n') || 'No posts'

    await sendTelegramText(
      `📅 <b>Today's Campaign</b>\n\n<b>${campaign.theme}</b>\nStatus: ${campaign.status}\n\n${statusLines}\n\n<a href="${appUrl}/dashboard">Open Dashboard</a>`
    )
    return
  }

  if (command === '/pending') {
    const { data: posts } = await supabase.from('posts').select('*')
      .in('status', ['scheduled', 'awaiting_approval'])
      .gte('scheduled_at', today).order('scheduled_at').limit(10)

    if (!posts?.length) {
      await sendTelegramText('✅ No pending publications right now.')
      return
    }
    const e: Record<string, string> = { instagram: '📸', tiktok: '🎵', linkedin: '💼', reddit: '🤖', twitter: '🐦' }
    const lines = posts.map(p => {
      const time = new Date(p.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: tz })
      return `${e[p.platform] || '📱'} ${p.platform.toUpperCase()} ${time} [${p.status}]`
    }).join('\n')

    await sendTelegramText(`📋 <b>Pending Publications</b>\n\n${lines}\n\n<a href="${appUrl}/dashboard">Manage in Dashboard</a>`)
    return
  }

  if (command === '/analytics') {
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 7)
    const { data: posts } = await supabase.from('posts').select('platform, status')
      .gte('created_at', weekAgo.toISOString())

    const total = posts?.length || 0
    const published = posts?.filter(p => p.status === 'published').length || 0
    const byPlatform: Record<string, number> = {}
    posts?.filter(p => p.status === 'published').forEach(p => {
      byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1
    })

    const lines = Object.entries(byPlatform)
      .sort(([, a], [, b]) => b - a)
      .map(([p, c]) => `  ${p}: ${c} published`)
      .join('\n') || '  No published posts yet'

    await sendTelegramText(
      `📊 <b>Last 7 Days</b>\n\n${published}/${total} posts published\n\n${lines}\n\n<a href="${appUrl}/dashboard">Full Analytics</a>`
    )
    return
  }

  const platforms = ['instagram', 'linkedin', 'reddit', 'twitter', 'tiktok']
  const platformCmd = command.replace('/', '')
  if (platforms.includes(platformCmd)) {
    const { data: account } = await supabase.from('social_accounts').select('*').eq('platform', platformCmd).single()
    const { data: recent } = await supabase.from('posts').select('title, status, scheduled_at')
      .eq('platform', platformCmd).order('created_at', { ascending: false }).limit(3)

    const statusIcon = account?.can_publish ? '🟢' : account?.is_connected ? '🟡' : '🔴'
    const statusText = account?.can_publish ? 'Ready to publish' : account?.is_connected ? 'Connected (limited)' : 'Not connected'
    const recentLines = recent?.map(p =>
      `  • ${(p.title || 'Post').slice(0, 40)} [${p.status}]`
    ).join('\n') || '  No recent posts'

    await sendTelegramText(
      `📱 <b>${platformCmd.toUpperCase()}</b>\n\n${statusIcon} ${statusText}\nFollowers: ${account?.follower_count || 'Unknown'}\n\nRecent posts:\n${recentLines}\n\n<a href="${appUrl}/api/auth/connect/${platformCmd}">Connect/Reconnect ↗</a>`
    )
    return
  }
}
