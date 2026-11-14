import type { AgentRole, DailyPerformance, Post } from '@/types'

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

interface Provider {
  name: string
  url: string
  apiKey: string | undefined
  model: string
  extraHeaders?: Record<string, string>
}

function getProviders(): Provider[] {
  return [
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: 'anthropic/claude-haiku-4.5',
      extraHeaders: {
        'HTTP-Referer': 'https://forgcv-growth.vercel.app',
        'X-Title': 'ForgCV Growth',
      },
    },
    {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      apiKey: process.env.GROQ_API_KEY,
      model: 'qwen/qwen3.8-27b',
    },
    {
      name: 'gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-3.5-flash-lite',
    },
    {
      // Additional Gemini model names tried by Nexora
      name: 'gemini-flash',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: process.env.GEMINI_API_KEY,
      model: 'gemini-2.5-flash',
    },
  ]
}

async function callProvider(
  provider: Provider,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number
): Promise<{ content: string; tokens_used: number }> {
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
      ...provider.extraHeaders,
    },
    body: JSON.stringify({
      model: provider.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`${provider.name} ${res.status}: ${err}`)
  }

  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error(`${provider.name}: empty response`)

  const tokens_used: number =
    (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0)

  return { content, tokens_used }
}

export async function runAgent(
  _agent: AgentRole,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 4096
): Promise<{ content: string; tokens_used: number }> {
  const providers = getProviders()
  const errors: string[] = []

  for (const provider of providers) {
    if (!provider.apiKey) continue
    try {
      return await callProvider(provider, systemPrompt, userMessage, maxTokens)
    } catch (err) {
      errors.push(`${provider.name}: ${err}`)
    }
  }

  throw new Error(`All AI providers failed:\n${errors.join('\n')}`)
}

export function buildDateContext(date: string): string {
  const d = new Date(date)
  const dateStr = d.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Europe/Amsterdam',
  })
  return `Today is ${dateStr}`
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
