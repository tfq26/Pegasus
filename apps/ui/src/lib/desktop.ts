/**
 * desktop — Desktop notifications via the Browser Notification API
 */

export function sendDesktopNotification(title: string, body: string): void {
  if (!('Notification' in window)) return

  if (Notification.permission === 'granted') {
    new Notification(title, { body })
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        new Notification(title, { body })
      }
    })
  }
}
