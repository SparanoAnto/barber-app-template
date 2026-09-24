import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AppointmentsView({ 
  userId, 
  isAdmin, 
  onEditAppointment,
  salonSettings = {} 
}) {
  const [appointments, setAppointments] = useState([])
  const [barbers, setBarbers] = useState([])
  const [selectedBarberId, setSelectedBarberId] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState(null)
  
  const [selectedDate, setSelectedDate] = useState(new Date().toLocaleDateString('sv-SE'))

  // Stati aggiuntivi per gestire le chiusure e le eccezioni/ferie
  const [shopClosures, setShopClosures] = useState([])
  const [barberExceptions, setBarberExceptions] = useState([])
  const [barberWorkingDays, setBarberWorkingDays] = useState([])

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
          offline_client_id,
          profiles:user_id ( full_name, email, phone ),
          offline_clients:offline_client_id ( full_name, phone ),
          barbers ( id, name ),
          appointment_services (
            service_id,
            services ( id, name, price, duration_minutes )
          )
        `)
        .neq('status', 'cancelled')

      if (isAdmin) {
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

      // 1. Chiusure collettive del salone per la data selezionata
      const closuresQuery = supabase
        .from('shop_closures')
        .select('*')
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate)

      // 2. Eccezioni / ferie dei singoli operatori per la data selezionata
      const exceptionsQuery = supabase
        .from('barber_exceptions')
        .select('*')
        .eq('date', selectedDate)

      // 3. Orari di lavoro specifici / eccezioni settimanali degli operatori
      const workingDaysQuery = supabase
        .from('barber_working_days')
        .select('*')

      const [
        { data, error },
        { data: closuresData },
        { data: exceptionsData },
        { data: workingDaysData }
      ] = await Promise.all([query, closuresQuery, exceptionsQuery, workingDaysQuery])

      if (error) throw error

      setAppointments(data || [])
      setShopClosures(closuresData || [])
      setBarberExceptions(exceptionsData || [])
      setBarberWorkingDays(workingDaysData || [])

    } catch (err) {
      console.error('Errore Supabase:', err.message)
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  function checkAppointmentPermissions(appointmentDate, startTime) {
    if (isAdmin) return { canModify: true, canCancel: true, reason: '' }

    const now = new Date().getTime()
    const appointmentDateTime = new Date(`${appointmentDate}T${startTime}`).getTime()
    const diffMs = appointmentDateTime - now
    const fifteenMinutesMs = 15 * 60 * 1000

    if (diffMs <= 0) {
      return { canModify: false, canCancel: false, reason: 'L\'appuntamento è già passato.' }
    }

    if (diffMs < fifteenMinutesMs) {
      return { canModify: true, canCancel: false, reason: 'Impossibile annullare a meno di 15 minuti dall\'orario.' }
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

  function formatDate(dateStr) {
    if (!dateStr) return 'N/D'
    const [year, month, day] = dateStr.split('-')
    return `${day}/${month}/${year}`
  }

  function sendWhatsAppReminder(item) {
    const phone = item.offline_clients?.phone || item.profiles?.phone || ''
    
    let clientName = 'Cliente'
    if (item.custom_client_name) {
      clientName = item.custom_client_name
    } else if (item.offline_clients?.full_name) {
      clientName = item.offline_clients.full_name
    } else if (item.profiles?.full_name) {
      clientName = item.profiles.full_name
    }
    
    const timeFormatted = item.start_time ? item.start_time.slice(0, 5) : ''
    const dateFormatted = formatDate(item.appointment_date)
    
    const message = encodeURIComponent(
      `Ciao ${clientName}! Ti ricordiamo il tuo appuntamento fissato per il giorno ${dateFormatted} alle ore ${timeFormatted} presso il nostro salone. A presto!`
    )

    const cleanPhone = phone.replace(/[^0-9+]/g, '')
    const url = cleanPhone ? `https://wa.me/${cleanPhone}?text=${message}` : `https://wa.me/?text=${message}`

    window.open(url, '_blank')
  }

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

  // Generatore dinamico slot orari basato su settings
  const openingStr = salonSettings.opening_time || '08:30'
  const closingStr = salonSettings.closing_time || '20:00'

  const [openHour, openMinute] = openingStr.split(':').map(Number)
  const [closeHour, closeMinute] = closingStr.split(':').map(Number)

  const timeSlots = []
  let currentTotalMinutes = openHour * 60 + (openMinute || 0)
  const endTotalMinutes = closeHour * 60 + (closeMinute || 0)
  const slotStep = salonSettings.slot_interval_minutes || 30

  while (currentTotalMinutes < endTotalMinutes) {
    const h = Math.floor(currentTotalMinutes / 60)
    const m = currentTotalMinutes % 60
    const hStr = String(h).padStart(2, '0')
    const mStr = String(m).padStart(2, '0')
    timeSlots.push(`${hStr}:${mStr}`)
    currentTotalMinutes += slotStep
  }

  // Determinazione degli operatori da visualizzare nella griglia
  const gridBarbers = isAdmin && selectedBarberId !== 'all'
    ? barbers.filter(b => b.id === selectedBarberId)
    : barbers

  // Verifica chiusura globale negozio
  const isShopClosedToday = shopClosures.length > 0
  const shopClosureReason = isShopClosedToday ? shopClosures[0].reason : ''

  // Funzione di supporto per convertire orari in minuti
  function timeToMinutes(timeStr) {
    if (!timeStr) return 0
    const parts = timeStr.split(':')
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
  }

  // Controllo stato slot per il singolo operatore (LOGICA CORRETTA)
  function getBarberSlotStatus(barberId, timeSlot) {
    if (isShopClosedToday) {
      return { isBlocked: true, reason: shopClosureReason || 'Chiusura Salone' }
    }

    // Giorno della settimana (0 = Domenica, 1 = Lunedì, 2 = Martedì, ...)
    const dateObj = new Date(selectedDate + 'T00:00:00')
    const dayOfWeek = dateObj.getDay()

    const slotMin = timeToMinutes(timeSlot)
    const salonStartMin = timeToMinutes(salonSettings.opening_time || '08:30')
    const salonEndMin = timeToMinutes(salonSettings.closing_time || '20:00')

    // Filtriamo i record di working days per questo specifico barbiere
    const barberRules = barberWorkingDays.filter(w => w.barber_id === barberId)

    if (barberRules.length === 0) {
      // 1. Se non ci sono record in assoluto per questo operatore, rispetta gli orari del salone
      if (slotMin < salonStartMin || slotMin >= salonEndMin) {
        return { isBlocked: true, reason: 'Fuori Orario' }
      }
    } else {
      // 2. Se ci sono record, cerchiamo se ce n'è uno per il giorno corrente della settimana
      const workingRule = barberRules.find(w => w.day_of_week === dayOfWeek)

      if (!workingRule) {
        // Se l'operatore ha dei record in barber_working_days ma NESSUNO per questo giorno, significa che oggi NON lavora
        return { isBlocked: true, reason: 'Fuori Orario' }
      }

      // Se il record esiste per questo giorno, controlliamo gli orari:
      // Se start_time o end_time sono vuoti/null, usa gli orari standard del salone
      const workStartMin = workingRule.start_time ? timeToMinutes(workingRule.start_time) : salonStartMin
      const workEndMin = workingRule.end_time ? timeToMinutes(workingRule.end_time) : salonEndMin

      if (slotMin < workStartMin || slotMin >= workEndMin) {
        return { isBlocked: true, reason: 'Fuori Orario' }
      }
    }

    // 3. Controllo eccezioni / ferie / permessi del barbiere (prevalgono)
    const exception = barberExceptions.find(e => e.barber_id === barberId && e.date === selectedDate)
    if (exception) {
      if (!exception.start_time || !exception.end_time) {
        return { isBlocked: true, reason: exception.reason || 'Assente / Ferie' }
      }
      const excStartMin = timeToMinutes(exception.start_time)
      const excEndMin = timeToMinutes(exception.end_time)
      if (slotMin >= excStartMin && slotMin < excEndMin) {
        return { isBlocked: true, reason: exception.reason || 'Assente' }
      }
    }

    return { isBlocked: false, reason: '' }
  }

  return (
    <div style={{
      position: 'relative',
      zIndex: 1,
      '--primary-color': salonSettings.primary_color || '#2563eb',
      '--accent-color': salonSettings.accent_color || '#D4AF37',
      '--secondary-color': salonSettings.secondary_color || '#1E293B',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      paddingBottom: '80px',
      padding: '4px'
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.2rem', fontWeight: 700 }}>
          {isAdmin ? 'Agenda Salone Centralizzata' : 'Le Tue Prenotazioni'}
        </h3>
        <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '12px' }}>
          {isAdmin ? 'Visualizzazione a griglia stile Teams: controlla i buchi e gestisci la giornata' : 'Storico e gestione dei tuoi appuntamenti'}
        </p>
      </div>

      {isShopClosedToday && (
        <div style={{
          backgroundColor: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>🏖️</span>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 2px 0', color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>
              Salone Chiuso in questa data
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#7f1d1d' }}>
              Motivo: <strong>{shopClosureReason}</strong>.
            </p>
          </div>
        </div>
      )}

      {!isAdmin && imminentClientAppointment && (
        <div style={{
          backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>⏰</span>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 2px 0', color: '#b45309', fontSize: '13px', fontWeight: 700 }}>
              Promemoria Appuntamento Imminente
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>
              Hai un appuntamento oggi alle ore <strong style={{ color: 'var(--primary-color)' }}>{imminentClientAppointment.start_time?.slice(0, 5)}</strong> con <strong style={{ color: 'var(--secondary-color)' }}>{imminentClientAppointment.barbers?.name || 'il salone'}</strong>.
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ 
          display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
          backgroundColor: '#ffffff', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0'
        }}>
          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
              Data Agenda:
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
              Operatore:
            </label>
            <select
              value={selectedBarberId}
              onChange={(e) => setSelectedBarberId(e.target.value)}
              style={filterInputStyle}
            >
              <option value="all">👤 Tutti gli Operatori (Vista Griglia)</option>
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
        <div style={{ textAlign: 'center', padding: '24px', color: '#64748b', fontSize: '12px' }}>Caricamento prenotazioni...</div>
      ) : errorMsg ? (
        <div style={{ padding: '12px', backgroundColor: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontSize: '12px' }}>
          Errore: {errorMsg}
        </div>
      ) : appointments.length === 0 && !isAdmin && !isShopClosedToday ? (
        <div style={{ textAlign: 'center', padding: '24px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: '12px' }}>
          Nessuna prenotazione attiva.
        </div>
      ) : isAdmin ? (
        /* VISTA A GRIGLIA CON SLOT OSCURATI PER FERIE / ASSENZE */
        <div style={{ 
          width: '100%', 
          overflowX: 'auto', 
          backgroundColor: '#ffffff', 
          borderRadius: '12px', 
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `80px repeat(${Math.max(gridBarbers.length, 1)}, minmax(200px, 1fr))`,
            minWidth: `${80 + Math.max(gridBarbers.length, 1) * 200}px` 
          }}>
            {/* Intestazione Tabella */}
            <div style={{ 
              padding: '12px 8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1', 
              borderRight: '1px solid #e2e8f0', fontWeight: 700, fontSize: '11px', color: '#64748b', textAlign: 'center' 
            }}>
              ORARIO
            </div>
            {gridBarbers.map(b => (
              <div key={b.id} style={{ 
                padding: '12px 8px', backgroundColor: '#f8fafc', borderBottom: '2px solid #cbd5e1', 
                borderRight: '1px solid #e2e8f0', fontWeight: 700, fontSize: '0.9rem', color: 'var(--secondary-color)', textAlign: 'center' 
              }}>
                👤 {b.name}
              </div>
            ))}

            {/* Righe Orarie */}
            {timeSlots.map(timeSlot => {
              return (
                <React.Fragment key={timeSlot}>
                  {/* Colonna Orario */}
                  <div style={{ 
                    padding: '10px 4px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #e2e8f0',
                    fontSize: '11px', fontWeight: 600, color: '#64748b', textAlign: 'center', backgroundColor: '#fafafa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {timeSlot}
                  </div>

                  {/* Colonne Operatori per questo slot */}
                  {gridBarbers.map(b => {
                    const slotStatus = getBarberSlotStatus(b.id, timeSlot)
                    const matchingApps = appointments.filter(item => 
                      item.barber_id === b.id && item.start_time && item.start_time.slice(0, 5) === timeSlot
                    )

                    return (
                      <div key={b.id} style={{ 
                        padding: '6px', borderBottom: '1px solid #f1f5f9', borderRight: '1px solid #e2e8f0',
                        minHeight: '55px', 
                        backgroundColor: slotStatus.isBlocked ? '#f1f5f9' : '#ffffff',
                        display: 'flex', flexDirection: 'column', gap: '4px'
                      }}>
                        {slotStatus.isBlocked ? (
                          <div style={{
                            flex: 1, backgroundColor: '#e2e8f0', borderRadius: '6px', padding: '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundImage: 'repeating-linear-gradient(45deg, #cbd5e1 0, #cbd5e1 2px, transparent 0, transparent 8px)',
                            opacity: 0.75, textAlign: 'center'
                          }}>
                            <span style={{ fontSize: '10px', fontWeight: 700, color: '#475569', backgroundColor: 'rgba(255,255,255,0.85)', padding: '2px 4px', borderRadius: '4px' }}>
                              🔒 {slotStatus.reason}
                            </span>
                          </div>
                        ) : matchingApps.length > 0 ? (
                          matchingApps.map(item => renderAppointmentCardCompact(item))
                        ) : (
                          <div style={{ 
                            flex: 1, border: '1px dashed #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc',
                            opacity: 0.4, minHeight: '35px'
                          }} />
                        )}
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>
        </div>
      ) : (
        /* Vista standard a lista per i clienti */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {appointments.map((item) => renderAppointmentCard(item))}
        </div>
      )}
    </div>
  )

  // Card compatta ottimizzata specificamente per la griglia a matrice
  function renderAppointmentCardCompact(item) {
    const formattedTime = item.start_time ? item.start_time.slice(0, 5) : ''
    const { canModify, canCancel, reason } = checkAppointmentPermissions(item.appointment_date, item.start_time)
    
    const sortedServices = item.appointment_services
      ?.map((as) => as.services)
      .filter(Boolean)
      .sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0)) || []

    const mainService = sortedServices[0]?.name || 'Servizio'

    let clientName = 'Cliente'
    let clientPhone = ''
    if (item.custom_client_name) {
      clientName = item.custom_client_name
    } else if (item.offline_clients?.full_name) {
      clientName = item.offline_clients.full_name
      if (item.offline_clients.phone) clientPhone = item.offline_clients.phone
    } else if (item.profiles?.full_name) {
      clientName = item.profiles.full_name
      if (item.profiles?.phone) clientPhone = item.profiles.phone
    }

    return (
      <div
        key={item.id}
        style={{
          backgroundColor: '#eff6ff',
          borderRadius: '6px',
          padding: '8px',
          border: '1px solid #bfdbfe',
          borderLeft: '3px solid var(--primary-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--secondary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clientName}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 }}>
              {item.total_price ? `€${parseFloat(item.total_price).toFixed(2)}` : ''}
            </span>
            {isAdmin && clientPhone && (
              <button
                onClick={() => sendWhatsAppReminder(item)}
                title="Invia WhatsApp"
                style={{
                  backgroundColor: '#22c55e', border: 'none', color: '#FFF',
                  padding: '2px 4px', borderRadius: '3px', fontSize: '9px', fontWeight: 600, cursor: 'pointer'
                }}
              >
                💬
              </button>
            )}
          </div>
        </div>

        <div style={{ fontSize: '11px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <strong>{formattedTime}</strong> - {mainService}
        </div>

        <div style={{ display: 'flex', gap: '4px', paddingTop: '4px', borderTop: '1px solid #dbeafe', justifyContent: 'flex-end' }}>
          <button
            disabled={!canModify}
            onClick={() => onEditAppointment(item)}
            title={!canModify ? reason : ''}
            style={{
              padding: '2px 6px', backgroundColor: 'var(--primary-color)', color: '#FFF', 
              border: 'none', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            ✏️ Mod.
          </button>
          <button
            disabled={!canCancel}
            onClick={() => handleCancelAppointment(item)}
            title={!canCancel ? reason : ''}
            style={{
              padding: '2px 6px', backgroundColor: 'transparent', color: '#dc2626', 
              border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '10px', fontWeight: 600, cursor: 'pointer'
            }}
          >
            ❌
          </button>
        </div>
      </div>
    )
  }

  // Card standard usata nella vista a lista singola (per clienti)
  function renderAppointmentCard(item) {
    const formattedTime = item.start_time ? item.start_time.slice(0, 5) : ''
    const { canModify, canCancel, reason } = checkAppointmentPermissions(item.appointment_date, item.start_time)
    
    const now = new Date()
    const appointmentDateTime = new Date(`${item.appointment_date}T${item.start_time || '00:00:00'}`)
    const isPast = appointmentDateTime <= now

    const sortedServices = item.appointment_services
      ?.map((as) => as.services)
      .filter(Boolean)
      .sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0)) || []

    const mainService = sortedServices[0]?.name || 'Servizio Generico'
    const secondaryServices = sortedServices.slice(1).map(s => s.name).join(', ')

    let clientName = 'Cliente'
    let clientPhone = ''

    if (item.custom_client_name) {
      clientName = item.custom_client_name
    } else if (item.offline_clients?.full_name) {
      clientName = item.offline_clients.full_name
      if (item.offline_clients.phone) clientPhone = item.offline_clients.phone
    } else if (item.profiles?.full_name) {
      clientName = item.profiles.full_name
      if (item.profiles?.phone) clientPhone = item.profiles.phone
    }

    return (
      <div
        key={item.id}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '8px',
          padding: '10px 14px',
          border: '1px solid #e2e8f0',
          borderLeft: '4px solid var(--primary-color)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          opacity: isPast && !isAdmin ? 0.75 : 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <span style={{ 
              backgroundColor: '#eff6ff', color: 'var(--primary-color)', padding: '2px 6px', 
              borderRadius: '6px', fontWeight: 800, fontSize: '0.85rem', flexShrink: 0 
            }}>
              {formattedTime}
            </span>
            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--secondary-color)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
              {clientName}
            </span>
            {clientPhone && <span style={{ fontSize: '11px', color: '#64748b', flexShrink: '0' }}>({clientPhone})</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <span style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.95rem' }}>
              {item.total_price ? `€${parseFloat(item.total_price).toFixed(2)}` : ''}
            </span>
          </div>
        </div>

        <div style={{ fontSize: '12px', color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
          <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
            <strong style={{ color: '#1e293b' }}>{mainService}</strong> 
            {secondaryServices && <span style={{ color: '#64748b' }}> (+ {secondaryServices})</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', paddingTop: '6px', borderTop: '1px solid #f8fafc', justifyContent: 'flex-end' }}>
          <button
            disabled={!canModify}
            onClick={() => onEditAppointment(item)}
            title={!canModify ? reason : ''}
            style={{
              padding: '4px 10px',
              backgroundColor: !canModify ? '#cbd5e1' : 'var(--primary-color)',
              color: '#FFF', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              cursor: !canModify ? 'not-allowed' : 'pointer'
            }}
          >
            ✏️ Modifica
          </button>

          <button
            disabled={!canCancel}
            onClick={() => handleCancelAppointment(item)}
            title={!canCancel ? reason : ''}
            style={{
              padding: '4px 10px',
              backgroundColor: 'transparent',
              color: !canCancel ? '#94a3b8' : '#dc2626',
              border: !canCancel ? '1px solid #cbd5e1' : '1px solid #fca5a5',
              borderRadius: '6px', fontSize: '11px', fontWeight: 600,
              cursor: !canCancel ? 'not-allowed' : 'pointer'
            }}
          >
            ❌ Annulla
          </button>
        </div>
      </div>
    )
  }
}

const filterInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid #cbd5e1',
  backgroundColor: '#f8fafc',
  color: '#1e293b',
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: '12px'
}
