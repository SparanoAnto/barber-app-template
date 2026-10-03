import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../supabaseClient'

const DEFAULT_HOLIDAYS = [
  '01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '11-01', '12-08', '12-25', '12-26',
]

const getCategoryIcon = (categoryName) => {
  const name = (categoryName || '').toLowerCase()
  if (name.includes('capelli') || name.includes('taglio')) return '✂️'
  if (name.includes('barba')) return '🧔'
  if (name.includes('prodotto') || name.includes('rivendita')) return '🛍'
  if (name.includes('estetica') || name.includes('viso') || name.includes('trattamenti')) return '✨'
  if (name.includes('colore') || name.includes('tintura')) return '🎨'
  return '📌'
}

export function BookingView({ 
  services = [], 
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
  const [salonWeeklyHours, setSalonWeeklyHours] = useState([])
  const [salonExceptions, setSalonExceptions] = useState([]) 
  const [selectedBarber, setSelectedBarber] = useState(null)
  const [selectedTime, setSelectedTime] = useState('')
  
  const [appUsers, setAppUsers] = useState([]) 
  const [offlineClients, setOfflineClients] = useState([]) 
  const [selectedClientType, setSelectedClientType] = useState('offline') 
  const [selectedClientId, setSelectedClientId] = useState('') 
  const [newClientName, setNewClientName] = useState('') 
  
  const [newClientPrefix, setNewClientPrefix] = useState('+39')
  const [newClientPhone, setNewClientPhone] = useState('') 

  const [existingAppointments, setExistingAppointments] = useState([])
  const [shopClosures, setShopClosures] = useState([]) 
  const [barberExceptions, setBarberExceptions] = useState([]) 
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [dateError, setDateError] = useState('')
  const [holidayNotice, setHolidayNotice] = useState('')
  const [scheduleNotice, setScheduleNotice] = useState('') 

  const [isSubmitting, setIsSubmitting] = useState(false)

  const todayString = useMemo(() => new Date().toLocaleDateString('sv-SE'), [])

  const extraServicesList = useMemo(() => {
    return services.filter(s => {
      const name = s.name ? s.name.toLowerCase() : ''
      const category = s.category ? s.category.toLowerCase() : ''
      return name.includes('extra time') || name.includes('tempo extra') || category.includes('extra time') || category.includes('durata extra')
    })
  }, [services])

  const configuredExtraService = extraServicesList.length > 0 ? extraServicesList[0] : null

  const fetchShopClosures = useCallback(async () => {
    const { data } = await supabase.from('shop_closures').select('*')
    if (data) setShopClosures(data)
  }, [])

  const fetchBarberExceptions = useCallback(async () => {
    const { data } = await supabase.from('barber_exceptions').select('*')
    if (data) setBarberExceptions(data)
  }, [])

  const fetchSalonExceptions = useCallback(async () => {
    const { data } = await supabase.from('salon_exceptions').select('*')
    if (data) setSalonExceptions(data)
  }, [])

  const fetchActiveBarbers = useCallback(async () => {
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
  }, [])

  const fetchBarberWorkingDays = useCallback(async () => {
    const { data } = await supabase.from('barber_working_days').select('*')
    if (data) setBarberWorkingDays(data)
  }, [])

  const fetchSalonWeeklyHours = useCallback(async () => {
    const { data } = await supabase.from('salon_weekly_hours').select('*')
    if (data) setSalonWeeklyHours(data)
  }, [])

  const fetchOfflineClients = useCallback(async () => {
    const { data } = await supabase
      .from('offline_clients')
      .select('*')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    if (data) setOfflineClients(data)
  }, [])

  const fetchAppUsers = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    if (data) setAppUsers(data)
  }, [])

  // 👉 Ottimizzazione con Promise.all per il caricamento iniziale parallelo
  useEffect(() => {
    const loadInitialData = async () => {
      setLoadingBarbers(true)
      await Promise.all([
        fetchShopClosures(),
        fetchBarberExceptions(),
        fetchSalonExceptions(),
        fetchActiveBarbers(),
        fetchBarberWorkingDays(),
        fetchSalonWeeklyHours(),
        isAdmin ? fetchOfflineClients() : Promise.resolve(),
        isAdmin ? fetchAppUsers() : Promise.resolve(),
      ])
      setLoadingBarbers(false)
    }

    loadInitialData()

    const channel = supabase
      .channel('public-booking-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, () => fetchActiveBarbers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_exceptions' }, () => fetchBarberExceptions())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_exceptions' }, () => fetchSalonExceptions()) 
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_closures' }, () => fetchShopClosures())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'barber_working_days' }, () => fetchBarberWorkingDays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_weekly_hours' }, () => fetchSalonWeeklyHours())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offline_clients' }, () => fetchOfflineClients())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchAppUsers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, () => {
        if (onServicesChange) onServicesChange()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAdmin, fetchShopClosures, fetchBarberExceptions, fetchSalonExceptions, fetchActiveBarbers, fetchBarberWorkingDays, fetchSalonWeeklyHours, fetchOfflineClients, fetchAppUsers, onServicesChange])

  useEffect(() => {
    if (preselectedClient && isAdmin) {
      if (preselectedClient.type === 'app' || preselectedClient.type === 'offline') {
        setSelectedClientType(preselectedClient.type)
        setSelectedClientId(preselectedClient.id)
      }
    }
  }, [preselectedClient, isAdmin])

  const isShopClosedPeriod = useCallback((dateStr) => {
    if (!dateStr) return false
    return shopClosures.some(closure => dateStr >= closure.start_date && dateStr <= closure.end_date)
  }, [shopClosures])

  const isClosedDay = useCallback((dateStr) => {
    if (!dateStr) return false
    const exception = salonExceptions.find(exc => dateStr >= exc.start_date && dateStr <= exc.end_date)
    if (exception) {
      if (exception.is_closed) return true
      if (exception.opening_time || exception.closing_time) return false 
    }

    const day = new Date(dateStr + 'T00:00:00').getDay()
    const salonDay = salonWeeklyHours.find(w => w.day_of_week === day)
    if (salonDay) {
      return salonDay.is_closed
    }
    return closedDays.includes(day)
  }, [salonExceptions, salonWeeklyHours, closedDays])

  const isHolidayDate = useCallback((dateStr) => {
    if (!dateStr) return false
    return holidays.includes(dateStr.slice(5))
  }, [holidays])

  const handleDateChange = useCallback((dateVal) => {
    setDateError('')
    setHolidayNotice('')
    setScheduleNotice('') 
    setSelectedTime('')
    setSelectedBarber(null)

    if (!dateVal) {
      setSelectedDate('')
      return
    }

    if (isClosedDay(dateVal)) {
      setDateError('⚠️ Il salone è chiuso nel giorno selezionato.')
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

    const salonException = salonExceptions.find(exc => dateVal >= exc.start_date && dateVal <= exc.end_date)
    if (salonException && !salonException.is_closed && (salonException.opening_time || salonException.closing_time)) {
      const customOpen = salonException.opening_time ? salonException.opening_time.slice(0, 5) : openingTime
      const customClose = salonException.closing_time ? salonException.closing_time.slice(0, 5) : closingTime
      setScheduleNotice(`⏰ Nota: In questa giornata è in vigore un orario speciale/prolungato: ${customOpen} - ${customClose}`)
    }

    if (isHolidayDate(dateVal)) {
      setHolidayNotice('🎉 Giorno Festivo: Gli orari del salone potrebbero subire variazioni o aperture straordinarie.')
    }
  }, [isClosedDay, isShopClosedPeriod, isHolidayDate, shopClosures, salonExceptions, openingTime, closingTime])

  useEffect(() => {
    if (editingAppointment) {
      const currentServiceIds = editingAppointment.appointment_services?.map(as => as.service_id || as.services?.id) || []
      
      const normalServices = services.filter(s => currentServiceIds.includes(s.id) && !extraServicesList.some(es => es.id === s.id))
      const matchedExtraServiceFound = services.find(s => currentServiceIds.includes(s.id) && extraServicesList.some(es => es.id === s.id))

      setSelectedServices(normalServices)

      if (matchedExtraServiceFound) {
        setAdminExtraMinutes(matchedExtraServiceFound.duration_minutes || 0)
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
        setNewClientPrefix('+39')
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
      setNewClientPrefix('+39')
      setNewClientPhone('')
      setDateError('')
      setHolidayNotice('')
      setScheduleNotice('')
    }
  }, [editingAppointment, services, activeBarbers, extraServicesList, userId, preselectedClient, handleDateChange])

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

  const baseServicesDuration = useMemo(() => {
    return selectedServices.reduce((acc, s) => acc + (s.duration_minutes || 0), 0)
  }, [selectedServices])

  const totalDuration = baseServicesDuration + (isAdmin ? Number(adminExtraMinutes) : 0)
  
  const totalPrice = useMemo(() => {
    const servicesTotal = selectedServices.reduce((acc, s) => {
      const priceToUse = (s.duration_minutes === 0 && customServicePrices[s.id] !== undefined && customServicePrices[s.id] !== '')
        ? parseFloat(customServicePrices[s.id])
        : parseFloat(s.price)
      return acc + (isNaN(priceToUse) ? 0 : priceToUse)
    }, 0)

    let extraPrice = 0
    if (isAdmin && adminExtraMinutes > 0) {
      const matchedExtra = extraServicesList.find(es => es.duration_minutes === Number(adminExtraMinutes)) || configuredExtraService
      extraPrice = matchedExtra ? parseFloat(matchedExtra.price || 0) : 0
    }

    return servicesTotal + extraPrice
  }, [selectedServices, customServicePrices, isAdmin, adminExtraMinutes, extraServicesList, configuredExtraService])

  const generateTimeSlots = useCallback(() => {
    if (!selectedDate || !selectedBarber) return []

    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()
    let targetOpening = null
    let targetClosing = null

    const salonException = salonExceptions.find(exc => selectedDate >= exc.start_date && selectedDate <= exc.end_date)
    if (salonException && !salonException.is_closed) {
      if (salonException.opening_time) targetOpening = salonException.opening_time.slice(0, 5)
      if (salonException.closing_time) targetClosing = salonException.closing_time.slice(0, 5)
    }

    const salonDay = salonWeeklyHours.find(w => w.day_of_week === dayOfWeek)
    const salonDefaultOpen = salonDay && salonDay.opening_time ? salonDay.opening_time.slice(0, 5) : openingTime
    const salonDefaultClose = salonDay && salonDay.closing_time ? salonDay.closing_time.slice(0, 5) : closingTime

    if (salonDay && salonDay.is_closed) return []

    const barberDays = barberWorkingDays.filter(wd => wd.barber_id === selectedBarber.id)

    if (barberDays.length > 0) {
      const specificBarberDay = barberDays.find(wd => wd.day_of_week === dayOfWeek)
      if (!specificBarberDay) return [] 

      if (!targetOpening) {
        targetOpening = specificBarberDay.start_time ? specificBarberDay.start_time.slice(0, 5) : salonDefaultOpen
      }
      if (!targetClosing) {
        targetClosing = specificBarberDay.end_time ? specificBarberDay.end_time.slice(0, 5) : salonDefaultClose
      }
    } else {
      if (!targetOpening) targetOpening = salonDefaultOpen
      if (!targetClosing) targetClosing = salonDefaultClose
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
  }, [selectedDate, selectedBarber, salonExceptions, barberWorkingDays, salonWeeklyHours, openingTime, closingTime, slotIntervalMinutes])

  const allTimeSlots = useMemo(() => generateTimeSlots(), [generateTimeSlots])

  const getAvailableBarbersForDate = useCallback((dateStr) => {
    if (!dateStr) return activeBarbers
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay()

    return activeBarbers.filter(barber => {
      if (barber.termination_date && dateStr > barber.termination_date) return false 

      const barberDays = barberWorkingDays.filter(wd => wd.barber_id === barber.id)
      if (barberDays.length > 0) {
        const worksOnThisDay = barberDays.some(wd => wd.day_of_week === dayOfWeek)
        if (!worksOnThisDay) return false
      } else {
        const salonDay = salonWeeklyHours.find(w => w.day_of_week === dayOfWeek)
        if (salonDay && salonDay.is_closed) return false
      }

      return true
    })
  }, [activeBarbers, barberWorkingDays, salonWeeklyHours])

  useEffect(() => {
    const fetchExistingAppointments = async () => {
      if (!selectedDate || !selectedBarber) {
        setExistingAppointments([])
        return
      }
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

    fetchExistingAppointments()
  }, [selectedDate, selectedBarber, editingAppointment])

  const isBarberAvailableAtSlot = useCallback((slot) => {
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
  }, [selectedBarber, selectedDate, barberExceptions, totalDuration, slotIntervalMinutes])

  const isSlotAvailable = useCallback((slot) => {
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
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay()

    const salonException = salonExceptions.find(exc => selectedDate >= exc.start_date && selectedDate <= exc.end_date)
    const salonDay = salonWeeklyHours.find(w => w.day_of_week === dayOfWeek)
    const salonDefaultClose = salonDay && salonDay.closing_time ? salonDay.closing_time.slice(0, 5) : closingTime

    if (salonException && salonException.closing_time) {
      targetClosing = salonException.closing_time.slice(0, 5)
    } else if (selectedBarber) {
      const barberDays = barberWorkingDays.filter(wd => wd.barber_id === selectedBarber.id)
      if (barberDays.length > 0) {
        const wd = barberDays.find(w => w.day_of_week === dayOfWeek)
        if (wd && wd.end_time) {
          targetClosing = wd.end_time.slice(0, 5)
        } else {
          targetClosing = salonDefaultClose
        }
      } else {
        targetClosing = salonDefaultClose
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
  }, [selectedDate, todayString, isBarberAvailableAtSlot, totalDuration, slotIntervalMinutes, closingTime, salonExceptions, selectedBarber, barberWorkingDays, salonWeeklyHours, existingAppointments])

  async function handleConfirmBooking() {
    if (isSubmitting) return 

    if (!selectedDate || !selectedBarber || !selectedTime || selectedServices.length === 0) {
      alert("Seleziona tutti i campi obbligatori e almeno un servizio.")
      return
    }

    setIsSubmitting(true) 

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
        const matchingExtraService = extraServicesList.find(es => es.duration_minutes === Number(adminExtraMinutes)) || configuredExtraService
        if (matchingExtraService && !servicesToSave.some(s => s.id === matchingExtraService.id)) {
          servicesToSave.push(matchingExtraService)
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
              setIsSubmitting(false)
              return
            }
            
            const fullPhone = newClientPhone.trim() ? `${newClientPrefix} ${newClientPhone.trim()}` : 'N/D'

            const { data: newOff, error: offErr } = await supabase
              .from('offline_clients')
              .insert([{ full_name: newClientName.trim(), phone: fullPhone }])
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
            setIsSubmitting(false)
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
    } finally {
      setIsSubmitting(false) 
    }
  }

  return (
    <div style={{
      position: 'relative',
      zIndex: 1,
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      paddingBottom: '80px',
      padding: '4px',
      color: 'var(--text-main)'
    }}>
      {editingAppointment && (
        <div style={{ 
          backgroundColor: 'rgba(37, 99, 235, 0.15)', padding: '14px 18px', borderRadius: '12px', marginBottom: '24px', 
          border: '1px solid var(--accent-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent-color)', fontSize: '0.9rem' }}>
            ✏️ Modifica dell'appuntamento esistente
          </span>
          <button onClick={onCancelEdit} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textDecoration: 'underline' }}>
            Annulla Modifica
          </button>
        </div>
      )}

      {isAdmin && (
        <div className="info-card" style={{ marginBottom: '24px', padding: '20px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-color)', display: 'block', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            👑 Seleziona Cliente per la Prenotazione:
          </label>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '14px' }}>
            <label style={{ color: 'var(--text-main)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
              <input type="radio" name="clientType" checked={selectedClientType === 'offline'} onChange={() => { setSelectedClientType('offline'); setSelectedClientId(''); }} />
              Cliente da Rubrica (Offline)
            </label>
            <label style={{ color: 'var(--text-main)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 600 }}>
              <input type="radio" name="clientType" checked={selectedClientType === 'app'} onChange={() => { setSelectedClientType('app'); setSelectedClientId(''); }} />
              Utente Registrato App
            </label>
          </div>

          {selectedClientType === 'offline' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={inputStyle}>
                <option value="">-- Seleziona un cliente dalla rubrica --</option>
                <option value="new">➕ Inserisci nuovo cliente occasionale</option>
                {offlineClients.map(c => (
                  <option key={c.id} value={c.id}>{c.full_name} {c.phone ? `(${c.phone})` : ''}</option>
                ))}
              </select>
              {selectedClientId === 'new' && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', background: '#11141b', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <input 
                    type="text" 
                    placeholder="Nome e Cognome cliente" 
                    value={newClientName} 
                    onChange={(e) => setNewClientName(e.target.value)} 
                    style={{ ...inputStyle, flex: 2, minWidth: '180px' }} 
                  />
                  
                  <div style={{ display: 'flex', gap: '6px', flex: 1.5, minWidth: '200px' }}>
                    <select 
                      value={newClientPrefix} 
                      onChange={(e) => setNewClientPrefix(e.target.value)} 
                      style={{ ...inputStyle, width: '90px', padding: '12px 6px', textAlign: 'center' }}
                    >
                      <option value="+39">+39 (IT)</option>
                      <option value="+41">+41 (CH)</option>
                      <option value="+33">+33 (FR)</option>
                      <option value="+49">+49 (DE)</option>
                      <option value="+44">+44 (UK)</option>
                      <option value="+34">+34 (ES)</option>
                      <option value="+1">+1 (US)</option>
                    </select>
                    
                    <input 
                      type="tel" 
                      placeholder="Telefono (Opzionale)" 
                      value={newClientPhone} 
                      onChange={(e) => setNewClientPhone(e.target.value)} 
                      style={{ ...inputStyle, flex: 1 }} 
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <select value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)} style={inputStyle}>
              <option value="">-- Seleziona utente registrato --</option>
              {appUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      <h3 className="section-title">
        1. Seleziona Servizi o Prodotti
      </h3>

      {(() => {
        const filteredServices = services.filter(s => {
          if (extraServicesList.some(es => es.id === s.id)) return false
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
              fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent-color)', marginBottom: '10px', 
              textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px',
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
                    border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                    backgroundColor: isSelected ? 'rgba(197, 160, 89, 0.1)' : '#181c24',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '8px',
                    boxShadow: isSelected ? '0 4px 10px rgba(0, 0, 0, 0.4)' : '0 1px 2px rgba(0,0,0,0.2)',
                    transition: 'all 0.15s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: '1.2' }}>{s.name}</strong>
                      <span style={{ color: 'var(--accent-color)', fontWeight: 800, fontSize: '0.95rem', whiteSpace: 'nowrap' }}>
                        {!isZeroDuration && `€${parseFloat(s.price).toFixed(2)}`}
                      </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
                      <span>{isZeroDuration && !isDiscountOrIntegration ? '📦 Prodotto' : isZeroDuration ? '' : `⏱ ${s.duration_minutes} min`}</span>
                      <span style={{ 
                        width: '16px', height: '16px', borderRadius: '50%', 
                        border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                        backgroundColor: isSelected ? 'var(--accent-color)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0f1115', fontSize: '10px', fontWeight: 700
                      }}>
                        {isSelected ? '✓' : ''}
                      </span>
                    </div>

                    {isSelected && isZeroDuration && isAdmin && (
                      <div onClick={(e) => e.stopPropagation()} style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px', background: '#11141b', padding: '6px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--accent-color)', fontWeight: 700 }}>€:</span>
                        <input
                          type="number" step="0.05" placeholder="Prezzo"
                          value={customServicePrices[s.id] !== undefined ? customServicePrices[s.id] : s.price}
                          onChange={(e) => handleCustomPriceChange(s.id, e.target.value)}
                          style={{ ...inputStyle, padding: '4px 8px', fontSize: '12px' }}
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
          {isAdmin && extraServicesList.length > 0 && (
            <div className="info-card" style={{ padding: '16px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <strong style={{ color: 'var(--accent-color)', fontSize: '0.9rem', display: 'block', marginBottom: '2px' }}>⏱️ Regolazione Durata Extra (Admin)</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Aggiunge minuti e costo basati sui servizi di extra time configurati.</span>
                </div>
                <select value={adminExtraMinutes} onChange={(e) => setAdminExtraMinutes(Number(e.target.value))} style={{ ...inputStyle, width: '220px', padding: '10px 12px' }}>
                  <option value={0}>Nessun extra (+0 min)</option>
                  {extraServicesList.map(es => (
                    <option key={es.id} value={es.duration_minutes}>
                      {es.name} (+{es.duration_minutes} min - €{parseFloat(es.price || 0).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div style={{ padding: '14px 18px', background: '#181c24', borderRadius: '12px', marginBottom: '24px', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--accent-color)' }}>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>
              Riepilogo: {totalDuration > 0 ? `${totalDuration} min` : 'Solo Prodotti'} | Totale: €{totalPrice.toFixed(2)}
            </strong>
          </div>

          <h3 className="section-title">
            2. Scegli la Data
          </h3>
          <div style={{ marginBottom: '24px' }}>
            <input type="date" min={todayString} value={selectedDate} onChange={e => handleDateChange(e.target.value)} style={{ ...inputStyle, border: holidayNotice || scheduleNotice ? '1px solid var(--accent-color)' : dateError ? '1px solid var(--danger-color)' : '1px solid var(--border-color)' }} />
            {dateError && <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--danger-color)' }}>{dateError}</div>}
            {scheduleNotice && <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(197, 160, 89, 0.15)', color: 'var(--accent-color)', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid var(--accent-color)' }}>{scheduleNotice}</div>}
            {holidayNotice && <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#fcd34d', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>{holidayNotice}</div>}
          </div>

          {selectedDate && !dateError && (
            <>
              <h3 className="section-title">
                3. Scegli l'Operatore
              </h3>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {loadingBarbers ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Caricamento operatori...</p>
                ) : getAvailableBarbersForDate(selectedDate).length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Nessun operatore disponibile in questa data.</p>
                ) : (
                  getAvailableBarbersForDate(selectedDate).map(b => (
                    <button key={b.id} onClick={() => setSelectedBarber(b)} style={{
                      flex: 1, minWidth: '140px', padding: '14px', borderRadius: '12px',
                      border: selectedBarber?.id === b.id ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                      backgroundColor: selectedBarber?.id === b.id ? 'rgba(197, 160, 89, 0.1)' : '#181c24',
                      color: 'var(--text-main)', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                      boxShadow: selectedBarber?.id === b.id ? '0 4px 12px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.2)'
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
              <h3 className="section-title">
                4. Seleziona Orario
              </h3>
              {loadingSlots ? <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Caricamento slot...</p> : (
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
                          border: isSelected ? '2px solid var(--accent-color)' : '1px solid var(--border-color)',
                          backgroundColor: !available ? 'rgba(239, 68, 68, 0.15)' : isSelected ? 'var(--accent-color)' : '#181c24',
                          color: !available ? '#fca5a5' : isSelected ? '#0f1115' : 'var(--text-main)',
                          cursor: !available ? 'not-allowed' : 'pointer',
                          fontWeight: isSelected || !available ? 700 : 500,
                          fontSize: '13px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '2px',
                          boxShadow: isSelected ? '0 4px 10px rgba(0,0,0,0.4)' : '0 1px 2px rgba(0,0,0,0.2)'
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

              <button 
                onClick={handleConfirmBooking} 
                disabled={!selectedTime || isSubmitting} 
                style={{
                  width: '100%', marginTop: '24px', padding: '14px', borderRadius: '12px', border: 'none',
                  backgroundColor: (!selectedTime || isSubmitting) ? 'var(--border-color)' : 'var(--accent-color)', 
                  color: (!selectedTime || isSubmitting) ? 'var(--text-muted)' : '#0f1115', 
                  fontWeight: 700, fontSize: '0.95rem', 
                  cursor: (!selectedTime || isSubmitting) ? 'not-allowed' : 'pointer',
                  boxShadow: (!selectedTime || isSubmitting) ? 'none' : '0 4px 12px rgba(0,0,0,0.4)',
                  opacity: isSubmitting ? 0.7 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isSubmitting 
                  ? "⏳ Elaborazione in corso..." 
                  : (editingAppointment ? "Salva Modifiche" : "Conferma Registrazione")
                }
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

const inputStyle = { 
  width: '100%', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', 
  backgroundColor: '#0f1115', color: '#f3f4f6', boxSizing: 'border-box', outline: 'none', fontSize: '13px'
}
