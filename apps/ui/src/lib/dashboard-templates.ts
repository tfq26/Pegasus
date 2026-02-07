export interface DashboardTemplate {
    id: string
    name: string
    description: string
    coverImage: string // CSS Gradient or URL
    workflow: string
    colorTheme: string
    initialData: any
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
    {
        id: 'titan',
        name: 'Titan',
        description: 'Dense financial monitoring and stable market analysis.',
        coverImage: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'Finance & Trading',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'Market Overview',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'S&P 500 (Mock)',
                        config: { value: 5432.12, label: 'Standard & Poor Index', trend: '+1.2%' }
                    },
                    {
                        id: 'el-2',
                        type: 'line',
                        title: 'Price Action - 24h (Mock)',
                        config: {
                            options: {
                                scales: {
                                    y: { beginAtZero: false }
                                }
                            },
                            data: {
                                labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'],
                                datasets: [{
                                    label: 'Price (USD)',
                                    data: [5380, 5395, 5410, 5405, 5432, 5430],
                                    borderColor: '#10b981',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    fill: true,
                                    tension: 0.4
                                }]
                            }
                        }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Market Sentiment (Mock)',
                        config: { value: 'Bullish', label: 'Fear & Greed Index' }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 4, h: 6 },
                    { i: 'el-2', x: 4, y: 0, w: 8, h: 12 },
                    { i: 'el-3', x: 0, y: 6, w: 4, h: 6 }
                ]
            }]
        }
    },
    {
        id: 'europa',
        name: 'Europa',
        description: 'Deep infrastructure monitoring and mission-critical health.',
        coverImage: 'linear-gradient(135deg, #1e3a8a 0%, #172554 50%, #1e40af 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'DevOps & IT',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'System Health',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'Server Uptime (Mock)',
                        config: { value: '99.98%', label: 'All Regions', status: 'healthy' }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Active Incidents (Mock)',
                        config: { value: 0, label: 'Last 24 hours' }
                    },
                    {
                        id: 'el-2',
                        type: 'line',
                        title: 'Request Latency (Mock)',
                        config: {
                            options: {
                                scales: {
                                    y: { beginAtZero: true, title: { display: true, text: 'ms' } }
                                }
                            },
                            data: {
                                labels: ['1m', '2m', '3m', '4m', '5m', '6m', '7m', '8m', '9m', '10m'],
                                datasets: [{
                                    label: 'Latency (ms)',
                                    data: [42, 45, 48, 120, 55, 42, 40, 44, 46, 43],
                                    borderColor: '#3b82f6',
                                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                    fill: true,
                                    tension: 0.4
                                }]
                            }
                        }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 6, h: 6 },
                    { i: 'el-3', x: 6, y: 0, w: 6, h: 6 },
                    { i: 'el-2', x: 0, y: 6, w: 12, h: 14 }
                ]
            }]
        }
    },
    {
        id: 'ganymede',
        name: 'Ganymede',
        description: 'Large-scale marketing analytics and massive user acquisition.',
        coverImage: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #db2777 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'Marketing & SaaS',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'Growth Metrics',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'New Signups (Mock)',
                        config: { value: 1240, label: 'Last 7 Days', trend: '+15%' }
                    },
                    {
                        id: 'el-2',
                        type: 'bar',
                        title: 'Conversion Funnel (Mock)',
                        config: {
                            options: {
                                indexAxis: 'y',
                                plugins: { legend: { display: false } }
                            },
                            data: {
                                labels: ['Visitors', 'Trial', 'Paid', 'Expansion'],
                                datasets: [{
                                    label: 'Users',
                                    data: [10000, 2500, 800, 120],
                                    backgroundColor: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe']
                                }]
                            }
                        }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Acquisition Cost (Mock)',
                        config: { value: '$4.50', label: 'Average CAC' }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 4, h: 6 },
                    { i: 'el-2', x: 4, y: 0, w: 8, h: 18 },
                    { i: 'el-3', x: 0, y: 6, w: 4, h: 6 }
                ]
            }]
        }
    },
    {
        id: 'callisto',
        name: 'Callisto',
        description: 'Hardened security monitoring and ancient threat detection paradigms.',
        coverImage: 'linear-gradient(135deg, #064e3b 0%, #10b981 50%, #34d399 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'Security & Audit',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'Threat Intel',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'Threat Level (Mock)',
                        config: { value: 'Low', label: 'Overall Status', status: 'safe' }
                    },
                    {
                        id: 'el-2',
                        type: 'radar',
                        title: 'Vulnerability Analysis (Mock)',
                        config: {
                            options: {
                                scales: { r: { min: 0, max: 100 } }
                            },
                            data: {
                                labels: ['Network', 'API', 'Database', 'Auth', 'UI'],
                                datasets: [{
                                    label: 'Risk Score',
                                    data: [15, 25, 10, 5, 20],
                                    borderColor: '#6366f1',
                                    backgroundColor: 'rgba(99, 102, 241, 0.2)'
                                }]
                            }
                        }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Blocked Attacks (Mock)',
                        config: { value: 142, label: 'Past 24h', trend: '-12%' }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 4, h: 6 },
                    { i: 'el-2', x: 4, y: 0, w: 8, h: 18 },
                    { i: 'el-3', x: 0, y: 6, w: 4, h: 6 }
                ]
            }]
        }
    },
    {
        id: 'enceladus',
        name: 'Enceladus',
        description: 'Vibrant revenue tracking and high-value customer analytics.',
        coverImage: 'linear-gradient(135deg, #78350f 0%, #d97706 50%, #f59e0b 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'Revenue & CRM',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'Sales Dashboard',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'Monthly Revenue (Mock)',
                        config: { value: '$124.5k', label: 'vs $110k target', trend: '+14%' }
                    },
                    {
                        id: 'el-2',
                        type: 'bar',
                        title: 'Revenue by Channel (Mock)',
                        config: {
                            data: {
                                labels: ['Direct', 'Referral', 'Social', 'Email'],
                                datasets: [{
                                    label: 'Revenue',
                                    data: [55000, 32000, 18000, 19500],
                                    backgroundColor: '#f59e0b'
                                }]
                            }
                        }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Win Rate (Mock)',
                        config: { value: '32%', label: 'Qualified Leads' }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 4, h: 6 },
                    { i: 'el-2', x: 4, y: 0, w: 8, h: 12 },
                    { i: 'el-3', x: 0, y: 6, w: 4, h: 6 }
                ]
            }]
        }
    },
    {
        id: 'io',
        name: 'Io',
        description: 'Volcanic project tracking for high-velocity agile teams.',
        coverImage: 'linear-gradient(135deg, #0891b2 0%, #0e7490 50%, #155e75 100%)',
        workflow: 'TEMPLATE',
        colorTheme: 'Agile & PM',
        initialData: {
            pages: [{
                id: 'page-1',
                title: 'Sprint Tracking',
                order: 0,
                elements: [
                    {
                        id: 'el-1',
                        type: 'stat',
                        title: 'Sprint Progress (Mock)',
                        config: { value: '65%', label: '12 days remaining' }
                    },
                    {
                        id: 'el-2',
                        type: 'line',
                        title: 'Burndown Chart (Mock)',
                        config: {
                            data: {
                                labels: ['Day 1', 'Day 3', 'Day 5', 'Day 7', 'Day 9', 'Day 11'],
                                datasets: [
                                    {
                                        label: 'Ideal',
                                        data: [100, 80, 60, 40, 20, 0],
                                        borderColor: 'rgba(0,0,0,0.2)',
                                        borderDash: [5, 5],
                                        fill: false
                                    },
                                    {
                                        label: 'Actual',
                                        data: [100, 85, 70, 45, 30, 25],
                                        borderColor: '#06b6d4',
                                        backgroundColor: 'rgba(6, 182, 212, 0.1)',
                                        fill: true
                                    }
                                ]
                            }
                        }
                    },
                    {
                        id: 'el-3',
                        type: 'stat',
                        title: 'Velocity (Mock)',
                        config: { value: '42 pts', label: 'Average per sprint' }
                    }
                ],
                layout: [
                    { i: 'el-1', x: 0, y: 0, w: 4, h: 6 },
                    { i: 'el-2', x: 4, y: 0, w: 8, h: 12 },
                    { i: 'el-3', x: 0, y: 6, w: 4, h: 6 }
                ]
            }]
        }
    }
]
