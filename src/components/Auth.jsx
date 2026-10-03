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
  const [phonePrefix, setPhonePrefix] = useState('+39')
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

        if (!profileError && profileData && profileData.is_active === false) {
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
      const siteUrl = window.location.origin
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: siteUrl,
      })

      if (resetError) {
        throw new Error(resetError.message)
      }

      setAuthSuccess('Se l\'email è registrata, riceverai un link sicuro per reimpostare la password.')
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

    const cleanFirstName = firstName.trim()
    const cleanLastName = lastName.trim()
    const rawPhone = phone.trim()
    const cleanAge = age.trim()

    if (!cleanFirstName || !cleanLastName) {
      setAuthError("Nome e Cognome sono campi obbligatori.")
      return
    }

    const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/
    if (!nameRegex.test(cleanFirstName) || !nameRegex.test(cleanLastName)) {
      setAuthError("Nome e Cognome possono contenere solo lettere e spazi.")
      return
    }

    let formattedPhone = null
    if (rawPhone) {
      const numericPhone = rawPhone.replace(/[^0-9]/g, '')
      
      if (numericPhone.length < 6 || numericPhone.length > 12) {
        setAuthError("Inserisci un numero di cellulare valido.")
        return
      }

      // Unisce prefisso scelto e numero pulito (es: +39 + 3331234567)
      formattedPhone = `${phonePrefix}${numericPhone}`
    }

    let parsedAge = null
    if (cleanAge !== '') {
      parsedAge = parseInt(cleanAge, 10)
      if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
        setAuthError("Inserisci un valore di età valido compreso tra 10 e 120 anni.")
        return
      }
    }

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
            first_name: cleanFirstName,
            last_name: cleanLastName,
            phone: formattedPhone,
            age: parsedAge
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
        '--accent-color': '#C5A059',
        '--text-main': '#f3f4f6',
        '--text-muted': '#9ca3af',
        '--border-color': '#2a3241',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '40px 20px', 
        display: 'flex', 
        flexDirection: 'column', 
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        backgroundColor: '#0f1115',
        color: 'var(--text-main)',
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
            color: 'var(--text-main)',
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
            color: 'var(--text-muted)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase'
          }}>
            {salonSettings?.salon_subtitle || 'Gestione Salone'}
          </span>
        </div>

        {/* Card Contenitore Principale */}
        <div style={{
          backgroundColor: '#181c24',
          borderRadius: '16px',
          padding: '32px 28px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.4)',
          border: '1px solid var(--border-color)',
          width: '100%',
          boxSizing: 'border-box'
        }}>
          {authError && <div style={errorBoxStyle}>{authError}</div>}
          {authSuccess && <div style={successBoxStyle}>{authSuccess}</div>}

          {isResettingPassword ? (
            <div>
              <h2 style={{ textAlign: 'center', color: 'var(--text-main)', marginTop: 0, fontSize: '1.2rem', fontWeight: 700 }}>Nuova Password</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
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
              <h2 style={{ textAlign: 'center', color: 'var(--text-main)', marginTop: 0, fontSize: '1.2rem', fontWeight: 700 }}>Recupera Password</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
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
                  {loading ? 'Invio in corso...' : 'Invia Link di Recupero'}
                </button>
                <p style={linkTextStyle}>
                  Torna al <span onClick={() => { setIsForgotPassword(false); setAuthError(''); setAuthSuccess(''); }} style={linkStyle}>Login</span>
                </p>
              </form>
            </div>
          ) : !isRegistering ? (
            <form onSubmit={handleLogin} style={formStyle}>
              <h2 style={{ textAlign: 'center', color: 'var(--text-main)', marginTop: 0, fontSize: '1.2rem', marginBottom: '4px', fontWeight: 700 }}>Area Riservata</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>Accedi per gestire le tue prenotazioni</p>

              <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <div style={{ textAlign: 'right', marginTop: '-2px' }}>
                <span 
                  onClick={() => { setIsForgotPassword(true); setAuthError(''); setAuthSuccess(''); }} 
                  style={{ ...linkStyle, fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}
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
              <h2 style={{ textAlign: 'center', color: 'var(--text-main)', marginTop: 0, fontSize: '1.2rem', marginBottom: '4px', fontWeight: 700 }}>Crea Account</h2>
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>Inserisci i tuoi dati per registrarti</p>

              <input type="text" placeholder="Nome" value={firstName} onChange={e => setFirstName(e.target.value)} required style={inputStyle} />
              <input type="text" placeholder="Cognome" value={lastName} onChange={e => setLastName(e.target.value)} required style={inputStyle} />
              
              <div style={{ display: 'flex', gap: '10px' }}>
                <input type="number" placeholder="Età" min="10" max="120" value={age} onChange={e => setAge(e.target.value)} required style={{ ...inputStyle, flex: '0 0 75px' }} />
                
                {/* Gruppo Prefisso + Telefono */}
                <div style={{ display: 'flex', flex: 1, gap: '4px' }}>
                  <select 
                    value={phonePrefix} 
                    onChange={e => setPhonePrefix(e.target.value)}
                    style={{
                      ...inputStyle,
                      flex: '0 0 85px',
                      padding: '11px 4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    <option value="+39">🇮🇹 +39</option>
                    <option value="+41">🇨🇭 +41</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+34">🇪🇸 +34</option>
                    <option value="+44">🇬🇧 +44</option>
                  </select>

                  <input 
                    type="tel" 
                    placeholder="Cellulare" 
                    value={phone} 
                    onChange={e => setPhone(e.target.value)} 
                    required 
                    style={{ ...inputStyle, flex: 1 }} 
                  />
                </div>
              </div>

              <input type="email" placeholder="Indirizzo Email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
              <input type="password" placeholder="Password (min. 6 caratteri)" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '10px 0' }}>
                <input 
                  type="checkbox" 
                  id="privacy" 
                  checked={privacyAccepted} 
                  onChange={e => setPrivacyAccepted(e.target.checked)} 
                  style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent-color)' }}
                />
                <label htmlFor="privacy" style={{ color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                  Accetto l'
                  <span 
                    onClick={(e) => {
                      e.preventDefault()
                      setShowPrivacyModal(true)
                    }}
                    style={{ color: 'var(--text-main)', textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', marginLeft: '3px' }}
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
          backgroundColor: 'rgba(11, 14, 19, 0.75)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#181c24',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '480px',
            maxHeight: '80vh',
            overflowY: 'auto',
            color: 'var(--text-main)',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            <h3 style={{ color: 'var(--accent-color)', marginTop: 0, fontSize: '1.15rem', fontWeight: 700 }}>Informativa sulla Privacy</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              Ai sensi del Regolamento UE 2016/679 (GDPR), i dati raccolti (Nome, Cognome, Età, Telefono, Email) sono trattati esclusivamente per la gestione delle prenotazioni e dell'account utente presso <strong>{appName}</strong>.
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              I dati sono protetti e non ceduti a terzi. Puoi richiederne la cancellazione in qualsiasi momento direttamente dall'applicazione.
            </p>
            <button 
              onClick={() => setShowPrivacyModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'var(--accent-color)',
                color: '#0f1115',
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: '16px',
                fontSize: '0.9rem',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
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
  border: '1px solid var(--border-color)', 
  backgroundColor: '#11141b', 
  color: 'var(--text-main)', 
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
  backgroundColor: 'var(--accent-color)', 
  color: '#0f1115', 
  fontWeight: 600, 
  fontSize: '0.9rem',
  cursor: 'pointer',
  marginTop: '4px',
  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
  transition: 'background 0.2s'
}

const errorBoxStyle = { 
  background: '#3f2222', 
  border: '1px solid #7f1d1d',
  color: '#fca5a5', 
  padding: '12px 14px', 
  borderRadius: '8px', 
  marginBottom: '18px',
  fontSize: '13px',
  fontWeight: 500
}

const successBoxStyle = { 
  background: '#143825', 
  border: '1px solid #1e462b',
  color: '#4ade80', 
  padding: '12px 14px', 
  borderRadius: '8px', 
  marginBottom: '18px',
  fontSize: '13px',
  textAlign: 'center',
  fontWeight: 500
}

const linkTextStyle = { textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', marginTop: '14px', marginBottom: 0 }
const linkStyle = { color: 'var(--text-main)', cursor: 'pointer', textDecoration: 'underline', fontWeight: 700 }
