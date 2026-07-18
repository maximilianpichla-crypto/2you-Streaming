import { useEffect, useState } from 'react'
import type { AlertPayload, AlertTypeConfig, AlertsSettings } from '../shared/types'
import { normalizeAlertType, renderAlertTemplate, defaultAlerts } from '../shared/types'
import { playAlertBeep, subscribeAlerts } from '../alertBus'
import { AlertBox } from './AlertBox'

interface ActiveAlert {
  id: string
  title: string
  subtitle: string
  config: AlertTypeConfig
}

interface Props {
  alerts: AlertsSettings
}

export function AlertOverlay({ alerts }: Props) {
  const [active, setActive] = useState<ActiveAlert | null>(null)

  useEffect(() => {
    return subscribeAlerts((payload: AlertPayload) => {
      if (!alerts.enabled) return
      const raw = alerts.types[payload.type]
      if (!raw?.enabled) return
      const fallback = defaultAlerts().types[payload.type]
      const config = normalizeAlertType(raw, fallback)

      const item: ActiveAlert = {
        id: crypto.randomUUID(),
        title: renderAlertTemplate(config.titleTemplate, payload),
        subtitle: renderAlertTemplate(config.subtitleTemplate, payload),
        config,
      }
      setActive(item)
      if (config.soundEnabled) {
        playAlertBeep(alerts.volume)
      }
      window.setTimeout(() => {
        setActive((cur) => (cur?.id === item.id ? null : cur))
      }, config.durationMs)
    })
  }, [alerts])

  if (!active) return null

  return (
    <div className="alert-stage">
      <AlertBox
        config={active.config}
        title={active.title}
        subtitle={active.subtitle}
      />
    </div>
  )
}
