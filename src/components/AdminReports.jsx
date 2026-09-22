import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'

export function AdminReports({ isOwner = false }) {
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
    uniqueClients: 0,
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

    const [year, month] = selectedMonth.split('-')
    const startOfMonth = new Date(year, month - 1, 1).toISOString()
    const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString()

    try {
      const { data: appointments, error: appError } = await supabase
        .from('appointments')
        .select(`
          id,
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
        .gte('start_time', startOfMonth)
        .lte('start_time', endOfMonth)
        .neq('status', 'cancelled')

      if (appError) throw appError

      if (!appointments || appointments.length === 0) {
        setStats({
          totalAppointments: 0, totalRevenue: 0, averageTicket: 0, totalRetailRevenue: 0,
          uniqueClients: 0, barberRevenue: [], serviceBreakdown: []
        })
        setLoading(false)
        return
      }

      const totalAppointments = appointments.length
      const totalRevenue = appointments.reduce((acc, curr) => acc + (parseFloat(curr.total_price) || 0), 0)
      
      const averageTicket = totalAppointments > 0 ? totalRevenue / totalAppointments : 0

      let totalRetailRevenue = 0
      const serviceMap = {}

      // Mappa per tracciare le performance di rivendita per operatore
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

      const clientCounts = {}
      appointments.forEach(app => {
        let clientName = ''
        if (app.custom_client_name) {
          clientName = `${app.custom_client_name} (Manuale)`
        } else if (app.profiles) {
          const fullName = `${app.profiles.first_name || ''} ${app.profiles.last_name || ''}`.trim()
          clientName = fullName || app.profiles.email || 'Cliente Senza Nome'
        } else {
          clientName = 'Cliente Anonimo'
        }
        clientCounts[clientName] = true
      })
      const uniqueClients = Object.keys(clientCounts).length

      setStats({
        totalAppointments, totalRevenue, averageTicket, totalRetailRevenue,
        uniqueClients, barberRevenue, serviceBreakdown
      })

    } catch (err) {
      console.error('Errore nel report:', err.message)
    } finally {
      setLoading(false)
    }
  }

  const maxBarberRevenue = stats.barberRevenue.length > 0 ? stats.barberRevenue[0].total : 1

  return (
    <div className="booking-container">
      <h2 className="section-title">📊 Report & Statistiche</h2>

      <div className="info-card" style={{ marginBottom: '20px' }}>
        <label style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
          Seleziona Mese:
        </label>
        <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={inputStyle} />
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>Caricamento dati...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            {isOwner && (
              <div className="info-card" style={statCardStyle}>
                <span style={statIconStyle}>💰</span>
                <span style={statLabelStyle}>Incasso Totale</span>
                <strong style={{ ...statValueStyle, color: '#66BB6A' }}>{formatCurrency(stats.totalRevenue)}</strong>
              </div>
            )}

            <div className="info-card" style={statCardStyle}>
              <span style={statIconStyle}>🎟️</span>
              <span style={statLabelStyle}>Fiches Media</span>
              <strong style={{ ...statValueStyle, color: '#64B5F6' }}>{formatCurrency(stats.averageTicket)}</strong>
            </div>

            <div className="info-card" style={statCardStyle}>
              <span style={statIconStyle}>🛍️</span>
              <span style={statLabelStyle}>Rivendita Mese</span>
              <strong style={{ ...statValueStyle, color: '#FFD700' }}>{formatCurrency(stats.totalRetailRevenue)}</strong>
            </div>

            <div className="info-card" style={statCardStyle}>
              <span style={statIconStyle}>👥</span>
              <span style={statLabelStyle}>Clienti Serviti</span>
              <strong style={statValueStyle}>{stats.uniqueClients}</strong>
            </div>
          </div>

          <div className="info-card">
            <h3 style={sectionHeaderStyle}>💈 Produttività Operatori & Rivendite</h3>
            {stats.barberRevenue.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Nessun dato per questo mese.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {stats.barberRevenue.map((barber, index) => {
                  const percentage = maxBarberRevenue > 0 ? (barber.total / maxBarberRevenue) * 100 : 0
                  const isTop = index === 0

                  return (
                    <div key={barber.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ color: '#FFF', fontSize: '0.95rem' }}>
                            {isTop && '👑 '} {barber.name}
                          </strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>
                            ({barber.retailCount} prodotti venduti | Incasso prodotti: {formatCurrency(barber.retailTotal)})
                          </span>
                        </div>
                        {isOwner ? (
                          <strong style={{ color: '#66BB6A', fontSize: '1.05rem' }}>{formatCurrency(barber.total)}</strong>
                        ) : (
                          <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '0.9rem' }}>{barber.retailCount} prod.</span>
                        )}
                      </div>
                      <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${percentage}%`, height: '100%', backgroundColor: isTop ? '#66BB6A' : 'var(--barber-blue)', borderRadius: '3px', transition: 'width 0.4s ease' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="info-card">
            <h3 style={sectionHeaderStyle}>✂️ Servizi & Prodotti (Rivendita / Sconti)</h3>
            {stats.serviceBreakdown.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Nessun servizio o prodotto registrato questo mese.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.serviceBreakdown.map((item) => (
                  <div key={item.name} style={listRowStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{item.isRetail ? '🧴' : '✂️'}</span>
                      <div>
                        <strong style={{ color: '#FFF', fontSize: '0.95rem', display: 'block' }}>{item.name}</strong>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {item.count} {item.count === 1 ? 'volta' : 'volte'} eseguito
                        </span>
                      </div>
                    </div>
                    {isOwner ? (
                      <strong style={{ color: item.isRetail ? '#FFD700' : '#64B5F6', fontSize: '1rem' }}>
                        {formatCurrency(item.totalRevenue)}
                      </strong>
                    ) : (
                      <span style={{ color: '#64B5F6', fontWeight: 'bold', fontSize: '0.9rem' }}>
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

const inputStyle = { width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-color)', backgroundColor: 'rgba(24, 24, 24, 0.85)', color: '#FFF', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
const statCardStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '16px 12px' }
const statIconStyle = { fontSize: '24px', marginBottom: '6px' }
const statLabelStyle = { fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }
const statValueStyle = { fontSize: '1.4rem', color: '#FFFFFF' }
const sectionHeaderStyle = { fontSize: '1.0rem', color: '#FFF', marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }
const listRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }
