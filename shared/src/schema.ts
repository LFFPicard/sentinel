import { pgTable, serial, text, integer, boolean, bigserial } from 'drizzle-orm/pg-core'

// users — all Plex users who have streamed on this server
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  plexId: text('plex_id').unique().notNull(),
  username: text('username').notNull(),
  displayName: text('display_name'),
  email: text('email'),
  thumb: text('thumb'),
  isOwner: boolean('is_owner').default(false),
  hidden: boolean('hidden').default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// libraries — Plex library sections
export const libraries = pgTable('libraries', {
  id: serial('id').primaryKey(),
  plexKey: text('plex_key').unique().notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(), // movie | show | music | photo
  agent: text('agent'),
  thumb: text('thumb'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// metadata — cached media info per Plex rating key
export const metadata = pgTable('metadata', {
  id: serial('id').primaryKey(),
  ratingKey: text('rating_key').unique().notNull(),
  parentKey: text('parent_key'),
  grandparentKey: text('grandparent_key'),
  libraryId: integer('library_id').references(() => libraries.id),
  type: text('type').notNull(), // movie | episode | track
  title: text('title').notNull(),
  grandparentTitle: text('grandparent_title'),
  parentTitle: text('parent_title'),
  year: integer('year'),
  thumb: text('thumb'),
  art: text('art'),
  duration: integer('duration'), // milliseconds
  studio: text('studio'),
  contentRating: text('content_rating'),
  summary: text('summary'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// session_history — every play event, partitioned by year
// NOTE: Drizzle doesn't fully manage partitioned tables — the partition
// DDL is handled manually via migration SQL files. This table definition
// represents the parent table shape only.
export const sessionHistory = pgTable('session_history', {
  id: bigserial('id', { mode: 'number' }),
  userId: integer('user_id').references(() => users.id),
  metadataId: integer('metadata_id').references(() => metadata.id),
  sessionKey: text('session_key'),
  startedAt: integer('started_at').notNull(),
  stoppedAt: integer('stopped_at'),
  duration: integer('duration'), // seconds actually watched
  progress: integer('progress'), // 0-100
  complete: boolean('complete').default(false),
  platform: text('platform'),
  player: text('player'),
  ipAddress: text('ip_address'),
  transcodeDecision: text('transcode_decision'), // direct | copy | transcode
  videoDecision: text('video_decision'),
  audioDecision: text('audio_decision'),
  qualityProfile: text('quality_profile'),
  imported: boolean('imported').default(false),
  year: integer('year').notNull(), // partition key
  location: text('location'),        // wan | lan
  product: text('product'),          // Plex Web | Plex for Windows etc.
})

// api_keys — authentication for consuming apps
export const apiKeys = pgTable('api_keys', {
  id: serial('id').primaryKey(),
  keyHash: text('key_hash').unique().notNull(), // bcrypt hash — never store raw
  keyPrefix: text('key_prefix').notNull(),       // first 16 chars of raw key — fast lookup hint
  label: text('label').notNull(),
  tier: text('tier').notNull(), // admin | read
  lastUsed: integer('last_used'),
  createdAt: integer('created_at').notNull(),
})

// settings — key/value config store
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// import_jobs — tracks async import progress
export const importJobs = pgTable('import_jobs', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(), // tautulli
  status: text('status').notNull(), // pending | running | complete | failed
  total: integer('total'),
  processed: integer('processed').default(0),
  errors: integer('errors').default(0),
  errorLog: text('error_log'),
  startedAt: integer('started_at'),
  completedAt: integer('completed_at'),
  createdAt: integer('created_at').notNull(),
})

// Re-export drizzle operators so consuming packages don't need drizzle-orm directly
export { eq, and, or, sql, inArray, lt, gt, asc, desc, isNotNull, ne } from 'drizzle-orm'
export { drizzle } from 'drizzle-orm/node-postgres'