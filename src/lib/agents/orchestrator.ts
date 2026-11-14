import { runResearcher } from './researcher'
import { runCMO } from './cmo'
import {
  runInstagramAgent, runLinkedInAgent, runRedditAgent,
  runTwitterAgent, runTikTokAgent, runQualityControl,
  type WrittenPost
} from './content-writers'
import type { PostBrief } from './cmo'
import type { AgentInput } from './base'
import type { Platform, Post } from '@/types'
import { createSupabaseServer } from '@/lib/db/server'

// Map PostBrief to the right specialist agent
async function runSpecialistAgent(brief: PostBrief, date: string): Promise<WrittenPost> {
  switch (brief.platform) {
    case 'instagram': return runInstagramAgent(brief, date)
    case 'linkedin': return runLinkedInAgent(brief, date)
    case 'reddit': return runRedditAgent(brief, date)
    case 'twitter': return runTwitterAgent(brief, date)
    case 'tiktok': return runTikTokAgent(brief, date)
    default: return runInstagramAgent(brief, date)
  }
}

function buildScheduledAt(date: string, time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  const d = new Date(date)
  d.setUTCHours(hours - 1, minutes, 0, 0) // CET = UTC+1
  return d.toISOString()
}

function buildUTMUrl(base: string, platform: Platform, campaign: string, content: string): string {
  const url = new URL(base)
  url.searchParams.set('utm_source', platform)
  url.searchParams.set('utm_medium', 'social')
  url.searchParams.set('utm_campaign', campaign)
  url.searchParams.set('utm_content', content)
  return url.toString()
}

export interface OrchestratorResult {
  campaign_id: string
  posts_created: number
  posts: Post[]
  strategy_summary: string
  objective: string
  theme: string
  agent_errors?: string[]
}

export async function generateDailyCampaign(
  date: string,
  performanceData?: AgentInput['performance_yesterday']
): Promise<OrchestratorResult> {
  const supabase = createSupabaseServer()

  console.log(`[Orchestrator] Starting campaign generation for ${date}`)

  // Step 1: Create campaign record
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      date,
      status: 'generating',
      objective: 'Generating...',
    })
    .select()
    .single()

  if (campaignError || !campaign) {
    throw new Error(`Failed to create campaign: ${campaignError?.message}`)
  }

  const input: AgentInput = {
    campaign_date: date,
    performance_yesterday: performanceData,
  }

  try {
    // Step 2: Research
    console.log('[Orchestrator] Running researcher...')
    const research = await runResearcher(input)

    await supabase.from('agent_tasks').insert({
      campaign_id: campaign.id,
      agent: 'researcher',
      status: 'completed',
      output: research as unknown as Record<string, unknown>,
    })

    // Step 3: CMO strategy
    console.log('[Orchestrator] Running CMO...')
    const campaignPlan = await runCMO(input, research)

    await supabase.from('campaigns').update({
      strategy_summary: campaignPlan.strategy_summary,
      objective: campaignPlan.objective,
      theme: campaignPlan.theme,
      target_audience: campaignPlan.target_audience,
      research_findings: JSON.stringify(research),
    }).eq('id', campaign.id)

    // Step 4: Specialist agents (run sequentially to respect rate limits)
    const writtenPosts: WrittenPost[] = []
    const agentErrors: string[] = []

    for (const brief of campaignPlan.posts) {
      try {
        console.log(`[Orchestrator] Running ${brief.platform} agent...`)
        const post = await runSpecialistAgent(brief, date)

        // Step 5: Quality control
        const qcResult = await runQualityControl(post)
        if (!qcResult.approved) {
          console.warn(`[Orchestrator] QC notes for ${brief.platform}: ${qcResult.issues.join(', ')}`)
        }
        if (qcResult.final_caption) post.caption = qcResult.final_caption

        writtenPosts.push(post)
      } catch (err) {
        const msg = `${brief.platform}: ${err}`
        console.error(`[Orchestrator] Agent failed — ${msg}`)
        agentErrors.push(msg)
      }
    }

    // Step 6: Save posts to database
    const savedPosts: Post[] = []

    for (const post of writtenPosts) {
      const brief = campaignPlan.posts.find(b => b.platform === post.platform)
      if (!brief) continue

      const scheduledAt = buildScheduledAt(date, post.scheduled_time || brief.scheduled_time)
      const destinationUrl = buildUTMUrl(
        post.destination_url || 'https://forgcv.com',
        post.platform as Platform,
        campaignPlan.theme.toLowerCase().replace(/\s+/g, '-'),
        `${post.platform}-${post.format}`
      )

      const { data: savedPost, error: postError } = await supabase
        .from('posts')
        .insert({
          campaign_id: campaign.id,
          platform: post.platform,
          format: post.format,
          status: 'awaiting_approval',
          scheduled_at: scheduledAt,
          title: post.title,
          caption: post.caption,
          hashtags: post.hashtags || [],
          cta: post.cta,
          destination_url: destinationUrl,
          utm_source: post.platform,
          utm_medium: 'social',
          utm_campaign: campaignPlan.theme.toLowerCase().replace(/\s+/g, '-'),
          utm_content: `${post.platform}-${post.format}`,
          media_type: post.media_type,
          media_urls: post.media_urls || [],
          media_preview_url: post.media_preview_url,
          objective: post.objective,
          target_audience: post.target_audience,
          expected_kpi: post.expected_kpi,
          strategy_explanation: post.strategy_explanation,
          generated_by: post.platform,
          idempotency_key: `${date}-${post.platform}-${Date.now()}`,
        })
        .select()
        .single()

      if (!postError && savedPost) {
        savedPosts.push(savedPost as Post)
      }
    }

    // Step 7: Mark campaign as ready
    await supabase.from('campaigns').update({
      status: 'ready_for_review',
    }).eq('id', campaign.id)

    console.log(`[Orchestrator] Campaign ready: ${savedPosts.length} posts created`)

    return {
      campaign_id: campaign.id,
      posts_created: savedPosts.length,
      posts: savedPosts,
      strategy_summary: campaignPlan.strategy_summary,
      objective: campaignPlan.objective,
      theme: campaignPlan.theme,
      agent_errors: agentErrors.length > 0 ? agentErrors : undefined,
    }

  } catch (err) {
    await supabase.from('campaigns').update({ status: 'failed' }).eq('id', campaign.id)
    throw err
  }
}
