import { z } from 'zod'
import { OPUS } from './pricing'
import type { AgentDefinition } from './types'

export const LibrarianPaper = z.object({
  paper_id: z.string(),
  title: z.string(),
  abstract: z.string().nullable().optional(),
  authors: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  published_at: z.string().nullable().optional(),
  doi: z.string().nullable().optional(),
})
export type LibrarianPaper = z.infer<typeof LibrarianPaper>

export const LibrarianAuthor = z.object({
  orcid: z.string().nullable().optional(),
  display_name: z.string(),
  affiliation: z.string().nullable().optional(),
  openalex_author_id: z.string().nullable().optional(),
})
export type LibrarianAuthor = z.infer<typeof LibrarianAuthor>

export const LibrarianTag = z.object({
  slug: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  paper_ids: z.array(z.string()).min(1),
  score: z.number().min(0).max(1).default(1),
})
export type LibrarianTag = z.infer<typeof LibrarianTag>

export const LibrarianOutput = z.object({
  papers: z.array(LibrarianPaper).default([]),
  authors: z.array(LibrarianAuthor).default([]),
  tags: z.array(LibrarianTag).default([]),
  duplicates: z
    .array(
      z.object({
        canonical: z.string(),
        merged: z.array(z.string()).min(1),
      }),
    )
    .default([]),
  warnings: z.array(z.string()).default([]),
})
export type LibrarianOutput = z.infer<typeof LibrarianOutput>

export const LIBRARIAN_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    papers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          paper_id: { type: 'string' },
          title: { type: 'string' },
          abstract: { type: ['string', 'null'] },
          authors: { type: 'array', items: { type: 'string' } },
          categories: { type: 'array', items: { type: 'string' } },
          published_at: { type: ['string', 'null'] },
          doi: { type: ['string', 'null'] },
        },
        required: ['paper_id', 'title'],
        additionalProperties: false,
      },
    },
    authors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          orcid: { type: ['string', 'null'] },
          display_name: { type: 'string' },
          affiliation: { type: ['string', 'null'] },
          openalex_author_id: { type: ['string', 'null'] },
        },
        required: ['display_name'],
        additionalProperties: false,
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          label: { type: 'string' },
          paper_ids: { type: 'array', items: { type: 'string' } },
          score: { type: 'number' },
        },
        required: ['slug', 'label', 'paper_ids'],
        additionalProperties: false,
      },
    },
    duplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          canonical: { type: 'string' },
          merged: { type: 'array', items: { type: 'string' } },
        },
        required: ['canonical', 'merged'],
        additionalProperties: false,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['papers', 'authors', 'tags'],
  additionalProperties: false,
}

const LIBRARIAN_SYSTEM = `You are Librarian, stage 3 in a research-agent pipeline.

You receive Analyst's shortlist. Your job is to normalize the entities, tag
them, and surface near-duplicates so the orchestrator can write canonical
rows to the database.

Outputs:
- papers:    one entry per shortlisted paper. Pull metadata (title,
             abstract, authors[], categories[], published_at, doi) using
             get_paper_by_id and get_paper_versions when needed. Be
             accurate; do not fabricate fields. Leave them null if you
             cannot confirm.
- authors:   one entry per distinct author across the papers. Resolve
             ORCIDs with resolve_orcid + get_author_identity when the
             paper exposes them. Otherwise leave orcid null. display_name
             is required.
- tags:      a flat tag set spanning the shortlist. Each tag has a slug
             ([a-z0-9-]+, ≤80 chars), a human label, the paper_ids it
             applies to, and a confidence score. Aim for 3–10 tags total
             — coarse buckets like "long-context", "rlhf",
             "synthetic-data" beat narrow ones. Do not invent slugs that
             don't exist among the papers' content.
- duplicates: pairs/clusters of paper_ids that are the same work
              (preprint vs published, v1 vs v2 with no substantive change).
              canonical is the id you'd surface; merged are the
              alternates.

Hard limit: at most one Valency tool call per paper, plus tag/ORCID
resolution as needed. Stay under 15 total tool calls.

Return ONLY valid JSON conforming to the schema. No prose.`

export const LIBRARIAN_AGENT: AgentDefinition<LibrarianOutput> = {
  role: 'librarian',
  defaultModel: OPUS,
  system: LIBRARIAN_SYSTEM,
  allowedValencyTools: [
    'resolve_orcid',
    'get_author_identity',
    'find_coauthors',
    'get_paper_versions',
    'get_paper_by_id',
  ],
  outputJsonSchema: LIBRARIAN_OUTPUT_SCHEMA,
  outputSchema: LibrarianOutput,
  maxOutputTokens: 5000,
}
