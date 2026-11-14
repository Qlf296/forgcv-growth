// ============================================================
// FORGCV GROWTH COMMAND CENTER — Core Types
// ============================================================

export type Platform = 'instagram' | 'tiktok' | 'linkedin' | 'reddit' | 'twitter' | 'facebook' | 'youtube' | 'pinterest'

export type ContentFormat =
  | 'reel' | 'carousel' | 'story' | 'static_image'
  | 'short_video' | 'article' | 'post' | 'thread'
  | 'comment' | 'reply'

export type PublicationStatus =
  | 'draft' | 'awaiting_approval' | 'approved'
  | 'scheduled' | 'publishing' | 'published'
  | 'failed' | 'cancelled'

export type CampaignStatus =
  | 'generating' | 'ready_for_review' | 'approved'
  | 'partially_published' | 'published' | 'failed'

export type AgentRole =
  | 'cmo' | 'researcher' | 'instagram' | 'tiktok'
  | 'reddit' | 'linkedin' | 'twitter' | 'seo'
  | 'analyst' | 'quality_control'

// ── Social Account ──────────────────────────────────────────
export interface SocialAccount {
  id: string
  platform: Platform
  username: string
  display_name: string
  profile_url?: string
  avatar_url?: string
  is_connected: boolean
  can_publish: boolean
  connection_status: 'connected' | 'disconnected' | 'token_expired' | 'permission_required' | 'platform_review_required' | 'error'
  connection_notes?: string
  access_token?: string // encrypted in DB
  token_expires_at?: string
  follower_count?: number
  created_at: string
  updated_at: string
}

// ── Daily Campaign ───────────────────────────────────────────
export interface Campaign {
  id: string
  date: string // YYYY-MM-DD
  status: CampaignStatus
  strategy_summary: string
  objective: string
  theme: string
  target_audience: string
  research_findings: string
  posts: Post[]
  performance_yesterday?: DailyPerformance
  approved_at?: string
  created_at: string
  updated_at: string
}

// ── Individual Post ─────────────────────────────────────────
export interface Post {
  id: string
  campaign_id: string
  platform: Platform
  format: ContentFormat
  status: PublicationStatus
  scheduled_at: string // ISO datetime

  // Content
  title: string
  caption: string
  hashtags: string[]
  cta: string
  destination_url: string
  utm_params: UTMParams

  // Media
  media_type: 'image' | 'video' | 'carousel' | 'text'
  media_urls: string[]
  media_preview_url?: string

  // Strategy
  objective: string
  target_audience: string
  expected_kpi: string
  strategy_explanation: string

  // Publishing
  platform_post_id?: string
  published_at?: string
  failure_reason?: string
  retry_count: number

  // Agent metadata
  generated_by: AgentRole
  reviewed_by?: AgentRole

  created_at: string
  updated_at: string
}

// ── UTM Parameters ───────────────────────────────────────────
export interface UTMParams {
  utm_source: string
  utm_medium: string
  utm_campaign: string
  utm_content?: string
  utm_term?: string
}

// ── Daily Performance ────────────────────────────────────────
export interface DailyPerformance {
  date: string
  website_visitors: number
  traffic_sources: TrafficSource[]
  cv_starts: number
  cv_completions: number
  pdf_downloads: number
  revenue: number
  new_followers: PlatformFollowers[]
  engagement: PlatformEngagement[]
  best_performing_post?: string
}

export interface TrafficSource {
  source: string
  visitors: number
  percentage: number
}

export interface PlatformFollowers {
  platform: Platform
  new_followers: number
  total_followers: number
}

export interface PlatformEngagement {
  platform: Platform
  likes: number
  comments: number
  shares: number
  impressions: number
  reach: number
  engagement_rate: number
}

// ── Agent Task ───────────────────────────────────────────────
export interface AgentTask {
  id: string
  campaign_id: string
  agent: AgentRole
  status: 'pending' | 'running' | 'completed' | 'failed'
  input: Record<string, unknown>
  output?: Record<string, unknown>
  error?: string
  started_at?: string
  completed_at?: string
  created_at: string
}

// ── Briefing ─────────────────────────────────────────────────
export interface DailyBriefing {
  id: string
  date: string
  campaign_id?: string
  performance: DailyPerformance
  strategy: string
  posts: Post[]
  research_findings: string
  recommended_actions: string[]
  sent_at?: string
  created_at: string
}

// ── Content Asset ────────────────────────────────────────────
export interface ContentAsset {
  id: string
  post_id: string
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
  filename: string
  size_bytes: number
  duration_seconds?: number
  width?: number
  height?: number
  format: string
  created_at: string
}

// ── Notification ─────────────────────────────────────────────
export interface Notification {
  id: string
  type: 'daily_briefing' | 'publish_success' | 'publish_failure' | 'token_expiry' | 'system_alert'
  title: string
  message: string
  campaign_id?: string
  post_id?: string
  read: boolean
  sent_via: 'telegram' | 'email' | 'in_app'
  created_at: string
}

// ── API Response ─────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ── Dashboard Stats ──────────────────────────────────────────
export interface DashboardStats {
  today_posts_pending: number
  today_posts_scheduled: number
  today_posts_published: number
  connected_accounts: number
  disconnected_accounts: number
  weekly_visitors: number
  weekly_cv_starts: number
  total_followers: number
}
