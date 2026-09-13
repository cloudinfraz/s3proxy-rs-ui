import { useEffect, useRef, useState, type FormEvent, type SetStateAction } from 'react'
import { Activity, Plus, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import type { Schema } from '../../api/control'
import { invokeOperation } from '../../api/operations'
import { DataTable, ErrorBanner } from '../../components/control'
import { IdentitySelectorPagination, useIdentitySelectorPage } from '../identities/identity-selector'
import { simulationEffectLabel, simulationRequest } from './policy-state'

type Condition = { id: number; key: string; value: string }
type SimulationResult = {
  request: Schema['AdminPolicySimulationRequest']
  response: Schema['AdminPolicySimulationResponse']
}

export default function PolicyDiagnostics() {
  const [preflight, setPreflight] = useState<Schema['AdminPolicyPreflightResponse'] | null>(null)
  const [preflightError, setPreflightError] = useState<Error | null>(null)
  const [preflightPending, setPreflightPending] = useState(false)
  const [credentialId, setCredentialIdState] = useState('')
  const identitySelector = useIdentitySelectorPage(null, true, credentialId)
  const identityPage = identitySelector.query
  const identities = { ...identityPage, data: identitySelector.items }
  const [action, setActionState] = useState('s3:GetObject')
  const [resource, setResourceState] = useState('arn:aws:s3:::bucket/key')
  const [conditions, setConditionsState] = useState<Condition[]>([])
  const [nextCondition, setNextCondition] = useState(1)
  const [simulation, setSimulation] = useState<SimulationResult | null>(null)
  const [simulationError, setSimulationError] = useState<Error | null>(null)
  const [simulationPending, setSimulationPending] = useState(false)
  const [lastSimulation, setLastSimulation] = useState<Schema['AdminPolicySimulationRequest'] | null>(null)
  const simulationAttempt = useRef(0)

  useEffect(() => () => { simulationAttempt.current += 1 }, [])

  function invalidateSimulation() {
    simulationAttempt.current += 1
    setSimulation(null)
    setSimulationError(null)
    setSimulationPending(false)
  }
  function setCredentialId(value: SetStateAction<string>) { invalidateSimulation(); setCredentialIdState(value) }
  function setAction(value: SetStateAction<string>) { invalidateSimulation(); setActionState(value) }
  function setResource(value: SetStateAction<string>) { invalidateSimulation(); setResourceState(value) }
  function setConditions(value: SetStateAction<Condition[]>) { invalidateSimulation(); setConditionsState(value) }

  async function runPreflight() { setPreflightPending(true); setPreflightError(null); try { setPreflight(await invokeOperation('preflightAdminPolicies', { parameters: { query: { limit: 100 } } })) } catch (cause) { setPreflightError(cause instanceof Error ? cause : new Error('Persisted policy preflight failed')) } finally { setPreflightPending(false) } }
  async function requestSimulation(request: Schema['AdminPolicySimulationRequest']) { const attempted = { ...request, conditions: { ...request.conditions } }; const attempt = ++simulationAttempt.current; setLastSimulation(attempted); setSimulationPending(true); setSimulationError(null); setSimulation(null); try { const response = await invokeOperation('simulateAdminIdentityPolicies', { body: attempted }); if (attempt === simulationAttempt.current) setSimulation({ request: attempted, response }) } catch (cause) { if (attempt === simulationAttempt.current) setSimulationError(cause instanceof ApiError && cause.status === 503 ? new Error('Policy dependencies are unavailable or malformed. Simulation failed closed; retry after recovery.') : cause instanceof Error ? cause : new Error('Simulation failed')) } finally { if (attempt === simulationAttempt.current) setSimulationPending(false) } }
  function submit(event: FormEvent) { event.preventDefault(); if (simulationPending) return; try { if (new Set(conditions.map(item => item.key)).size !== conditions.length) throw new Error('Condition keys must be unique'); const input = Object.fromEntries(conditions.map(item => [item.key, item.value])); void requestSimulation(simulationRequest({ credentialId, action, resource, conditions: input })) } catch (cause) { setLastSimulation(null); setSimulation(null); setSimulationError(cause instanceof Error ? cause : new Error('Invalid simulation input')) } }
  return <div className="policy-diagnostics">
    <IdentitySelectorPagination page={identitySelector.page} pending={identityPage.isFetching || identitySelector.selectedQuery.isFetching} canPrevious={identitySelector.canPrevious} canNext={identitySelector.canNext} previous={identitySelector.previous} next={identitySelector.next} />
    {credentialId && identitySelector.selectedQuery.isError && <ErrorBanner error={new Error('Selected identity metadata unavailable')} retry={() => { void identitySelector.selectedQuery.refetch() }} />}
    <section className="policy-section" aria-labelledby="preflight-title"><div className="section-heading"><div><h2 id="preflight-title">Persisted policy preflight</h2><p>Runs bounded guardrail checks against stored policies only when requested.</p></div><button disabled={preflightPending} onClick={() => { void runPreflight() }}><Activity size={16} />{preflightPending ? 'Running...' : 'Run preflight'}</button></div>{preflightError && <ErrorBanner error={preflightError} retry={() => { void runPreflight() }} />}{preflight && <><p role="status">Returned {preflight.returned} of limit {preflight.limit}.{preflight.truncated ? ' Results are truncated; resolve these findings and run again.' : ' Results are complete for this run.'}</p><DataTable rows={preflight.items} rowKey={(row) => `${row.kind}:${row.stable_id ?? row.name}`} columns={[{ label: 'Kind', value: row => row.kind.replaceAll('_', ' ') }, { label: 'Resource', value: row => row.name }, { label: 'Reasons', value: row => <ul>{row.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul> }]} /></>}</section>
    <section className="policy-section" aria-labelledby="simulation-title"><div><h2 id="simulation-title">Identity policy simulator</h2><p>Evaluates the selected identity's persisted effective policy set. It performs no signed S3 request or Azure I/O.</p></div>{identities.isError && <ErrorBanner error={new Error('Identity metadata unavailable')} retry={() => { void identities.refetch() }} />}{simulationError && <ErrorBanner error={simulationError} retry={lastSimulation ? () => { void requestSimulation(lastSimulation) } : undefined} />}<form className="simulation-form" onSubmit={submit}><label>Identity<select required value={credentialId} onChange={event => setCredentialId(event.target.value)}><option value="">Select identity</option>{identities.data?.filter(identity => identity.credential_id).map(identity => <option value={identity.credential_id!} key={identity.credential_id!}>{identity.s3_access_key}</option>)}</select></label><label>S3 action<input required value={action} onChange={event => setAction(event.target.value)} /></label><label>S3 resource ARN<input required value={resource} onChange={event => setResource(event.target.value)} /></label><fieldset><legend>Condition context</legend>{conditions.map(condition => <div className="condition-row" key={condition.id}><input aria-label="Condition key" placeholder="aws:SecureTransport" value={condition.key} onChange={event => setConditions(items => items.map(item => item.id === condition.id ? { ...item, key: event.target.value } : item))} /><input aria-label="Condition value" placeholder="true" value={condition.value} onChange={event => setConditions(items => items.map(item => item.id === condition.id ? { ...item, value: event.target.value } : item))} /><button type="button" className="icon-button" aria-label="Remove condition" title="Remove condition" onClick={() => setConditions(items => items.filter(item => item.id !== condition.id))}><Trash2 size={16} /></button></div>)}<button type="button" onClick={() => { setConditions(items => [...items, { id: nextCondition, key: '', value: '' }]); setNextCondition(value => value + 1) }}><Plus size={16} />Add condition</button></fieldset><button className="primary" disabled={simulationPending}>{simulationPending ? 'Evaluating...' : 'Simulate'}</button></form>{simulation && <div className={`simulation-result ${simulation.response.effect.toLowerCase()}`} role="status"><strong>{simulationEffectLabel(simulation.response.effect)}</strong><span>{simulation.response.evaluated_policies} persisted policies evaluated</span><span>{simulation.response.matched_sid ? `Matched statement: ${simulation.response.matched_sid}` : 'No matching statement ID'}</span><span>Evaluated identity: {simulation.request.credential_id}</span><span>Evaluated action: {simulation.request.action}</span><span>Evaluated resource: {simulation.request.resource}</span><span>Evaluated conditions: {Object.entries(simulation.request.conditions).map(([key, value]) => `${key}=${value}`).join(', ') || 'None'}</span></div>}</section>
  </div>
}