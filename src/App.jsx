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
import { SalonInfoView } from './components/SalonInfoView'
import { InstallGuideModal } from './components/InstallGuideModal'
import { NotificationCenter } from './components/NotificationCenter'
import './App.css'

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('services')

  // Stato per il banner e per lo storico di sessione con persistenza localStorage e pulizia a 24h
  const [bannerAlert, setBannerAlert] = useState({ show: false, text: '', type: 'info' })
  
  const [notificationHistory, setNotificationHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('admin_notification_history')
      const savedTime = localStorage.getItem('admin_notification_timestamp')
      
      if (saved && savedTime) {
        const now = Date.now()
        const lastTime = parseInt(savedTime, 10)
        const twentyFourHours = 24 * 60 * 60 * 1000

        // Autopulizia a 24 ore se sono passate più di 24h dall'ultima volta
        if (now - lastTime > twentyFourHours) {
          localStorage.removeItem('admin_notification_history')
          localStorage.removeItem('admin_notification_timestamp')
          localStorage.removeItem('admin_unread_count')
          return []
        }
        return JSON.parse(saved)
      }
    } catch (e) {
      console.error('Errore caricamento notifiche salvate:', e)
    }
    return []
  })

  const [unreadCount, setUnreadCount] = useState(() => {
    try {
      const savedCount = localStorage.getItem('admin_unread_count')
      const savedTime = localStorage.getItem('admin_notification_timestamp')
      if (savedCount && savedTime) {
        const now = Date.now()
        const lastTime = parseInt(savedTime, 10)
        if (now - lastTime > 24 * 60 * 60 * 1000) return 0
        return parseInt(savedCount, 10)
      }
    } catch (e) {}
    return 0
  })

  const [showNotificationModal, setShowNotificationModal] = useState(false)

  // Effetto per sincronizzare lo storico notifiche e il contatore nel localStorage
  useEffect(() => {
    try {
      localStorage.setItem('admin_notification_history', JSON.stringify(notificationHistory))
      localStorage.setItem('admin_unread_count', String(unreadCount))
      if (notificationHistory.length > 0) {
        localStorage.setItem('admin_notification_timestamp', String(Date.now()))
      } else {
        localStorage.removeItem('admin_notification_timestamp')
      }
    } catch (e) {
      console.error('Errore salvataggio notifiche:', e)
    }
  }, [notificationHistory, unreadCount])

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
      primary_color: '#C5A059',
      accent_color: '#C5A059',
      secondary_color: '#181c24'
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

  function playNotificationBell() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      const ctx = new AudioContext()

      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime)

        gain.gain.setValueAtTime(0.3, ctx.currentTime + startTime)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration)

        osc.connect(gain)
        gain.connect(ctx.destination)

        osc.start(ctx.currentTime + startTime)
        osc.stop(ctx.currentTime + startTime + duration)
      }

      playTone(587.33, 0, 0.4)
      playTone(880, 0.1, 0.5)
      playTone(1174.66, 0.2, 0.8)
    } catch (e) {
      console.log('Audio non riprodotto automaticamente:', e)
    }
  }

  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' })

  const [showProfileForm, setShowProfileForm] = useState(false)
  const [editFirstName, setEditFirstName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editPhonePrefix, setEditPhonePrefix] = useState('+39')
  const [editPhone, setEditPhone] = useState('')
  const [editAge, setEditAge] = useState('')
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

      if (!error && data && data.is_active === false) {
        return false
      }
      return true
    } catch (err) {
      return true
    }
  }

  useEffect(() => {
    if (session && (profile?.is_approved || profile?.role === 'admin')) {
      loadSaloneData()
    }
    
    let profileSubscription = null
    let servicesSubscription = null
    let appointmentsSubscription = null

    if (session && (profile?.is_approved || profile?.role === 'admin')) {
      if (profile?.role === 'admin') {
        fetchPendingCount()
        profileSubscription = supabase
          .channel('app_admin_profiles_realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
            fetchPendingCount()
          })
          .subscribe()

        appointmentsSubscription = supabase
          .channel('app_admin_appointments_realtime')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, async (payload) => {
            let detailText = ''

            if (payload.eventType === 'INSERT') {
              const newAppt = payload.new
              detailText = '📅 Nuovo appuntamento prenotato!'
              if (newAppt.appointment_date) {
                const [year, month, day] = newAppt.appointment_date.split('-')
                const timeFormatted = newAppt.start_time ? newAppt.start_time.substring(0, 5) : ''
                detailText = `📅 Nuovo appuntamento per il ${day}/${month}/${year}${timeFormatted ? ' alle ' + timeFormatted : ''}`
              }
              playNotificationBell()
            } 
            else if (payload.eventType === 'DELETE') {
              const oldAppt = payload.old
              detailText = '❌ Un appuntamento è stato cancellato!'
              if (oldAppt && oldAppt.appointment_date) {
                const [year, month, day] = oldAppt.appointment_date.split('-')
                const timeFormatted = oldAppt.start_time ? oldAppt.start_time.substring(0, 5) : ''
                detailText = `❌ Appuntamento cancellato per il ${day}/${month}/${year}${timeFormatted ? ' alle ' + timeFormatted : ''}`
              }
              playNotificationBell()
            } 
            else if (payload.eventType === 'UPDATE') {
              const updatedAppt = payload.new
              const oldAppt = payload.old

              if (updatedAppt.status === 'cancelled' && oldAppt.status !== 'cancelled') {
                detailText = '❌ Un appuntamento è stato annullato!'
                if (updatedAppt.appointment_date) {
                  const [year, month, day] = updatedAppt.appointment_date.split('-')
                  const timeFormatted = updatedAppt.start_time ? updatedAppt.start_time.substring(0, 5) : ''
                  detailText = `❌ Appuntamento annullato per il ${day}/${month}/${year}${timeFormatted ? ' alle ' + timeFormatted : ''}`
                }
                playNotificationBell()
              } else {
                detailText = '✏️ Un appuntamento è stato modificato!'
                if (updatedAppt.appointment_date) {
                  const [year, month, day] = updatedAppt.appointment_date.split('-')
                  const timeFormatted = updatedAppt.start_time ? updatedAppt.start_time.substring(0, 5) : ''
                  detailText = `✏️ Appuntamento modificato per il ${day}/${month}/${year}${timeFormatted ? ' alle ' + timeFormatted : ''}`
                }
                playNotificationBell()
              }
            }

            if (detailText) {
              const newNotification = {
                id: Date.now(),
                text: detailText,
                timestamp: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
              }

              setNotificationHistory(prev => [newNotification, ...prev].slice(0, 30))
              setUnreadCount(prev => prev + 1)

              setBannerAlert({
                show: true,
                text: detailText,
                type: 'info'
              })
              setTimeout(() => {
                setBannerAlert({ show: false, text: '', type: 'info' })
              }, 6000)
            }
          })
          .subscribe()
      }

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
      if (appointmentsSubscription) supabase.removeChannel(appointmentsSubscription)
    }
  }, [session, profile])

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
        setEditAge(data.age !== null && data.age !== undefined ? String(data.age) : '')
        
        const fullPhone = data.phone || ''
        if (fullPhone.startsWith('+')) {
          const knownPrefixes = ['+39', '+41', '+33', '+49', '+34', '+44']
          const foundPrefix = knownPrefixes.find(p => fullPhone.startsWith(p))
          if (foundPrefix) {
            setEditPhonePrefix(foundPrefix)
            setEditPhone(fullPhone.replace(foundPrefix, ''))
          } else {
            setEditPhonePrefix('+39')
            setEditPhone(fullPhone)
          }
        } else {
          setEditPhonePrefix('+39')
          setEditPhone(fullPhone)
        }
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

    const cleanFirstName = editFirstName.trim()
    const cleanLastName = editLastName.trim()
    const rawPhone = editPhone.trim()
    const cleanAge = editAge.trim()

    if (!cleanFirstName || !cleanLastName) {
      setProfileMessage({ type: 'error', text: 'Nome e Cognome sono campi obbligatori.' })
      return
    }

    const nameRegex = /^[A-Za-zÀ-ÿ\s'-]+$/
    if (!nameRegex.test(cleanFirstName) || !nameRegex.test(cleanLastName)) {
      setProfileMessage({ type: 'error', text: 'Nome e Cognome possono contenere solo lettere e spazi.' })
      return
    }

    let formattedPhone = null
    if (rawPhone) {
      const numericPhone = rawPhone.replace(/[^0-9]/g, '')
      if (numericPhone.length < 6 || numericPhone.length > 12) {
        setProfileMessage({ type: 'error', text: 'Inserisci un numero di cellulare valido.' })
        return
      }
      formattedPhone = `${editPhonePrefix}${numericPhone}`
    }

    let parsedAge = null
    if (cleanAge !== '') {
      parsedAge = parseInt(cleanAge, 10)
      if (isNaN(parsedAge) || parsedAge < 10 || parsedAge > 120) {
        setProfileMessage({ type: 'error', text: 'Inserisci un valore di età valido compreso tra 10 e 120 anni.' })
        return
      }
    }

    setProfileLoading(true)
    try {
      const updatedData = {
        first_name: cleanFirstName,
        last_name: cleanLastName,
        full_name: `${cleanFirstName} ${cleanLastName}`,
        phone: formattedPhone,
        age: parsedAge
      }

      const { error } = await supabase
        .from('profiles')
        .update(updatedData)
        .eq('id', session.user.id)

      if (error) throw error

      setProfileMessage({ type: 'success', text: 'Informazioni aggiornate con successo!' })
      setProfile(prev => ({
        ...prev,
        ...updatedData
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

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', 
        height: '100vh', backgroundColor: '#0f1115', fontFamily: 'Inter, system-ui, sans-serif' 
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #2a3241',
          borderTop: '3px solid #C5A059',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <span style={{ marginTop: '16px', fontSize: '13px', fontWeight: 600, color: '#9ca3af', letterSpacing: '0.5px' }}>
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
          <h2 style={{ color: '#fca5a5', margin: '0 0 10px 0' }}>Account in Attesa</h2>
          <p style={{ color: '#9ca3af', lineHeight: '1.5' }}>
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
        '--primary-color': '#C5A059',
        '--accent-color': '#C5A059',
        '--secondary-color': '#181c24'
      }}
    >
      <InstallGuideModal salonSettings={salonSettings} />

      <div className="top-banner" />

      {/* Modale Centro Notifiche Modulare */}
      <NotificationCenter 
        show={showNotificationModal}
        onClose={() => setShowNotificationModal(false)}
        notifications={notificationHistory}
        onClear={() => {
          setNotificationHistory([])
          setUnreadCount(0)
          localStorage.removeItem('admin_notification_history')
          localStorage.removeItem('admin_unread_count')
          localStorage.removeItem('admin_notification_timestamp')
        }}
      />

      {/* Banner di notifica in tempo reale */}
      {bannerAlert.show && (
        <div style={{
          position: 'fixed', top: '15px', left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, width: '90%', maxWidth: '450px',
          backgroundColor: '#1f2937', border: '1px solid #C5A059', color: '#f3f4f6',
          padding: '14px 18px', borderRadius: '10px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          animation: 'fadeInOut 0.3s ease-in-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '18px' }}>🔔</span>
            <span style={{ fontSize: '13px', fontWeight: '500', lineHeight: '1.4' }}>{bannerAlert.text}</span>
          </div>
          <button 
            onClick={() => setBannerAlert({ show: false, text: '', type: 'info' })}
            style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '16px', cursor: 'pointer', padding: '0 4px', flexShrink: 0 }}
          >
            ✕
          </button>
        </div>
      )}

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
              width: '45px', height: '45px', borderRadius: '8px', backgroundColor: '#C5A059',
              color: '#0f1115', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px'
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

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {profile?.role === 'admin' && (
            <>
              <button 
                onClick={() => {
                  setShowNotificationModal(true)
                  setUnreadCount(0)
                  localStorage.setItem('admin_unread_count', '0')
                }}
                style={{
                  position: 'relative', background: '#181c24', border: '1px solid var(--border-color)',
                  borderRadius: '8px', padding: '8px 10px', cursor: 'pointer', color: 'var(--text-main)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px'
                }}
                title="Centro Notifiche"
              >
                🔔
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#ef4444',
                    color: '#fff', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px',
                    borderRadius: '50%', border: '2px solid #0f1115'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>
              <span className="admin-badge">ADMIN</span>
            </>
          )}
        </div>
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
          <SalonInfoView 
            salonSettings={salonSettings} 
            isAdmin={profile?.role === 'admin'} 
          />
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
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                    <p style={{ margin: 0 }}><strong>Nome:</strong> {profile?.first_name || ''} {profile?.last_name || ''}</p>
                    <p style={{ margin: 0 }}><strong>Email:</strong> {profile?.email || session?.user?.email}</p>
                    <p style={{ margin: 0 }}><strong>Età:</strong> {profile?.age !== null && profile?.age !== undefined ? `${profile.age} anni` : 'Non specificata'}</p>
                    <p style={{ margin: 0 }}><strong>Telefono:</strong> {profile?.phone || 'Non specificato'}</p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setEditFirstName(profile?.first_name || '')
                      setEditLastName(profile?.last_name || '')
                      setEditAge(profile?.age !== null && profile?.age !== undefined ? String(profile.age) : '')
                      
                      const fullPhone = profile?.phone || ''
                      if (fullPhone.startsWith('+')) {
                        const knownPrefixes = ['+39', '+41', '+33', '+49', '+34', '+44']
                        const foundPrefix = knownPrefixes.find(p => fullPhone.startsWith(p))
                        if (foundPrefix) {
                          setEditPhonePrefix(foundPrefix)
                          setEditPhone(fullPhone.replace(foundPrefix, ''))
                        } else {
                          setEditPhonePrefix('+39')
                          setEditPhone(fullPhone)
                        }
                      } else {
                        setEditPhonePrefix('+39')
                        setEditPhone(fullPhone)
                      }

                      setShowProfileForm(true)
                      setProfileMessage({ type: '', text: '' })
                    }}
                    style={{
                      width: '100%', marginTop: '5px', padding: '10px', borderRadius: '8px',
                      border: '1px solid var(--border-color)', backgroundColor: '#11141b',
                      color: 'var(--text-main)', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    ✏️ Modifica Dati Anagrafici
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h4 style={{ color: 'var(--text-main)', margin: 0 }}>Modifica Dati Anagrafici</h4>
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
                      backgroundColor: profileMessage.type === 'error' ? '#3f2222' : '#143825',
                      border: profileMessage.type === 'error' ? '1px solid #7f1d1d' : '1px solid #1e462b',
                      color: profileMessage.type === 'error' ? '#fca5a5' : '#4ade80'
                    }}>
                      {profileMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleUpdateProfile} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Nome *</label>
                      <input 
                        type="text" 
                        value={editFirstName} 
                        onChange={e => setEditFirstName(e.target.value)} 
                        placeholder="Es. Mario" 
                        style={profileInputStyle} 
                        required 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cognome *</label>
                      <input 
                        type="text" 
                        value={editLastName} 
                        onChange={e => setEditLastName(e.target.value)} 
                        placeholder="Es. Rossi" 
                        style={profileInputStyle} 
                        required 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Età</label>
                      <input 
                        type="number" 
                        min="10" 
                        max="120" 
                        value={editAge} 
                        onChange={e => setEditAge(e.target.value)} 
                        placeholder="Es. 30" 
                        style={profileInputStyle} 
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Cellulare</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <select 
                          value={editPhonePrefix} 
                          onChange={e => setEditPhonePrefix(e.target.value)}
                          style={{
                            ...profileInputStyle,
                            flex: '0 0 85px',
                            padding: '10px 4px',
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
                          value={editPhone} 
                          onChange={e => setEditPhone(e.target.value)} 
                          placeholder="Es. 3331234567" 
                          style={{ ...profileInputStyle, flex: 1 }} 
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" disabled={profileLoading}
                      style={{
                        padding: '10px', borderRadius: '8px', border: 'none',
                        backgroundColor: '#C5A059', color: '#0f1115', fontWeight: '600', cursor: 'pointer', marginTop: '5px'
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
                    border: '1px solid var(--border-color)', backgroundColor: '#11141b',
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
                      backgroundColor: pwdMessage.type === 'error' ? '#3f2222' : '#143825',
                      border: pwdMessage.type === 'error' ? '1px solid #7f1d1d' : '1px solid #1e462b',
                      color: pwdMessage.type === 'error' ? '#fca5a5' : '#4ade80'
                    }}>
                      {pwdMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <input 
                      type="password" placeholder="Nuova Password (min. 6 caratteri)" value={newPassword} 
                      onChange={e => setNewPassword(e.target.value)} style={profileInputStyle}
                    />
                    <button 
                      type="submit" disabled={pwdLoading}
                      style={{
                        padding: '10px', borderRadius: '8px', border: 'none',
                        backgroundColor: '#7f1d1d', color: '#fca5a5', fontWeight: '600', cursor: 'pointer'
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
                  border: adminSubTab === 'approvals' ? '1px solid #C5A059' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'approvals' ? '#C5A059' : '#181c24',
                  color: adminSubTab === 'approvals' ? '#0f1115' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                📋 Approvazioni
              </button>

              <button
                onClick={() => setAdminSubTab('clients')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'clients' ? '1px solid #C5A059' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'clients' ? '#C5A059' : '#181c24',
                  color: adminSubTab === 'clients' ? '#0f1115' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                👥 Clienti
              </button>

              <button
                onClick={() => setAdminSubTab('services')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'services' ? '1px solid #C5A059' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'services' ? '#C5A059' : '#181c24',
                  color: adminSubTab === 'services' ? '#0f1115' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                🏷️ Servizi
              </button>

              <button
                onClick={() => setAdminSubTab('staff')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'staff' ? '1px solid #C5A059' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'staff' ? '#C5A059' : '#181c24',
                  color: adminSubTab === 'staff' ? '#0f1115' : 'var(--text-main)',
                  fontWeight: '600', fontSize: '0.75rem', cursor: 'pointer'
                }}
              >
                ✂️ Staff & Ferie
              </button>

              <button
                onClick={() => setAdminSubTab('reports')}
                style={{
                  flex: 1, minWidth: '90px', padding: '10px 6px', borderRadius: '8px',
                  border: adminSubTab === 'reports' ? '1px solid #C5A059' : '1px solid var(--border-color)',
                  backgroundColor: adminSubTab === 'reports' ? '#C5A059' : '#181c24',
                  color: adminSubTab === 'reports' ? '#0f1115' : 'var(--text-main)',
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
  backgroundColor: '#11141b',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
  fontSize: '14px',
  outline: 'none'
}
