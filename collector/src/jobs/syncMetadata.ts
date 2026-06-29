import { db } from '../db/index.js'
import { metadata, libraries, eq } from '@sentinel/shared/src/schema'
import { log } from '../logger.js'

const PLEX_URL = process.env.PLEX_URL!
const PLEX_TOKEN = process.env.PLEX_TOKEN!

export async function fetchAndCacheMetadata(ratingKey: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${PLEX_URL}/library/metadata/${ratingKey}?X-Plex-Token=${PLEX_TOKEN}`,
      { headers: { Accept: 'application/json' } }
    )

    if (!res.ok) {
      log.error(`[syncMetadata] Failed for ratingKey=${ratingKey}: ${res.status}`)
      return null
    }

    const data = await res.json() as any
    const item = data?.MediaContainer?.Metadata?.[0]
    if (!item) return null

    const now = Math.floor(Date.now() / 1000)

    // Find library by section ID
    let libraryId: number | null = null
    if (item.librarySectionID) {
      const lib = await db.select()
        .from(libraries)
        .where(eq(libraries.plexKey, String(item.librarySectionID)))
        .limit(1)
      if (lib.length > 0) libraryId = lib[0].id
    }

    const existing = await db.select()
      .from(metadata)
      .where(eq(metadata.ratingKey, ratingKey))
      .limit(1)

    if (existing.length > 0) {
      await db.update(metadata)
        .set({ updatedAt: now })
        .where(eq(metadata.ratingKey, ratingKey))
      return existing[0].id
    }

    const inserted = await db.insert(metadata).values({
      ratingKey,
      parentKey: item.parentRatingKey ?? null,
      grandparentKey: item.grandparentRatingKey ?? null,
      libraryId,
      type: item.type,
      title: item.title,
      grandparentTitle: item.grandparentTitle ?? null,
      parentTitle: item.parentTitle ?? null,
      year: item.year ?? null,
      thumb: item.thumb ?? null,
      art: item.art ?? null,
      duration: item.duration ?? null,
      studio: item.studio ?? null,
      contentRating: item.contentRating ?? null,
      summary: item.summary ?? null,
      createdAt: now,
      updatedAt: now,
    }).returning({ id: metadata.id })

    log.info(`[syncMetadata] Cached: ${item.title} (${ratingKey})`)
    return inserted[0].id
  } catch (err) {
    log.error(`[syncMetadata] Error for ratingKey=${ratingKey}: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}