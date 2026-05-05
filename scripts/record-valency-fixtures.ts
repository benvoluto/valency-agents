/**
 * Records a golden response for every tool wrapper in `lib/valency/tools.ts`.
 * Output goes to `tests/fixtures/valency/<tool>.json`.
 *
 * Usage:
 *   tsx scripts/record-valency-fixtures.ts
 *
 * Requires VALENCY_BEARER_TOKEN in env. Skips tools that mutate (submit_feedback)
 * or that need inputs we can't safely synthesize (export_papers_*).
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { config } from 'dotenv'
import { ValencyClient } from '../lib/valency/client'
import { tools } from '../lib/valency/tools'

config({ path: '.vercel/.env.development.local' })

const FIXTURES_DIR = path.resolve('tests/fixtures/valency')
mkdirSync(FIXTURES_DIR, { recursive: true })

const token = process.env.VALENCY_BEARER_TOKEN
if (!token) {
  console.error('VALENCY_BEARER_TOKEN not set')
  process.exit(1)
}
const client = new ValencyClient({
  token,
  rateLimitKey: 'fixture-recorder',
  logger: () => {},
  maxAttempts: 2,
  timeoutMs: 30_000,
})

const KNOWN_PAPER_ID = '2406.12345'
const KNOWN_AUTHOR = 'Yann LeCun'
const KNOWN_ORCID = '0000-0002-1825-0097'
const KNOWN_CATEGORY = 'cs.LG'

interface Recipe {
  name: string
  run: () => Promise<unknown>
  /** Skip recording if the recorded response is too noisy / large. */
  skip?: string
}

