import { neon } from '@neondatabase/serverless'

const DATABASE_URL = process.env.NEON_DATABASE_URL
if (!DATABASE_URL) {
    console.error('NEON_DATABASE_URL not set')
    process.exit(1)
}

const sql = neon(DATABASE_URL)

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        * {
            box-sizing: border-box;
        }
        
        .desktop-guide-container {
            position: relative;
            width: 100%;
            background: var(--background);
        }
        
        .guide-hero {
            position: relative;
            padding: 6rem 2rem 4rem;
            text-align: center;
            background: linear-gradient(180deg, 
                rgba(168, 85, 247, 0.05) 0%, 
                transparent 100%
            );
            border-bottom: 1px solid var(--border);
        }
        
        .guide-title {
            font-size: 3rem;
            font-weight: 900;
            color: var(--foreground);
            margin-bottom: 1rem;
            letter-spacing: -0.02em;
        }
        
        .guide-subtitle {
            font-size: 1.125rem;
            color: var(--muted-foreground);
            max-width: 600px;
            margin: 0 auto;
            line-height: 1.7;
        }
        
        .guide-content {
            max-width: 900px;
            margin: 0 auto;
            padding: 3rem 2rem;
        }
        
        .comparison-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            border-radius: 8px;
            overflow: hidden;
            background: var(--card);
            border: 1px solid var(--border);
            margin: 2rem 0;
        }
        
        .comparison-table thead {
            background: var(--muted);
        }
        
        .comparison-table th {
            padding: 1rem 1.5rem;
            text-align: left;
            font-size: 0.875rem;
            font-weight: 700;
            color: var(--foreground);
            border-bottom: 1px solid var(--border);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .comparison-table td {
            padding: 1rem 1.5rem;
            border-bottom: 1px solid var(--border);
            color: var(--muted-foreground);
            font-size: 0.9375rem;
        }
        
        .comparison-table tr:last-child td {
            border-bottom: none;
        }
        
        .comparison-table td:first-child {
            font-weight: 600;
            color: var(--foreground);
        }
        
        .feature-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            background: rgba(168, 85, 247, 0.1);
            border: 1px solid rgba(168, 85, 247, 0.2);
            color: #a855f7;
            font-weight: 600;
            font-size: 0.8125rem;
        }
        
        .section {
            margin: 3rem 0;
        }
        
        .section-title {
            font-size: 1.75rem;
            font-weight: 800;
            margin-bottom: 1rem;
            color: var(--foreground);
            letter-spacing: -0.01em;
        }
        
        .section-text {
            font-size: 1rem;
            line-height: 1.75;
            color: var(--muted-foreground);
            margin-bottom: 1rem;
        }
        
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
        }
        
        .feature-card {
            padding: 1.5rem;
            border-radius: 8px;
            background: var(--card);
            border: 1px solid var(--border);
            transition: all 0.2s ease;
        }
        
        .feature-card:hover {
            border-color: rgba(168, 85, 247, 0.4);
            transform: translateY(-2px);
        }
        
        .feature-icon {
            width: 40px;
            height: 40px;
            border-radius: 6px;
            background: rgba(168, 85, 247, 0.1);
            border: 1px solid rgba(168, 85, 247, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 1rem;
            color: #a855f7;
            font-weight: 700;
            font-size: 1.125rem;
        }
        
        .feature-card h3 {
            font-size: 1.125rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            color: var(--foreground);
        }
        
        .feature-card p {
            color: var(--muted-foreground);
            line-height: 1.6;
            font-size: 0.9375rem;
        }
        
        .tech-list {
            display: grid;
            gap: 0.75rem;
            margin: 1.5rem 0;
        }
        
        .tech-item {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
        }
        
        .tech-bullet {
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #a855f7;
            margin-top: 0.5rem;
            flex-shrink: 0;
        }
        
        .tech-item strong {
            color: var(--foreground);
            font-weight: 600;
        }
        
        .cta-section {
            margin-top: 4rem;
            padding: 3rem 2rem;
            border-radius: 8px;
            background: var(--card);
            border: 1px solid var(--border);
            text-align: center;
        }
        
        .cta-title {
            font-size: 2rem;
            font-weight: 900;
            margin-bottom: 0.75rem;
            color: var(--foreground);
            letter-spacing: -0.01em;
        }
        
        .cta-text {
            font-size: 1.125rem;
            color: var(--muted-foreground);
            margin-bottom: 2rem;
        }
        
        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 2rem;
            border-radius: 6px;
            background: #a855f7;
            color: white;
            font-weight: 600;
            font-size: 1rem;
            text-decoration: none;
            transition: all 0.2s ease;
            border: none;
        }
        
        .cta-button:hover {
            background: #9333ea;
            transform: translateY(-1px);
        }
        
        .badge {
            display: inline-block;
            padding: 0.25rem 0.75rem;
            border-radius: 4px;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .badge-pro {
            background: rgba(168, 85, 247, 0.1);
            color: #a855f7;
            border: 1px solid rgba(168, 85, 247, 0.2);
        }
    </style>
</head>
<body>
    <div class="desktop-guide-container">
        <div class="guide-hero">
            <h1 class="guide-title">Introducing Pegasus Desktop</h1>
            <p class="guide-subtitle">
                Native performance meets cloud power. Experience database analytics with unprecedented speed and seamless offline capabilities.
            </p>
        </div>
        
        <div class="guide-content">
            <div class="section">
                <h2 class="section-title">Why Desktop?</h2>
                <p class="section-text">
                    Pegasus Desktop brings native OS integration and performance optimizations that web browsers simply cannot match. 
                    Built with Tauri and Rust, it delivers a secure, lightweight, and blazingly fast experience while maintaining 
                    full cloud synchronization.
                </p>
            </div>
            
            <table class="comparison-table">
                <thead>
                    <tr>
                        <th>Feature</th>
                        <th>Web Version</th>
                        <th>Desktop App</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Performance</td>
                        <td>Browser-based</td>
                        <td><span class="feature-badge">Native Speed</span></td>
                    </tr>
                    <tr>
                        <td>Offline Access</td>
                        <td>Limited</td>
                        <td><span class="feature-badge">Full Offline</span></td>
                    </tr>
                    <tr>
                        <td>OS Integration</td>
                        <td>Web standards</td>
                        <td><span class="feature-badge">Native Menus</span></td>
                    </tr>
                    <tr>
                        <td>Auto Updates</td>
                        <td>Browser cache</td>
                        <td><span class="feature-badge">In-App Updates</span></td>
                    </tr>
                    <tr>
                        <td>Security</td>
                        <td>Browser sandbox</td>
                        <td><span class="feature-badge">Rust Security</span></td>
                    </tr>
                    <tr>
                        <td>Bundle Size</td>
                        <td>Downloads on demand</td>
                        <td><span class="feature-badge">~3MB Install</span></td>
                    </tr>
                </tbody>
            </table>
            
            <div class="section">
                <h2 class="section-title">Key Features</h2>
                
                <div class="feature-grid">
                    <div class="feature-card">
                        <div class="feature-icon">UI</div>
                        <h3>Adaptive Interface</h3>
                        <p>Automatically switches between web and desktop UI modes for the perfect experience in any environment.</p>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">⚡</div>
                        <h3>Instant Startup</h3>
                        <p>Launch in under 500ms with native performance that's 10x faster than web page loads.</p>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">🔒</div>
                        <h3>Rust Security</h3>
                        <p>Enterprise-grade protection built on Tauri's Rust foundation for maximum data safety.</p>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">☁️</div>
                        <h3>Cloud Sync</h3>
                        <p>Seamless synchronization of dashboards, queries, and settings across all devices.</p>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">OS</div>
                        <h3>Cross-Platform</h3>
                        <p>Native builds for macOS, Windows, and Linux with consistent UX everywhere.</p>
                    </div>
                    
                    <div class="feature-card">
                        <div class="feature-icon">🎨</div>
                        <h3>System Theming</h3>
                        <p>Automatically adapts to your OS theme preferences with smooth transitions.</p>
                    </div>
                </div>
            </div>
            
            <div class="section">
                <h2 class="section-title">Technical Architecture</h2>
                <p class="section-text">
                    Built with modern technology that prioritizes performance and security:
                </p>
                <div class="tech-list">
                    <div class="tech-item">
                        <div class="tech-bullet"></div>
                        <div><strong>Tauri + Rust:</strong> Native performance with memory safety and minimal overhead</div>
                    </div>
                    <div class="tech-item">
                        <div class="tech-bullet"></div>
                        <div><strong>Vue 3:</strong> Reactive UI with composition API for maintainable code</div>
                    </div>
                    <div class="tech-item">
                        <div class="tech-bullet"></div>
                        <div><strong>~3MB Bundle:</strong> 97% smaller than equivalent Electron applications</div>
                    </div>
                    <div class="tech-item">
                        <div class="tech-bullet"></div>
                        <div><strong>50MB RAM:</strong> 90% less memory usage compared to web-based alternatives</div>
                    </div>
                    <div class="tech-item">
                        <div class="tech-bullet"></div>
                        <div><strong>Cold Start:</strong> Launch to fully interactive in under 500 milliseconds</div>
                    </div>
                </div>
            </div>
            
            <div class="cta-section">
                <h2 class="cta-title">Ready for Native Performance?</h2>
                <p class="cta-text">
                    Download Pegasus Desktop and experience the future of database analytics
                </p>
                <a href="/download" class="cta-button">
                    <span>Download Now</span>
                    <span>→</span>
                </a>
            </div>
        </div>
    </div>
</body>
</html>
`

async function updateDesktopGuide() {
    try {
        console.log('Updating desktop guide with refined design...')

        await sql`
            UPDATE guides
            SET content = ${htmlContent},
                content_type = 'html',
                updated_at = CURRENT_TIMESTAMP
            WHERE slug = 'introducing-desktop-app'
        `

        console.log('✓ Guide updated successfully')
    } catch (error) {
        console.error('Error:', error.message)
        process.exit(1)
    }
}

updateDesktopGuide()
