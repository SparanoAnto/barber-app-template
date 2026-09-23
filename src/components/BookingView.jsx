import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

// Festività Nazionali Italiane Standard (MM-DD)
const DEFAULT_HOLIDAYS = [
  '01-01', // Capodanno
  '01-06', // Epifania
  '04-25', // Festa della Liberazione
  '05-01', // Festa del Lavoro
  '06-02', // Festa della Repubblica
  '08-15', // Ferragosto
  '11-01', // Tutti i Santi
  '12-08', // Immacolata Concezione
  '12-25', // Natale
  '12-26', // Santo Stefano
]

// Funzione helper per assegnare un'icona dinamica in base al nome della categoria
const getCategoryIcon = (categoryName) => {
  const name = categoryName.toLowerCase()
  if (name.includes('capelli') || name.includes('taglio')) return '✂️'
  if (name.includes('barba')) return '🧔'
  if (name.includes('prodotto') || name.includes('rivendita')) return '🛍️'
  if (name.includes('estetica') || name.includes('viso') || name.includes('trattamenti')) return '✨'
  if (name.includes('colore') || name.includes('tintura')) return '🎨'
  return '📌' // Icona di default per le altre categorie (es. Generale)
}

export function BookingView({ 
  services, 
  userId, 
  isAdmin, 
  editingAppointment, 
  onBookingSuccess, 
  onCancelEdit,
  closedDays = [0, 1], // 0 = Domenica, 1 = Lunedì (Configurabile)
  openingTime = "08:30",
  closingTime = "20:00",
  slotIntervalMinutes = 30,
  holidays = DEFAULT_HOLIDAYS
}) {
  const [selectedServices, setSelectedServices] = useState([])
  const [customServicePrices, setCustomServicePrices] = useState({})
  
  // Stato per gestire i minuti extra tramite il box azzurro (Admin)
  const [adminExtraMinutes, setAdminExtraMinutes] = useState(0)

  const [selectedDate, setSelectedDate] = useState('')
  const [activeBarbers, setActiveBarbers] = useState([]) 
  const [barberWorkingDays, setBarberWorkingDays] = useState([])
  const [selectedBarber, setSelectedBarber] = useState(null)
  const [selectedTime, setSelectedTime] = useState('')
  const [customClientName, setCustomClientName] = useState('')

  const [existingAppointments, setExistingAppointments] = useState([])
  const [shopClosures, setShopClosures] = useState([]) 
  const [barberExceptions, setBarberExceptions] = useState([]) 
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dateError, setDateError] = useState('')
  const [holidayNotice, setHolidayNotice] = useState('')

  // Troviamo il servizio extra configurato nel database (es. "Extra Time" da 30 min)
  const configuredExtraService = services.find(s => 
    (s.category && s.category.toLowerCase().includes('extra')) || 
    (s.name && s.name.toLowerCase().includes('extra'))
  )
  const extraServiceDuration = configuredExtraService ? configuredExtraService.duration_minutes : 30

  // Data locale in formato YYYY-MM-DD
  const todayString = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    fetchShopClosures()
    fetchBarberExceptions()
    fetchActiveBarbers()
    fetchBarberWorkingDays()

    const channel = supabase
      .channel('public-booking-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, () => fetchActiveBarbers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_exceptions' }, () => fetchBarberExceptions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_closures' }, () => fetchShopClosures())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_working_days' }, () => fetchBarberWorkingDays())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  async function fetchShopClosures() {
    const { data } = await supabase.from('shop_closures').select('*')
    if (data) setShopClosures(data)
  }

  async function fetchBarberExceptions() {
    const { data } = await supabase.from('barber_exceptions').select('*')
    if (data) setBarberExceptions(data)
  }

  async function fetchActiveBarbers() {
    const { data, error } = await supabase
      .from('barbers')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (data && !error) {
      setActiveBarbers(data)
      setSelectedBarber(prev => {
        if (prev && !data.some(b => b.id === prev.id)) return null
        return prev
      })
    }
  }

  async function fetchBarberWorkingDays() {
    const { data } = await supabase.from('barber_working_days').select('*')
    if (data) setBarberWorkingDays(data)
  }

  const isShopClosedPeriod = (dateStr) => {
    if (!dateStr) return false
    return shopClosures.some(closure => dateStr >= closure.start_date && dateStr <= closure.end_date)
  }

  const generateTimeSlots = () => {
    let targetOpening = openingTime
    let targetClosing = closingTime

    if (selectedDate && selectedBarber) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()
      const wd = barberWorkingDays.find(w => w.barber_id === selectedBarber.id && w.day_of_week === dayOfWeek)
      if (wd) {
        if (wd.start_time) targetOpening = wd.start_time.slice(0, 5)
        if (wd.end_time) targetClosing = wd.end_time.slice(0, 5)
      }
    }

    const slots = []
    const [startH, startM] = targetOpening.split(':').map(Number)
    const [endH, endM] = targetClosing.split(':').map(Number)

    let current = new Date()
    current.setHours(startH, startM, 0, 0)
    const end = new Date()
    end.setHours(endH, endM, 0, 0)

    while (current <= end) {
      const hours = String(current.getHours()).padStart(2, '0')
      const minutes = String(current.getMinutes()).padStart(2, '0')
      slots.push(`${hours}:${minutes}`)
      current.setMinutes(current.getMinutes() + slotIntervalMinutes)
    }
    return slots
  }

  const allTimeSlots = generateTimeSlots()

  useEffect(() => {
    if (editingAppointment) {
      const currentServiceIds = editingAppointment.appointment_services?.map(as => as.service_id || as.services?.id) || []
      
      const normalServices = services.filter(s => currentServiceIds.includes(s.id) && !s.name.toLowerCase().includes('extra time') && !s.name.toLowerCase().includes('extra'))
      const extraServiceFound = services.find(s => currentServiceIds.includes(s.id) && (s.name.toLowerCase().includes('extra time') || s.name.toLowerCase().includes('extra')))

      setSelectedServices(normalServices)

      if (extraServiceFound) {
        setAdminExtraMinutes(extraServiceFound.duration_minutes || extraServiceDuration)
      } else if (editingAppointment.start_time && editingAppointment.end_time) {
        const [sH, sM] = editingAppointment.start_time.split(':').map(Number)
        const [eH, eM] = editingAppointment.end_time.split(':').map(Number)
        const diffMinutes = (eH * 60 + eM) - (sH * 60 + sM)
        const baseDuration = normalServices.reduce((acc, s) => acc + s.duration_minutes, 0)
        if (diffMinutes > baseDuration) {
          setAdminExtraMinutes(diffMinutes - baseDuration)
        } else {
          setAdminExtraMinutes(0)
        }
      }

      const pricesMap = {}
      editingAppointment.appointment_services?.forEach(as => {
        const sId = as.service_id || as.services?.id
        if (as.price !== undefined) {
          pricesMap[sId] = String(as.price)
        }
      })
      setCustomServicePrices(pricesMap)

      if (editingAppointment.appointment_date) {
        handleDateChange(editingAppointment.appointment_date)
      }

      if (editingAppointment.start_time) {
        setSelectedTime(editingAppointment.start_time.slice(0, 5))
      }

      if (activeBarbers.length > 0) {
        const barber = activeBarbers.find(b => b.id === editingAppointment.barber_id)
        if (barber) setSelectedBarber(barber)
      }

      setCustomClientName(editingAppointment.custom_client_name || '')
    } else {
      setSelectedServices([])
      setCustomServicePrices({})
      setAdminExtraMinutes(0)
      setSelectedDate('')
      setSelectedBarber(null)
      setSelectedTime('')
      setCustomClientName('')
      setDateError('')
      setHolidayNotice('')
    }
  }, [editingAppointment, services, activeBarbers])

  const toggleService = (service) => {
    const exists = selectedServices.find(s => s.id === service.id)
    if (exists) {
      setSelectedServices(selectedServices.filter(s => s.id !== service.id))
    } else {
      setSelectedServices([...selectedServices, service])
      if (service.duration_minutes === 0 && !customServicePrices[service.id]) {
        setCustomServicePrices(prev => ({ ...prev, [service.id]: String(service.price || 0) }))
      }
    }
  }

  const handleCustomPriceChange = (serviceId, value) => {
    setCustomServicePrices(prev => ({
      ...prev,
      [serviceId]: value
    }))
  }

  // Calcolo durata totale (Servizi normali + minuti extra del box azzurro)
  const baseServicesDuration = selectedServices.reduce((acc, s) => acc + s.duration_minutes, 0)
  const totalDuration = baseServicesDuration + (isAdmin ? Number(adminExtraMinutes) : 0)
  
  const totalPrice = selectedServices.reduce((acc, s) => {
    const priceToUse = (s.duration_minutes === 0 && customServicePrices[s.id] !== undefined && customServicePrices[s.id] !== '')
      ? parseFloat(customServicePrices[s.id])
      : parseFloat(s.price)
    return acc + (isNaN(priceToUse) ? 0 : priceToUse)
  }, 0)

  const isClosedDay = (dateStr) => {
    if (!dateStr) return false
    const day = new Date(dateStr + 'T00:00:00').getDay()
    return closedDays.includes(day)
  }

  const isHolidayDate = (dateStr) => {
    if (!dateStr) return false
    return holidays.includes(dateStr.slice(5))
  }

  const handleDateChange = (dateVal) => {
    setDateError('')
    setHolidayNotice('')
    setSelectedTime('')
    setSelectedBarber(null)

    if (!dateVal) {
      setSelectedDate('')
      return
    }

    if (isClosedDay(dateVal)) {
      setDateError('⚠️ Il salone è chiuso nel giorno selezionato (giorno di chiusura settimanale).')
      setSelectedDate('')
      return
    }

    if (isShopClosedPeriod(dateVal)) {
      const closureInfo = shopClosures.find(c => dateVal >= c.start_date && dateVal <= c.end_date)
      setDateError(`🏖️ Il salone è chiuso per "${closureInfo?.reason || 'Ferie Collettive'}" in questa data.`)
      setSelectedDate('')
      return
    }

    setSelectedDate(dateVal)

    if (isHolidayDate(dateVal)) {
      setHolidayNotice('🎉 Giorno Festivo: Gli orari del salone potrebbero subire variazioni o aperture straordinarie.')
    }
  }

  const getAvailableBarbersForDate = (dateStr) => {
    if (!dateStr) return activeBarbers

    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay()

    return activeBarbers.filter(barber => {
      if (barber.termination_date && dateStr > barber.termination_date) {
        return false 
      }

      const barberDays = barberWorkingDays.filter(wd => wd.barber_id === barber.id)
      if (barberDays.length > 0) {
        const worksOnThisDay = barberDays.some(wd => wd.day_of_week === dayOfWeek)
        if (!worksOnThisDay) return false
      }

      return true
    })
  }

  useEffect(() => {
    if (selectedDate && selectedBarber) {
      fetchExistingAppointments()
    } else {
      setExistingAppointments([])
    }
  }, [selectedDate, selectedBarber, editingAppointment])

  async function fetchExistingAppointments() {
    setLoadingSlots(true)

    let query = supabase
      .from('appointments')
      .select('id, appointment_date, start_time, end_time')
      .eq('barber_id', selectedBarber.id)
      .eq('appointment_date', selectedDate)
      .neq('status', 'cancelled')

    if (editingAppointment?.id) {
      query = query.neq('id', editingAppointment.id)
    }

    const { data } = await query
    setExistingAppointments(data || [])
    setLoadingSlots(false)
  }

  const isBarberAvailableAtSlot = (slot) => {
    if (!selectedBarber || !selectedDate) return true
    const exception = barberExceptions.find(exc => exc.barber_id === selectedBarber.id && exc.date === selectedDate)
    if (!exception) return true
    if (!exception.start_time || !exception.end_time) return false 

    const proposedStart = new Date(`${selectedDate}T${slot}:00`)
    const effectiveDuration = totalDuration === 0 ? 30 : totalDuration
    const proposedEnd = new Date(proposedStart.getTime() + effectiveDuration * 60000)

    const excStart = new Date(`${selectedDate}T${exception.start_time}`)
    const excEnd = new Date(`${selectedDate}T${exception.end_time}`)

    if (proposedStart < excEnd && proposedEnd > excStart) return false 
    return true
  }

  const isSlotAvailable = (slot) => {
    if (!selectedDate) return false
    const now = new Date()
    const proposedStart = new Date(`${selectedDate}T${slot}:00`)
    if (selectedDate === todayString && proposedStart < now) return false
    if (!isBarberAvailableAtSlot(slot)) return false

    const effectiveDuration = totalDuration === 0 ? slotIntervalMinutes : totalDuration
    const [pH, pM] = slot.split(':').map(Number)
    const proposedStartMinutes = pH * 60 + pM
    const proposedEndMinutes = proposedStartMinutes + effectiveDuration

    for (const app of existingAppointments) {
      const [eStartH, eStartM] = app.start_time.slice(0, 5).split(':').map(Number)
      const [eEndH, eEndM] = app.end_time.slice(0, 5).split(':').map(Number)
      const existingStartMinutes = eStartH * 60 + eStartM
      const existingEndMinutes = eEndH * 60 + eEndM

      if (proposedStartMinutes < existingEndMinutes && proposedEndMinutes > existingStartMinutes) {
        return false
      }
    }
    return true
  }

  async function handleConfirmBooking() {
    if (!selectedDate || !selectedBarber || !selectedTime || selectedServices.length === 0) {
      alert("Seleziona tutti i campi obbligatori e almeno un servizio.")
      return
    }

    const [startH, startM] = selectedTime.split(':').map(Number)
    const effectiveDuration = totalDuration === 0 ? slotIntervalMinutes : totalDuration
    
    const startDateObj = new Date()
    startDateObj.setHours(startH, startM + effectiveDuration, 0)
    const endH = String(startDateObj.getHours()).padStart(2, '0')
    const endMin = String(startDateObj.getMinutes()).padStart(2, '0')
    const endTimeString = `${endH}:${endMin}:00`
    const startTimeString = `${selectedTime}:00`

    try {
      let servicesToSave = [...selectedServices]

      if (isAdmin && adminExtraMinutes > 0) {
        let extraService = configuredExtraService
        if (!extraService) {
          extraService = services.find(s => s.name.toLowerCase().includes('extra'))
        }

        if (extraService && !servicesToSave.some(s => s.id === extraService.id)) {
          servicesToSave.push(extraService)
        }
      }

      if (editingAppointment && editingAppointment.id) {
        const updatePayload = {
          barber_id: selectedBarber.id,
          appointment_date: selectedDate,
          start_time: startTimeString,
          end_time: endTimeString,
          total_price: totalPrice
        }

        if (isAdmin && customClientName.trim() !== '') {
          updatePayload.custom_client_name = customClientName.trim()
        }

        const { error: updateError } = await supabase
          .from('appointments')
          .update(updatePayload)
          .eq('id', editingAppointment.id)
        if (updateError) throw updateError

        const { error: delError } = await supabase
          .from('appointment_services')
          .delete()
          .eq('appointment_id', editingAppointment.id)
        if (delError) throw delError

        const joins = servicesToSave.map(s => {
          const finalPrice = (s.duration_minutes === 0 && customServicePrices[s.id] !== undefined && customServicePrices[s.id] !== '')
            ? parseFloat(customServicePrices[s.id])
            : parseFloat(s.price || 0)

          return {
            appointment_id: editingAppointment.id,
            service_id: s.id,
            price: isNaN(finalPrice) ? 0 : finalPrice
          }
        })

        const { error: insertServiceError } = await supabase
          .from('appointment_services')
          .insert(joins)
        if (insertServiceError) throw insertServiceError

        alert("Appuntamento modificato con successo!")
      } else {
        const newAppointment = {
          user_id: userId,
          barber_id: selectedBarber.id,
          appointment_date: selectedDate,
          start_time: startTimeString,
          end_time: endTimeString,
          total_price: totalPrice,
          status: 'confirmed'
        }

        if (isAdmin && customClientName.trim() !== '') {
          newAppointment.custom_client_name = customClientName.trim()
        }

        const { data: appData, error: appError } = await supabase
          .from('appointments')
          .insert([newAppointment])
          .select()
          .single()
        if (appError) throw appError

        const joins = servicesToSave.map(s => {
          const finalPrice = (s.duration_minutes === 0 && customServicePrices[s.id] !== undefined && customServicePrices[s.id] !== '')
            ? parseFloat(customServicePrices[s.id])
            : parseFloat(s.price || 0)

          return {
            appointment_id: appData.id,
            service_id: s.id,
            price: isNaN(finalPrice) ? 0 : finalPrice
          }
        })

        const { error: joinError } = await supabase
          .from('appointment_services')
          .insert(joins)
        if (joinError) throw joinError

        alert("Nuova prenotazione registrata con successo!")
      }

      if (onBookingSuccess) onBookingSuccess()
    } catch (err) {
      alert("Errore salvataggio: " + err.message)
    }
  }

  return (
    <div className="booking-container">
      {editingAppointment && (
        <div style={{ backgroundColor: 'rgba(25, 118, 210, 0.15)', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', border: '1px solid var(--barber-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 'bold', color: 'var(--barber-blue)', fontSize: '0.9rem' }}>
            ✏️ Modifica dell'appuntamento esistente
          </span>
          <button onClick={onCancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
            Annulla Modifica
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="info-card" style={{ marginBottom: '20px', borderColor: 'var(--barber-blue)' }}>
          <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#64B5F6', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            👑 Prenotazione / Vendita per conto di un cliente (Opzionale):
          </label>
          <input
            type="text"
            placeholder="Es: Mario Rossi (Rivendita / Telefono)"
            value={customClientName}
            onChange={(e) => setCustomClientName(e.target.value)}
            style={{ ...inputStyle, backgroundColor: 'rgba(15, 15, 15, 0.9)', border: '1px solid var(--border-color)' }}
          />
        </div>
      )}

      <h3 className="section-title">1. Seleziona Servizi o Prodotti</h3>

      {/* Raggruppamento dinamico per categoria con icone dedicate */}
      {(() => {
        const filteredServices = services.filter(s => {
          const isExtraCategory = s.category && s.category.toLowerCase().includes('extra')
          const isExtraName = s.name && s.name.toLowerCase().includes('extra')
          const shouldHideFromList = isExtraCategory || isExtraName
          return (isAdmin || s.is_bookable) && !shouldHideFromList;
        });
        
        const categoriesMap = filteredServices.reduce((acc, service) => {
          const cat = service.category && service.category.trim() !== '' ? service.category : 'Generale';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(service);
          return acc;
        }, {});

        return Object.entries(categoriesMap).map(([categoryName, catServices]) => (
          <div key={categoryName} style={{ marginBottom: '20px' }}>
            <div style={{ 
              fontSize: '0.85rem', 
              fontWeight: 'bold', 
              color: 'var(--barber-red)', 
              marginBottom: '10px', 
              textTransform: 'uppercase', 
              letterSpacing: '0.5px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span>{getCategoryIcon(categoryName)}</span> {categoryName}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {catServices.map(s => {
                const isSelected = selectedServices.some(item => item.id === s.id)
                const isZeroDuration = s.duration_minutes === 0
                const isDiscountOrIntegration = s.name.toLowerCase().includes('sconto') || s.name.toLowerCase().includes('integrazione')

                return (
                  <div key={s.id} style={{
                    padding: '14px 16px',
                    borderRadius: '8px',
                    border: isSelected ? '1px solid var(--barber-red)' : '1px solid var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(211, 47, 47, 0.15)' : 'rgba(24, 24, 24, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: isSelected ? '0 0 12px rgba(211, 47, 47, 0.2)' : 'none',
                    transition: 'all 0.2s ease'
                  }}>
                    <div onClick={() => toggleService(s)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <div>
                        <strong style={{ fontSize: '1rem', color: '#ffffff' }}>{s.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {isZeroDuration && !isDiscountOrIntegration ? '📦 Prodotto / Extra (Senza durata)' : isZeroDuration ? '' : `⏱ ${s.duration_minutes} min`}
                        </div>
                      </div>
                      <div style={{ color: 'var(--barber-red)', fontWeight: '800', fontSize: '1.1rem' }}>
                        {!isZeroDuration && `€${parseFloat(s.price).toFixed(2)}`}
                      </div>
                    </div>

                    {isSelected && isZeroDuration && isAdmin && (
                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', color: '#FFD700', fontWeight: 'bold' }}>Inserisci Importo (€):</span>
                        <input
                          type="number"
                          step="0.05"
                          placeholder="Es: 10"
                          value={customServicePrices[s.id] !== undefined ? customServicePrices[s.id] : s.price}
                          onChange={(e) => handleCustomPriceChange(s.id, e.target.value)}
                          style={{ ...inputStyle, padding: '6px 10px', width: '120px', backgroundColor: '#111', color: '#FFD700', fontWeight: 'bold' }}
                        />
                        {isDiscountOrIntegration && (
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            (Usa segno negativo es. -5 per sconti)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      })()}

      {selectedServices.length > 0 && (
        <>
          {/* Box Azzurro Admin: Gestione pulita basata sui minuti configurati nel database (es. 30 min) */}
          {isAdmin && (
            <div style={{ padding: '14px 16px', background: 'rgba(25, 118, 210, 0.1)', border: '1px solid var(--barber-blue)', borderRadius: '8px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <strong style={{ color: '#64B5F6', fontSize: '0.9rem', display: 'block' }}>⏱️ Regolazione Durata Extra (Admin)</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aggiunge minuti e registra automaticamente il servizio extra nelle analisi.</span>
                </div>
                <select
                  value={adminExtraMinutes}
                  onChange={(e) => setAdminExtraMinutes(Number(e.target.value))}
                  style={{ ...inputStyle, width: '160px', padding: '8px 10px', backgroundColor: '#111', color: '#FFF', fontWeight: 'bold' }}
                >
                  <option value={0}>Nessun extra (+0 min)</option>
                  <option value={extraServiceDuration}>+{extraServiceDuration} min (Tot: {baseServicesDuration + extraServiceDuration}m)</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ padding: '12px 16px', background: 'rgba(30, 30, 30, 0.9)', borderLeft: '4px solid var(--barber-red)', borderRadius: '6px', marginBottom: '25px' }}>
            <strong style={{ color: '#FFF' }}>Riepilogo: {totalDuration > 0 ? `${totalDuration} min` : 'Solo Prodotti/Extra'} | Totale: €{totalPrice.toFixed(2)}</strong>
          </div>

          <h3 className="section-title">2. Scegli la Data</h3>
          <div style={{ marginBottom: '25px' }}>
            <input 
              type="date" 
              min={todayString}
              value={selectedDate} 
              onChange={e => handleDateChange(e.target.value)} 
              style={{ ...inputStyle, border: holidayNotice ? '1px solid #FFD700' : dateError ? '1px solid var(--barber-red)' : '1px solid var(--border-color)' }} 
            />
            {dateError && <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(211,47,47,0.2)', color: '#FF8A80', borderRadius: '6px', fontSize: '13px' }}>{dateError}</div>}
            {holidayNotice && <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(255,215,0,0.15)', color: '#FFD700', borderRadius: '6px', fontSize: '13px' }}>{holidayNotice}</div>}
          </div>

          {selectedDate && !dateError && (
            <>
              <h3 className="section-title">3. Scegli l'Operatore</h3>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', flexWrap: 'wrap' }}>
                {getAvailableBarbersForDate(selectedDate).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessun operatore disponibile in questa data.</p>
                ) : (
                  getAvailableBarbersForDate(selectedDate).map(b => (
                    <button key={b.id} onClick={() => setSelectedBarber(b)} style={{
                      flex: 1, minWidth: '120px', padding: '12px', borderRadius: '8px',
                      border: selectedBarber?.id === b.id ? '2px solid var(--barber-blue)' : '1px solid var(--border-color)',
                      backgroundColor: selectedBarber?.id === b.id ? 'rgba(25, 118, 210, 0.2)' : 'rgba(24, 24, 24, 0.85)',
                      color: '#FFF', cursor: 'pointer', fontWeight: 'bold'
                    }}>
                      💈 {b.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {selectedBarber && selectedDate && !dateError && (
            <>
              <h3 className="section-title">4. Seleziona Orario</h3>
              {loadingSlots ? <p style={{ color: 'var(--text-muted)' }}>Caricamento slot...</p> : (
                <div className="time-slots-grid">
                  {allTimeSlots.map(slot => {
                    const available = isSlotAvailable(slot)
                    const isSelected = selectedTime === slot
                    return (
                      <button
                        key={slot} disabled={!available} onClick={() => setSelectedTime(slot)}
                        className={`time-slot-card ${isSelected ? 'selected' : ''}`}
                        style={{
                          backgroundColor: !available ? '#1a1a1a' : isSelected ? 'var(--barber-red)' : 'rgba(30, 30, 30, 0.8)',
                          color: !available ? '#444' : '#FFF', cursor: !available ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {slot}
                      </button>
                    )
                  })}
                </div>
              )}

              <button onClick={handleConfirmBooking} disabled={!selectedTime} style={{
                width: '100%', marginTop: '20px', padding: '14px', borderRadius: '6px', border: 'none',
                backgroundColor: !selectedTime ? '#333' : 'var(--barber-red)', color: !selectedTime ? '#777' : '#FFF', fontWeight: 'bold', cursor: !selectedTime ? 'not-allowed' : 'pointer'
              }}>
                {editingAppointment ? "Salva Modifiche" : "Conferma Registrazione"}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

const inputStyle = { 
  width: '100%', 
  padding: '12px 14px', 
  borderRadius: '6px', 
  border: '1px solid var(--border-color)', 
  backgroundColor: 'rgba(24, 24, 24, 0.85)', 
  color: '#FFF', 
  boxSizing: 'border-box', 
  outline: 'none', 
  fontSize: '14px',
  colorScheme: 'dark' 
}
