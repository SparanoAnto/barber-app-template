import React, { useState, useEffect } from 'react'

export function InstallGuideModal({ salonSettings = {} }) {
  const [isStandalone, setIsStandalone] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isIOS, setIsIOS] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // 1. Verifica se l'utente ha recentemente chiuso il banner (salvato in localStorage)
    const lastDismissed = localStorage.getItem('pwa_banner_dismissed')
    if (lastDismissed) {
      const daysPassed = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24)
      if (daysPassed < 14) { // Nasconde per 14 giorni se ignorato
        setDismissed(true)
      }
    }

    // 2. Rileva se l'app è già stata installata ed è aperta in modalità Standalone
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  window.navigator.standalone || 
                  document.referrer.includes('android-app://')
    
    setIsStandalone(isPWA)

    // 3. Rileva se il dispositivo è iOS (iPhone/iPad/iPod)
    const userAgent = window.navigator.userAgent.toLowerCase()
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent) && !window.MSStream
    setIsIOS(isIosDevice)

    // 4. Intercetta il prompt di installazione nativo (Android / Chrome / Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  }, [])

  const handleDismiss = () => {
    setDismissed(true)
    // Memorizza la chiusura nel browser per non mostrare il popup a ogni refresh
    localStorage.setItem('pwa_banner_dismissed', Date.now().toString())
  }

  const handleInstallAndroid = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      handleDismiss()
    }
    setDeferredPrompt(null)
  }

  // Non mostra nulla se è già installata/aperta come PWA o se l'utente ha chiuso l'avviso
  if (isStandalone || dismissed) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: '85px', // Sollevato per non sovrapporsi alla barra di navigazione inferiore
      left: '15px',
      right: '15px',
      maxWidth: '450px',
      margin: '0 auto',
      backgroundColor: '#1e293b',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderLeft: '4px solid var(--primary-color)',
      borderRadius: '12px',
      padding: '18px',
      zIndex: 999,
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
      color: '#FFF',
      '--primary-color': salonSettings.primary_color || '#2563eb',
      '--accent-color': salonSettings.accent_color || '#D4AF37',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--accent-color, #f59e0b)', fontSize: '0.95rem', fontWeight: 700 }}>
          📲 Installa l'App del Salone
        </h4>
        <span 
          onClick={handleDismiss} 
          style={{ cursor: 'pointer', fontSize: '16px', color: '#94a3b8', padding: '4px', lineHeight: 1 }}
          title="Chiudi"
        >
          ✕
        </span>
      </div>

      <p style={{ fontSize: '13px', color: '#cbd5e1', margin: '0 0 14px 0', lineHeight: '1.4' }}>
        Per la migliore esperienza e per prenotare in un click, aggiungi l'app allo schermo del tuo telefono!
      </p>

      {/* Istruzioni iOS */}
      {isIOS ? (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '12px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.5', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.04)' }}>
          1. Tocca il tasto <strong>Condividi</strong> ⎋ (in basso al centro su Safari).<br />
          2. Scorri in basso e seleziona <strong>"Aggiungi alla schermata Home"</strong> ➕.
        </div>
      ) : (
        /* Pulsante o istruzioni per Android / Chrome */
        deferredPrompt ? (
          <button 
            onClick={handleInstallAndroid}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: 'var(--primary-color)',
              color: '#FFF',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
              boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)',
              transition: 'background 0.2s'
            }}
          >
            Installa Ora
          </button>
        ) : (
          <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '12px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.5', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.04)' }}>
            Tocca i <strong>3 pallini in alto a destra</strong> e seleziona <strong>"Aggiungi a schermata Home"</strong> o <strong>"Installa app"</strong>.
          </div>
        )
      )}
    </div>
  )
}
