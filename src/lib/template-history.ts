import type { Prisma } from '@prisma/client'

export interface TemplateSnapshot {
  items: {
    text: string
    priority: string | null
    section: string
    indent: number
    conditionIndex: number | null
    conditionResult: string
    dueOffsetDays: number | null
  }[]
  customFields: { name: string; type: string; options: string[]; required: boolean }[]
}

type SnapshotSource = {
  items: {
    text: string
    priority: string | null
    section: string
    indent: number
    conditionIndex: number | null
    conditionResult: string
    dueOffsetDays: number | null
  }[]
  customFields: { name: string; type: string; options: string; required: boolean }[]
}

/** Items and fields in the shape the template PATCH route accepts (so a restore is just a PATCH). */
export function buildSnapshot(t: SnapshotSource): TemplateSnapshot {
  return {
    items: t.items.map((i) => ({
      text: i.text,
      priority: i.priority,
      section: i.section,
      indent: i.indent,
      conditionIndex: i.conditionIndex,
      conditionResult: i.conditionResult,
      dueOffsetDays: i.dueOffsetDays,
    })),
    customFields: t.customFields.map((f) => {
      let options: string[] = []
      try {
        options = JSON.parse(f.options)
      } catch {}
      return { name: f.name, type: f.type, options, required: f.required }
    }),
  }
}

/** Store a version's snapshot; an already-recorded version is left untouched. */
export async function recordVersion(
  tx: Prisma.TransactionClient,
  templateId: string,
  version: number,
  source: SnapshotSource,
  savedByName: string
) {
  await tx.templateVersion.upsert({
    where: { templateId_version: { templateId, version } },
    create: { templateId, version, snapshot: JSON.stringify(buildSnapshot(source)), savedByName },
    update: {},
  })
}
