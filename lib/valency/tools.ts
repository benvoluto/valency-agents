import { z } from 'zod'
import type { ValencyClient } from './client'

// ─── Reusable shapes ──────────────────────────────────────────────────────

export const Meta = z
  .object({
    request_id: z.string().optional(),
    tool: z.string().optional(),
    duration_ms: z.number().optional(),
    server_version: z.string().optional(),
    db_duration_ms: z.number().optional(),
  })
  .passthrough()

export const PaperRow = z
  .object({
    id: z.string(),
    title: z.string(),
    abstract: z.string().nullable().optional(),
    authors: z.array(z.string()).optional(),
    categories: z.array(z.string()).nullable().optional(),
    datestamp: z.string().nullable().optional(),
    doi: z.string().nullable().optional(),
    journal_ref: z.string().nullable().optional(),
    source: z.string().optional(),
    first_submitted: z.string().nullable().optional(),
    relevance_score: z.number().nullable().optional(),
    match_quality: z.string().nullable().optional(),
    citation_count: z.number().nullable().optional(),
    url: z.string().nullable().optional(),
  })
  .passthrough()
export type PaperRow = z.infer<typeof PaperRow>

export const AuthorAffiliation = z
  .object({
    institution: z.string(),
    country_code: z.string().optional(),
    work_count: z.number().optional(),
  })
  .passthrough()

