import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Auth } from './components/Auth'
import { BookingView } from './components/BookingView'
import { Navigation } from './components/Navigation'
import { AdminApprovals } from './components/AdminApprovals'
import { AppointmentsView } from './components/AppointmentsView'
import { AdminReports } from './components/AdminReports'
import { AdminStaff } from './components/AdminStaff'
import { AdminServices } from './components/AdminServices'
import { AdminClients } from './components/AdminClients'
import { InstallGuideModal } from './components/InstallGuideModal'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('services')

  const [salonSettings, setSalonSettings] = useState(() => {
    const cachedSettings = localStorage.getItem('salon_settings')
    if (cachedSettings) {
      try {
        return JSON.parse(cachedSettings)
      } catch (e) {}
    }
    return {
      salon_name: 'Barber Shop',
      salon_subtitle: 'Barber Shop',
      address: '',
      phone: '',
      closed_day: 'Domenica e Lunedì',
      opening_time: '08:30',
      closing_time: '20:00',
      slot_interval_minutes: 30,
      closed_days: [0, 1],
      primary_color: '#2563eb',
      accent_color: '#D4AF37',
      secondary_color: '#1E293B'
    }
  })

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

  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' })

  const [showProfileForm, setShowProfileForm] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' })

  const [adminSubTab, setAdminSubTab] = useState('approvals')
  const [services, setServices] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [preselectedClientForBooking, setPreselectedClientForBooking] = useState(null)

  useEffect(() => {
    const hash = window.location.hash
    const search = window.location.search

    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      setIsResettingPassword(true)
    }

    async function initApp() {
      await fetchSalonSettings()

      const { data: { session: currentSession } } = await supabase.auth.getSession()
      
      if (currentSession) {
        const isActive = await verifyUserIsActive(currentSession.user.id)
        if (isActive) {
          setSession(currentSession)
          await fetchProfile(currentSession.user.id)
        } else {
          await supabase.auth.signOut()
          setSession(null)
          setLoading(false)
        }
      } else {
        setLoading(false)
      }
    }

    initApp()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsResettingPassword(true)
      }

      if (currentSession) {
        const isActive = await verifyUserIsActive(currentSession.user.id)
        if (isActive) {
          setSession(currentSession)
          await fetchProfile(currentSession.user.id)
        } else {
          await supabase.auth.signOut()
          setSession(null)
          setProfile(null)
          setLoading(false)
        }
      } else {
        setSession(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function verifyUserIsActive(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('is_active')
        .eq('id', userId)
        .single()

      if (error || (data && data.is_active === false)) {
        return false
      }
      return true
    } catch (err) {
      return false
    }
  }

  // Caricamento dati e ascolto Realtime globale (incluso servizi)
  useEffect(() => {
    if (session && (profile?.is_approved || profile?.role === 'admin')) {
      loadSaloneData()
    }
    
    let profileSubscription = null
    let servicesSubscription = null

    if (session && (profile?.is_approved || profile?.role === 'admin')) {
      if (profile?.role === 'admin') {
        fetchPendingCount()
        profileSubscription = supabase
          .channel('app_admin_profiles_realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            fetchPendingCount()
          })
          .subscribe()
      }

      // Ascolto Realtime globale per i servizi, così si aggiornano subito ovunque
      servicesSubscription = supabase
        .channel('app_global_services_realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
          loadSaloneData()
        })
        .subscribe()
    }

    return () => {
      if (profileSubscription) supabase.removeChannel(profileSubscription)
      if (servicesSubscription) supabase.removeChannel(servicesSubscription)
    }
  }, [session, profile])

  // Ricarica i servizi ogni volta che l'utente si sposta sulla tab dei servizi (BookingView)
  useEffect(() => {
    if (activeTab === 'services' && session && (profile?.is_approved || profile?.role === 'admin')) {
      loadSaloneData()
    }
  }, [activeTab, session, profile])

  async function fetchSalonSettings() {
    try {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single()
      if (data && !error) {
        setSalonSettings(prev => {
          const updated = { ...prev, ...data }
          localStorage.setItem('salon_settings', JSON.stringify(updated))
          return updated
        })
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
      if (data) {
        setEditFirstName(data.first_name || '')
        setEditLastName(data.last_name || '')
        setEditPhone(data.phone || '')
      }
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
    if (sData) setServices(sData)
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

  async function handleUpdateProfile(e) {
    e.preventDefault()
    setProfileMessage({ type: '', text: '' })

    if (!editFirstName.trim() || !editLastName.trim()) {
      setProfileMessage({ type: 'error', text: 'Nome e Cognome sono obbligatori.' })
      return
    }

    setProfileLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: editFirstName.trim(),
          last_name: editLastName.trim(),
          phone: editPhone.trim()
        })
        .eq('id', session.user.id)

      if (error) throw error

      setProfileMessage({ type: 'success', text: 'Informazioni aggiornate con successo!' })
      setProfile(prev => ({
        ...prev,
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        phone: editPhone.trim()
      }))
      setTimeout(() => {
        setShowProfileForm(false)
        setProfileMessage({ type: '', text: '' })
      }, 1500)
    } catch (err) {
      setProfileMessage({ type: 'error', text: err.message })
    } finally {
      setProfileLoading(false)
    }
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
    setPreselectedClientForBooking(null)
    setActiveTab('appointments')
  }

  // --- LOADING SCHERMATA PROFESSIONALE (Sostituisce l'icona fissa) ---
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
        height: '100vh', backgroundColor: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif' 
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #e2e8f0',
          borderTop: '3px solid #2563eb',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span style={{ marginTop: '16px', fontSize: '13px', fontWeight: 600, color: '#64748b', letterSpacing: '0.5px' }}>
          Caricamento in corso...
        </span>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

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

  if (!session) {
    return (
      <Auth 
        appName={salonSettings.salon_name} 
        salonSettings={salonSettings}
        appLogo={salonSettings.logo_url ? <img src={salonSettings.logo_url} alt="Logo" style={{ height: '50px' }} /> : "💈"} 
      />
    )
  }

  if (profile && !profile.is_approved && profile.role !== 'admin') {
    return (
      <div className="app-container" style={{ padding: '30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <InstallGuideModal salonSettings={salonSettings} />
        <div className="info-card" style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger-color)', margin: '0 0 10px 0' }}>Account in Attesa</h2>
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
    <div 
      className="app-container"
      style={{ 
        '--primary-color': salonSettings.primary_color || '#2563eb',
        '--accent-color': salonSettings.accent_color || '#D4AF37',
        '--secondary-color': salonSettings.secondary_color || '#1E293B'
      }}
    >
      <InstallGuideModal salonSettings={salonSettings} />

      <div className="top-banner" />

      <div className="header-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {salonSettings.logo_url ? (
            <img 
              src={salonSettings.logo_url} 
              alt={salonSettings.salon_name || 'Logo Salone'} 
              style={{ width: '45px', height: '45px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--border-color)' }} 
            />
          ) : (
            <div style={{
              width: '45px', height: '45px', borderRadius: '8px', backgroundColor: 'var(--primary-color)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px'
            }}>
              {salonSettings.salon_name ? salonSettings.salon_name.charAt(0) : 'E'}
            </div>
          )}

          <div>
            <h2 className="brand-title" style={{ fontSize: '1.25rem', margin: 0 }}>{salonSettings.salon_name}</h2>
            <span className="brand-subtitle" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
              {salonSettings.salon_subtitle || 'HAIR & BEAUTY SALON'}
            </span>
          </div>
        </div>
        {profile?.role === 'admin' && <span className="admin-badge">ADMIN</span>}
      </div>

      <div style={{ padding: '20px', position: 'relative', zIndex: 1 }}>
        {activeTab === 'services' && (
          <BookingView 
            services={services} 
            onServicesChange={loadSaloneData} 
            userId={session.user.id} 
            isAdmin={profile?.role === 'admin'}
            editingAppointment={editingAppointment}
            preselectedClient={preselectedClientForBooking}
            onBookingSuccess={handleBookingSuccess}
            onCancelEdit={() => {
              setEditingAppointment(null)
              setPreselectedClientForBooking(null)
            }}
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
              <p style={{ color: 'var(--danger-color)', fontWeight: 'bold', margin: '15px 0 0 0' }}>
                💈 Chiuso {salonSettings.closed_day || 'Domenica e Lunedì'}
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
              {!showProfileForm ? (
                <div>
                  <p style={{ margin: '10px 0' }}><strong>Nome:</strong> {profile?.first_name} {profile?.last_name}</p>
                  <p style={{ margin: '10px 0' }}><strong>Email:</strong> {profile?.email}</p>
                  <p style={{ margin: '10px 0' }}><strong>Telefono:</strong> {profile?.phone || 'Non specificato'}</p>
                  
                  <button 
                    onClick={() => {
                      setEditFirstName(profile?.first_name || '')
                      setEditLastName(profile?.last_name || '')
                      setEditPhone(profile?.phone || '')
                      setShowProfileForm(true)
                      setProfileMessage({ type: '', text: '' })
                    }}
                    style={{
                      width: '100%', marginTop: '15px', padding: '10px', borderRadius: '8px',
                      border: '1px solid var(--border-color)', backgroundColor: '#ffffff',
                      color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    ✏️ Modifica Dati Personali
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: 'var(--text-main)', margin: 0 }}>Modifica Profilo</h4>
                    <span 
                      onClick={() => {
                        setShowProfileForm(false)
                        setProfileMessage({ type: '', text: '' })
                      }}
                      style={{ color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Annulla
                    </span>
                  </div>

                  {profileMessage.text && (
                    <div style={{
                      padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px',
                      backgroundColor: profileMessage.type === 'error' ? '#fee2e2' : '#d1fae5',
                      border: profileMessage.type === 'error' ? '1px solid #ef4444' : '1px solid #10b981',
                      color: profileMessage.type === 'error' ? '#991b1b' : '#065f46'
                    }}>
                      {profileMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nome</label>
                      <input type="text" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} style={profileInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cognome</label>
                      <input type="text" value={editLastName} onChange={e => setEditLastName(e.target.value)} style={profileInputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Telefono</label>
                      <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)} style={profileInputStyle} />
                    </div>

                    <button 
                      type="submit" disabled={profileLoading}
                      style={{
                        padding: '10px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'var(--primary-color)', color: '#FFF', fontWeight: '600', cursor: 'pointer', marginTop: '5px'
                      }}
                    >
                      {profileLoading ? 'Salvataggio...' : 'Salva Modifiche'}
                    </button>
                  </form>
                </div>
              )}
              
              <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

              {!showPasswordForm ? (
                <button 
                  onClick={() => {
                    setShowPasswordForm(true)
                    setPwdMessage({ type: '', text: '' })
                  }}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '8px',
                    border: '1px solid var(--border-color)', backgroundColor: '#ffffff',
                    color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer'
                  }}
                >
                  🔑 Modifica Password
                </button>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: 'var(--text-main)', margin: 0 }}>Cambia Password</h4>
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
                      padding: '10px', borderRadius: '8px', marginBottom: '10px', fontSize: '13px',
                      backgroundColor: pwdMessage.type === 'error' ? '#fee2e2' : '#d1fae5',
                      border: pwdMessage.type === 'error' ? '1px solid #ef4444' : '1px solid #10b981',
                      color: pwdMessage.type === 'error' ? '#991b1b' : '#065f46'
                    }}>
                      {pwdMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input 
                      type="password" placeholder="Nuova Password" value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)} style={profileInputStyle}
                    />
                    <button 
                      type="submit" disabled={pwdLoading}
                      style={{
                        padding: '10px', borderRadius: '8px', border: 'none',
                        backgroundColor: 'var(--danger-color)', color: '#FFF', fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      {pwdLoading ? 'Aggiornamento...' : 'Aggiorna Password'}
                    </button>
                  </form>
                </div>
              )}

              <hr style={{ border: '0', borderTop: '1px solid var(--border-color)', margin: '20px 0' }} />

              <button onClick={() => supabase.auth.signOut()} className="btn-danger" style={{ width: '100%', marginBottom: '12px' }}>
                Disconnettiti
              </button>

              {profile?.role !== 'admin' && (
                <button 
                  onClick={handleDeleteAccount} 
                  style={{ 
                    width: '100%', padding: '10px', borderRadius: '8px', border: 'none', 
                    backgroundColor: 'transparent', color: 'var(--text-muted)', fontSize: '12px', 
                    cursor: 'pointer', textDecoration: 'underline'
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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setAdminSubTab('approvals')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'approvals' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'approvals' ? 'var(--primary-color)' : '#ffffff',
                  color: adminSubTab === 'approvals' ? '#FFF' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                📋 Approvazioni
              </button>

              <button
                onClick={() => setAdminSubTab('clients')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'clients' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'clients' ? 'var(--primary-color)' : '#ffffff',
                  color: adminSubTab === 'clients' ? '#FFF' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                👥 Clienti
              </button>

              <button
                onClick={() => setAdminSubTab('services')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'services' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'services' ? 'var(--primary-color)' : '#ffffff',
                  color: adminSubTab === 'services' ? '#FFF' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                🏷️ Servizi
              </button>

              <button
                onClick={() => setAdminSubTab('staff')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'staff' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'staff' ? 'var(--primary-color)' : '#ffffff',
                  color: adminSubTab === 'staff' ? '#FFF' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                ✂️ Staff & Ferie
              </button>

              <button
                onClick={() => setAdminSubTab('reports')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'reports' ? '1px solid var(--primary-color)' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'reports' ? 'var(--primary-color)' : '#ffffff',
                  color: adminSubTab === 'reports' ? '#FFF' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                📊 Report & Stats
              </button>
            </div>

            {adminSubTab === 'approvals' && (
              <div>
                <h3 className="section-title">Pannello Approvazioni</h3>
                <AdminApprovals onApprovalCountChange={fetchPendingCount} />
              </div>
            )}

            {adminSubTab === 'clients' && (
              <AdminClients 
                onSelectClientForBooking={(client) => {
                  setPreselectedClientForBooking(client)
                  setActiveTab('services')
                }} 
              />
            )}

            {adminSubTab === 'services' && (
              <AdminServices />
            )}

            {adminSubTab === 'staff' && (
              <AdminStaff />
            )}

            {adminSubTab === 'reports' && (
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
        salonSettings={salonSettings}
      />
    </div>
  )
}

const profileInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: '#ffffff',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none'
}
