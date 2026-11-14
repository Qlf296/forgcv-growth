import { runAgent, FORGCV_CONTEXT, buildDateContext, parseJSON } from './base'
import type { AgentInput } from './base'
import type { Platform, ContentFormat } from '@/types'
import type { ResearchOutput } from './researcher'

export interface CampaignPlan {
  strategy_summary: string
  objective: string
  theme: string
  target_audience: string
  posts: PostBrief[]
  reasoning: string
}

export interface PostBrief {
  platform: Platform
  format: ContentFormat
  title: string
  objective: string
  target_audience: string
  key_message: string
  cta: string
  destination_url: string
  scheduled_time: string // HH:MM
  priority: 'high' | 'medium' | 'low'
  expected_kpi: string
  strategy_explanation: string
}

const SYSTEM_PROMPT = `
You are the Chief Marketing Officer of ForgCV's autonomous marketing agency.

${FORGCV_CONTEXT}

Your role:
- Own the complete marketing strategy for ForgCV
- Decide what to publish, where, and when — based on actual data
- Coordinate all specialist agents
- Ensure brand consistency across all channels
- Maximize qualified traffic and CV creations, not just engagement

STRATEGIC PRINCIPLES:
1. Quality over quantity — 3 excellent posts beat 10 mediocre ones
2. Every post must serve a business purpose (traffic, awareness, or community)
3. Publish when the audience is most active on each platform
4. English-first, international tone
5. Never publish duplicate content on the same day across platforms

PLATFORM PUBLISHING WINDOWS (Europe/Amsterdam time):
- Instagram: 09:00–10:00 (Reels), 11:00–12:00 (Carousels)
- TikTok: 12:00–13:00, 18:00–20:00
- LinkedIn: 07:30–09:00, 11:30–13:00
- Reddit: 09:00–11:00 (avoid weekends for professional subs)
- X/Twitter: 08:00–10:00, 17:00–19:00

Output must be valid JSON matching the CampaignPlan interface.
`.trim()

export async function runCMO(input: AgentInput, research: ResearchOutput): Promise<CampaignPlan> {
  const userMessage = `
${buildDateContext(input.campaign_date)}

RESEARCH FINDINGS FROM TODAY:
Trending topics: ${research.trending_topics.map(t => `${t.topic} (${t.urgency} urgency)`).join(', ')}
Weekly theme suggestion: ${research.weekly_theme_suggestion}

Community opportunities:
${research.community_opportunities.map(c => `- ${c.platform}/${c.community}: ${c.opportunity}`).join('\n')}

SEO opportunities: ${research.seo_opportunities.map(s => s.keyword).join(', ')}

${input.performance_yesterday ? `
YESTERDAY'S PERFORMANCE:
- Visitors: ${input.performance_yesterday.website_visitors}
- CV starts: ${input.performance_yesterday.cv_starts}
- Best platform: ${input.performance_yesterday.new_followers?.sort((a,b) => b.new_followers - a.new_followers)[0]?.platform || 'unknown'}
` : 'Early stage — no historical performance data yet. Focus on establishing presence.'}

YOUR TASK:
Design today's marketing campaign. Select 3-5 publications maximum across platforms.
For each post, provide a complete brief that the specialist agents can execute.

Consider:
1. What is the single most important message ForgCV should communicate today?
2. Which platforms will have the highest ROI today (day of week matters)?
3. How do the posts complement each other without being repetitive?
4. What specific landing page should each post drive traffic to?

IMPORTANT: Do NOT recommend TikTok publishing if status is "platform_review_required".
Instead, recommend TikTok content creation for future use when API is approved.

Return ONLY valid JSON.
\`\`\`json
{
  "strategy_summary": "...",
  "objective": "...",
  "theme": "...",
  "target_audience": "...",
  "reasoning": "...",
  "posts": [
    {
      "platform": "instagram",
      "format": "carousel",
      "title": "...",
      "objective": "...",
      "target_audience": "...",
      "key_message": "...",
      "cta": "Create your free CV at forgcv.com",
      "destination_url": "https://forgcv.com/create-cv-free",
      "scheduled_time": "09:30",
      "priority": "high",
      "expected_kpi": "500 impressions, 50 saves, 10 profile visits",
      "strategy_explanation": "..."
    }
  ]
}
\`\`\`
`

  const { content, tokens_used } = await runAgent('cmo', SYSTEM_PROMPT, userMessage, 3000)
  const parsed = parseJSON<CampaignPlan>(content)

  if (!parsed) {
    throw new Error(`CMO agent returned invalid JSON. Raw: ${content.slice(0, 200)}`)
  }

  console.log(`[CMO] Campaign planned: ${parsed.posts.length} posts. Tokens: ${tokens_used}`)
  return parsed
}
