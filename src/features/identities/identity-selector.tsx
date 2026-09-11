import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { controlQueries } from '../../api/control'

export function useIdentitySelectorPage(accessMode: 'direct' | 'virtual' | null = null, enabled = true) {
  const [cursors, setCursors] = useState<Array<string | null>>([null])
  const cursor = cursors[cursors.length - 1]
  const query = useQuery({ ...controlQueries.identityPage(cursor, accessMode), enabled })
  return {
    query,
    page: cursors.length,
    previous: () => setCursors(current => current.slice(0, -1)),
    next: () => {
      if (query.data?.next_after_id) setCursors(current => [...current, query.data.next_after_id])
    },
    canPrevious: cursors.length > 1,
    canNext: Boolean(query.data?.next_after_id),
  }
}

export function IdentitySelectorPagination({ page, pending, canPrevious, canNext, previous, next }: {
  page: number
  pending: boolean
  canPrevious: boolean
  canNext: boolean
  previous: () => void
  next: () => void
}) {
  return <div className="role-pagination">
    <button type="button" className="icon-button" aria-label="Previous identity page" title="Previous identity page" disabled={!canPrevious || pending} onClick={previous}><ChevronLeft size={16} /></button>
    <span>Identity page {page}</span>
    <button type="button" className="icon-button" aria-label="Next identity page" title="Next identity page" disabled={!canNext || pending} onClick={next}><ChevronRight size={16} /></button>
  </div>
}
