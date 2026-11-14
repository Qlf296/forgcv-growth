import Anthropic from '@anthropic-ai/sdk'
import type { AgentRole, DailyPerformance, Post } from '@/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const FORGCV_CONTEXT = `
ForgCV (https://forgcv.com) is a 100% free CV and cover letter generator.
No sign-up required. No watermarks. No paid features.
Built by Vixfor, targeting international job seekers worldwide.

Key pages:
- /create-cv-free — Main CV generator (money page #1)
- /cover-letter-generator — Cover letter generator (money page #2)
- /templates — Template gallery
- 46 SEO pages targeting: free CV builder, free resume builder, ATS-friendly CV, CV by country/job

Tech: Pure HTML/CSS/JS, hosted on Netlify. No backend, no user accounts.
Brand colors: #5B57FF (indigo), #8B5CF6 (purple)
Brand voice: Professional, helpful, international, English-first.
Competitors: Zety, Novoresume, Resume.io, Canva Resume

Value proposition: Create a professional, ATS-friendly CV for free in minutes.
8 languages. 6 templates. Instant PDF download.

Target audiences:
1. Students and recent graduates (first CV)
2. Job changers (updating CV)
3. International applicants (country-specific formats)
4. Non-native English speakers (multilingual support)
5. Budget-conscious professionals (free alternative to paid tools)
`.trim()

export interface AgentInput {
  campaign_date: string
  performance_yesterday?: DailyPerformance
  existing_posts?: Post[]
  research_context?: string
  additional_context?: string
}

export interface AgentOutput {
  success: boolean
  agent: AgentRole
  output: Record<string, unknown>
  tokens_used: number
  error?: string
}

export async function runAgent(
  agent: AgentRole,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<{ content: string; tokens_used: number }> {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const content = response.content[0].type === 'text' ? response.content[0].text : ''
  const tokens_used = response.usage.input_tokens + response.usage.output_tokens

  return { content, tokens_used }
}

export function buildDateContext(date: string): string {
  const d = new Date(date)
  const dayName = d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Europe/Amsterdam' })
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })
  return `Today is ${dateStr} (${dayName})`
}

export function parseJSON<T>(text: string): T | null {
  try {
    const codeBlockMatch = text.match(/```json\n?([\s\S]*?)\n?```/)
    if (codeBlockMatch) return JSON.parse(codeBlockMatch[1]) as T
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start !== -1 && end !== -1) return JSON.parse(text.slice(start, end + 1)) as T
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
