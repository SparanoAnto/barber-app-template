import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

const DEFAULT_HOLIDAYS = [
  '01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26',
]

const getCategoryIcon = (categoryName) => {
  const name = categoryName.toLowerCase()
  if (name.includes('capelli') || name.includes('taglio')) return '✂️'
  if (name.includes('barba')) return '🧔'
  if (name.includes('prodotto') || name.includes('rivendita')) return '🛍️'
  if (name.includes('estetica') || name.includes('viso') || name.includes('trattamenti')) return '✨'
  if (name.includes('colore') || name.includes('tintura')) return '🎨'
  return '📌'
}

export function BookingView({ 
  services, 
  onServicesChange, 
  userId, 
  isAdmin, 
  editingAppointment, 
  preselectedClient, 
  onBookingSuccess, 
  onCancelEdit,
  closedDays = [0, 1],
  openingTime = "08:30",
  closingTime = "20:00",
  slotIntervalMinutes = 30,
  holidays = DEFAULT_HOLIDAYS,
  salonSettings = {} 
}) {
  const [selectedServices, setSelectedServices] = useState([])
  const [customServicePrices, setCustomServicePrices] = useState({})
  const [adminExtraMinutes, setAdminExtraMinutes] = useState(0)

  const [selectedDate, setSelectedDate] = useState('')
  const [activeBarbers, setActiveBarbers] = useState([]) 
  const [loadingBarbers, setLoadingBarbers] = useState(true) 
  const [barberWorkingDays, setBarberWorkingDays] = useState([])
  const [selectedBarber, setSelectedBarber] = useState(null)
  const [selectedTime, setSelectedTime] = useState('')
  
  const [appUsers, setAppUsers] = useState([]) 
  const [offlineClients, setOfflineClients] = useState([]) 
  const [selectedClientType, setSelectedClientType] = useState('offline') 
  const [selectedClientId, setSelectedClientId] = useState('') 
  const [newClientName, setNewClientName] = useState('') 
  const [newClientPhone, setNewClientPhone] = useState('') 

  const [existingAppointments, setExistingAppointments] = useState([])
  const [shopClosures, setShopClosures] = useState([]) 
  const [barberExceptions, setBarberExceptions] = useState([]) 
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dateError, setDateError] = useState('')
  const [holidayNotice, setHolidayNotice] = useState('')

  // Ricerca sicura e universale del servizio extra (cerca corrispondenze blindate per evitare falsi positivi)
  const configuredExtraService = services.find(s => {
    const name = s.name ? s.name.toLowerCase() : ''
    const category = s.category ? s.category.toLowerCase() : ''
    return name === 'extra time' || name === 'tempo extra' || category === 'extra time' || category === 'durata extra'
  })
  const extraServiceDuration = configuredExtraService ? configuredExtraService.duration_minutes : 0

  const todayString = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    fetchShopClosures()
    fetchBarberExceptions()
    fetchActiveBarbers()
    fetchBarberWorkingDays()
    if (isAdmin) {
      fetchOfflineClients()
      fetchAppUsers()
    }

    const channel = supabase
      .channel('public-booking-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, () => fetchActiveBarbers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_exceptions' }, () => fetchBarberExceptions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_closures' }, () => fetchShopClosures())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_working_days' }, () => fetchBarberWorkingDays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offline_clients' }, () => fetchOfflineClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        if (onServicesChange) onServicesChange()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAdmin])

  useEffect(() => {
    if (preselectedClient && isAdmin) {
      if (preselectedClient.type === 'app') {
        setSelectedClientType('app')
        setSelectedClientId(preselectedClient.id)
      } else if (preselectedClient.type === 'offline') {
        setSelectedClientType('offline')
        setSelectedClientId(preselectedClient.id)
      }
    }
  }, [preselectedClient, isAdmin])

  async function fetchShopClosures() {
    const { data } = await supabase.from('shop_closures').select('*')
    if (data) setShopClosures(data)
  }

  async function fetchBarberExceptions() {
    const { data } = await supabase.from('barber_exceptions').select('*')
    if (data) setBarberExceptions(data)
  }

  async function fetchActiveBarbers() {
    setLoadingBarbers(true)
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
    setLoadingBarbers(false)
  }

  async function fetchBarberWorkingDays() {
    const { data } = await supabase.from('barber_working_days').select('*')
    if (data) setBarberWorkingDays(data)
  }

  async function fetchOfflineClients() {
    const { data } = await supabase.from('offline_clients').select('*').order('full_name', { ascending: true })
    if (data) setOfflineClients(data)
  }

  async function fetchAppUsers() {
    const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name', { ascending: true })
    if (data) setAppUsers(data)
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

    while (current < end) {
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
      
      const normalServices = services.filter(s => currentServiceIds.includes(s.id) && s !== configuredExtraService)
      const extraServiceFound = services.find(s => currentServiceIds.includes(s.id) && s === configuredExtraService)

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

      if (editingAppointment.offline_client_id) {
        setSelectedClientType('offline')
        setSelectedClientId(editingAppointment.offline_client_id)
        setNewClientName('')
        setNewClientPhone('')
      } else if (editingAppointment.user_id && editingAppointment.user_id !== userId) {
        setSelectedClientType('app')
        setSelectedClientId(editingAppointment.user_id)
      } else if (editingAppointment.custom_client_name) {
        setSelectedClientType('offline')
        setSelectedClientId('new')
        setNewClientName(editingAppointment.custom_client_name)
      }
    } else if (!preselectedClient) {
      setSelectedServices([])
      setCustomServicePrices({})
      setAdminExtraMinutes(0)
      setSelectedDate('')
      setSelectedBarber(null)
      setSelectedTime('')
      setSelectedClientType('offline')
      setSelectedClientId('')
      setNewClientName('')
      setNewClientPhone('')
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
      if (barber.termination_date && dateStr > barber.termination_date) return false 
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
    const effectiveDuration = totalDuration === 0 ? slotIntervalMinutes : totalDuration
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

    let targetClosing = closingTime
    if (selectedBarber) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()
      const wd = barberWorkingDays.find(w => w.barber_id === selectedBarber.id && w.day_of_week === dayOfWeek)
      if (wd && wd.end_time) {
        targetClosing = wd.end_time.slice(0, 5)
      }
    }
    const [closingH, closingM] = targetClosing.split(':').map(Number)
    const closingMinutes = closingH * 60 + closingM

    if (proposedEndMinutes > closingMinutes) return false

    for (const app of existingAppointments) {
      if (!app.start_time || !app.end_time) continue
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

      if (isAdmin && adminExtraMinutes > 0 && configuredExtraService) {
        if (!servicesToSave.some(s => s.id === configuredExtraService.id)) {
          servicesToSave.push(configuredExtraService)
        }
      }

      let finalUserId = userId
      let finalOfflineClientId = null
      let finalCustomName = null

      if (isAdmin) {
        if (selectedClientType === 'app') {
          finalUserId = selectedClientId || userId
        } else {
          finalUserId = userId
          if (selectedClientId === 'new') {
            if (!newClientName.trim()) {
              alert("Inserisci il nome del nuovo cliente.")
              return
            }
            const { data: newOff, error: offErr } = await supabase
              .from('offline_clients')
              .insert([{ full_name: newClientName.trim(), phone: newClientPhone.trim() || 'N/D' }])
              .select()
              .single()

            if (!offErr && newOff) {
              finalOfflineClientId = newOff.id
            } else {
              finalCustomName = newClientName.trim()
            }
          } else if (selectedClientId) {
            finalOfflineClientId = selectedClientId
          } else {
            alert("Seleziona un cliente dalla rubrica o inseriscine uno nuovo.")
            return
          }
        }
      }

      if (editingAppointment && editingAppointment.id) {
        const updatePayload = {
          barber_id: selectedBarber.id,
          appointment_date: selectedDate,
          start_time: startTimeString,
          end_time: endTimeString,
          total_price: totalPrice,
          user_id: finalUserId,
          offline_client_id: finalOfflineClientId,
          custom_client_name: finalCustomName
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
          user_id: finalUserId,
          barber_id: selectedBarber.id,
          appointment_date: selectedDate,
          start_time: startTimeString,
          end_time: endTimeString,
          total_price: totalPrice,
          status: 'confirmed',
          offline_client_id: finalOfflineClientId,
          custom_client_name: finalCustomName
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
      {editingAppointment && (
        <div style={{ 
          backgroundColor: '#eff6ff', padding: '14px 18px', borderRadius: '12px', marginBottom: '24px', 
          border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, color: 'var(--primary-color)', fontSize: '0.9rem' }}>
            ✏️ Modifica dell'appuntamento esistente
          </span>
          <button onClick={onCancelEdit} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textDecoration: 'underline' }}>
            Annulla Modifica
          </button>
        </div>
      )}

      {isAdmin && (
        <div style={{ marginBottom: '24px', border: '1px solid #e2e8f0', padding: '20px', background: '#ffffff', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary-color)', display: 'block', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            👑 Seleziona Cliente per la Prenotazione:
          </label>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
            <label style={{ color: '#1e293b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
              <input type="radio" name="clientType" checked={selectedClientType === 'offline'} onChange={() => { setSelectedClientType('offline'); setSelectedClientId(''); }} />
              Cliente da Rubrica (Offline)
            </label>
            <label style={{ color: '#1e293b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
              <input type="radio" name="clientType" checked={selectedClientType === 'app'} onChange={() => { setSelectedClientType('app'); setSelectedClientId(''); }} />
              Utente Registrato App
            </label>
          </div>

          {selectedClientType === 'offline' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={{ ...inputStyle, backgroundColor: '#f8fafc', color: '#1e293b', fontWeight: 600 }}>
                <option value="">-- Seleziona un cliente dalla rubrica --</option>
                <option value="new">➕ Inserisci nuovo cliente occasionale</option>
                {offlineClients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
              {selectedClientId === 'new' && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <input type="text" placeholder="Nome e Cognome cliente" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '180px', backgroundColor: '#fff' }} />
                  <input type="text" placeholder="Telefono (Opzionale)" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: '180px', backgroundColor: '#fff' }} />
                </div>
              )}
            </div>
          ) : (
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={{ ...inputStyle, backgroundColor: '#f8fafc', color: '#1e293b', fontWeight: 600 }}>
              <option value="">-- Seleziona utente registrato --</option>
              {appUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <h3 style={{ color: 'var(--secondary-color)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
        1. Seleziona Servizi o Prodotti
      </h3>

      {(() => {
        const filteredServices = services.filter(s => {
          if (configuredExtraService && s.id === configuredExtraService.id) return false
          return s.is_bookable;
        });
        
        filteredServices.sort((a, b) => a.name.localeCompare(b.name));

        const categoriesMap = filteredServices.reduce((acc, service) => {
          const cat = service.category && service.category.trim() !== '' ? service.category : 'Generale';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(service);
          return acc;
        }, {});

        const sortedCategories = Object.entries(categoriesMap).sort(([catA], [catB]) => catA.localeCompare(catB));

        return sortedCategories.map(([categoryName, catServices]) => (
          <div key={categoryName} style={{ marginBottom: '20px' }}>
            <div style={{ 
              fontSize: '0.85rem', fontWeight: 700, color: 'var(--primary-color)', marginBottom: '10px', 
              textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}>
              <span>{getCategoryIcon(categoryName)}</span> {categoryName}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
              {catServices.map(s => {
                const isSelected = selectedServices.some(item => item.id === s.id)
                const isZeroDuration = s.duration_minutes === 0
                const isDiscountOrIntegration = s.name.toLowerCase().includes('sconto') || s.name.toLowerCase().includes('integrazione')

                return (
                  <div key={s.id} onClick={() => toggleService(s)} style={{
                    padding: '12px 14px', borderRadius: '10px',
                    border: isSelected ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                    backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px',
                    boxShadow: isSelected ? '0 4px 10px rgba(37, 99, 235, 0.08)' : '0 1px 2px rgba(0,0,0,0.02)',
                    transition: 'all 0.15s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--secondary-color)', lineHeight: '1.2' }}>{s.name}</strong>
                      <span style={{ color: 'var(--primary-color)', fontWeight: 800, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                        {!isZeroDuration && `€${parseFloat(s.price).toFixed(2)}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                      <span>{isZeroDuration && !isDiscountOrIntegration ? '📦 Prodotto' : isZeroDuration ? '' : `⏱ ${s.duration_minutes} min`}</span>
                      <span style={{ 
                        width: '16px', height: '16px', borderRadius: '50%', 
                        border: isSelected ? '2px solid var(--primary-color)' : '1px solid #cbd5e1',
                        backgroundColor: isSelected ? 'var(--primary-color)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '10px'
                      }}>
                        {isSelected ? '✓' : ''}
                      </span>
                    </div>

                    {isSelected && isZeroDuration && isAdmin && (
                      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', background: '#ffffff', padding: '6px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: 'var(--primary-color)', fontWeight: 700 }}>€:</span>
                        <input
                          type="number" step="0.05" placeholder="Prezzo"
                          value={customServicePrices[s.id] !== undefined ? customServicePrices[s.id] : s.price}
                          onChange={(e) => handleCustomPriceChange(s.id, e.target.value)}
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px', backgroundColor: '#f8fafc', color: '#1e293b', fontWeight: 700 }}
                        />
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
          {isAdmin && configuredExtraService && (
            <div style={{ padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <strong style={{ color: 'var(--primary-color)', fontSize: '0.9rem', display: 'block', marginBottom: '2px' }}>⏱️ Regolazione Durata Extra (Admin)</strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Aggiunge minuti extra ({configuredExtraService.name}) alla prestazione.</span>
                </div>
                <select value={adminExtraMinutes} onChange={(e) => setAdminExtraMinutes(Number(e.target.value))} style={{ ...inputStyle, width: '180px', padding: '10px 12px', backgroundColor: '#fff', color: '#1e293b', fontWeight: 700 }}>
                  <option value={0}>Nessun extra (+0 min)</option>
                  <option value={configuredExtraService.duration_minutes}>+{configuredExtraService.duration_minutes} min (Tot: {baseServicesDuration + configuredExtraService.duration_minutes}m)</option>
                </select>
              </div>
            </div>
          )}

          <div style={{ padding: '14px 18px', background: '#f8fafc', borderLeft: '4px solid var(--primary-color)', borderRadius: '12px', marginBottom: '24px', border: '1px solid #e2e8f0', borderLeftWidth: '4px' }}>
            <strong style={{ color: 'var(--secondary-color)', fontSize: '0.95rem' }}>
              Riepilogo: {totalDuration > 0 ? `${totalDuration} min` : 'Solo Prodotti'} | Totale: €{totalPrice.toFixed(2)}
            </strong>
          </div>

          <h3 style={{ color: 'var(--secondary-color)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
            2. Scegli la Data
          </h3>
          <div style={{ marginBottom: '24px' }}>
            <input type="date" min={todayString} value={selectedDate} onChange={e => handleDateChange(e.target.value)} style={{ ...inputStyle, border: holidayNotice ? '1px solid var(--accent-color)' : dateError ? '1px solid #ef4444' : '1px solid #cbd5e1' }} />
            {dateError && <div style={{ marginTop: '10px', padding: '12px', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>{dateError}</div>}
            {holidayNotice && <div style={{ marginTop: '10px', padding: '12px', background: '#fef3c7', color: '#92400e', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>{holidayNotice}</div>}
          </div>

          {selectedDate && !dateError && (
            <>
              <h3 style={{ color: 'var(--secondary-color)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
                3. Scegli l'Operatore
              </h3>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {loadingBarbers ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>Caricamento operatori...</p>
                ) : getAvailableBarbersForDate(selectedDate).length === 0 ? (
                  <p style={{ color: '#64748b', fontSize: '13px' }}>Nessun operatore disponibile in questa data.</p>
                ) : (
                  getAvailableBarbersForDate(selectedDate).map(b => (
                    <button key={b.id} onClick={() => setSelectedBarber(b)} style={{
                      flex: 1, minWidth: '140px', padding: '14px', borderRadius: '12px',
                      border: selectedBarber?.id === b.id ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                      backgroundColor: selectedBarber?.id === b.id ? '#eff6ff' : '#ffffff',
                      color: 'var(--secondary-color)', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                      boxShadow: selectedBarber?.id === b.id ? '0 4px 12px rgba(37, 99, 235, 0.08)' : '0 1px 3px rgba(0,0,0,0.02)'
                    }}>
                      👤 {b.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}

          {selectedBarber && selectedDate && !dateError && (
            <>
              <h3 style={{ color: 'var(--secondary-color)', fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>
                4. Seleziona Orario
              </h3>
              {loadingSlots ? <p style={{ color: '#64748b', fontSize: '13px' }}>Caricamento slot...</p> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(95px, 1fr))', gap: '10px' }}>
                  {allTimeSlots.map(slot => {
                    const available = isSlotAvailable(slot)
                    const isSelected = selectedTime === slot
                    return (
                      <button
                        key={slot} 
                        disabled={!available} 
                        onClick={() => setSelectedTime(slot)}
                        title={!available ? "Orario occupato o non disponibile" : "Orario disponibile"}
                        style={{
                          padding: '12px 6px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid var(--primary-color)' : '1px solid #e2e8f0',
                          backgroundColor: !available ? '#fee2e2' : isSelected ? 'var(--primary-color)' : '#ffffff',
                          color: !available ? '#991b1b' : isSelected ? '#ffffff' : 'var(--secondary-color)',
                          cursor: !available ? 'not-allowed' : 'pointer',
                          fontWeight: isSelected || !available ? 700 : 500,
                          fontSize: '13px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '2px',
                          boxShadow: isSelected ? '0 4px 10px rgba(37, 99, 235, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)'
                        }}
                      >
                        <span>{slot}</span>
                        <span style={{ fontSize: '10px', opacity: 0.85, fontWeight: 600 }}>
                          {!available ? 'Occupato' : 'Libero'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <button onClick={handleConfirmBooking} disabled={!selectedTime} style={{
                width: '100%', marginTop: '24px', padding: '14px', borderRadius: '12px', border: 'none',
                backgroundColor: !selectedTime ? '#cbd5e1' : 'var(--primary-color)', color: '#FFF', fontWeight: 700, fontSize: '0.95rem', cursor: !selectedTime ? 'not-allowed' : 'pointer',
                boxShadow: !selectedTime ? 'none' : '0 4px 12px rgba(37, 99, 235, 0.2)'
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
  width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', 
  backgroundColor: '#f8fafc', color: '#1e293b', boxSizing: 'border-box', outline: 'none', fontSize: '13px'
}
