import React from 'react'

export function Navigation({ activeTab, setActiveTab, isAdmin, pendingCount }) {
  return (
    <nav style={navBarStyle} aria-label="Navigazione principale">
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
  backgroundColor: 'rgba(18, 18, 18, 0.95)', 
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  borderTop: '1px solid var(--border-color)', 
  display: 'flex', 
  justifyContent: 'space-around', 
  alignItems: 'center',
  paddingTop: '8px',
  paddingBottom: 'calc(8px + env(safe-area-inset-bottom))', 
  boxSizing: 'border-box',
  zIndex: 1000
}

const navBtnStyle = (isActive) => ({ 
  background: 'none', 
  border: 'none', 
  color: isActive ? 'var(--barber-red)' : 'var(--text-muted)', 
  fontSize: '11px', 
  fontWeight: isActive ? 'bold' : '500', 
  cursor: 'pointer', 
  textAlign: 'center',
  flex: 1,
  padding: '4px 0',
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
  marginBottom: '2px',
  transform: isActive ? 'scale(1.15)' : 'scale(1)',
  transition: 'transform 0.2s ease'
})

const badgeStyle = {
  position: 'absolute',
  top: '0px',
  right: '15%',
  backgroundColor: 'var(--barber-red)',
  color: '#ffffff',
  fontSize: '10px',
  fontWeight: 'bold',
  borderRadius: '10px',
  padding: '2px 6px',
  border: '2px solid #121212',
  boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
}
