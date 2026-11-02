import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCalendarEvents } from '@/lib/calendar'
import { AppShell } from '@/components/AppShell'
import { CalendarClient } from '@/components/CalendarClient'

// Everything still open that has a due date, plus forecast recurring runs.
export default async function CalendarPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const events = await getCalendarEvents(session.user)

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
      <CalendarClient events={events} />
    </AppShell>
  )
}
