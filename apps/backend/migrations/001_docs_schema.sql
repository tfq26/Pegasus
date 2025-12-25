-- Documentation and Changelog Tables

-- Guides/Documentation table
CREATE TABLE IF NOT EXISTS guides (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    order_index INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Releases/Changelogs table
CREATE TABLE IF NOT EXISTS releases (
    id SERIAL PRIMARY KEY,
    version VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    date DATE NOT NULL,
    is_latest BOOLEAN DEFAULT false,
    published BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Release sections (New Features, Improvements, Bug Fixes)
CREATE TABLE IF NOT EXISTS release_sections (
    id SERIAL PRIMARY KEY,
    release_id INTEGER NOT NULL REFERENCES releases (id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- 'New Features', 'Improvements', 'Bug Fixes'
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Release items (individual changes within a section)
CREATE TABLE IF NOT EXISTS release_items (
    id SERIAL PRIMARY KEY,
    section_id INTEGER NOT NULL REFERENCES release_sections (id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    details TEXT [], -- Array of detail strings
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_guides_slug ON guides (slug);

CREATE INDEX IF NOT EXISTS idx_guides_published ON guides (published);

CREATE INDEX IF NOT EXISTS idx_releases_version ON releases (version);

CREATE INDEX IF NOT EXISTS idx_releases_is_latest ON releases (is_latest);

CREATE INDEX IF NOT EXISTS idx_releases_published ON releases (published);

CREATE INDEX IF NOT EXISTS idx_release_sections_release_id ON release_sections (release_id);

CREATE INDEX IF NOT EXISTS idx_release_items_section_id ON release_items (section_id);