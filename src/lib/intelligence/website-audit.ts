import { createSupabaseServer } from '@/lib/db/server'

interface AuditResult {
  homepage_ok: boolean
  cv_builder_ok: boolean
  cover_letter_ok: boolean
  templates_ok: boolean
  response_time_ms: number
  status_code: number
  errors: string[]
  opportunities: string[]
}

async function checkUrl(url: string): Promise<{ ok: boolean; status: number; ms: number }> {
  const start = Date.now()
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'ForgCV-Monitor/1.0' },
    })
    return { ok: res.ok, status: res.status, ms: Date.now() - start }
  } catch {
    return { ok: false, status: 0, ms: Date.now() - start }
  }
}

export async function runWebsiteAudit(): Promise<AuditResult> {
  const pages = [
    { key: 'homepage', url: 'https://forgcv.com/' },
    { key: 'cv_builder', url: 'https://forgcv.com/create-cv-free' },
    { key: 'cover_letter', url: 'https://forgcv.com/cover-letter-generator' },
    { key: 'templates', url: 'https://forgcv.com/templates' },
  ]

  const results = await Promise.all(pages.map(p => checkUrl(p.url)))
  const [homepage, cvBuilder, coverLetter, templates] = results

  const errors: string[] = []
  const opportunities: string[] = []

  if (!homepage.ok) errors.push(`Homepage down — HTTP ${homepage.status}`)
  if (!cvBuilder.ok) errors.push(`CV Builder (/create-cv-free) down — HTTP ${cvBuilder.status}`)
  if (!coverLetter.ok) errors.push(`Cover Letter page down — HTTP ${coverLetter.status}`)
  if (!templates.ok) errors.push(`Templates page down — HTTP ${templates.status}`)

  const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length)
  if (avgMs > 3000) opportunities.push(`Slow average response (${avgMs}ms) — consider CDN or image optimization`)
  if (homepage.ms > 2000) opportunities.push(`Homepage response slow (${homepage.ms}ms) — first contentful paint may be poor`)
  if (errors.length === 0) opportunities.push('All key pages responding normally')

  const result: AuditResult = {
    homepage_ok: homepage.ok,
    cv_builder_ok: cvBuilder.ok,
    cover_letter_ok: coverLetter.ok,
    templates_ok: templates.ok,
    response_time_ms: avgMs,
    status_code: homepage.status,
    errors,
    opportunities,
  }

  const supabase = createSupabaseServer()
  const today = new Date().toISOString().slice(0, 10)

  await supabase.from('website_audits').upsert({
    date: today,
    ...result,
    created_at: new Date().toISOString(),
  }, { onConflict: 'date' })

  await supabase.from('system_events').insert({
    event_type: 'website_audit',
    status: errors.length > 0 ? 'warning' : 'success',
    message: errors.length > 0 ? `Website issues: ${errors.join('; ')}` : `All pages OK (${avgMs}ms avg)`,
    metadata: result as unknown as Record<string, unknown>,
  })

  return result
}
