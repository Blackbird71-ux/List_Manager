import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'

interface SearchResult {
  type: 'checklist' | 'item'
  id: string
  title: string
  snippet: string
  score: number
  checklistId?: string
  checklistTitle?: string
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50') || 50, 100)

  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const { role, organizationId } = session.user
  const where = checklistAccessWhere(session.user.id, role, organizationId)

  // SQLite LIKE is case-insensitive for ASCII, so `contains` matches
  // regardless of case; scoring below re-checks with toLowerCase.
  // The third OR arm returns checklists whose only match is inside an item.
  const checklists = await prisma.checklist.findMany({
    where: {
      ...where,
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
        { items: { some: { OR: [{ text: { contains: q } }, { notes: { contains: q } }] } } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      items: {
        where: {
          OR: [
            { text: { contains: q } },
            { notes: { contains: q } },
          ],
        },
        select: {
          id: true,
          text: true,
          notes: true,
        },
      },
    },
    take: limit,
  })

  const results: SearchResult[] = []

  for (const cl of checklists) {
    let score = 0
    let snippet = ''

    // Title match gets highest score
    if (cl.title.toLowerCase().includes(q.toLowerCase())) {
      score += 10
      snippet = cl.title
    }

    // Description match
    if (cl.description?.toLowerCase().includes(q.toLowerCase())) {
      score += 5
      if (!snippet) snippet = cl.description.substring(0, 100)
    }

    // Add checklist result if scored
    if (score > 0) {
      results.push({
        type: 'checklist',
        id: cl.id,
        title: cl.title,
        snippet: snippet || '',
        score,
      })
    }

    // Score item matches
    for (const item of cl.items) {
      let itemScore = 0
      let itemSnippet = ''

      if (item.text.toLowerCase().includes(q.toLowerCase())) {
        itemScore += 3
        itemSnippet = item.text
      }

      if (item.notes?.toLowerCase().includes(q.toLowerCase())) {
        itemScore += 2
        if (!itemSnippet) itemSnippet = item.notes
      }

      if (itemScore > 0) {
        results.push({
          type: 'item',
          id: item.id,
          title: item.text,
          snippet: itemSnippet || '',
          score: itemScore,
          checklistId: cl.id,
          checklistTitle: cl.title,
        })
      }
    }
  }

  // Sort by score descending, take top results
  results.sort((a, b) => b.score - a.score)

  return NextResponse.json({ results: results.slice(0, limit) })
}