const recipes: Recipe[] = [
  { name: 'search_by_title', run: () => tools.searchByTitle(client, { query: 'attention is all you need', limit: 2 }) },
  { name: 'search_by_abstract', run: () => tools.searchByAbstract(client, { query: 'mixture of experts', limit: 2 }) },
  { name: 'search_by_abstract_batch', run: () => tools.searchByAbstractBatch(client, { queries: ['attention sinks'], limit: 2 }) },
  { name: 'search_by_author', run: () => tools.searchByAuthor(client, { author: KNOWN_AUTHOR, limit: 2 }) },
  { name: 'search_by_category', run: () => tools.searchByCategory(client, { category: KNOWN_CATEGORY, limit: 2 }) },
  { name: 'search_by_venue', run: () => tools.searchByVenue(client, { venue: 'NeurIPS', limit: 2 }) },
  { name: 'search_by_comments', run: () => tools.searchByComments(client, { query: 'accepted to ICLR', limit: 2 }) },
  { name: 'search_cross_category', run: () => tools.searchCrossCategory(client, { query: 'transformers', categories: ['cs.LG', 'cs.CL'], limit: 2 }) },
  { name: 'semantic_search_papers', run: () => tools.semanticSearchPapers(client, { query: 'long context attention sinks', limit: 2 }) },
  { name: 'find_similar_papers', run: () => tools.findSimilarPapers(client, { paper_id: KNOWN_PAPER_ID, limit: 2 }) },
  { name: 'get_citing_papers', run: () => tools.getCitingPapers(client, { paper_id: KNOWN_PAPER_ID, limit: 2 }) },
  { name: 'filter_by_date_range', run: () => tools.filterByDateRange(client, { start_date: '2025-12-01', end_date: '2025-12-02', limit: 2 }) },
  { name: 'filter_by_categories', run: () => tools.filterByCategories(client, { categories: ['cs.LG'], limit: 2 }) },
  { name: 'filter_by_license', run: () => tools.filterByLicense(client, { license: 'CC-BY-4.0', limit: 2 }) },
  { name: 'filter_papers_with_doi', run: () => tools.filterPapersWithDoi(client, { limit: 2 }) },
  { name: 'resolve_orcid', run: () => tools.resolveOrcid(client, { orcid: KNOWN_ORCID, limit: 2 }) },
  { name: 'get_author_profile', run: () => tools.getAuthorProfile(client, { author: KNOWN_AUTHOR }) },
  { name: 'get_author_identity', run: () => tools.getAuthorIdentity(client, { author: KNOWN_AUTHOR }) },
  { name: 'find_coauthors', run: () => tools.findCoauthors(client, { author: KNOWN_AUTHOR, limit: 3 }) },
  { name: 'find_papers_by_researcher', run: () => tools.findPapersByResearcher(client, { author: KNOWN_AUTHOR, limit: 2 }) },
  { name: 'compare_authors', run: () => tools.compareAuthors(client, { authors: [KNOWN_AUTHOR, 'Geoffrey Hinton'] }) },
  { name: 'batch_author_categories', run: () => tools.batchAuthorCategories(client, { authors: [KNOWN_AUTHOR], max_categories: 5 }) },
  { name: 'identify_prolific_authors', run: () => tools.identifyProlificAuthors(client, { category: KNOWN_CATEGORY, limit: 5 }) },
  { name: 'get_paper_by_id', run: () => tools.getPaperById(client, { paper_id: KNOWN_PAPER_ID }) },
  { name: 'get_paper_versions', run: () => tools.getPaperVersions(client, { paper_id: KNOWN_PAPER_ID }) },
  { name: 'count_papers', run: () => tools.countPapers(client, { category: KNOWN_CATEGORY }) },
  { name: 'analyze_corpus_metrics', run: () => tools.analyzeCorpusMetrics(client, { category: KNOWN_CATEGORY }) },
  { name: 'get_publication_trends', run: () => tools.getPublicationTrends(client, { category: KNOWN_CATEGORY, granularity: 'year' }) },
  { name: 'get_publication_trends_batch', run: () => tools.getPublicationTrendsBatch(client, { categories: ['cs.LG'], granularity: 'year' }) },
  { name: 'get_keyword_trends', run: () => tools.getKeywordTrends(client, { query: 'attention', granularity: 'year' }) },
  { name: 'identify_research_domains', run: () => tools.identifyResearchDomains(client, { limit: 5 }) },
  { name: 'list_sources', run: () => tools.listSources(client) },
  { name: 'get_field_coverage', run: () => tools.getFieldCoverage(client, { field: 'journal_ref', category: KNOWN_CATEGORY }) },
  { name: 'export_papers_json', run: () => tools.exportPapersJson(client, { paper_ids: [KNOWN_PAPER_ID] }) },
  { name: 'export_papers_csv', run: () => tools.exportPapersCsv(client, { paper_ids: [KNOWN_PAPER_ID] }) },
  { name: 'export_papers_bibtex', run: () => tools.exportPapersBibtex(client, { paper_ids: [KNOWN_PAPER_ID] }) },
  { name: 'export_from_filter', run: () => tools.exportFromFilter(client, { category: KNOWN_CATEGORY, limit: 2 }) },
  { name: 'submit_feedback', skip: 'mutating', run: async () => null },
]

async function main() {
const result: Record<string, 'ok' | 'skip' | 'fail'> = {}

for (const r of recipes) {
  const file = path.join(FIXTURES_DIR, `${r.name}.json`)
  if (r.skip) {
    console.log(`skip   ${r.name} (${r.skip})`)
    result[r.name] = 'skip'
    continue
  }
  if (existsSync(file) && !process.argv.includes('--force')) {
    console.log(`have   ${r.name} (--force to overwrite)`)
    result[r.name] = 'ok'
    continue
  }
  try {
    const value = await r.run()
    writeFileSync(file, JSON.stringify(value, null, 2))
    console.log(`wrote  ${r.name}`)
    result[r.name] = 'ok'
  } catch (err) {
    console.warn(`FAIL   ${r.name}: ${(err as Error).message}`)
    result[r.name] = 'fail'
  }
}

const failed = Object.entries(result).filter(([, v]) => v === 'fail').map(([k]) => k)
console.log(
  `\nSummary: ${Object.values(result).filter((v) => v === 'ok').length} ok, ${Object.values(result).filter((v) => v === 'skip').length} skip, ${failed.length} fail`,
)
if (failed.length > 0) {
  console.log(`Failed: ${failed.join(', ')}`)
  process.exit(1)
}
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
