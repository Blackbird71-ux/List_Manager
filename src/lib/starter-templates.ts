import type { ItemKind } from '@/lib/item-types'
import type { Recurrence } from '@/lib/recurrence'

// Ready-made templates a new organisation can add in one click, then edit freely.
// Pure data so both the Templates page and the API route can use it.

export interface StarterItem {
  text: string
  section?: string
  priority?: 'low' | 'medium' | 'high'
  kind?: ItemKind
  unit?: string
  minValue?: number
  maxValue?: number
  photoRequired?: boolean
}

export interface StarterTemplate {
  key: string
  title: string
  description: string
  category: string
  recurrence: Recurrence
  requiresSignOff: boolean
  items: StarterItem[]
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'fridge-temps',
    title: 'Fridge & freezer temperatures',
    description: 'Daily temperature log. Readings outside the safe range are flagged for a corrective action.',
    category: 'food safety',
    recurrence: 'daily',
    requiresSignOff: false,
    items: [
      { text: 'Fridge 1 temperature', kind: 'number', unit: '°C', minValue: 0, maxValue: 5 },
      { text: 'Fridge 2 temperature', kind: 'number', unit: '°C', minValue: 0, maxValue: 5 },
      { text: 'Freezer temperature', kind: 'number', unit: '°C', minValue: -25, maxValue: -15 },
      { text: 'Door seals clean and intact' },
      { text: 'Checked by', kind: 'signature' },
    ],
  },
  {
    key: 'vehicle-prestart',
    title: 'Vehicle pre-start check',
    description: 'Before driving: walk-around, fluids and safety gear. Odometer and a photo are recorded.',
    category: 'vehicles',
    recurrence: 'none',
    requiresSignOff: false,
    items: [
      { text: 'Odometer reading', section: 'Before you start', kind: 'number', unit: 'km' },
      { text: 'Photo of the vehicle (all sides if damaged)', section: 'Before you start', photoRequired: true },
      { text: 'Tyres — tread and pressure OK', section: 'Walk-around', priority: 'high' },
      { text: 'Lights and indicators working', section: 'Walk-around', priority: 'high' },
      { text: 'No new damage to body or windscreen', section: 'Walk-around' },
      { text: 'Oil, coolant and washer fluid OK', section: 'Under the bonnet' },
      { text: 'First aid kit and fire extinguisher on board', section: 'Safety gear' },
      { text: 'Any defects found', section: 'Sign', kind: 'text' },
      { text: 'Driver signature', section: 'Sign', kind: 'signature' },
    ],
  },
  {
    key: 'fire-safety',
    title: 'Monthly fire safety check',
    description: 'Extinguishers, exits, alarms and evacuation signage. Needs a manager to sign off.',
    category: 'safety',
    recurrence: 'monthly',
    requiresSignOff: true,
    items: [
      { text: 'Extinguishers present, tagged and gauge in the green', priority: 'high' },
      { text: 'Fire blanket in place' },
      { text: 'Exit doors unlocked and paths clear', priority: 'high' },
      { text: 'Exit signs lit' },
      { text: 'Evacuation diagram on display and up to date' },
      { text: 'Smoke alarm test button works' },
      { text: 'Notes / issues found', kind: 'text' },
    ],
  },
  {
    key: 'open-close',
    title: 'Opening & closing',
    description: 'Daily routine for opening up in the morning and locking up at night.',
    category: 'operations',
    recurrence: 'daily',
    requiresSignOff: false,
    items: [
      { text: 'Disarm alarm and unlock', section: 'Opening' },
      { text: 'Lights, heating / cooling on', section: 'Opening' },
      { text: 'Float counted', section: 'Opening', kind: 'number', unit: '$' },
      { text: 'Walk through — anything broken or out of place?', section: 'Opening' },
      { text: 'Takings counted', section: 'Closing', kind: 'number', unit: '$' },
      { text: 'Appliances and lights off', section: 'Closing' },
      { text: 'Windows and back door locked', section: 'Closing', priority: 'high' },
      { text: 'Alarm set', section: 'Closing', priority: 'high' },
    ],
  },
  {
    key: 'weekly-cleaning',
    title: 'Weekly cleaning',
    description: 'Room-by-room clean. Tick what was done and note anything that needs attention.',
    category: 'cleaning',
    recurrence: 'weekly',
    requiresSignOff: false,
    items: [
      { text: 'Benches and tables wiped and sanitised', section: 'Kitchen' },
      { text: 'Fridge cleared of old food', section: 'Kitchen' },
      { text: 'Floors mopped', section: 'Kitchen' },
      { text: 'Toilets and basins cleaned', section: 'Bathrooms' },
      { text: 'Soap and paper restocked', section: 'Bathrooms' },
      { text: 'Bins emptied', section: 'General' },
      { text: 'Floors vacuumed', section: 'General' },
      { text: 'Anything needing repair', section: 'General', kind: 'text' },
    ],
  },
  {
    key: 'new-starter',
    title: 'New starter onboarding',
    description: 'Everything a new team member needs in their first week.',
    category: 'people',
    recurrence: 'none',
    requiresSignOff: true,
    items: [
      { text: 'Account and email set up', section: 'Before day one' },
      { text: 'Keys / access card issued', section: 'Before day one' },
      { text: 'Site tour and emergency exits shown', section: 'Day one', priority: 'high' },
      { text: 'Introduced to the team', section: 'Day one' },
      { text: 'Policies read and understood', section: 'First week' },
      { text: 'Safety induction completed', section: 'First week', priority: 'high' },
      { text: 'New starter signature', section: 'First week', kind: 'signature' },
    ],
  },
]

export function findStarters(keys: string[]): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((t) => keys.includes(t.key))
}
