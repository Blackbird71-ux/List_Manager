import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { publicOrigin, qrSvg } from '@/lib/qr'
import { PrintButton } from '@/components/PrintButton'

// A printable QR label for a template — stick it on the fridge, vehicle or room it covers.
// Scanning opens the open checklist for it, or offers to start one.
export default async function TemplateQrPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect(`/login?next=/templates/${id}/qr`)

  const template = await prisma.template.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, title: true, description: true },
  })
  if (!template) notFound()

  const url = `${await publicOrigin()}/scan/${template.id}`
  const svg = await qrSvg(url)

  return (
    <div className="mx-auto max-w-md space-y-5 bg-white p-6 text-black print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/templates" className="text-sm text-blue-700 hover:underline">
          ← Back to templates
        </Link>
        <PrintButton />
      </div>
      <div className="break-inside-avoid rounded-xl border-2 border-black p-6 text-center">
        <h1 className="text-2xl font-bold">{template.title}</h1>
        {template.description && <p className="mt-1 text-sm text-gray-700">{template.description}</p>}
        <div className="mx-auto my-4 w-64" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="text-sm font-semibold">Scan to open this checklist</p>
        <p className="mt-1 break-all text-xs text-gray-600">{url}</p>
      </div>
      <p className="text-sm text-gray-600 print:hidden">
        Anyone in your organisation who scans this is taken to the open checklist for “{template.title}”, or can
        start a new one. They sign in first if they need to. The link works only for your organisation.
      </p>
    </div>
  )
}
