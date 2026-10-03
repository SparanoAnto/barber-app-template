import React from 'react'

export function NotificationCenter({ show, onClose, notifications, onClear }) {
  if (!show) return null

  return (
    <div style={{
      position: 'fixed', inset: '0', zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#181c24', border: '1px solid var(--border-color)', borderRadius: '12px',
        width: '100%', maxWidth: '450px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-color)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>📜 Storico Notifiche</h3>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {notifications.length > 0 && (
              <button 
                onClick={onClear}
                style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}
              >
                Svuota
              </button>
            )}
            <button 
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        </div>

        <div style={{ padding: '15px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {notifications.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', margin: '30px 0' }}>
              Nessuna notifica recente.
            </p>
          ) : (
            notifications.map(item => (
              <div key={item.id} style={{
                backgroundColor: '#11141b', border: '1px solid var(--border-color)',
                padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px'
              }}>
                <span style={{ fontSize: '13px', color: 'var(--text-main)', fontWeight: '500' }}>
                  {item.text}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', alignSelf: 'flex-end' }}>
                  {item.timestamp}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
