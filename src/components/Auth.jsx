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
  
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [showPrivacyModal, setShowPrivacyModal] = useState(false)

  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setIsResettingPassword(isResettingPasswordProps)
  }, [isResettingPasswordProps])

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

    return message
  }

  async function handleLogin(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      
      if (authError) {
        throw new Error(authError.message)
      }

      if (authData?.user) {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', authData.user.id)
          .single()

        if (profileError || (profileData && profileData.is_active === false)) {
          await supabase.auth.signOut()
          setAuthError("Il tuo account è stato disattivato dall'amministratore. Contatta il salone per maggiori informazioni.")
          setLoading(false)
          return
        }
      }
    } catch (err) {
      setAuthError(translateAuthError(err.message))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)

    try {
      // 1. Controllo preliminare: verifichiamo se l'email esiste nella tabella profiles
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (profileError) {
        throw new Error("Errore durante la verifica dell'email.")
      }

      // Se l'email non è associata a nessun profilo nel database
      if (!profileData) {
        setAuthError("L'indirizzo email inserito non risulta registrato. Verifica i dati o procedi con la registrazione.")
        setLoading(false)
        return
      }

      // 2. Se l'email esiste, procediamo con l'invio sicuro del link tramite Supabase Auth
      const siteUrl = window.location.origin
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: siteUrl,
      })

      if (resetError) {
        throw new Error(resetError.message)
      }

      setAuthSuccess('Ti abbiamo inviato un\'email con il link sicuro per reimpostare la password.')
    } catch (err) {
      setAuthError(translateAuthError(err.message))
    } finally {
      setLoading(false)
    }
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

  return (
    <div 
      style={{ 
        position: 'relative',
        zIndex: 1,
        '--primary-color': salonSettings.primary_color || '#2563eb',
        '--accent-color': salonSettings.accent_color || '#D4AF37',
        '--secondary-color': salonSettings.secondary_color || '#1E293B',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '40px 20px', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }}>
        
        {/* Brand Header Universale Dinamico */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '10px' }}>{appLogo}</div>

          <h1 style={{ 
            fontSize: '1.8rem', 
            fontWeight: 800, 
            margin: 0, 
            color: 'var(--secondary-color)',
            letterSpacing: '-0.025em',
            lineHeight: '1.2'
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

          <span style={{ 
            display: 'block', 
            fontSize: '0.85rem', 
            marginTop: '6px',
            color: '#64748b',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            {salonSettings?.salon_subtitle || 'Gestione Salone'}
          </span>
        </div>

        {/* Card Contenitore Principale */}
        <div style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '32px 28px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -2px rgba(0, 0, 0, 0.02)',
          border: '1px solid #e2e8f0',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {authError && <div style={errorBoxStyle}>{authError}</div>}
          {authSuccess && <div style={successBoxStyle}>{authSuccess}</div>}

          {isResettingPassword ? (
            <div>
              <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)', marginTop: 0, fontSize: '1.2rem', fontWeight: 700 }}>Nuova Password</h2>
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>
                Inserisci la nuova password per il tuo account.
              </p>
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
          ) : isForgotPassword ? (
            <div>
              <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)', marginTop: 0, fontSize: '1.2rem', fontWeight: 700 }}>Recupera Password</h2>
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>
                Inserisci la tua email per ricevere il link di recupero sicuro.
              </p>
              <form onSubmit={handleForgotPassword} style={formStyle}>
                <input 
                  type="email" 
                  placeholder="Indirizzo Email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  required 
                  style={inputStyle} 
                />
                <button type="submit" disabled={loading} style={btnPrimaryStyle}>
                  {loading ? 'Verifica in corso...' : 'Invia Link di Recupero'}
                </button>
                <p style={linkTextStyle}>
                  Torna al <span onClick={() => { setIsForgotPassword(false); setAuthError(''); setAuthSuccess(''); }} style={linkStyle}>Login</span>
                </p>
              </form>
            </div>
          ) : !isRegistering ? (
            <form onSubmit={handleLogin} style={formStyle}>
              <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)', marginTop: 0, fontSize: '1.2rem', marginBottom: '4px', fontWeight: 700 }}>Area Riservata</h2>
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>Accedi per gestire le tue prenotazioni</p>

              <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <div style={{ textAlign: 'right', marginTop: '-2px' }}>
                <span 
                  onClick={() => { setIsForgotPassword(true); setAuthError(''); setAuthSuccess(''); }} 
                  style={{ ...linkStyle, fontSize: '12px', color: '#64748b', fontWeight: 600 }}
                >
                  Password dimenticata?
                </span>
              </div>

              <button type="submit" disabled={loading} style={btnPrimaryStyle}>
                {loading ? 'Accesso in corso...' : 'Accedi'}
              </button>
              <p style={linkTextStyle}>
                Non hai un account? <span onClick={() => { setIsRegistering(true); setAuthError(''); setAuthSuccess(''); }} style={linkStyle}>Registrati ora</span>
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} style={formStyle}>
              <h2 style={{ textAlign: 'center', color: 'var(--secondary-color)', marginTop: 0, fontSize: '1.2rem', marginBottom: '4px', fontWeight: 700 }}>Crea Account</h2>
              <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>Inserisci i tuoi dati per registrarti</p>

              <input type="text" placeholder="Nome" value={firstName} onChange={e => setFirstName(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder="Cognome" value={lastName} onChange={e => setLastName(e.target.value)} required style={inputStyle} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="number" placeholder="Età" value={age} onChange={e => setAge(e.target.value)} required style={{ ...inputStyle, flex: 1 }} />
                <input type="tel" placeholder="Cellulare" value={phone} onChange={e => setPhone(e.target.value)} required style={{ ...inputStyle, flex: 2 }} />
              </div>
              <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password (min. 6 caratteri)" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                <input 
                  type="checkbox" 
                  id="privacy" 
                  checked={privacyAccepted} 
                  onChange={e => setPrivacyAccepted(e.target.checked)} 
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--primary-color)' }}
                />
                <label htmlFor="privacy" style={{ color: '#475569', fontSize: '12px', cursor: 'pointer' }}>
                  Accetto l'
                  <span 
                    onClick={(e) => {
                      e.preventDefault()
                      setShowPrivacyModal(true)
                    }}
                    style={{ color: 'var(--secondary-color)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', marginLeft: '3px' }}
                  >
                    Informativa sulla Privacy
                  </span>
                </label>
              </div>

              <button type="submit" disabled={loading} style={btnPrimaryStyle}>
                {loading ? 'Registrazione in corso...' : 'Crea Account'}
              </button>
              <p style={linkTextStyle}>
                Hai già un account? <span onClick={() => { setIsRegistering(false); setAuthError(''); setAuthSuccess(''); }} style={linkStyle}>Accedi</span>
              </p>
            </form>
          )}
        </div>
      </div>

      {/* MODALE INFORMATIVA PRIVACY */}
      {showPrivacyModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '480px',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: '#1e293b',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ color: 'var(--primary-color)', marginTop: 0, fontSize: '1.15rem', fontWeight: 700 }}>Informativa sulla Privacy</h3>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
              Ai sensi del Regolamento UE 2016/679 (GDPR), i dati raccolti (Nome, Cognome, Età, Telefono, Email) sono trattati esclusivamente per la gestione delle prenotazioni e dell'account utente presso <strong>{appName}</strong>.
            </p>
            <p style={{ fontSize: '13px', color: '#475569', lineHeight: '1.6' }}>
              I dati sono protetti e non ceduti a terzi. Puoi richiederne la cancellazione in qualsiasi momento direttamente dall'applicazione.
            </p>
            <button 
              onClick={() => setShowPrivacyModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--primary-color)',
                color: '#FFF',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '16px',
                fontSize: '0.9rem',
                boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
              }}
            >
              Ho capito
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
  padding: '11px 14px', 
  borderRadius: '8px', 
  border: '1px solid #cbd5e1', 
  backgroundColor: '#f8fafc', 
  color: '#1e293b', 
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: '14px',
  transition: 'border-color 0.2s'
}

const btnPrimaryStyle = { 
  width: '100%', 
  padding: '12px', 
  borderRadius: '8px', 
  border: 'none', 
  backgroundColor: 'var(--primary-color)', 
  color: '#FFF', 
  fontWeight: 600, 
  fontSize: '0.9rem',
  cursor: 'pointer',
  marginTop: '4px',
  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
  transition: 'background 0.2s'
}

const errorBoxStyle = { 
  background: '#fee2e2', 
  border: '1px solid #fca5a5',
  color: '#b91c1c', 
  padding: '12px 14px', 
  borderRadius: '8px', 
  marginBottom: '18px',
  fontSize: '13px',
  fontWeight: 500
}

const successBoxStyle = { 
  background: '#dcfce7', 
  border: '1px solid #86efac',
  color: '#166534', 
  padding: '12px 14px', 
  borderRadius: '8px', 
  marginBottom: '18px',
  fontSize: '13px',
  textAlign: 'center',
  fontWeight: 500
}

const linkTextStyle = { textAlign: 'center', color: '#64748b', fontSize: '13px', marginTop: '14px', marginBottom: 0 }
const linkStyle = { color: 'var(--secondary-color)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }
