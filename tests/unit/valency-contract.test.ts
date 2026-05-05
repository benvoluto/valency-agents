import { readFileSync, existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AnalyzeCorpusResult,
  AuthorIdentityResult,
  AuthorProfileResult,
  BatchAuthorCategoriesResult,
  CompareAuthorsResult,
  CountPapersResult,
  ExportBibtexResult,
  ExportCsvResult,
  ExportFromFilterResult,
  ExportJsonResult,
  FieldCoverageResult,
  FindCoauthorsResult,
  IdentifyDomainsResult,
  IdentifyProlificResult,
  KeywordTrendResult,
  ListSourcesResult,
  PaperListResult,
  PaperVersionsResult,
  ResolveOrcidResult,
  SinglePaperResult,
  TrendBatchResult,
  TrendResult,
} from '@/lib/valency/tools'
import { z } from 'zod'

const FIXTURES_DIR = path.resolve('tests/fixtures/valency')

const SCHEMA_BY_TOOL: Record<string, z.ZodTypeAny> = {
  search_by_title: PaperListResult,
  search_by_abstract: PaperListResult,
  search_by_abstract_batch: PaperListResult,
  search_by_author: PaperListResult,
  search_by_category: PaperListResult,
  search_by_venue: PaperListResult,
  search_by_comments: PaperListResult,
  search_cross_category: PaperListResult,
  semantic_search_papers: PaperListResult,
  find_similar_papers: PaperListResult,
  get_citing_papers: PaperListResult,
  filter_by_date_range: PaperListResult,
  filter_by_categories: PaperListResult,
  filter_by_license: PaperListResult,
  filter_papers_with_doi: PaperListResult,
  resolve_orcid: ResolveOrcidResult,
  get_author_profile: AuthorProfileResult,
  get_author_identity: AuthorIdentityResult,
  find_coauthors: FindCoauthorsResult,
  find_papers_by_researcher: PaperListResult,
  compare_authors: CompareAuthorsResult,
  batch_author_categories: BatchAuthorCategoriesResult,
  identify_prolific_authors: IdentifyProlificResult,
  get_paper_by_id: SinglePaperResult,
  get_paper_versions: PaperVersionsResult,
  count_papers: CountPapersResult,
  analyze_corpus_metrics: AnalyzeCorpusResult,
  get_publication_trends: TrendResult,
  get_publication_trends_batch: TrendBatchResult,
  get_keyword_trends: KeywordTrendResult,
  identify_research_domains: IdentifyDomainsResult,
  list_sources: ListSourcesResult,
  get_field_coverage: FieldCoverageResult,
  export_papers_json: ExportJsonResult,
  export_papers_csv: ExportCsvResult,
  export_papers_bibtex: ExportBibtexResult,
  export_from_filter: ExportFromFilterResult,
}

function loadFixture(tool: string): unknown | null {
  const file = path.join(FIXTURES_DIR, `${tool}.json`)
  if (!existsSync(file)) return null
  return JSON.parse(readFileSync(file, 'utf8'))
}

describe('Valency contract', () => {
  for (const tool of Object.keys(SCHEMA_BY_TOOL)) {
    it(`${tool}: golden response parses`, () => {
      const fixture = loadFixture(tool)
      if (fixture === null) {
        // Run `npm run record:valency` to populate fixtures.
        return
      }
      const schema = SCHEMA_BY_TOOL[tool]
      expect(() => schema.parse(fixture)).not.toThrow()
    })
  }

  it('every recorded fixture has a schema mapping', () => {
    if (!existsSync(FIXTURES_DIR)) return
    const recorded = readdirSync(FIXTURES_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
    const known = new Set(Object.keys(SCHEMA_BY_TOOL))
    const orphans = recorded.filter((t) => !known.has(t))
    expect(orphans).toEqual([])
  })
})
