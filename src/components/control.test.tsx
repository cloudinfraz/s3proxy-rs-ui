import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DataTable, ErrorBanner } from './control'

afterEach(() => vi.unstubAllGlobals())

describe('control presentation contracts', () => {
  const columns = [{ label: 'Name', value: (row: string) => row }]

  it('renders scoped desktop table headers and escapes stored markup', () => {
    const html = renderToStaticMarkup(<DataTable rows={['<img onerror=alert(1)>']} columns={columns} rowKey={row => row} />)
    expect(html).toContain('<th scope="col">Name</th>')
    expect(html).toContain('&lt;img onerror=alert(1)&gt;')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<dl')
  })

  it('renders one labelled definition list on mobile without a hidden duplicate table', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    const html = renderToStaticMarkup(<DataTable rows={['record']} columns={columns} rowKey={row => row} />)
    expect(html).toContain('<dt>Name</dt><dd>record</dd>')
    expect(html).not.toContain('<table')
  })

  it.each([true, false])('announces %s loading or empty state', loading => {
    const html = renderToStaticMarkup(<DataTable rows={[]} loading={loading} columns={columns} rowKey={row => row} />)
    expect(html).toContain('role="status"')
    expect(html).toContain(loading ? 'Loading...' : 'No records')
  })

  it('announces escaped errors without inserting markup', () => {
    const html = renderToStaticMarkup(<ErrorBanner error={new Error('<script>synthetic</script>')} />)
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('<script>')
  })
})