import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import {
  enableNotifications,
  notifyNewAlerts,
  registerNotificationNavigation,
  resetNotificationThrottle,
  NOTIFY_THROTTLE_MS,
} from '@/lib/notifications'
import NotificationToggle from '@/components/NotificationToggle'
import { NOTIFICATIONS_KEY } from '@/lib/storageKeys'
import type { AlertPayload } from '@/types'

const alert = (h: string): AlertPayload => ({
  label: 'l',
  contract_id: 'C1',
  network: 'testnet',
  rule_triggered: 'AnyTransaction',
  transaction_hash: h + 'x'.repeat(20),
  timestamp: 1,
  horizon_link: 'x',
})

let ctor: ReturnType<typeof vi.fn>
function mockNotification(permission: string, request = 'granted') {
  ctor = vi.fn()
  const N = ctor as unknown as {
    permission: string
    requestPermission: unknown
  }
  N.permission = permission
  N.requestPermission = vi.fn().mockResolvedValue(request)
  vi.stubGlobal('Notification', N)
  ;(window as unknown as { Notification: unknown }).Notification = N
}

beforeEach(() => {
  localStorage.clear()
  resetNotificationThrottle()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('notifications', () => {
  it('does nothing until opted in', () => {
    mockNotification('granted')
    expect(notifyNewAlerts([alert('a')], 'L', '/contracts/1')).toBe(false)
    expect(ctor).not.toHaveBeenCalled()
  })

  it('requests permission on enable and stores preference', async () => {
    mockNotification('default', 'granted')
    expect(await enableNotifications()).toBe(true)
    expect(localStorage.getItem(NOTIFICATIONS_KEY)).toBe('1')
  })

  it('does not enable when denied', async () => {
    mockNotification('default', 'denied')
    expect(await enableNotifications()).toBe(false)
  })

  it('groups bursts into one notification and throttles', async () => {
    mockNotification('default', 'granted')
    await enableNotifications()
    ;(ctor as unknown as { permission: string }).permission = 'granted'
    expect(
      notifyNewAlerts([alert('a'), alert('b')], 'L', '/contracts/1', 1000)
    ).toBe(true)
    expect(ctor).toHaveBeenCalledTimes(1)
    expect(ctor.mock.calls[0][0]).toContain('2 new alerts')
    expect(notifyNewAlerts([alert('c')], 'L', '/contracts/1', 1000 + 5)).toBe(
      false
    )
    expect(
      notifyNewAlerts(
        [alert('c')],
        'L',
        '/contracts/1',
        1000 + NOTIFY_THROTTLE_MS
      )
    ).toBe(true)
  })

  it('throttles independently for different contracts', async () => {
    mockNotification('default', 'granted')
    await enableNotifications()
    ;(ctor as unknown as { permission: string }).permission = 'granted'

    expect(notifyNewAlerts([alert('a')], 'A', '/contracts/a', 1000)).toBe(true)
    expect(notifyNewAlerts([alert('b')], 'B', '/contracts/b', 1005)).toBe(true)
    expect(ctor).toHaveBeenCalledTimes(2)
  })

  it('sends suppressed alerts together when the contract cooldown expires', async () => {
    vi.useFakeTimers({ now: 1000 })
    mockNotification('default', 'granted')
    await enableNotifications()
    ;(ctor as unknown as { permission: string }).permission = 'granted'

    expect(notifyNewAlerts([alert('a')], 'A', '/contracts/a')).toBe(true)
    expect(notifyNewAlerts([alert('b')], 'A', '/contracts/a')).toBe(false)
    expect(notifyNewAlerts([alert('c')], 'A', '/contracts/a')).toBe(false)
    expect(ctor).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(NOTIFY_THROTTLE_MS)
    })

    expect(ctor).toHaveBeenCalledTimes(2)
    expect(ctor.mock.calls[1][0]).toContain('2 new alerts')
  })

  it('routes notification clicks through the registered Next navigation callback', async () => {
    mockNotification('default', 'granted')
    await enableNotifications()
    ;(ctor as unknown as { permission: string }).permission = 'granted'
    const navigate = vi.fn()
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    const unregister = registerNotificationNavigation(navigate)

    notifyNewAlerts([alert('a')], 'A', '/contracts/a', 1000)
    const notification = ctor.mock.instances[0] as unknown as Notification
    notification.onclick?.(new Event('click') as Event)

    expect(navigate).toHaveBeenCalledWith('/contracts/a')
    expect(focus).toHaveBeenCalledOnce()
    unregister()
    focus.mockRestore()
  })

  it('turns the toggle off when notification permission is revoked', async () => {
    mockNotification('granted')
    localStorage.setItem(NOTIFICATIONS_KEY, '1')
    const originalPermissions = Object.getOwnPropertyDescriptor(
      navigator,
      'permissions'
    )
    const permissionStatus = new EventTarget() as PermissionStatus
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue(permissionStatus) },
    })

    render(createElement(NotificationToggle))
    const checkbox = await screen.findByRole('checkbox')
    await waitFor(() => expect(checkbox).toBeChecked())

    ;(ctor as unknown as { permission: string }).permission = 'denied'
    act(() => permissionStatus.dispatchEvent(new Event('change')))

    await waitFor(() => expect(checkbox).not.toBeChecked())
    expect(screen.getByText('Permission denied')).toBeInTheDocument()

    if (originalPermissions) {
      Object.defineProperty(navigator, 'permissions', originalPermissions)
    } else {
      Reflect.deleteProperty(navigator, 'permissions')
    }
  })
})
