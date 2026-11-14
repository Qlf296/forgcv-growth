-- ============================================================
-- FORGCV GROWTH COMMAND CENTER — Database Schema
-- Run this in Supabase SQL Editor to initialize
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── Social Accounts ──────────────────────────────────────────
create table social_accounts (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('instagram','tiktok','linkedin','reddit','twitter','facebook','youtube','pinterest')),
  username text not null,
  display_name text not null,
  profile_url text,
  avatar_url text,
  is_connected boolean default false,
  can_publish boolean default false,
  connection_status text default 'disconnected' check (connection_status in ('connected','disconnected','token_expired','permission_required','platform_review_required','error')),
  connection_notes text,
  access_token_encrypted text, -- store encrypted tokens only
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  follower_count integer default 0,
  platform_account_id text, -- platform's own ID for the account
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(platform, username)
);

-- ── Campaigns ────────────────────────────────────────────────
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  date date not null unique,
  status text default 'generating' check (status in ('generating','ready_for_review','approved','partially_published','published','failed')),
  strategy_summary text,
  objective text,
  theme text,
  target_audience text,
  research_findings text,
  performance_yesterday jsonb default '{}',
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_campaigns_date on campaigns(date);
create index idx_campaigns_status on campaigns(status);

-- ── Posts ─────────────────────────────────────────────────────
create table posts (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references campaigns(id) on delete cascade,
  platform text not null check (platform in ('instagram','tiktok','linkedin','reddit','twitter','facebook','youtube','pinterest')),
  format text not null check (format in ('reel','carousel','story','static_image','short_video','article','post','thread','comment','reply')),
  status text default 'draft' check (status in ('draft','awaiting_approval','approved','scheduled','publishing','published','failed','cancelled')),
  scheduled_at timestamptz not null,

  -- Content
  title text,
  caption text,
  hashtags text[] default '{}',
  cta text,
  destination_url text default 'https://forgcv.com',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,

  -- Media
  media_type text check (media_type in ('image','video','carousel','text')),
  media_urls text[] default '{}',
  media_preview_url text,

  -- Strategy
  objective text,
  target_audience text,
  expected_kpi text,
  strategy_explanation text,

  -- Publishing
  platform_post_id text,
  published_at timestamptz,
  failure_reason text,
  retry_count integer default 0,
  idempotency_key text unique,

  -- Agent metadata
  generated_by text,
  reviewed_by text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_posts_campaign on posts(campaign_id);
create index idx_posts_status on posts(status);
create index idx_posts_platform on posts(platform);
create index idx_posts_scheduled on posts(scheduled_at);

-- ── Content Assets ───────────────────────────────────────────
create table content_assets (
  id uuid primary key default uuid_generate_v4(),
  post_id uuid references posts(id) on delete cascade,
  type text check (type in ('image','video','audio','document')),
  url text not null,
  storage_path text,
  filename text,
  size_bytes bigint,
  duration_seconds integer,
  width integer,
  height integer,
  format text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index idx_assets_post on content_assets(post_id);

-- ── Agent Tasks ──────────────────────────────────────────────
create table agent_tasks (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid references campaigns(id) on delete cascade,
  agent text not null,
  status text default 'pending' check (status in ('pending','running','completed','failed')),
  input jsonb default '{}',
  output jsonb,
  error text,
  tokens_used integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index idx_tasks_campaign on agent_tasks(campaign_id);
create index idx_tasks_status on agent_tasks(status);

-- ── Daily Performance ────────────────────────────────────────
create table daily_performance (
  id uuid primary key default uuid_generate_v4(),
  date date not null unique,
  website_visitors integer default 0,
  traffic_sources jsonb default '[]',
  cv_starts integer default 0,
  cv_completions integer default 0,
  pdf_downloads integer default 0,
  revenue decimal(10,2) default 0,
  new_followers jsonb default '[]',
  engagement jsonb default '[]',
  best_performing_post_id uuid references posts(id),
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_perf_date on daily_performance(date);

-- ── Notifications ────────────────────────────────────────────
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in ('daily_briefing','publish_success','publish_failure','token_expiry','system_alert')),
  title text not null,
  message text not null,
  campaign_id uuid references campaigns(id),
  post_id uuid references posts(id),
  is_read boolean default false,
  sent_via text check (sent_via in ('telegram','email','in_app')),
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index idx_notif_unread on notifications(is_read) where is_read = false;

-- ── SEO Keywords ─────────────────────────────────────────────
create table seo_keywords (
  id uuid primary key default uuid_generate_v4(),
  keyword text not null,
  language text default 'en',
  country text,
  search_volume integer,
  difficulty integer,
  current_position integer,
  clicks integer default 0,
  impressions integer default 0,
  ctr decimal(5,4) default 0,
  priority integer default 0,
  status text default 'tracking' check (status in ('tracking','optimizing','ranking','opportunity')),
  last_checked_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Platform Analytics ───────────────────────────────────────
create table platform_analytics (
  id uuid primary key default uuid_generate_v4(),
  platform text not null,
  date date not null,
  followers integer default 0,
  new_followers integer default 0,
  impressions integer default 0,
  reach integer default 0,
  profile_visits integer default 0,
  link_clicks integer default 0,
  engagement_rate decimal(5,4) default 0,
  raw_data jsonb default '{}',
  created_at timestamptz default now(),
  unique(platform, date)
);

create index idx_platform_analytics on platform_analytics(platform, date);

-- ── Updated_at triggers ──────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_campaigns_updated before update on campaigns
  for each row execute function update_updated_at();

create trigger trg_posts_updated before update on posts
  for each row execute function update_updated_at();

create trigger trg_accounts_updated before update on social_accounts
  for each row execute function update_updated_at();

create trigger trg_perf_updated before update on daily_performance
  for each row execute function update_updated_at();

-- ── Row Level Security (optional — enable for multi-tenant) ──
-- alter table campaigns enable row level security;
-- alter table posts enable row level security;

-- ── Initial seed: social account slots ───────────────────────
insert into social_accounts (platform, username, display_name, is_connected, can_publish, connection_status) values
  ('instagram', 'forgcv', 'ForgCV', false, false, 'disconnected'),
  ('tiktok', 'forgcv', 'ForgCV', false, false, 'platform_review_required'),
  ('linkedin', 'forgcv', 'ForgCV', false, false, 'disconnected'),
  ('reddit', 'forgcv', 'ForgCV', false, false, 'disconnected'),
  ('twitter', 'forgcv', 'ForgCV', false, false, 'disconnected')
on conflict do nothing;
