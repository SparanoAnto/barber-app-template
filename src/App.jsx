import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Auth } from './components/Auth'
import { BookingView } from './components/BookingView'
import { Navigation } from './components/Navigation'
import { AdminApprovals } from './components/AdminApprovals'
import { AppointmentsView } from './components/AppointmentsView'
import { AdminReports } from './components/AdminReports'
import { InstallGuideModal } from './components/InstallGuideModal'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('services')

  // Stato per le impostazioni dinamiche del salone
  const [salonSettings, setSalonSettings] = useState({
    salon_name: 'Barber Shop',
    salon_subtitle: 'Barber Shop',
    address: '',
    phone: '',
    closed_day: 'Domenica e Lunedì',
    opening_time: '08:30',
    closing_time: '20:00',
    slot_interval_minutes: 30,
    closed_days: [0, 1] // [Domenica, Lunedì]
  })

  // Mappatura da stringa ad array di indici JS per i giorni di chiusura
  function getClosedDaysArray(closedDayText, closedDaysArray) {
    if (Array.isArray(closedDaysArray) && closedDaysArray.length > 0) {
      return closedDaysArray
    }
    const map = {
      'Domenica': [0],
      'Lunedì': [1],
      'Martedì': [2],
      'Mercoledì': [3],
      'Giovedì': [4],
      'Venerdì': [5],
      'Sabato': [6],
      'Domenica e Lunedì': [0, 1]
    }
    return map[closedDayText] || [0, 1]
  }

  // Stato per il reset password da link email
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Stati per il cambio password nel profilo
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' })

  // Sub-tab Admin
  const [adminSubTab, setAdminSubTab] = useState('approvals')

  const [services, setServices] = useState([])
  const [barbers, setBarbers] = useState([])
  const [pendingCount, setPendingCount] = useState(0)

  const [editingAppointment, setEditingAppointment] = useState(null)

  useEffect(() => {
    // 🔍 CONTROLLO URL: Attiva il Reset Password SOLO se type=recovery
    const hash = window.location.hash
    const search = window.location.search

    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setIsResettingPassword(true)
    }

    // Carica le impostazioni del salone all'avvio
    fetchSalonSettings()

    // 1. Recupero sessione iniziale
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // 2. Ascolto dei cambiamenti di stato Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)

      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true)
      }

      if (session) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && (profile?.is_approved || profile?.role === 'admin')) {
      loadSaloneData()
    }
    if (session && profile?.role === 'admin') {
      fetchPendingCount()
    }
  }, [session, profile])

  async function fetchSalonSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single()
      if (data && !error) {
        setSalonSettings(prev => ({ ...prev, ...data }))
        document.title = data.salon_name || 'Barber Shop'
      }
    } catch (err) {
      console.error('Errore caricamento settings salone:', err.message)
    }
  }

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      setProfile(data)
    } catch (err) {
      console.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPendingCount() {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_approved', false)

    if (!error) setPendingCount(count || 0)
  }

  async function loadSaloneData() {
    const { data: sData } = await supabase.from('services').select('*')
    const { data: bData } = await supabase.from('barbers').select('*').eq('is_active', true)
    if (sData) setServices(sData)
    if (bData) setBarbers(bData)
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPwdMessage({ type: '', text: '' })

    if (!newPassword || newPassword.length < 6) {
      setPwdMessage({ type: 'error', text: 'La password deve contenere almeno 6 caratteri.' })
      return
    }

    setPwdLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })

    if (error) {
      setPwdMessage({ type: 'error', text: error.message })
    } else {
      setPwdMessage({ type: 'success', text: 'Password aggiornata con successo!' })
      setNewPassword('')
      setTimeout(() => setShowPasswordForm(false), 2000)
    }
    setPwdLoading(false)
  }

  async function handleDeleteAccount() {
    if (profile?.role === 'admin') {
      alert("Gli account Amministratore non possono essere eliminati dall'applicazione.")
      return
    }

    const confirmDelete = window.confirm(
      "Sei sicuro di voler eliminare definitivamente il tuo account?\n\nI tuoi dati personali verranno rimossi e i tuoi appuntamenti passati verranno anonimizzati."
    )

    if (confirmDelete) {
      try {
        setLoading(true)
        const { error } = await supabase.rpc('delete_own_user')

        if (error) throw error

        await supabase.auth.signOut()
        alert("Il tuo account ed i tuoi dati personali sono stati eliminati con successo.")
        window.location.reload()
      } catch (err) {
        alert("Errore durante l'eliminazione dell'account: " + err.message)
      } finally {
        setLoading(false)
      }
    }
  }

  const handleStartEdit = (appointment) => {
    setEditingAppointment(appointment)
    setActiveTab('services')
  }

  const handleBookingSuccess = () => {
    setEditingAppointment(null)
    setActiveTab('appointments')
  }

  if (loading) {
    return (
      <div className="app-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <h1 className="brand-title" style={{ fontSize: '2.4rem', textAlign: 'center' }}>
          {salonSettings.salon_name}
        </h1>
        <span className="brand-subtitle" style={{ fontSize: '2rem' }}>
          {salonSettings.salon_subtitle || 'Barber Shop'}
        </span>
      </div>
    )
  }

  // Reset Password da email (SOLO per type=recovery)
  if (isResettingPassword) {
    return (
      <Auth 
        appName={salonSettings.salon_name}
        salonSettings={salonSettings}
        isResettingPasswordProps={true} 
        onPasswordUpdated={() => {
          setIsResettingPassword(false)
          window.history.replaceState({}, document.title, window.location.pathname)
        }} 
      />
    )
  }

  // Se non autenticato, mostra il form di Auth con il nome, il logo e i settings dinamici
  if (!session) {
    return (
      <Auth 
        appName={salonSettings.salon_name} 
        salonSettings={salonSettings}
        appLogo={salonSettings.logo_url ? <img src={salonSettings.logo_url} alt="Logo" style={{ height: '50px' }} /> : "💈"} 
      />
    )
  }

  // Se in attesa di approvazione admin
  if (profile && !profile.is_approved && profile.role !== 'admin') {
    return (
      <div className="app-container" style={{ padding: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <InstallGuideModal />
        <div className="info-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--barber-red)', margin: '0 0 10px 0' }}>Account in Attesa</h2>
          <p style={{ color: 'var(--text-muted)', lineHeight: '1.5' }}>
            Ciao <strong>{profile.first_name}</strong>, la tua registrazione è attiva. Un amministratore deve convalidare il tuo account prima che tu possa prenotare.
          </p>
          <button onClick={() => supabase.auth.signOut()} className="btn-danger" style={{ marginTop: '15px' }}>
            Esci
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <InstallGuideModal />

      <div className="top-banner" />

      <div className="header-brand">
        <div>
          <h2 className="brand-title">{salonSettings.salon_name}</h2>
          <span className="brand-subtitle">{salonSettings.salon_subtitle || 'Barber Shop'}</span>
        </div>
        {profile?.role === 'admin' && <span className="admin-badge">ADMIN</span>}
      </div>

      <div style={{ padding: '20px', position: 'relative', zIndex: 1 }}>
        {activeTab === 'services' && (
          <BookingView 
            services={services} 
            barbers={barbers} 
            userId={session.user.id} 
            isAdmin={profile?.role === 'admin'}
            editingAppointment={editingAppointment}
            onBookingSuccess={handleBookingSuccess}
            onCancelEdit={() => setEditingAppointment(null)}
            
            /* --- INIEZIONE IMPOSTAZIONI DINAMICHE DA SUPABASE --- */
            openingTime={salonSettings.opening_time || '08:30'}
            closingTime={salonSettings.closing_time || '20:00'}
            slotIntervalMinutes={salonSettings.slot_interval_minutes || 30}
            closedDays={getClosedDaysArray(salonSettings.closed_day, salonSettings.closed_days)}
          />
        )}

        {activeTab === 'info' && (
          <div>
            <h3 className="section-title">Dove Siamo</h3>
            <div className="info-card">
              <p style={{ margin: '8px 0' }}>📍 {salonSettings.address || 'Indirizzo da configurare'}</p>
              {salonSettings.phone && <p style={{ margin: '8px 0' }}>📞 Tel: {salonSettings.phone}</p>}
              <p style={{ color: 'var(--barber-red)', fontWeight: 'bold', margin: '15px 0 0 0' }}>
                💈 Chiuso il {salonSettings.closed_day || 'Domenica e Lunedì'}
              </p>
            </div>
          </div>
        )}

        {activeTab === 'appointments' && (
          <AppointmentsView 
            userId={session.user.id} 
            isAdmin={profile?.role === 'admin'}
            onEditAppointment={handleStartEdit}
          />
        )}

        {activeTab === 'profile' && (
          <div>
            <h3 className="section-title">Il Tuo Profilo</h3>
            <div className="info-card">
              <p style={{ margin: '10px 0' }}><strong>Nome:</strong> {profile?.first_name} {profile?.last_name}</p>
              <p style={{ margin: '10px 0' }}><strong>Email:</strong> {profile?.email}</p>
              <p style={{ margin: '10px 0' }}><strong>Telefono:</strong> {profile?.phone}</p>
              
              <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

              {!showPasswordForm ? (
                <button 
                  onClick={() => {
                    setShowPasswordForm(true)
                    setPwdMessage({ type: '', text: '' })
                  }}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#FFF',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🔑 Modifica Password
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: '#FFF', margin: 0 }}>Cambia Password</h4>
                    <span 
                      onClick={() => {
                        setShowPasswordForm(false)
                        setNewPassword('')
                        setPwdMessage({ type: '', text: '' })
                      }}
                      style={{ color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Annulla
                    </span>
                  </div>
                  
                  {pwdMessage.text && (
                    <div style={{
                      padding: '10px',
                      borderRadius: '6px',
                      marginBottom: '10px',
                      fontSize: '13px',
                      backgroundColor: pwdMessage.type === 'error' ? 'rgba(211, 47, 47, 0.2)' : 'rgba(46, 125, 50, 0.2)',
                      border: pwdMessage.type === 'error' ? '1px solid var(--barber-red)' : '1px solid #2e7d32',
                      color: pwdMessage.type === 'error' ? '#FFF' : '#81c784'
                    }}>
                      {pwdMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input 
                      type="password" 
                      placeholder="Nuova Password" 
                      value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'rgba(15, 15, 15, 0.8)',
                        color: '#FFF',
                        boxSizing: 'border-box',
                        fontSize: '14px',
                        outline: 'none'
                      }}
                    />
                    <button 
                      type="submit" 
                      disabled={pwdLoading}
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: 'var(--barber-red)',
                        color: '#FFF',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                      }}
                    >
                      {pwdLoading ? 'Aggiornamento...' : 'Aggiorna Password'}
                    </button>
                  </form>
                </div>
              )}

              <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

              <button 
                onClick={() => supabase.auth.signOut()} 
                className="btn-danger" 
                style={{ width: '100%', marginBottom: '12px' }}
              >
                Disconnettiti
              </button>

              {profile?.role !== 'admin' && (
                <button 
                  onClick={handleDeleteAccount} 
                  style={{ 
                    width: '100%', 
                    padding: '10px', 
                    borderRadius: '6px', 
                    border: 'none', 
                    backgroundColor: 'transparent', 
                    color: 'var(--text-muted)', 
                    fontSize: '12px', 
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  ⚠️ Elimina il mio account e i dati
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'admin' && profile?.role === 'admin' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button
                onClick={() => setAdminSubTab('approvals')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: adminSubTab === 'approvals' ? '1px solid var(--barber-red)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'approvals' ? 'var(--barber-red)' : 'rgba(24, 24, 24, 0.85)',
                  color: '#FFF',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                📋 Approvazioni
              </button>

              <button
                onClick={() => setAdminSubTab('reports')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '8px',
                  border: adminSubTab === 'reports' ? '1px solid var(--barber-red)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'reports' ? 'var(--barber-red)' : 'rgba(24, 24, 24, 0.85)',
                  color: '#FFF',
                  fontWeight: 'bold',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                📊 Report & Stats
              </button>
            </div>

            {adminSubTab === 'approvals' ? (
              <div>
                <h3 className="section-title">Pannello Approvazioni</h3>
                <AdminApprovals onApprovalChange={fetchPendingCount} />
              </div>
            ) : (
              <AdminReports isOwner={profile?.is_owner || false} />
            )}
          </div>
        )}
      </div>

      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        isAdmin={profile?.role === 'admin'} 
        pendingCount={pendingCount}
      />
    </div>
  )
}
