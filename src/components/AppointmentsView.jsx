import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Funzioni di utilità esterne per evitare problemi di hoisting
function timeToMinutes(timeStr) {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)
}

function formatDate(dateStr) {
  if (!dateStr) return 'N/D'
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

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

  const [shopClosures, setShopClosures] = useState([])
  const [salonExceptions, setSalonExceptions] = useState([])
  const [barberExceptions, setBarberExceptions] = useState([])
  const [barberWorkingDays, setBarberWorkingDays] = useState([])
  const [salonWeeklyHours, setSalonWeeklyHours] = useState([])

  // Stato per la modale di dettaglio dell'appuntamento (click sulla card)
  const [selectedAppointmentDetail, setSelectedAppointmentDetail] = useState(null)

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

  // --- INTEGRAZIONE SUPABASE REALTIME (SOLO PER AGGIORNARE LA GRIGLIA) ---
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel('public:appointments-realtime-grid')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        (payload) => {
          if (payload.eventType === 'UPDATE' && payload.new.status === 'cancelled') {
            setAppointments((prev) => prev.filter(app => app.id !== payload.new.id))
            setSelectedAppointmentDetail((currentDetail) => 
              currentDetail?.id === payload.new.id ? null : currentDetail
            )
          }

          // Per qualsiasi INSERT, UPDATE o DELETE, ricarichiamo i dati della griglia in tempo reale
          setTimeout(() => {
            fetchAppointments()
          }, 200)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, isAdmin, selectedDate, selectedBarberId])
  // -------------------------------------------------

  async function fetchBarbers() {
    const { data } = await supabase
      .from('barbers')
      .select('id, name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      
    if (data) setBarbers(data)
  }

  async function fetchAppointments() {
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

      const closuresQuery = supabase
        .from('shop_closures')
        .select('*')
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate)

      const salonExceptionsQuery = supabase
        .from('salon_exceptions')
        .select('*')
        .lte('start_date', selectedDate)
        .gte('end_date', selectedDate)

      const exceptionsQuery = supabase
        .from('barber_exceptions')
        .select('*')
        .eq('date', selectedDate)

      const workingDaysQuery = supabase
        .from('barber_working_days')
        .select('*')

      const weeklyHoursQuery = supabase
        .from('salon_weekly_hours')
        .select('*')

      const [
        { data, error },
        { data: closuresData },
        { data: salonExceptionsData },
        { data: exceptionsData },
        { data: workingDaysData },
        { data: weeklyHoursData }
      ] = await Promise.all([
        query, 
        closuresQuery, 
        salonExceptionsQuery, 
        exceptionsQuery, 
        workingDaysQuery, 
        weeklyHoursQuery
      ])

      if (error) throw error

      // DEDUPLICAZIONE UNIVERSALE E PULITA
      const appointmentsMap = new Map()
      
      ;(data || []).forEach(item => {
        if (!appointmentsMap.has(item.id)) {
          appointmentsMap.set(item.id, {
            ...item,
            appointment_services: item.appointment_services ? [...item.appointment_services] : []
          })
        } else {
          const existing = appointmentsMap.get(item.id)
          if (item.appointment_services) {
            item.appointment_services.forEach(newServ => {
              const exists = existing.appointment_services.some(
                s => s.service_id === newServ.service_id
              )
              if (!exists) {
                existing.appointment_services.push(newServ)
              }
            })
          }
        }
      })

      let uniqueAppointments = Array.from(appointmentsMap.values())

      const seenIds = new Set()
      uniqueAppointments = uniqueAppointments.filter(item => {
        if (seenIds.has(item.id)) return false
        seenIds.add(item.id)
        return true
      })

      setAppointments(uniqueAppointments)
      setShopClosures(closuresData || [])
      setSalonExceptions(salonExceptionsData || [])
      setBarberExceptions(exceptionsData || [])
      setBarberWorkingDays(workingDaysData || [])
      setSalonWeeklyHours(weeklyHoursData || [])

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
      return { canModify: false, canCancel: false, reason: 'Impossibile modificare o annullare a meno di 15 minuti dall\'orario.' }
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
      setSelectedAppointmentDetail(null)
    } catch (err) {
      alert("Errore durante l'annullamento: " + err.message)
    }
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

  const dateObj = new Date(selectedDate + 'T00:00:00')
  const dayOfWeek = dateObj.getDay()

  const currentSalonException = salonExceptions.find(e => {
    if (!e.start_date || !e.end_date) return e.date === selectedDate
    return selectedDate >= e.start_date && selectedDate <= e.end_date
  })

  const currentWeeklyRule = salonWeeklyHours.find(w => w.day_of_week === dayOfWeek) || {}

  let isWeeklyClosed = currentWeeklyRule.is_closed || false
  
  const isSalonExceptionClosed = currentSalonException && !currentSalonException.opening_time && !currentSalonException.closing_time && !currentSalonException.start_time
  const isShopClosedToday = shopClosures.length > 0 || isWeeklyClosed || isSalonExceptionClosed

  let shopClosureReason = shopClosures.length > 0 
    ? (shopClosures[0]?.reason || 'Chiusura Salone') 
    : (isWeeklyClosed ? 'Giorno di Chiusura Settimanale' : (isSalonExceptionClosed ? (currentSalonException?.reason || 'Chiusura Straordinaria') : ''))

  let openingStr = '08:30'
  let closingStr = '20:00'

  if (!isWeeklyClosed && currentWeeklyRule.opening_time && currentWeeklyRule.closing_time) {
    openingStr = currentWeeklyRule.opening_time.slice(0, 5)
    closingStr = currentWeeklyRule.closing_time.slice(0, 5)
  }

  if (currentSalonException) {
    if (currentSalonException.opening_time) {
      openingStr = currentSalonException.opening_time.slice(0, 5)
    }
    if (currentSalonException.closing_time) {
      closingStr = currentSalonException.closing_time.slice(0, 5)
    }
  }

  const [openHour, openMinute] = openingStr.split(':').map(Number)
  const [closeHour, closeMinute] = closingStr.split(':').map(Number)

  const timeSlots = []
  let currentTotalMinutes = openHour * 60 + (openMinute || 0)
  let endTotalMinutes = closeHour * 60 + (closeMinute || 0)
  const slotStep = salonSettings.slot_interval_minutes || 30

  let absoluteClosingMinutes = endTotalMinutes
  if (!isWeeklyClosed && currentWeeklyRule.closing_time) {
    absoluteClosingMinutes = Math.max(endTotalMinutes, timeToMinutes(currentWeeklyRule.closing_time.slice(0, 5)))
  }
  
  const gridEndMinutes = currentSalonException?.closing_time ? Math.max(endTotalMinutes, timeToMinutes(currentSalonException.closing_time.slice(0, 5))) : absoluteClosingMinutes

  while (currentTotalMinutes < gridEndMinutes) {
    const h = Math.floor(currentTotalMinutes / 60)
    const m = currentTotalMinutes % 60
    const hStr = String(h).padStart(2, '0')
    const mStr = String(m).padStart(2, '0')
    timeSlots.push(`${hStr}:${mStr}`)
    currentTotalMinutes += slotStep
  }

  const dayStartMinutes = timeSlots.length > 0 ? timeToMinutes(timeSlots[0]) : (openHour * 60 + (openMinute || 0))

  const gridBarbers = isAdmin && selectedBarberId !== 'all'
    ? barbers.filter(b => b.id === selectedBarberId)
    : barbers

  function getBarberSlotStatus(barberId, timeSlot) {
    if (isShopClosedToday) {
      return { isBlocked: true, reason: shopClosureReason || 'Salone Chiuso' }
    }

    const slotMin = timeToMinutes(timeSlot)
    const salonStartMin = timeToMinutes(openingStr)
    const salonEndMin = timeToMinutes(closingStr)

    if (slotMin >= salonEndMin) {
      return { isBlocked: true, reason: currentSalonException?.reason || 'Chiusura Salone' }
    }

    if (currentSalonException && currentSalonException.start_time && currentSalonException.end_time) {
      const excBlockStart = timeToMinutes(currentSalonException.start_time)
      const excBlockEnd = timeToMinutes(currentSalonException.end_time)
      if (slotMin >= excBlockStart && slotMin < excBlockEnd) {
        return { isBlocked: true, reason: currentSalonException.reason || 'Chiusura Straordinaria' }
      }
    }

    if (slotMin < salonStartMin) {
      return { isBlocked: true, reason: 'Fuori Orario' }
    }

    const barberRules = barberWorkingDays.filter(w => w.barber_id === barberId)

    if (barberRules.length === 0) {
      if (slotMin < salonStartMin || slotMin >= salonEndMin) {
        return { isBlocked: true, reason: 'Fuori Orario' }
      }
    } else {
      const workingRule = barberRules.find(w => w.day_of_week === dayOfWeek)

      if (!workingRule) {
        return { isBlocked: true, reason: 'Fuori Orario' }
      }

      const workStartMin = workingRule.start_time ? timeToMinutes(workingRule.start_time) : salonStartMin
      const workEndMin = workingRule.end_time ? timeToMinutes(workingRule.end_time) : salonEndMin

      if (slotMin < workStartMin || slotMin >= workEndMin) {
        return { isBlocked: true, reason: 'Fuori Orario' }
      }
    }

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

  function renderAppointmentCardCompact(item) {
    const formattedTime = item.start_time ? item.start_time.slice(0, 5) : ''
    const endTime = item.end_time ? item.end_time.slice(0, 5) : ''
    
    const startMin = timeToMinutes(formattedTime)
    const endMin = timeToMinutes(endTime)
    const durationMinutes = Math.max(endMin - startMin, salonSettings.slot_interval_minutes || 30)
    
    const slotHeightPx = 55 
    const slotInterval = salonSettings.slot_interval_minutes || 30
    
    const minutesFromDayStart = startMin - dayStartMinutes
    const topPx = (minutesFromDayStart / slotInterval) * slotHeightPx
    
    const totalSlots = durationMinutes / slotInterval
    const calculatedHeight = totalSlots * slotHeightPx

    const finalHeight = Math.max(calculatedHeight - 2, 55)

    const sortedServices = item.appointment_services
      ?.map((as) => as.services)
      .filter(Boolean)
      .sort((a, b) => (b.duration_minutes || 0) - (a.duration_minutes || 0)) || []

    const mainService = sortedServices.map(s => s.name).join(' / ') || 'Servizio'

    let clientName = 'Cliente'
    if (item.custom_client_name) {
      clientName = item.custom_client_name
    } else if (item.offline_clients?.full_name) {
      clientName = item.offline_clients.full_name
    } else if (item.profiles?.full_name) {
      clientName = item.profiles.full_name
    }

    return (
      <div
        key={item.id}
        onClick={() => setSelectedAppointmentDetail(item)}
        style={{
          position: 'absolute',
          top: `${Math.max(0, topPx)}px`,
          left: '4px',
          right: '4px',
          height: `${finalHeight}px`,
          zIndex: 10,
          backgroundColor: 'rgba(197, 160, 89, 0.18)',
          borderRadius: '6px',
          padding: '4px 6px',
          border: '1px solid var(--accent-color)',
          borderLeft: '4px solid var(--accent-color)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          overflow: 'hidden',
          boxShadow: '0 2px 6px rgba(0, 0, 0, 0.4)',
          cursor: 'pointer',
          transition: 'transform 0.1s ease, background-color 0.1s ease'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', lineHeight: '1.1' }}>
          <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {clientName}
          </span>
          <span style={{ color: 'var(--accent-color)', fontWeight: 800, fontSize: '0.8rem', whiteSpace: 'nowrap', marginLeft: '4px' }}>
            {item.total_price ? `€${parseFloat(item.total_price).toFixed(2)}` : ''}
          </span>
        </div>

        <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.1' }}>
          <strong style={{ color: 'var(--text-main)' }}>{formattedTime}-{endTime}</strong> • {mainService}
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', gap: '3px', alignItems: 'center', marginTop: 'auto' }}>
            <button
              onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(item); }}
              title="Invia promemoria WhatsApp"
              style={{ flex: 1, backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 2px', fontSize: '9.5px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              💬 WhatsApp
            </button>
            {onEditAppointment && (
              <button
                onClick={(e) => { e.stopPropagation(); onEditAppointment(item); }}
                title="Modifica appuntamento"
                style={{ flex: 1, backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', borderRadius: '3px', padding: '2px 2px', fontSize: '9.5px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                ✏ Modifica
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleCancelAppointment(item); }}
              title="Annulla appuntamento"
              style={{ backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 5px', fontSize: '9.5px', cursor: 'pointer', fontWeight: 600 }}
            >
              ✕
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderAppointmentCard(item) {
    const formattedTime = item.start_time ? item.start_time.slice(0, 5) : ''
    const endTime = item.end_time ? item.end_time.slice(0, 5) : ''
    const formattedDateStr = formatDate(item.appointment_date)
    const barberName = item.barbers?.name || 'Operatore'

    let clientName = 'Cliente'
    if (item.custom_client_name) {
      clientName = item.custom_client_name
    } else if (item.offline_clients?.full_name) {
      clientName = item.offline_clients.full_name
    } else if (item.profiles?.full_name) {
      clientName = item.profiles.full_name
    }

    const clientPhone = item.offline_clients?.phone || item.profiles?.phone || 'Non disponibile'

    const servicesList = item.appointment_services
      ?.map((as) => as.services)
      .filter(Boolean) || []

    const now = new Date().getTime()
    const appointmentDateTime = new Date(`${item.appointment_date}T${item.start_time}`).getTime()
    const isPast = appointmentDateTime < now

    const { canModify, canCancel, reason } = checkAppointmentPermissions(item.appointment_date, item.start_time)

    return (
      <div 
        key={item.id} 
        onClick={() => setSelectedAppointmentDetail(item)}
        style={{ 
          backgroundColor: '#181c24', 
          borderRadius: '10px', 
          padding: '16px', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px',
          opacity: isPast ? 0.75 : 1,
          cursor: 'pointer'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>📅</span> {formattedDateStr} 
            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>|</span> 
            <span>⏰</span> {formattedTime} {endTime ? `- ${endTime}` : ''}
          </div>
          {item.total_price && (
            <div style={{ color: 'var(--accent-color)', fontWeight: 800, fontSize: '0.95rem' }}>
              €{parseFloat(item.total_price).toFixed(2)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👤</span> Cliente: <strong style={{ color: 'var(--text-main)' }}>{clientName}</strong> ({clientPhone})
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>✂️</span> Operatore: <strong style={{ color: 'var(--text-main)' }}>{barberName}</strong>
          </div>

          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-main)' }}>Servizi prenotati:</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', paddingLeft: '4px' }}>
              {servicesList.length > 0 ? (
                servicesList.map((srv, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#11141b', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                    <span style={{ color: 'var(--text-main)', fontWeight: 500 }}>• {srv.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {srv.duration_minutes ? `${srv.duration_minutes} min` : ''} {srv.price ? `(€${parseFloat(srv.price).toFixed(2)})` : ''}
                    </span>
                  </div>
                ))
              ) : (
                <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Nessun dettaglio servizio disponibile</span>
              )}
            </div>
          </div>
        </div>

        {!isAdmin && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', gap: '8px', flexWrap: 'wrap' }}>
            {isPast ? (
              <span style={{ fontSize: '11px', color: '#4ade80', backgroundColor: 'rgba(34, 197, 94, 0.15)', padding: '4px 10px', borderRadius: '6px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                ✅ Completato
              </span>
            ) : (
              <>
                <div style={{ flex: 1, minWidth: '140px' }}>
                  {reason && (
                    <span style={{ fontSize: '11px', color: '#fca5a5', backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                      ⚠ {reason}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                  {onEditAppointment && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditAppointment(item); }}
                      disabled={!canModify}
                      style={{
                        backgroundColor: canModify ? 'var(--accent-color)' : '#334155',
                        color: canModify ? '#0f1115' : 'var(--text-muted)',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        cursor: canModify ? 'pointer' : 'not-allowed',
                        fontWeight: 600
                      }}
                    >
                      ✏️ Modifica
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleCancelAppointment(item); }}
                    disabled={!canCancel}
                    style={{
                      backgroundColor: canCancel ? '#ef4444' : '#334155',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '11px',
                      cursor: canCancel ? 'pointer' : 'not-allowed',
                      fontWeight: 600
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      position: 'relative',
      zIndex: 1,
      '--accent-color': '#C5A059',
      '--text-main': '#f3f4f6',
      '--text-muted': '#9ca3af',
      '--border-color': '#2a3241',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      paddingBottom: '80px',
      padding: '4px',
      color: 'var(--text-main)'
    }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.2rem', fontWeight: 700 }}>
          {isAdmin ? 'Agenda Salone Centralizzata' : 'I Miei Appuntamenti'}
        </h3>
        <p style={{ margin: '2px 0 0 0', color: 'var(--text-muted)', fontSize: '12px' }}>
          {isAdmin ? 'Controlla la tua giornata (clicca su una card per i dettagli)' : 'Storico e gestione dei tuoi appuntamenti'}
        </p>
      </div>

      {isShopClosedToday && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '10px',
          padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>🏖</span>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: '0 0 2px 0', color: '#fca5a5', fontSize: '13px', fontWeight: 700 }}>
              Salone Chiuso in questa data
            </h4>
            <p style={{ margin: 0, fontSize: '12px', color: '#f87171' }}>
              Motivo: <strong>{shopClosureReason}</strong>.
            </p>
          </div>
        </div>
      )}

      {isAdmin && (
        <div style={{ 
          display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
          backgroundColor: '#181c24', padding: '14px', borderRadius: '10px', border: '1px solid var(--border-color)'
        }}>
          <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
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
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>
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
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>Caricamento prenotazioni...</div>
      ) : errorMsg ? (
        <div style={{ padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#fca5a5', fontSize: '12px' }}>
          Errore: {errorMsg}
        </div>
      ) : isAdmin ? (
        <div style={{ 
          width: '100vw', 
          maxWidth: '100%',
          maxHeight: '70vh',
          overflow: 'auto', 
          backgroundColor: '#181c24', 
          borderRadius: '12px', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: `80px repeat(${Math.max(gridBarbers.length, 1)}, minmax(220px, 1fr))`,
            minWidth: `${80 + Math.max(gridBarbers.length, 1) * 220}px` 
          }}>
            <div style={{ 
              position: 'sticky', 
              top: 0,
              left: 0, 
              zIndex: 40, 
              padding: '12px 8px', 
              backgroundColor: '#11141b', 
              borderBottom: '2px solid var(--border-color)', 
              borderRight: '1px solid var(--border-color)', 
              fontWeight: 700, 
              fontSize: '11px', 
              color: 'var(--text-muted)', 
              textAlign: 'center' 
            }}>
              ORARIO
            </div>

            {gridBarbers.map(b => (
              <div key={b.id} style={{ 
                position: 'sticky',
                top: 0,
                zIndex: 30,
                padding: '12px 8px', 
                backgroundColor: '#11141b', 
                borderBottom: '2px solid var(--border-color)', 
                borderRight: '1px solid var(--border-color)', 
                fontWeight: 700, 
                fontSize: '0.9rem', 
                color: 'var(--accent-color)', 
                textAlign: 'center'
              }}>
                👤 {b.name}
              </div>
            ))}

            {timeSlots.map((timeSlot) => {
              const slotHeightPx = 55
              return (
                <React.Fragment key={timeSlot}>
                  <div style={{ 
                    position: 'sticky', 
                    left: 0, 
                    zIndex: 20, 
                    padding: '10px 4px', 
                    borderBottom: '1px solid var(--border-color)', 
                    borderRight: '1px solid var(--border-color)', 
                    fontSize: '11px', 
                    fontWeight: 600, 
                    color: 'var(--text-muted)', 
                    textAlign: 'center', 
                    backgroundColor: '#11141b', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: `${slotHeightPx}px`, 
                    boxSizing: 'border-box'
                  }}>
                    {timeSlot}
                  </div>

                  {gridBarbers.map(b => {
                    const slotStatus = getBarberSlotStatus(b.id, timeSlot)
                    return (
                      <div key={b.id} style={{ 
                        height: `${slotHeightPx}px`,
                        padding: '4px', 
                        borderBottom: '1px solid var(--border-color)', 
                        borderRight: '1px solid var(--border-color)',
                        backgroundColor: slotStatus.isBlocked ? '#11141b' : '#181c24',
                        boxSizing: 'border-box',
                        position: 'relative'
                      }}>
                        {slotStatus.isBlocked && (
                          <div style={{
                            width: '100%', height: '100%', backgroundColor: '#11141b', borderRadius: '4px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            backgroundImage: 'repeating-linear-gradient(45deg, #2a3241 0, #2a3241 2px, transparent 0, transparent 8px)',
                            opacity: 0.75
                          }}>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', backgroundColor: 'rgba(17, 20, 27, 0.85)', padding: '1px 4px', borderRadius: '3px' }}>
                              🔒 {slotStatus.reason}
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>

          <div style={{ position: 'relative', marginTop: `-${timeSlots.length * 55}px`, pointerEvents: 'none' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: `80px repeat(${Math.max(gridBarbers.length, 1)}, minmax(220px, 1fr))`,
              minWidth: `${80 + Math.max(gridBarbers.length, 1) * 220}px` 
            }}>
              <div />

              {gridBarbers.map(b => {
                const barberApps = appointments.filter(item => item.barber_id === b.id)
                return (
                  <div key={b.id} style={{ position: 'relative', height: `${timeSlots.length * 55}px`, pointerEvents: 'auto', paddingTop: '2px' }}>
                    {barberApps.map(item => renderAppointmentCardCompact(item))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '1rem', color: 'var(--text-main)', fontWeight: '700' }}>
              📌 Prossimi Appuntamenti
            </h4>
            {appointments.filter(item => `${item.appointment_date}T${item.start_time}` >= new Date().toISOString().slice(0, 16)).length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {appointments
                  .filter(item => `${item.appointment_date}T${item.start_time}` >= new Date().toISOString().slice(0, 16))
                  .map((item) => renderAppointmentCard(item))}
              </div>
            ) : (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>Nessun appuntamento futuro in programma.</p>
            )}
          </div>
        </div>
      )}

      {selectedAppointmentDetail && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }} onClick={() => setSelectedAppointmentDetail(null)}>
          <div 
            style={{
              backgroundColor: '#181c24',
              border: '1px solid var(--border-color)',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '450px',
              padding: '24px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h4 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.1rem', fontWeight: 700 }}>
                Dettagli Appuntamento
              </h4>
              <button 
                onClick={() => setSelectedAppointmentDetail(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>Cliente:</span>
                <strong style={{ color: 'var(--text-main)', fontSize: '16px' }}>
                  {selectedAppointmentDetail.custom_client_name || selectedAppointmentDetail.offline_clients?.full_name || selectedAppointmentDetail.profiles?.full_name || 'N/D'}
                </strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>Telefono / Contatto:</span>
                <span style={{ color: 'var(--text-main)' }}>
                  {selectedAppointmentDetail.offline_clients?.phone || selectedAppointmentDetail.profiles?.phone || 'Non specificato'}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '20px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>Data:</span>
                  <span style={{ color: 'var(--text-main)' }}>{formatDate(selectedAppointmentDetail.appointment_date)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>Orario:</span>
                  <span style={{ color: 'var(--text-main)' }}>{selectedAppointmentDetail.start_time?.slice(0, 5)} - {selectedAppointmentDetail.end_time?.slice(0, 5)}</span>
                </div>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block' }}>Operatore Assegnato:</span>
                <span style={{ color: 'var(--text-main)' }}>{selectedAppointmentDetail.barbers?.name || 'N/D'}</span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', display: 'block', marginBottom: '4px' }}>Servizi Richiesti:</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedAppointmentDetail.appointment_services?.map((as, idx) => (
                    <div key={idx} style={{ backgroundColor: '#11141b', padding: '8px', borderRadius: '6px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 500 }}>{as.services?.name}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{as.services?.duration_minutes} min - €{parseFloat(as.services?.price || 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontWeight: 600 }}>Totale Complessivo:</span>
                <span style={{ color: 'var(--accent-color)', fontSize: '1.2rem', fontWeight: 800 }}>
                  €{parseFloat(selectedAppointmentDetail.total_price || 0).toFixed(2)}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              {isAdmin && (
                <button
                  onClick={() => sendWhatsAppReminder(selectedAppointmentDetail)}
                  style={{ flex: 1, backgroundColor: '#22c55e', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  💬 WhatsApp
                </button>
              )}
              {isAdmin && onEditAppointment && (
                <button
                  onClick={() => {
                    const item = selectedAppointmentDetail
                    setSelectedAppointmentDetail(null)
                    onEditAppointment(item)
                  }}
                  style={{ flex: 1, backgroundColor: 'var(--accent-color)', color: '#0f1115', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
                >
                  ✏️ Modifica
                </button>
              )}
              <button
                onClick={() => handleCancelAppointment(selectedAppointmentDetail)}
                style={{ flex: isAdmin ? 'initial' : 1, backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer', fontWeight: 600 }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const filterInputStyle = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  backgroundColor: '#11141b',
  color: 'var(--text-main)',
  boxSizing: 'border-box',
  outline: 'none',
  fontSize: '12px'
}
