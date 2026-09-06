import { Plus, Trash2 } from 'lucide-react'
import type { Schema } from '../../api/control'
import { conditionOperators, emptyStatement, type TrustStatement } from './role-state'

export default function TrustEditor({ account, statements, identities, change }: {
  account: string; statements: TrustStatement[]; identities: Schema['IdentityProjection'][]
  change: (statements: TrustStatement[]) => void
}) {
  function update(index: number, patch: Partial<TrustStatement>) {
    change(statements.map((statement, position) => position === index ? { ...statement, ...patch } : statement))
  }
  return <div className="role-trust-editor">{statements.map((statement, index) => <fieldset key={index} className="role-trust-statement">
    <legend>Statement {index + 1}</legend>
    <div className="role-inline-fields"><label>Effect<select value={statement.effect} onChange={event => update(index, { effect: event.target.value as 'Allow' | 'Deny' })}><option>Allow</option><option>Deny</option></select></label><button type="button" className="icon-button danger" title="Remove statement" aria-label={`Remove statement ${index + 1}`} disabled={statements.length === 1} onClick={() => change(statements.filter((_, position) => position !== index))}><Trash2 size={16} /></button></div>
    <label>Credential principals<select multiple required size={Math.min(4, Math.max(2, identities.length))} aria-label={`Statement ${index + 1} principals`} value={statement.principals} onChange={event => update(index, { principals: Array.from(event.target.selectedOptions, option => option.value) })}>{identities.map(identity => <option key={identity.credential_id} value={`arn:aws:iam::${account}:user/s3proxy/${identity.credential_id}`}>{identity.s3_access_key}{!identity.enabled ? ' (disabled)' : ''}</option>)}</select></label>
    {statement.conditions.map((condition, conditionIndex) => {
      const set = (patch: Partial<typeof condition>) => update(index, { conditions: statement.conditions.map((current, position) => position === conditionIndex ? { ...current, ...patch } : current) })
      return <div key={conditionIndex} className="role-condition"><label>Condition key<select value={condition.key} onChange={event => set({ key: event.target.value, operator: conditionOperators[event.target.value][0], value: '' })}>{Object.keys(conditionOperators).map(key => <option key={key}>{key}</option>)}</select></label><label>Operator<select value={condition.operator} onChange={event => set({ operator: event.target.value })}>{conditionOperators[condition.key].map(operator => <option key={operator}>{operator}</option>)}</select></label>
        <label>New value{condition.key === 'aws:SecureTransport' ? <select required value={condition.value} onChange={event => set({ value: event.target.value })}><option value="">Select value</option><option>true</option><option>false</option></select> : <input required type="password" autoComplete="new-password" spellCheck={false} value={condition.value} onChange={event => set({ value: event.target.value })} />}</label><button type="button" className="icon-button danger" title="Remove condition" aria-label={`Remove condition ${conditionIndex + 1} from statement ${index + 1}`} onClick={() => update(index, { conditions: statement.conditions.filter((_, position) => position !== conditionIndex) })}><Trash2 size={16} /></button></div>
    })}
    <button type="button" onClick={() => update(index, { conditions: [...statement.conditions, { operator: 'StringEquals', key: 'sts:ExternalId', value: '' }] })}><Plus size={15} /> Add condition</button>
  </fieldset>)}<button type="button" onClick={() => change([...statements, emptyStatement()])}><Plus size={15} /> Add statement</button></div>
}