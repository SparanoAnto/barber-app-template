import React from 'react'

export function Navigation({ activeTab, setActiveTab, isAdmin, pendingCount, salonSettings = {} }) {
  return (
    <nav style={{
      ...navBarStyle,
      '--accent-color': '#C5A059',
    }} aria-label="Navigazione principale">
      <button 
        onClick={() => setActiveTab('info')} 
        style={navBtnStyle(activeTab === 'info')}
        aria-label="Info e Posizione"
      >
        <span style={iconStyle(activeTab === 'info')}>📍</span>
        <span>Info</span>
      </button>

      <button 
        onClick={() => setActiveTab('services')} 
        style={navBtnStyle(activeTab === 'services')}
        aria-label="Prenota un servizio"
      >
        <span style={iconStyle(activeTab === 'services')}>✂️</span>
        <span>Prenota</span>
      </button>

      <button 
        onClick={() => setActiveTab('appointments')} 
        style={navBtnStyle(activeTab === 'appointments')}
        aria-label="Visualizza la tua Agenda"
      >
        <span style={iconStyle(activeTab === 'appointments')}>📅</span>
        <span>Agenda</span>
      </button>

      <button 
        onClick={() => setActiveTab('profile')} 
        style={navBtnStyle(activeTab === 'profile')}
        aria-label="Il tuo Profilo"
      >
        <span style={iconStyle(activeTab === 'profile')}>👤</span>
        <span>Profilo</span>
      </button>

      {isAdmin && (
        <button 
          onClick={() => setActiveTab('admin')} 
          style={{ ...navBtnStyle(activeTab === 'admin'), position: 'relative' }}
          aria-label="Pannello Amministratore"
        >
          <span style={iconStyle(activeTab === 'admin')}>⚙️</span>
          <span>Admin</span>
          {pendingCount > 0 && (
            <span style={badgeStyle} aria-label={`${pendingCount} utenti in attesa`}>
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </button>
      )}
    </nav>
  )
}

/* --- STILI CSS-IN-JS --- */

const navBarStyle = { 
  position: 'fixed', 
  bottom: 0, 
  left: '50%', 
  transform: 'translateX(-50%)',
  width: '100%',
  maxWidth: '480px', 
  backgroundColor: 'rgba(15, 17, 21, 0.85)', 
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  borderTop: '1px solid #2a3241', 
  display: 'flex', 
  justifyContent: 'space-around', 
  alignItems: 'center',
  paddingTop: '8px',
  paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', 
  boxSizing: 'border-box',
  zIndex: 1000,
  boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.4)',
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
}

const navBtnStyle = (isActive) => ({ 
  background: 'none', 
  border: 'none', 
  color: isActive ? 'var(--accent-color)' : '#9ca3af', 
  fontSize: '11px', 
  fontWeight: isActive ? '700' : '500', 
  cursor: 'pointer', 
  textAlign: 'center',
  flex: 1,
  padding: '6px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s ease, transform 0.1s ease',
  outline: 'none',
  WebkitTapHighlightColor: 'transparent'
})

const iconStyle = (isActive) => ({
  fontSize: '18px',
  display: 'block',
  marginBottom: '3px',
  transform: isActive ? 'scale(1.15)' : 'scale(1)',
  transition: 'transform 0.2s ease'
})

const badgeStyle = {
  position: 'absolute',
  top: '4px',
  right: '22%',
  backgroundColor: 'var(--accent-color, #C5A059)',
  color: '#0f1115',
  fontSize: '10px',
  fontWeight: 'bold',
  borderRadius: '10px',
  padding: '1px 5px',
  border: '2px solid #0f1115',
  boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
}
