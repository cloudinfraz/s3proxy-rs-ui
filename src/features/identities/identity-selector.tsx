import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { controlQueries } from '../../api/control'

export function useIdentitySelectorPage(accessMode: 'direct' | 'virtual' | null = null, enabled = true, selectedId = '') {
  const [pagination, setPagination] = useState<{ accessMode: 'direct' | 'virtual' | null; cursors: Array<string | null> }>({ accessMode, cursors: [null] })
  const cursors = pagination.accessMode === accessMode ? pagination.cursors : [null]
  useEffect(() => {
    if (pagination.accessMode !== accessMode) setPagination({ accessMode, cursors: [null] })
  }, [accessMode, pagination.accessMode])
  const cursor = cursors[cursors.length - 1]
  const query = useQuery({ ...controlQueries.identityPage(cursor, accessMode), enabled })
  const selectedFromPage = query.data?.items.find(identity => identity.credential_id === selectedId)
  const selectedQuery = useQuery({ ...controlQueries.identity(selectedId), enabled: enabled && Boolean(selectedId) && (!query.isPending || cursors.length > 1) && !selectedFromPage })
  const selectedDetail = selectedQuery.data?.credential_id === selectedId ? selectedQuery.data : undefined
  const items = selectedDetail && !selectedFromPage ? [selectedDetail, ...(query.data?.items ?? [])] : query.data?.items ?? []
  return {
    query,
    selectedQuery,
    items,
    page: cursors.length,
    previous: () => setPagination(current => ({ accessMode, cursors: (current.accessMode === accessMode ? current.cursors : [null]).slice(0, -1) })),
    next: () => {
      if (query.data?.next_after_id) setPagination(current => ({ accessMode, cursors: [...(current.accessMode === accessMode ? current.cursors : [null]), query.data!.next_after_id] }))
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