export const AuthorProfile = z
  .object({
    openalex_author_id: z.string().nullable().optional(),
    display_name: z.string(),
    orcid: z.string().nullable().optional(),
    works_count: z.number().optional(),
    cited_by_count: z.number().optional(),
    h_index: z.number().optional(),
    affiliations: z.array(AuthorAffiliation).optional(),
    current_institution: z
      .object({
        institution: z.string(),
        country_code: z.string().optional(),
        derived: z.boolean().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()
export type AuthorProfile = z.infer<typeof AuthorProfile>

const baseEnvelope = {
  count: z.number().optional(),
  warnings: z.array(z.string()).default([]),
  _meta: Meta.optional(),
}

// ─── Per-tool result schemas ──────────────────────────────────────────────

export const PaperListResult = z
  .object({ ...baseEnvelope, papers: z.array(PaperRow).default([]) })
  .passthrough()
export type PaperListResult = z.infer<typeof PaperListResult>

export const SinglePaperResult = z
  .object({ ...baseEnvelope, paper: PaperRow.nullable() })
  .passthrough()

export const ResolveOrcidResult = z
  .object({
    ...baseEnvelope,
    orcid: z.string(),
    profile: AuthorProfile.nullable(),
    papers_in_corpus: z.array(PaperRow).default([]),
    candidates: z.array(z.unknown()).default([]),
  })
  .passthrough()
export type ResolveOrcidResult = z.infer<typeof ResolveOrcidResult>

export const FindCoauthorsResult = z
  .object({
    ...baseEnvelope,
    author: z.string(),
    resolved_name: z.string().optional(),
    coauthors: z.array(
      z
        .object({
          coauthor: z.string(),
          coauthor_norm: z.string().optional(),
          shared_papers: z.number(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export type FindCoauthorsResult = z.infer<typeof FindCoauthorsResult>

export const ListSourcesResult = z
  .object({
    count: z.number(),
    _meta: Meta.optional(),
    sources: z.array(
      z
        .object({
          source: z.string(),
          paper_count: z.number(),
          earliest_date: z.string().optional(),
          latest_date: z.string().optional(),
          papers_with_embeddings: z.number().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export type ListSourcesResult = z.infer<typeof ListSourcesResult>

export const IdentifyDomainsResult = z
  .object({
    ...baseEnvelope,
    categories: z.array(
      z
        .object({
          category: z.string(),
          paper_count: z.number(),
          percentage: z.number().optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export type IdentifyDomainsResult = z.infer<typeof IdentifyDomainsResult>

export const IdentifyProlificResult = z
  .object({
    ...baseEnvelope,
    authors: z.array(
      z
        .object({
          author: z.string(),
          paper_count: z.number(),
        })
        .passthrough(),
    ).optional(),
  })
  .passthrough()

export const CountPapersResult = z
  .object({
    total: z.number(),
    count: z.number().optional(),
    _meta: Meta.optional(),
  })
  .passthrough()
export type CountPapersResult = z.infer<typeof CountPapersResult>

export const TrendResult = z
  .object({
    ...baseEnvelope,
    granularity: z.string().optional(),
    periods: z.array(
      z
        .object({
          period: z.string(),
          paper_count: z.number(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
export type TrendResult = z.infer<typeof TrendResult>

export const TrendBatchResult = z
  .object({
    ...baseEnvelope,
    granularity: z.string().optional(),
    series: z
      .array(
        z
          .object({
            category: z.string(),
            periods: z
              .array(
                z
                  .object({
                    period: z.string(),
                    paper_count: z.number(),
                  })
                  .passthrough(),
              )
              .default([]),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export const KeywordTrendResult = z
  .object({
    ...baseEnvelope,
    query: z.string().optional(),
    granularity: z.string().optional(),
    periods: z
      .array(
        z
          .object({
            period: z.string(),
            paper_count: z.number(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export const AnalyzeCorpusResult = z
  .object({
    total_papers: z.number(),
    _meta: Meta.optional(),
  })
  .passthrough()

export const AuthorProfileResult = z
  .object({
    ...baseEnvelope,
    author: z.string(),
    profile: AuthorProfile.nullable().optional(),
  })
  .passthrough()

export const CompareAuthorsResult = z
  .object({
    ...baseEnvelope,
    authors: z.array(z.unknown()),
  })
  .passthrough()

export const BatchAuthorCategoriesResult = z
  .object({
    ...baseEnvelope,
    authors: z.union([
      z.array(z.unknown()),
      z.record(z.string(), z.unknown()),
    ]),
  })
  .passthrough()

export const AuthorIdentityResult = z
  .object({
    ...baseEnvelope,
    matches: z.array(z.unknown()).optional(),
  })
  .passthrough()

export const PaperVersionsResult = z
  .object({
    ...baseEnvelope,
    paper_id: z.string().optional(),
    versions: z.array(z.unknown()).default([]),
  })
  .passthrough()

export const ExportJsonResult = z
  .object({
    ...baseEnvelope,
    format: z.string().optional(),
    paper_count: z.number().optional(),
    requested_count: z.number().optional(),
    not_found: z.number().optional(),
    papers: z.array(PaperRow).optional(),
  })
  .passthrough()

export const ExportCsvResult = z
  .object({
    ...baseEnvelope,
    format: z.string().optional(),
    paper_count: z.number().optional(),
    csv: z.string().optional(),
  })
  .passthrough()

export const ExportBibtexResult = z
  .object({
    ...baseEnvelope,
    format: z.string().optional(),
    paper_count: z.number().optional(),
    requested_count: z.number().optional(),
    not_found: z.number().optional(),
    bibtex: z.string().optional(),
    entries: z.array(z.unknown()).optional(),
  })
  .passthrough()

export const ExportFromFilterResult = z
  .object({
    ...baseEnvelope,
    format: z.string().optional(),
  })
  .passthrough()

export const FieldCoverageResult = z
  .object({
    ...baseEnvelope,
    field: z.string().optional(),
    coverage: z.unknown().optional(),
  })
  .passthrough()

export const SubmitFeedbackResult = z
  .object({
    ...baseEnvelope,
    accepted: z.boolean().optional(),
  })
  .passthrough()

// ─── Wrapper inputs ───────────────────────────────────────────────────────

type Source = 'arxiv' | 'biorxiv' | 'medrxiv' | 'pubmed' | (string & {})
type SortBy = 'relevance' | 'recency' | 'citations' | 'date' | (string & {})
type Granularity = 'day' | 'week' | 'month' | 'year' | (string & {})

export interface CommonListOpts {
  limit?: number
  source?: Source
  start_date?: string
  end_date?: string
  max_authors?: number
  include_abstract?: boolean
  sort_by?: SortBy
  enrich_citations?: boolean
}

// ─── Tool-by-tool wrappers ────────────────────────────────────────────────

export const tools = {
  // Search & discovery
  searchByTitle: (
    c: ValencyClient,
    args: CommonListOpts & {
      query: string
      author?: string
      category?: string
      strict_mode?: 'prefix' | 'exact' | 'fuzzy'
      semantic_fallback?: boolean
    },
  ) => c.callTool('search_by_title', args, PaperListResult),

  searchByAbstract: (
    c: ValencyClient,
    args: CommonListOpts & {
      query: string
      category?: string
      exclude_categories?: string[]
      author?: string
      strict_mode?: string
      phrase_mode?: boolean
    },
  ) => c.callTool('search_by_abstract', args, PaperListResult),

  searchByAbstractBatch: (
    c: ValencyClient,
    args: Omit<CommonListOpts, 'sort_by'> & {
      queries: string[]
      category?: string
      exclude_categories?: string[]
      phrase_mode?: boolean
    },
  ) => c.callTool('search_by_abstract_batch', args, PaperListResult),

  searchByAuthor: (
    c: ValencyClient,
    args: CommonListOpts & {
      author: string
      strict_mode?: string
    },
  ) => c.callTool('search_by_author', args, PaperListResult),

  searchByCategory: (
    c: ValencyClient,
    args: CommonListOpts & { category: string },
  ) => c.callTool('search_by_category', args, PaperListResult),

  searchByVenue: (
    c: ValencyClient,
    args: CommonListOpts & {
      venue: string
      category?: string
      query?: string
      include_comments?: boolean
    },
  ) => c.callTool('search_by_venue', args, PaperListResult),

  searchByComments: (
    c: ValencyClient,
    args: CommonListOpts & { query: string; category?: string },
  ) => c.callTool('search_by_comments', args, PaperListResult),

  searchCrossCategory: (
    c: ValencyClient,
    args: CommonListOpts & { query: string; categories: string[] },
  ) => c.callTool('search_cross_category', args, PaperListResult),

  semanticSearchPapers: (
    c: ValencyClient,
    args: CommonListOpts & {
      query: string
      category?: string
      phrase_mode?: boolean
    },
  ) => c.callTool('semantic_search_papers', args, PaperListResult),

  findSimilarPapers: (
    c: ValencyClient,
    args: CommonListOpts & {
      paper_id: string
      result_source?: Source
    },
  ) => c.callTool('find_similar_papers', args, PaperListResult),

  getCitingPapers: (
    c: ValencyClient,
    args: { paper_id: string; limit?: number; sort_by?: SortBy; source?: Source; max_authors?: number },
  ) => c.callTool('get_citing_papers', args, PaperListResult),

  // Filtering
  filterByDateRange: (
    c: ValencyClient,
    args: CommonListOpts & {
      start_date: string
      end_date: string
      category?: string
    },
  ) => c.callTool('filter_by_date_range', args, PaperListResult),

  filterByCategories: (
    c: ValencyClient,
    args: CommonListOpts & { categories: string[] },
  ) => c.callTool('filter_by_categories', args, PaperListResult),

  filterByLicense: (
    c: ValencyClient,
    args: CommonListOpts & { license: string; category?: string },
  ) => c.callTool('filter_by_license', args, PaperListResult),

  filterPapersWithDoi: (
    c: ValencyClient,
    args: CommonListOpts & { category?: string },
  ) => c.callTool('filter_papers_with_doi', args, PaperListResult),

  // Author intelligence
  resolveOrcid: (
    c: ValencyClient,
    args: { orcid: string; limit?: number; sort_by?: SortBy; source?: Source; enrich_citations?: boolean },
  ) => c.callTool('resolve_orcid', args, ResolveOrcidResult),

  getAuthorProfile: (
    c: ValencyClient,
    args: { author: string; orcid?: string; source?: Source },
  ) => c.callTool('get_author_profile', args, AuthorProfileResult),

  getAuthorIdentity: (
    c: ValencyClient,
    args: {
      author?: string
      paper_id?: string
      orcid?: string
      openalex_author_id?: string
      source?: Source
    },
  ) => c.callTool('get_author_identity', args, AuthorIdentityResult),

  findCoauthors: (
    c: ValencyClient,
    args: { author: string; limit?: number; exclude_mega_collaborations?: boolean; source?: Source },
  ) => c.callTool('find_coauthors', args, FindCoauthorsResult),

  findPapersByResearcher: (
    c: ValencyClient,
    args: {
      author?: string
      orcid?: string
      openalex_author_id?: string
      paper_id?: string
      limit?: number
      sort_by?: SortBy
      source?: Source
      enrich_citations?: boolean
    },
  ) => c.callTool('find_papers_by_researcher', args, PaperListResult),

  compareAuthors: (
    c: ValencyClient,
    args: { authors: string[]; source?: Source },
  ) => c.callTool('compare_authors', args, CompareAuthorsResult),

  batchAuthorCategories: (
    c: ValencyClient,
    args: { authors: string[]; max_categories?: number; source?: Source },
  ) => c.callTool('batch_author_categories', args, BatchAuthorCategoriesResult),

  identifyProlificAuthors: (
    c: ValencyClient,
    args: { category?: string; limit?: number; source?: Source } = {},
  ) => c.callTool('identify_prolific_authors', args, IdentifyProlificResult),

  // Paper details
  getPaperById: (
    c: ValencyClient,
    args: {
      paper_id: string
      source?: Source
      max_authors?: number
      include_abstract?: boolean
      enrich_citations?: boolean
    },
  ) => c.callTool('get_paper_by_id', args, SinglePaperResult),

  getPaperVersions: (
    c: ValencyClient,
    args: { paper_id: string; source?: Source },
  ) => c.callTool('get_paper_versions', args, PaperVersionsResult),

  // Trends & analytics
  countPapers: (
    c: ValencyClient,
    args: {
      start_date?: string
      end_date?: string
      category?: string
      author?: string
      strict_mode?: string
      title_query?: string
      license?: string
      include_versions?: boolean
      source?: Source
    } = {},
  ) => c.callTool('count_papers', args, CountPapersResult),

  analyzeCorpusMetrics: (
    c: ValencyClient,
    args: { category?: string; include_versions?: boolean; source?: Source } = {},
  ) => c.callTool('analyze_corpus_metrics', args, AnalyzeCorpusResult),

  getPublicationTrends: (
    c: ValencyClient,
    args: {
      category: string
      granularity?: Granularity
      start_date?: string
      end_date?: string
      format?: string
      source?: Source
    },
  ) => c.callTool('get_publication_trends', args, TrendResult),

  getPublicationTrendsBatch: (
    c: ValencyClient,
    args: {
      categories: string[]
      granularity?: Granularity
      start_date?: string
      end_date?: string
      format?: string
      source?: Source
    },
  ) => c.callTool('get_publication_trends_batch', args, TrendBatchResult),

  getKeywordTrends: (
    c: ValencyClient,
    args: {
      query: string
      category?: string
      granularity?: Granularity
      start_date?: string
      end_date?: string
      format?: string
      source?: Source
    },
  ) => c.callTool('get_keyword_trends', args, KeywordTrendResult),

  // Corpus info
  identifyResearchDomains: (
    c: ValencyClient,
    args: { limit?: number; source?: Source } = {},
  ) => c.callTool('identify_research_domains', args, IdentifyDomainsResult),

  listSources: (c: ValencyClient) =>
    c.callTool('list_sources', {}, ListSourcesResult),

  getFieldCoverage: (
    c: ValencyClient,
    args: { field: string; category?: string; limit?: number; source?: Source },
  ) => c.callTool('get_field_coverage', args, FieldCoverageResult),

  // Export
  exportPapersJson: (
    c: ValencyClient,
    args: { paper_ids: string[] },
  ) => c.callTool('export_papers_json', args, ExportJsonResult),

  exportPapersCsv: (
    c: ValencyClient,
    args: { paper_ids: string[]; fields?: string[] },
  ) => c.callTool('export_papers_csv', args, ExportCsvResult),

  exportPapersBibtex: (
    c: ValencyClient,
    args: { paper_ids: string[] },
  ) => c.callTool('export_papers_bibtex', args, ExportBibtexResult),

  exportFromFilter: (
    c: ValencyClient,
    args: {
      license?: string
      category?: string
      start_date?: string
      end_date?: string
      format?: string
      fields?: string[]
      limit?: number
      source?: Source
    } = {},
  ) => c.callTool('export_from_filter', args, ExportFromFilterResult),

  // Feedback
  submitFeedback: (
    c: ValencyClient,
    args: {
      inquiry_summary?: string
      bug_report?: string
      feature_request?: string
      search_quality?: number
      data_quality?: number
      response_time_perception?: string
      nps_score?: number
      num_valency_calls_this_session?: number
      context?: Record<string, unknown>
    },
  ) => c.callTool('submit_feedback', args, SubmitFeedbackResult),
}

/** All wrappers as a flat list — used by contract tests. */
export const TOOL_NAMES = [
  'search_by_title',
  'search_by_abstract',
  'search_by_abstract_batch',
  'search_by_author',
  'search_by_category',
  'search_by_venue',
  'search_by_comments',
  'search_cross_category',
  'semantic_search_papers',
  'find_similar_papers',
  'get_citing_papers',
  'filter_by_date_range',
  'filter_by_categories',
  'filter_by_license',
  'filter_papers_with_doi',
  'resolve_orcid',
  'get_author_profile',
  'get_author_identity',
  'find_coauthors',
  'find_papers_by_researcher',
  'compare_authors',
  'batch_author_categories',
  'identify_prolific_authors',
  'get_paper_by_id',
  'get_paper_versions',
  'count_papers',
  'analyze_corpus_metrics',
  'get_publication_trends',
  'get_publication_trends_batch',
  'get_keyword_trends',
  'identify_research_domains',
  'list_sources',
  'get_field_coverage',
  'export_papers_json',
  'export_papers_csv',
  'export_papers_bibtex',
  'export_from_filter',
  'submit_feedback',
] as const
