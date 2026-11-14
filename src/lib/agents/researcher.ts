import { runAgent, FORGCV_CONTEXT, buildDateContext, parseJSON } from './base'
import type { AgentInput } from './base'

export interface ResearchOutput {
  trending_topics: TrendingTopic[]
  competitor_insights: string[]
  community_opportunities: CommunityOpportunity[]
  content_ideas: ContentIdea[]
  seo_opportunities: SEOOpportunity[]
  weekly_theme_suggestion: string
}

interface TrendingTopic {
  topic: string
  relevance: string
  platforms: string[]
  urgency: 'high' | 'medium' | 'low'
}

interface CommunityOpportunity {
  platform: string
  community: string
  opportunity: string
  approach: string
}

interface ContentIdea {
  title: string
  format: string
  platform: string
  hook: string
  why_now: string
}

interface SEOOpportunity {
  keyword: string
  search_volume: string
  difficulty: string
  content_type: string
  url_slug: string
}

const SYSTEM_PROMPT = `
You are the Market Intelligence Researcher for ForgCV's autonomous marketing system.

${FORGCV_CONTEXT}

Your role:
- Analyze employment market trends and CV-related topics
- Identify what job seekers are searching for and discussing RIGHT NOW
- Research competitor content strategies
- Find Reddit/LinkedIn/TikTok community opportunities
- Identify seasonal content opportunities (hiring seasons, graduation, new year job searches)
- Surface high-intent keywords for SEO

IMPORTANT RULES:
- Only use publicly known information — no invented statistics
- Mark any metric as "estimated" if not from a verified public source
- Focus on actionable opportunities, not generic advice
- Prioritize English-language international audiences
- Research must be current and specific, not generic

Output must be valid JSON matching the ResearchOutput interface.
`.trim()

export async function runResearcher(input: AgentInput): Promise<ResearchOutput> {
  const userMessage = `
${buildDateContext(input.campaign_date)}

${input.performance_yesterday ? `
Yesterday's performance:
- Website visitors: ${input.performance_yesterday.website_visitors}
- CV starts: ${input.performance_yesterday.cv_starts}
- Best performing content: ${input.performance_yesterday.best_performing_post || 'No data yet'}
` : 'No performance data available yet — this is early stage.'}

Your task:
1. Identify 3-5 trending topics in the CV/job search space that are relevant TODAY (consider day of week, season, current events in employment)
2. Surface 2-3 competitor content patterns from Zety, Novoresume, Resume.io, Canva
3. Find 2-3 specific Reddit/LinkedIn community opportunities with REAL subreddit names
4. Generate 5 specific content ideas with hooks, one per platform (Instagram, TikTok, LinkedIn, Reddit, X)
5. Identify 3 SEO keyword opportunities ForgCV is not yet ranking for

Return ONLY valid JSON.
Example structure:
\`\`\`json
{
  "trending_topics": [{"topic": "...", "relevance": "...", "platforms": ["..."], "urgency": "high"}],
  "competitor_insights": ["..."],
  "community_opportunities": [{"platform": "Reddit", "community": "r/resumes", "opportunity": "...", "approach": "..."}],
  "content_ideas": [{"title": "...", "format": "reel", "platform": "instagram", "hook": "...", "why_now": "..."}],
  "seo_opportunities": [{"keyword": "...", "search_volume": "2,400/mo (estimated)", "difficulty": "medium", "content_type": "landing page", "url_slug": "..."}],
  "weekly_theme_suggestion": "..."
}
\`\`\`
`

  const { content, tokens_used } = await runAgent('researcher', SYSTEM_PROMPT, userMessage, 2048)
  const parsed = parseJSON<ResearchOutput>(content)

  if (!parsed) {
    throw new Error(`Researcher agent returned invalid JSON. Raw: ${content.slice(0, 200)}`)
  }

  console.log(`[Researcher] Completed. Tokens: ${tokens_used}`)
  return parsed
}
