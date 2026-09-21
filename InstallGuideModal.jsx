import React, { useState, useEffect } from 'react'

export function InstallGuideModal() {
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
      bottom: '20px',
      left: '15px',
      right: '15px',
      backgroundColor: '#1c1c1e',
      border: '2px solid var(--barber-red)',
      borderRadius: '12px',
      padding: '16px',
      zIndex: 9999,
      boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
      color: '#FFF'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, color: 'var(--barber-red)', fontSize: '15px' }}>📲 Installa l'App del Salone</h4>
        <span 
          onClick={handleDismiss} 
          style={{ cursor: 'pointer', fontSize: '18px', color: 'var(--text-muted)', padding: '0 4px' }}
        >
          ✕
        </span>
      </div>

      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 12px 0', lineHeight: '1.4' }}>
        Per la migliore esperienza e per prenotare in un click, aggiungi l'app allo schermo del tuo telefono!
      </p>

      {/* Istruzioni iOS */}
      {isIOS ? (
        <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.5' }}>
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
              padding: '10px',
              backgroundColor: 'var(--barber-red)',
              color: '#FFF',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Installa Ora
          </button>
        ) : (
          <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px', fontSize: '12px', lineHeight: '1.5' }}>
            Tocca i <strong>3 pallini in alto a destra</strong> e seleziona <strong>"Aggiungi a schermata Home"</strong> o <strong>"Installa app"</strong>.
          </div>
        )
      )}
    </div>
  )
}
