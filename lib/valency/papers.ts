import { ValencyClient } from './client'
import { tools, type PaperRow } from './tools'

export type { PaperRow }

/**
 * Returns the most relevant papers for a researcher. Prefers ORCID resolution
 * when supplied; falls back to author-name search.
 */
export async function gatherResearcherPapers(
  client: ValencyClient,
  args: { orcid?: string | null; name?: string | null; limit?: number },
): Promise<PaperRow[]> {
  const limit = args.limit ?? 12

  if (args.orcid) {
    const result = await tools.resolveOrcid(client, {
      orcid: args.orcid,
      limit,
    })
    if (result.papers_in_corpus.length > 0) {
      return result.papers_in_corpus.slice(0, limit)
    }
  }

  if (args.name) {
    const result = await tools.searchByAuthor(client, {
      author: args.name,
      limit,
    })
    return result.papers.slice(0, limit)
  }

  return []
}
