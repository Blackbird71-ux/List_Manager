import { NextResponse } from 'next/server'
import readXlsxFile from 'read-excel-file/node'
import mammoth from 'mammoth'
import { auth } from '@/lib/auth'
import { htmlToText, parseCsv, parseRows, parseTextList } from '@/lib/import-parser'

const MAX_BYTES = 2 * 1024 * 1024

// Reads an uploaded .txt/.md/.csv/.xlsx/.docx and returns a draft template. Nothing
// is saved — the client shows the draft in the template editor first.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is too large (2 MB max)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  const title = file.name.replace(/\.[^.]+$/, '').trim() || 'Imported list'

  try {
    let draft
    if (ext === 'xlsx') {
      const sheets = await readXlsxFile(Buffer.from(await file.arrayBuffer()))
      draft = parseRows(sheets[0]?.data ?? [])
    } else if (ext === 'csv') {
      draft = parseRows(parseCsv(await file.text()))
    } else if (ext === 'docx') {
      const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(await file.arrayBuffer()) })
      draft = parseTextList(htmlToText(value))
    } else if (ext === 'txt' || ext === 'md') {
      draft = parseTextList(await file.text())
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type — use .txt, .csv, .xlsx or .docx' },
        { status: 400 }
      )
    }
    if (draft.items.length === 0 && draft.fields.length === 0) {
      return NextResponse.json({ error: 'No list items found in that file' }, { status: 400 })
    }
    return NextResponse.json({ title, ...draft })
  } catch {
    return NextResponse.json({ error: 'Could not read that file' }, { status: 400 })
  }
}
