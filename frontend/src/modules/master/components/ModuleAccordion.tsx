import React from 'react'
import {
  CAccordion,
  CAccordionBody,
  CAccordionHeader,
  CAccordionItem,
  CBadge,
} from '@coreui/react-pro'
import type { ModuleDef, SubModule } from './moduleHierarchy'

interface ModuleAccordionProps {
  modules: ModuleDef[]
  permissions: Record<string, boolean>
  roleDefaults: Record<string, boolean>
  onPermissionChange: (action: string, granted: boolean) => void
  defaultExpanded?: string[]
}

const SubModuleRow: React.FC<{
  sub: SubModule
  permissions: Record<string, boolean>
  roleDefaults: Record<string, boolean>
  onPermissionChange: (action: string, granted: boolean) => void
}> = ({ sub, permissions, roleDefaults, onPermissionChange }) => {
  const allGranted = sub.actions.every(a => permissions[a] ?? false)
  const someGranted = sub.actions.some(a => permissions[a] ?? false)

  return (
    <div className="mb-2 pb-2 border-bottom border-light">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="fw-semibold small">{sub.label}</span>
        <CBadge color={allGranted ? 'success' : someGranted ? 'warning' : 'secondary'} shape="rounded-pill" className="small">
          {sub.actions.filter(a => permissions[a] ?? false).length}/{sub.actions.length}
        </CBadge>
      </div>
      <div className="d-flex flex-wrap gap-2">
        {sub.actions.map(action => {
          const granted = permissions[action] ?? false
          const isDefault = (roleDefaults[action] ?? false) === granted

          return (
            <label
              key={action}
              className={`d-inline-flex align-items-center gap-1 px-2 py-1 rounded-2 small ${
                granted
                  ? 'bg-primary bg-opacity-10 text-primary'
                  : 'bg-light text-muted'
              } ${isDefault ? '' : 'border border-warning'}`}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <input
                type="checkbox"
                className="form-check-input m-0"
                checked={granted}
                onChange={(e) => onPermissionChange(action, e.target.checked)}
                style={{ width: '14px', height: '14px' }}
              />
              <span className="small">{action.split('.').pop()}</span>
              {!isDefault && (
                <CBadge color="warning" shape="rounded-pill" className="small" style={{ fontSize: '9px', padding: '0 4px' }}>
                  edit
                </CBadge>
              )}
            </label>
          )
        })}
      </div>
    </div>
  )
}

const ModuleAccordion: React.FC<ModuleAccordionProps> = ({
  modules,
  permissions,
  roleDefaults,
  onPermissionChange,
  defaultExpanded,
}) => {
  return (
    <CAccordion activeItemKey={defaultExpanded?.[0]} alwaysOpen>
      {modules.map((mod) => {
        const totalActions = mod.submodules.reduce((s, sub) => s + sub.actions.length, 0)
        const grantedActions = mod.submodules.reduce(
          (s, sub) => s + sub.actions.filter(a => permissions[a] ?? false).length, 0
        )

        return (
          <CAccordionItem itemKey={mod.label} key={mod.label}>
            <CAccordionHeader className="small">
              <div className="d-flex align-items-center justify-content-between w-100 me-3">
                <span className="fw-bold">{mod.label}</span>
                <CBadge color={grantedActions === totalActions ? 'success' : 'info'} shape="rounded-pill">
                  {grantedActions}/{totalActions}
                </CBadge>
              </div>
            </CAccordionHeader>
            <CAccordionBody className="p-3">
              {mod.submodules.map((sub) => (
                <SubModuleRow
                  key={sub.label}
                  sub={sub}
                  permissions={permissions}
                  roleDefaults={roleDefaults}
                  onPermissionChange={onPermissionChange}
                />
              ))}
            </CAccordionBody>
          </CAccordionItem>
        )
      })}
    </CAccordion>
  )
}

export default ModuleAccordion
