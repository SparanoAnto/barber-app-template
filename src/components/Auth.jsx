import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function Auth({ 
  appName = "App Salone", 
  appLogo = "✨", 
  salonSettings = {},
  isResettingPasswordProps = false, 
  onPasswordUpdated 
}) {
  const [isRegistering, setIsRegistering] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [isResettingPassword, setIsResettingPassword] = useState(isResettingPasswordProps)
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [age, setAge] = useState('')
  
  // Stati per la Privacy
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setIsResettingPassword(isResettingPasswordProps)
  }, [isResettingPasswordProps])

  /**
   * Helper per tradurre in modo chiaro i messaggi di errore di Supabase in italiano
   */
  function translateAuthError(message) {
    if (!message) return "Si è verificato un errore imprevisto."
    const lowerMsg = message.toLowerCase()

    if (lowerMsg.includes('invalid login credentials') || lowerMsg.includes('invalid grant')) {
      return "Email o password non corretti. Verifica i dati inseriti o registrati se non hai un account."
    }
    if (lowerMsg.includes('email not confirmed')) {
      return "Account non ancora attivato. Controlla la tua casella di posta e conferma l'email."
    }
    if (lowerMsg.includes('user already registered') || lowerMsg.includes('already registered')) {
      return "Esiste già un account registrato con questa email. Prova ad accedere."
    }
    if (lowerMsg.includes('password should be at least')) {
      return "La password è troppo corta: deve contenere almeno 6 caratteri."
    }
    if (lowerMsg.includes('rate limit') || lowerMsg.includes('over_email_send_rate_limit')) {
      return "Hai effettuato troppe richieste in poco tempo. Riprova tra qualche minuto."
    }
    if (lowerMsg.includes('invalid email')) {
      return "L'indirizzo email inserito non è valido."
    }

    return message // Fallback al messaggio originale se non mappato
  }

  async function handleLogin(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setAuthError(translateAuthError(error.message))
    }
    setLoading(false)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)

    const siteUrl = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl,
    })

    if (error) {
      setAuthError(translateAuthError(error.message))
    } else {
      setAuthSuccess('Ti abbiamo inviato un\'email con il link sicuro per reimpostare la password.')
    }
    setLoading(false)
  }

  async function handleUpdatePassword(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password: newPassword })
    
    if (error) {
      setAuthError(translateAuthError(error.message))
    } else {
      alert('Password aggiornata con successo!')
      setIsResettingPassword(false)
      if (onPasswordUpdated) onPasswordUpdated()
    }
    setLoading(false)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')

    if (!privacyAccepted) {
      setAuthError("Devi accettare l'Informativa sulla Privacy per poter creare un account.")
      return
    }

    setLoading(true)

    try {
      const siteUrl = window.location.origin
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: siteUrl,
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            age: parseInt(age) || null
          }
        }
      })

      if (signUpError) throw signUpError

      alert("Registrazione completata! Controlla la tua email per confermare l'account prima di accedere.")
      setIsRegistering(false)
    } catch (err) {
      setAuthError(translateAuthError(err.message))
    } finally {
      setLoading(false)
    }
  }

  if (isResettingPassword) {
    return (
      <div className="app-container" style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="info-card">
          <h2 style={{ textAlign: 'center', color: '#FFFFFF', marginTop: '10px' }}>Nuova Password</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '15px' }}>
            Inserisci la nuova password per il tuo account.
          </p>
          {authError && <div style={errorBoxStyle}>{authError}</div>}
          <form onSubmit={handleUpdatePassword} style={formStyle}>
            <input 
              type="password" 
              placeholder="Nuova Password (min. 6 caratteri)" 
              value={newPassword} 
              onChange={e => setNewPassword(e.target.value)} 
              required 
              style={inputStyle} 
            />
            <button type="submit" disabled={loading} style={btnPrimaryStyle}>
              {loading ? 'Salvataggio in corso...' : 'Salva Nuova Password'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (isForgotPassword) {
    return (
      <div className="app-container" style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="info-card">
          <h2 style={{ textAlign: 'center', color: '#FFFFFF', marginTop: '10px' }}>Recupera Password</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', marginBottom: '15px' }}>
            Inserisci la tua email. Ti invieremo le istruzioni per il recupero.
          </p>
          {authError && <div style={errorBoxStyle}>{authError}</div>}
          {authSuccess && <div style={successBoxStyle}>{authSuccess}</div>}
          
          <form onSubmit={handleForgotPassword} style={formStyle}>
            <input 
              type="email" 
              placeholder="La tua email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              required 
              style={inputStyle} 
            />
            <button type="submit" disabled={loading} style={btnPrimaryStyle}>
              {loading ? 'Invio in corso...' : 'Invia Link di Recupero'}
            </button>
            <p style={linkTextStyle}>
              Torna al <span onClick={() => { setIsForgotPassword(false); setAuthError(''); setAuthSuccess(''); }} style={linkStyle}>Login</span>
            </p>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container" style={{ padding: '30px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      
      {/* Brand Header Universale Dinamico (Senza icone fisse da barbiere) */}
      <div style={{ textAlign: 'center', marginBottom: '25px', position: 'relative', zIndex: 1 }}>
        
        {/* Filigrana di sfondo */}
        <div style={{
          position: 'absolute',
          top: '-35px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '3.6rem',
          fontWeight: '900',
          color: 'rgba(255, 255, 255, 0.03)',
          whiteSpace: 'nowrap',
          letterSpacing: '2px',
          userSelect: 'none',
          zIndex: -1,
          textTransform: 'uppercase'
        }}>
          {appName}
        </div>

        {/* Titolo principale */}
        <h1 className="brand-title" style={{ 
          fontSize: '2.2rem', 
          fontWeight: '900', 
          margin: 0, 
          color: '#FFFFFF',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          lineHeight: '1.1'
        }}>
          {appName && appName.toLowerCase().includes('th') ? (
            <>
              {appName.split(/th/i)[0]}
              <sup style={{ fontSize: '0.6em', textTransform: 'lowercase' }}>th</sup>
              {appName.split(/th/i)[1]}
            </>
          ) : (
            appName
          )}
        </h1>

        {/* Sottotitolo dinamico */}
        <span className="brand-subtitle" style={{ 
          display: 'block', 
          fontSize: '1.2rem', 
          marginTop: '6px',
          color: 'var(--text-muted)',
          fontWeight: 'normal',
          letterSpacing: '0.5px'
        }}>
          {salonSettings?.salon_subtitle || 'Portale di Prenotazione'}
        </span>

      </div>

      <div className="info-card" style={{ position: 'relative', zIndex: '1' }}>
        {authError && <div style={errorBoxStyle}>{authError}</div>}

        {!isRegistering ? (
          <form onSubmit={handleLogin} style={formStyle}>
            <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            
            <div style={{ textAlign: 'right', marginTop: '-5px' }}>
              <span 
                onClick={() => { setIsForgotPassword(true); setAuthError(''); }} 
                style={{ ...linkStyle, fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}
              >
                Password dimenticata?
              </span>
            </div>

            <button type="submit" disabled={loading} style={btnPrimaryStyle}>
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </button>
            <p style={linkTextStyle}>
              Non hai un account? <span onClick={() => { setIsRegistering(true); setAuthError(''); }} style={linkStyle}>Registrati</span>
            </p>
          </form>
        ) : (
          <form onSubmit={handleRegister} style={formStyle}>
            <input type="text" placeholder="Nome" value={firstName} onChange={e => setFirstName(e.target.value)} required style={inputStyle} />
            <input type="text" placeholder="Cognome" value={lastName} onChange={e => setLastName(e.target.value)} required style={inputStyle} />
            <input type="number" placeholder="Età" value={age} onChange={e => setAge(e.target.value)} required style={inputStyle} />
            <input type="tel" placeholder="Cellulare" value={phone} onChange={e => setPhone(e.target.value)} required style={inputStyle} />
            <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            <input type="password" placeholder="Password (min. 6 caratteri)" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '5px 0' }}>
              <input 
                type="checkbox" 
                id="privacy" 
                checked={privacyAccepted} 
                onChange={e => setPrivacyAccepted(e.target.checked)} 
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              <label htmlFor="privacy" style={{ color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                Ho letto e accetto l'
                <span 
                  onClick={(e) => {
                    e.preventDefault()
                    setShowPrivacyModal(true)
                  }}
                  style={{ color: '#FFF', textDecoration: 'underline', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Informativa sulla Privacy
                </span>
              </label>
            </div>

            <button type="submit" disabled={loading} style={btnPrimaryStyle}>
              {loading ? 'Registrazione...' : 'Crea Account'}
            </button>
            <p style={linkTextStyle}>
              Hai già un account? <span onClick={() => { setIsRegistering(false); setAuthError(''); }} style={linkStyle}>Accedi</span>
            </p>
          </form>
        )}
      </div>

      {/* MODALE INFORMATIVA PRIVACY */}
      {showPrivacyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1c1c1e',
            border: '1px solid var(--border-color)',
            borderRadius: '12px',
            padding: '20px',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: '#FFF'
          }}>
            <h3 style={{ color: 'var(--barber-red)', marginTop: 0 }}>Informativa sulla Privacy</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              Ai sensi del Regolamento UE 2016/679 (GDPR), i dati raccolti (Nome, Cognome, Età, Telefono, Email) sono trattati esclusivamente per la gestione delle prenotazioni e dell'account utente presso <strong>{appName}</strong>.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
              I dati sono protetti e non ceduti a terzi. Puoi richiederne la cancellazione in qualsiasi momento direttamente dall'applicazione.
            </p>
            <button 
              onClick={() => setShowPrivacyModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: 'var(--barber-red)',
                color: '#FFF',
                fontWeight: 'bold',
                cursor: 'pointer',
                marginTop: '15px'
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

const formStyle = { display: 'flex', flexDirection: 'column', gap: '14px' }

const inputStyle = { 
  width: '100%', 
  padding: '12px 14px', 
  borderRadius: '6px', 
  border: '1px solid var(--border-color)', 
  backgroundColor: 'rgba(15, 15, 15, 0.8)', 
  color: '#FFF', 
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: '14px'
}

const btnPrimaryStyle = { 
  width: '100%', 
  padding: '13px', 
  borderRadius: '6px', 
  border: 'none', 
  backgroundColor: 'var(--barber-red)', 
  color: '#FFF', 
  fontWeight: 'bold', 
  fontSize: '0.95rem',
  letterSpacing: '0.5px',
  cursor: 'pointer',
  marginTop: '5px',
  boxShadow: '0 4px 12px rgba(211, 47, 47, 0.3)'
}

const errorBoxStyle = { 
  background: 'rgba(211, 47, 47, 0.2)', 
  border: '1px solid var(--barber-red)',
  color: '#FFF', 
  padding: '10px 14px', 
  borderRadius: '6px', 
  marginBottom: '15px',
  fontSize: '13px'
}

const successBoxStyle = { 
  background: 'rgba(46, 125, 50, 0.2)', 
  border: '1px solid #2e7d32',
  color: '#81c784', 
  padding: '10px 14px', 
  borderRadius: '6px', 
  marginBottom: '15px',
  fontSize: '13px',
  textAlign: 'center'
}

const linkTextStyle = { textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px',marginTop: '10px' }
const linkStyle = { color: '#FFFFFF', cursor: 'pointer', textDecoration: 'underline', fontWeight: 'bold' }
