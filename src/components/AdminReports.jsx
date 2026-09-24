import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminReports({ isOwner = false, salonSettings = {} }) {
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [stats, setStats] = useState({
    totalAppointments: 0,
    totalRevenue: 0,
    averageTicket: 0,
    totalRetailRevenue: 0,
    completedVisits: 0,
    barberRevenue: [], 
    serviceBreakdown: [] 
  })

  useEffect(() => {
    fetchReportData()
  }, [selectedMonth])

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount || 0)
  }

  async function fetchReportData() {
    setLoading(true)

    const [year, month] = selectedMonth.split('-').map(Number)
    
    // Inizio del mese corrente (es. 2026-09-01)
    const startOfPeriod = `${selectedMonth}-01`
    
    // Calcolo sicuro del primo giorno del mese successivo
    const nextMonthDate = new Date(year, month, 1)
    const nextYear = nextMonthDate.getFullYear()
    const nextMonthStr = String(nextMonthDate.getMonth() + 1).padStart(2, '0')
    const startOfNextPeriod = `${nextYear}-${nextMonthStr}-01`

    try {
      const { data: rawAppointments, error: appError } = await supabase
        .from('appointments')
        .select(`
          id,
          appointment_date,
          start_time,
          total_price,
          user_id,
          custom_client_name,
          barbers ( id, name ),
          profiles ( first_name, last_name, email ),
          appointment_services (
            service_id,
            price,
            services ( name, duration_minutes, type ) 
          )
        `)
        .gte('appointment_date', startOfPeriod)
        .lt('appointment_date', startOfNextPeriod)
        .neq('status', 'cancelled')

      if (appError) throw appError

      // FILTRAGGIO DINAMICO: Escludiamo gli appuntamenti futuri rispetto a data e ora attuali
      const now = new Date()
      const todayStr = now.toLocaleDateString('sv-SE') // Formato YYYY-MM-DD locale
      const currentHours = now.getHours()
      const currentMinutes = now.getMinutes()
      const currentTimeValue = currentHours * 60 + currentMinutes

      const appointments = (rawAppointments || []).filter(app => {
        if (!app.appointment_date) return false

        // Se la data è nel passato rispetto a oggi, è valida
        if (app.appointment_date < todayStr) return true

        // Se la data è futura rispetto a oggi, la scartiamo completamente
        if (app.appointment_date > todayStr) return false

        // Se ci troviamo esattamente nel giorno odierno, confrontiamo gli orari (start_time)
        if (app.appointment_date === todayStr) {
          if (!app.start_time) return true // Se non c'è orario per sicurezza lo includiamo o escludiamo (qui incluso)
          const [h, m] = app.start_time.split(':').map(Number)
          const appTimeValue = h * 60 + m
          // Consideriamo valido solo se l'orario d'inizio è minore o uguale all'orario attuale
          return appTimeValue <= currentTimeValue
        }

        return false
      })

      if (!appointments || appointments.length === 0) {
        setStats({
          totalAppointments: 0, totalRevenue: 0, averageTicket: 0, totalRetailRevenue: 0,
          completedVisits: 0, barberRevenue: [], serviceBreakdown: []
        })
        setLoading(false)
        return
      }

      const totalAppointments = appointments.length
      const totalRevenue = appointments.reduce((acc, curr) => acc + (parseFloat(curr.total_price) || 0), 0)
      
      const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0

      // I passaggi effettuati corrispondono al totale degli appuntamenti validi passati/in corso del mese
      const completedVisits = totalAppointments

      let totalRetailRevenue = 0
      const serviceMap = {}
      const barberMap = {}

      appointments.forEach(app => {
        const barberName = app.barbers?.name || 'Non Assegnato'
        const price = parseFloat(app.total_price) || 0

        if (!barberMap[barberName]) {
          barberMap[barberName] = { total: 0, retailCount: 0, retailTotal: 0 }
        }
        barberMap[barberName].total += price

        app.appointment_services?.forEach(as => {
          const serviceName = as.services?.name || 'Servizio Generico'
          const serviceType = as.services?.type || 'service'
          const servicePrice = parseFloat(as.price) || 0
          
          const isRetail = serviceType === 'product'

          if (!serviceMap[serviceName]) {
            serviceMap[serviceName] = { count: 0, totalRevenue: 0, isRetail: isRetail }
          }
          serviceMap[serviceName].count += 1
          serviceMap[serviceName].totalRevenue += servicePrice

          if (isRetail) {
            totalRetailRevenue += servicePrice
            barberMap[barberName].retailCount += 1
            barberMap[barberName].retailTotal += servicePrice
          }
        })
      })

      const serviceBreakdown = Object.entries(serviceMap)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => {
          if (a.isRetail !== b.isRetail) {
            return a.isRetail ? 1 : -1
          }
          return b.totalRevenue - a.totalRevenue
        })

      const barberRevenue = Object.entries(barberMap)
        .map(([name, data]) => ({
          name,
          ...data
        }))
        .sort((a, b) => b.total - a.total)

      setStats({
        totalAppointments, totalRevenue, averageTicket, totalRetailRevenue,
        completedVisits, barberRevenue, serviceBreakdown
      })

    } catch (err) {
      console.error('Errore nel report:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const maxBarberRevenue = stats.barberRevenue.length > 0 ? stats.barberRevenue[0].total : 1

  return (
    <div 
      style={{
        position: 'relative',
        zIndex: 1,
        '--primary-color': salonSettings.primary_color || '#2563eb',
        '--accent-color': salonSettings.accent_color || '#D4AF37',
        '--secondary-color': salonSettings.secondary_color || '#1E293B',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        padding: '4px'
      }}
    >
      {/* Header Sezione */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--secondary-color)', fontSize: '1.35rem', fontWeight: 700 }}>📊 Report & Statistiche</h2>
        <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>Analizza le performance finanziarie, la produttività dello staff e l'andamento dei servizi fino ad ora</p>
      </div>

      {/* Selettore Mese */}
      <div style={{ marginBottom: '24px', backgroundColor: '#ffffff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', borderLeft: '4px solid var(--primary-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '8px' }}>
          Seleziona Mese di Riferimento:
        </label>
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={inputStyle} />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontSize: '14px' }}>Caricamento dati in corso...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Griglia KPI / Statistiche */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
            {isOwner && (
              <div style={{ ...statCardStyle, borderLeft: '4px solid #16a34a' }}>
                <span style={statIconStyle}>💰</span>
                <span style={statLabelStyle}>Incasso Totale</span>
                <strong style={{ ...statValueStyle, color: '#16a34a' }}>{formatCurrency(stats.totalRevenue)}</strong>
              </div>
            )}

            <div style={{ ...statCardStyle, borderLeft: '4px solid var(--primary-color)' }}>
              <span style={statIconStyle}>🎟️</span>
              <span style={statLabelStyle}>Scontrino Medio</span>
              <strong style={{ ...statValueStyle, color: 'var(--primary-color)' }}>{formatCurrency(stats.averageTicket)}</strong>
            </div>

            <div style={{ ...statCardStyle, borderLeft: '4px solid var(--accent-color)' }}>
              <span style={statIconStyle}>🛍️</span>
              <span style={statLabelStyle}>Rivendita Mese</span>
              <strong style={{ ...statValueStyle, color: '#ca8a04' }}>{formatCurrency(stats.totalRetailRevenue)}</strong>
            </div>

            <div style={{ ...statCardStyle, borderLeft: '4px solid #64748b' }}>
              <span style={statIconStyle}>✂️</span>
              <span style={statLabelStyle}>Passaggi Effettuati</span>
              <strong style={{ ...statValueStyle, color: '#1e293b' }}>{stats.completedVisits}</strong>
            </div>
          </div>

          {/* Produttività Operatori */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={sectionHeaderStyle}>💈 Produttività Operatori & Rivendite</h3>
            {stats.barberRevenue.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Nessun dato disponibile per questo mese fino ad ora.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                {stats.barberRevenue.map((barber, index) => {
                  const percentage = maxBarberRevenue > 0 ? (barber.total / maxBarberRevenue) * 100 : 0
                  const isTop = index === 0

                  return (
                    <div key={barber.name} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>
                            {isTop && '👑 '} {barber.name}
                          </strong>
                          <span style={{ fontSize: '12px', color: '#64748b', marginLeft: '8px' }}>
                            ({barber.retailCount} prodotti | Incasso prod: {formatCurrency(barber.retailTotal)})
                          </span>
                        </div>
                        {isOwner ? (
                          <strong style={{ color: '#16a34a', fontSize: '1.05rem' }}>{formatCurrency(barber.total)}</strong>
                        ) : (
                          <span style={{ color: '#ca8a04', fontWeight: 'bold', fontSize: '0.9rem' }}>{barber.retailCount} prod.</span>
                        )}
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: isTop ? '#16a34a' : 'var(--primary-color)', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Servizi & Prodotti */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <h3 style={sectionHeaderStyle}>✂️ Servizi & Prodotti (Rivendita)</h3>
            {stats.serviceBreakdown.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>Nessun servizio o prodotto registrato questo mese fino ad ora.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {stats.serviceBreakdown.map((item) => (
                  <div key={item.name} style={listRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '18px' }}>{item.isRetail ? '🧴' : '✂️'}</span>
                      <div>
                        <strong style={{ color: '#1e293b', fontSize: '0.95rem', display: 'block' }}>{item.name}</strong>
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          Eseguito {item.count} {item.count === 1 ? 'volta' : 'volte'}
                        </span>
                      </div>
                    </div>
                    {isOwner ? (
                      <strong style={{ color: item.isRetail ? '#ca8a04' : 'var(--primary-color)', fontSize: '1rem' }}>
                        {formatCurrency(item.totalRevenue)}
                      </strong>
                    ) : (
                      <span style={{ color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                        {item.count} v.
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

const inputStyle = { 
  width: '100%', 
  padding: '11px 14px', 
  borderRadius: '8px', 
  border: '1px solid #cbd5e1', 
  backgroundColor: '#f8fafc', 
  color: '#1e293b', 
  fontSize: '14px', 
  outline: 'none', 
  boxSizing: 'border-box',
  transition: 'border-color 0.2s'
}

const statCardStyle = { 
  display: 'flex', 
  flexDirection: 'column', 
  alignItems: 'flex-start', 
  backgroundColor: '#ffffff', 
  border: '1px solid #e2e8f0', 
  borderRadius: '12px', 
  padding: '20px', 
  boxShadow: '0 1px 3px rgba(0,0,0,0.02)' 
}

const statIconStyle = { 
  fontSize: '22px', 
  marginBottom: '10px' 
}

const statLabelStyle = { 
  fontSize: '11px', 
  fontWeight: 600, 
  color: '#64748b', 
  textTransform: 'uppercase', 
  letterSpacing: '0.5px', 
  marginBottom: '4px' 
}

const statValueStyle = { 
  fontSize: '1.35rem',
  fontWeight: 700
}

const sectionHeaderStyle = { 
  fontSize: '1.1rem', 
  color: '#1e293b', 
  marginTop: 0, 
  marginBottom: '18px', 
  borderBottom: '1px solid #e2e8f0', 
  paddingBottom: '12px',
  fontWeight: 700
}

const listRowStyle = { 
  display: 'flex', 
  justifyContent: 'space-between', 
  alignItems: 'center', 
  padding: '12px 8px', 
  borderBottom: '1px solid #f1f5f9',
  borderRadius: '6px'
}
