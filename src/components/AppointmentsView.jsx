import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AppointmentsView({ userId, isAdmin, onEditAppointment }) {
  const [appointments, setAppointments] = useState([])
  const [barbers, setBarbers] = useState([])
  const [selectedBarberId, setSelectedBarberId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  
  // Inizializzazione della data corrente nel formato locale YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'))

  useEffect(() => {
    if (isAdmin) {
      fetchBarbers()
    }
  }, [isAdmin])

  useEffect(() => {
    if (userId) {
      fetchAppointments()
    } else {
      setLoading(false)
    }
  }, [userId, isAdmin, selectedDate, selectedBarberId])

  async function fetchBarbers() {
    const { data } = await supabase.from('barbers').select('id, name').eq('is_active', true)
    if (data) setBarbers(data)
  }

  async function fetchAppointments() {
    setLoading(true)
    setErrorMsg(null)

    try {
      let query = supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          start_time,
          end_time,
          status,
          total_price,
          custom_client_name,
          barber_id,
          user_id,
          profiles:user_id ( first_name, last_name, phone ),
          barbers ( id, name ),
          appointment_services (
            service_id,
            services ( id, name, price, duration_minutes )
          )
        `)
        .neq('status', 'cancelled')

      if (isAdmin) {
        // Filtro preciso basato direttamente sul campo appointment_date (YYYY-MM-DD)
        query = query
          .eq('appointment_date', selectedDate)
          .order('start_time', { ascending: true })

        if (selectedBarberId !== 'all') {
          query = query.eq('barber_id', selectedBarberId)
        }
      } else {
        query = query
          .eq('user_id', userId)
          .order('appointment_date', { ascending: false })
          .order('start_time', { ascending: false })
      }

      const { data, error } = await query
      if (error) throw error
      setAppointments(data || [])
    } catch (err) {
      console.error('Errore Supabase:', err.message)
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Helper per verificare le regole di modifica/annullamento basate su data e ora locali
   */
  function checkAppointmentPermissions(appointmentDate, startTime) {
    if (isAdmin) return { canModify: true, canCancel: true, reason: '' }

    const now = new Date().getTime()
    const appointmentDateTime = new Date(`${appointmentDate}T${startTime}`).getTime()
    const diffMs = appointmentDateTime - now
    const fifteenMinutesMs = 15 * 60 * 1000

    if (diffMs <= 0) {
      return {
        canModify: false,
        canCancel: false,
        reason: 'L\'appuntamento è già passato.'
      }
    }

    if (diffMs < fifteenMinutesMs) {
      return {
        canModify: true,
        canCancel: false,
        reason: 'Impossibile annullare a meno di 15 minuti dall\'orario.'
      }
    }

    return { canModify: true, canCancel: true, reason: '' }
  }

  async function handleCancelAppointment(item) {
    const { canCancel, reason } = checkAppointmentPermissions(item.appointment_date, item.start_time)

    if (!canCancel) {
      alert(reason || "Non hai i permessi per annullare questo appuntamento.")
      return
    }

    const confirmCancel = window.confirm("Sei sicuro di voler annullare questo appuntamento?")
    if (!confirmCancel) return

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', item.id)

      if (error) throw error

      alert("Appuntamento annullato con successo!")
      fetchAppointments()
    } catch (err) {
      alert("Errore durante l'annullamento: " + err.message)
    }
  }

  /**
   * Funzione Click to Chat per l'invio rapido del promemoria WhatsApp (solo Admin)
   */
  function sendWhatsAppReminder(item) {
    const phone = item.profiles?.phone || ''
    const clientName = item.custom_client_name 
      ? item.custom_client_name 
      : `${item.profiles?.first_name || ''} ${item.profiles?.last_name || ''}`.trim() || 'Cliente'
    
    const timeFormatted = item.start_time ? item.start_time.slice(0, 5) : ''
    
    const message = encodeURIComponent(
      `Ciao ${clientName}! Ti ricordiamo il tuo appuntamento fissato per oggi alle ore ${timeFormatted} presso il nostro salone. A presto!`
    )

    const cleanPhone = phone.replace(/[^0-9+]/g, '')
    const url = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${message}` 
      : `https://wa.me/?text=${message}`

    window.open(url, '_blank')
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/D'
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  // --- LOGICA PROMEMORIA AUTOMATICO IN-APP (Solo per il Cliente) ---
  const todayString = new Date().toLocaleDateString('sv-SE')
  const imminentClientAppointment = !isAdmin ? appointments.find(item => {
    const isToday = item.appointment_date === todayString
    const now = new Date()
    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes()
    
    if (isToday && item.start_time) {
      const [h, m] = item.start_time.split(':').map(Number)
      const appointmentMinutes = h * 60 + m
      return appointmentMinutes > currentTimeMinutes
    }
    return false
  }) : null

  return (
    <div>
      <div style={{ marginBottom: '15px' }}>
        <h3 className="section-title">
          {isAdmin ? 'Agenda Salone Centralizzata' : 'Le Tue Prenotazioni'}
        </h3>
      </div>

      {/* BANNER NOTIFICA AUTOMATICA IN-APP PER IL CLIENTE */}
      {!isAdmin && imminentClientAppointment && (
        <div style={{
          backgroundColor: 'rgba(212, 160, 23, 0.15)',
          border: '1px solid #d4a017',
          borderRadius: '8px',
          padding: '14px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '24px' }}>⏰</span>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 4px 0', color: '#FFD700', fontSize: '15px' }}>
              Promemoria Appuntamento Imminente!
            </h4>
            <p style={{ margin: 0, fontSize: '13px', color: '#FFF' }}>
              Hai un appuntamento oggi alle ore <strong style={{ color: '#FFD700' }}>{imminentClientAppointment.start_time?.slice(0, 5)}</strong> con l'operatore <strong style={{ color: '#FFF' }}>{imminentClientAppointment.barbers?.name || 'il salone'}</strong>. Ti aspettiamo!
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Data Agenda:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Operatore:
            </label>
            <select
              value={selectedBarberId}
              onChange={(e) => setSelectedBarberId(e.target.value)}
              style={filterInputStyle}
            >
              <option value="all">💈 Tutti gli Operatori</option>
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Caricamento prenotazioni...</p>
      ) : errorMsg ? (
        <p style={{ color: 'var(--barber-red)', fontSize: '14px' }}>Errore caricamento: {errorMsg}</p>
      ) : appointments.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {isAdmin ? 'Nessun appuntamento attivo per i filtri selezionati.' : 'Non hai ancora effettuato nessuna prenotazione attiva.'}
        </p>
      ) : (
        appointments.map((item) => {
          const formattedDate = formatDate(item.appointment_date)
          const formattedTime = item.start_time ? item.start_time.slice(0, 5) : ''
          const { canModify, canCancel, reason } = checkAppointmentPermissions(item.appointment_date, item.start_time)
          
          // Verifica se l'appuntamento è passato confrontando data e ora correnti
          const now = new Date()
          const appointmentDateTime = new Date(`${item.appointment_date}T${item.start_time || '00:00:00'}`)
          const isPast = appointmentDateTime <= now

          // Separiamo e ordiniamo i servizi: prima quelli principali (durata > 0), poi rivendite/extra (durata 0)
          const sortedServices = item.appointment_services
            ?.map((as) => as.services)
            .filter(Boolean)
            .sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0)) || []

          const mainService = sortedServices[0]?.name || 'Servizio Generico'
          const secondaryServices = sortedServices.slice(1).map(s => s.name).join(', ')

          const clientName = item.custom_client_name 
            ? item.custom_client_name 
            : item.profiles 
            ? `${item.profiles.first_name || ''} ${item.profiles.last_name || ''}`.trim() 
            : 'Cliente'

          const clientPhone = item.profiles?.phone ? ` 📞 ${item.profiles.phone}` : ''

          return (
            <div
              key={item.id}
              className="info-card"
              style={{
                marginBottom: '12px',
                borderLeft: `4px solid ${isAdmin ? 'var(--barber-red)' : 'var(--barber-blue)'}`,
                padding: '16px',
                opacity: isPast && !isAdmin ? 0.75 : 1
              }}
            >
              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid var(--border-color)' }}>
                  <div style={{ fontWeight: 'bold', color: '#FFF', fontSize: '0.95rem' }}>
                    👤 {clientName} <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>{clientPhone}</span>
                  </div>
                  {/* Pulsante rapido WhatsApp visibile solo all'admin */}
                  <button
                    onClick={() => sendWhatsAppReminder(item)}
                    title="Invia promemoria WhatsApp al cliente"
                    style={{
                      backgroundColor: '#25D366',
                      border: 'none',
                      color: '#FFF',
                      padding: '5px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    💬 WhatsApp
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontWeight: 'bold', fontSize: '1.05rem', color: '#ffffff', display: 'block' }}>
                    {mainService}
                  </span>
                  {secondaryServices && (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', display: 'block', marginTop: '2px' }}>
                      + {secondaryServices}
                    </span>
                  )}
                </div>
                <span style={{ color: 'var(--barber-red)', fontWeight: 'bold', fontSize: '1.1rem' }}>
                  {item.total_price ? `€${parseFloat(item.total_price).toFixed(2)}` : ''}
                </span>
              </div>

              <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                💈 Barbiere: <strong style={{ color: '#FFF' }}>{item.barbers?.name || 'Non specificato'}</strong>
              </p>
              <p style={{ margin: '4px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                📅 Data: <strong style={{ color: '#FFF' }}>{formattedDate}</strong> ore <strong style={{ color: '#FFF' }}>{formattedTime}</strong>
                {isPast && (
                  <span style={{ marginLeft: '8px', fontSize: '11px', color: '#888', fontWeight: 'bold' }}>
                    (Scaduto)
                  </span>
                )}
              </p>

              <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                {/* Pulsante Modifica */}
                <button
                  disabled={!canModify}
                  onClick={() => onEditAppointment(item)}
                  title={!canModify ? reason : ''}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    backgroundColor: !canModify ? '#333' : 'var(--barber-blue)',
                    color: !canModify ? '#777' : '#FFF',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: !canModify ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseDown={(e) => canModify && (e.currentTarget.style.opacity = '0.8')}
                  onMouseUp={(e) => canModify && (e.currentTarget.style.opacity = '1')}
                >
                  ✏️ Modifica {isAdmin && isPast ? '(Admin)' : ''}
                </button>

                {/* Pulsante Annulla */}
                <button
                  disabled={!canCancel}
                  onClick={() => handleCancelAppointment(item)}
                  title={!canCancel ? reason : ''}
                  style={{
                    flex: 1,
                    padding: '10px 8px',
                    backgroundColor: 'transparent',
                    color: !canCancel ? '#555' : 'var(--barber-red)',
                    border: !canCancel ? '1px solid #444' : '1px solid var(--barber-red)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    cursor: !canCancel ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseDown={(e) => canCancel && (e.currentTarget.style.opacity = '0.8')}
                  onMouseUp={(e) => canCancel && (e.currentTarget.style.opacity = '1')}
                >
                  ❌ Annulla
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

const filterInputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid var(--border-color)',
  backgroundColor: 'rgba(20, 20, 20, 0.9)',
  color: '#FFF',
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: '13px',
  colorScheme: 'dark'
}
