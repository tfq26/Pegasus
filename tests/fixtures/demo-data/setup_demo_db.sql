-- Demo Database Setup Script
-- Run this to create the demo SQLite database

-- Clients Table
CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    pan TEXT,
    risk_profile TEXT CHECK (
        risk_profile IN (
            'Conservative',
            'Moderate',
            'Moderately Aggressive',
            'Aggressive'
        )
    ),
    investment_horizon INTEGER, -- years
    kyc_status TEXT DEFAULT 'Verified',
    onboarding_date DATE,
    advisor_id INTEGER
);

-- Portfolio Goals Table
CREATE TABLE IF NOT EXISTS portfolio_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients (id),
    goal_name TEXT NOT NULL,
    target_amount REAL,
    current_value REAL,
    target_date DATE,
    monthly_sip REAL,
    priority TEXT CHECK (
        priority IN ('High', 'Medium', 'Low')
    ),
    status TEXT DEFAULT 'Active'
);

-- Transactions Table
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients (id),
    transaction_date DATE,
    fund_name TEXT,
    transaction_type TEXT CHECK (
        transaction_type IN (
            'Purchase',
            'Redemption',
            'Switch In',
            'Switch Out',
            'Dividend Reinvest',
            'SIP'
        )
    ),
    amount REAL,
    units REAL,
    nav REAL,
    folio_number TEXT,
    status TEXT DEFAULT 'Completed'
);

-- SIP Registrations Table
CREATE TABLE IF NOT EXISTS sip_registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER REFERENCES clients (id),
    fund_name TEXT,
    sip_amount REAL,
    sip_date INTEGER, -- day of month
    start_date DATE,
    end_date DATE,
    status TEXT CHECK (
        status IN (
            'Active',
            'Paused',
            'Completed',
            'Cancelled'
        )
    ),
    mandate_id TEXT
);

-- Insert Sample Clients
INSERT INTO
    clients (
        name,
        email,
        phone,
        pan,
        risk_profile,
        investment_horizon,
        onboarding_date,
        advisor_id
    )
VALUES (
        'Taufeeq Ali',
        'taufeeq@example.com',
        '+91-9876543210',
        'ABCDE1234F',
        'Moderately Aggressive',
        10,
        '2022-06-15',
        1
    ),
    (
        'Priya Sharma',
        'priya.sharma@example.com',
        '+91-9876543211',
        'FGHIJ5678K',
        'Moderate',
        7,
        '2023-01-20',
        1
    ),
    (
        'Rahul Verma',
        'rahul.v@example.com',
        '+91-9876543212',
        'KLMNO9012P',
        'Aggressive',
        15,
        '2021-03-10',
        1
    ),
    (
        'Anita Desai',
        'anita.d@example.com',
        '+91-9876543213',
        'QRSTU3456V',
        'Conservative',
        5,
        '2023-08-05',
        2
    ),
    (
        'Vikram Singh',
        'vikram.s@example.com',
        '+91-9876543214',
        'WXYZ78901A',
        'Moderate',
        8,
        '2022-11-12',
        2
    );

-- Insert Portfolio Goals
INSERT INTO
    portfolio_goals (
        client_id,
        goal_name,
        target_amount,
        current_value,
        target_date,
        monthly_sip,
        priority,
        status
    )
VALUES (
        1,
        'Retirement Corpus',
        50000000,
        4582450,
        '2040-01-01',
        45000,
        'High',
        'Active'
    ),
    (
        1,
        'Child Education',
        10000000,
        850000,
        '2035-06-01',
        15000,
        'High',
        'Active'
    ),
    (
        1,
        'House Down Payment',
        3000000,
        1200000,
        '2027-12-01',
        25000,
        'Medium',
        'Active'
    ),
    (
        2,
        'Retirement Fund',
        30000000,
        2150000,
        '2045-01-01',
        30000,
        'High',
        'Active'
    ),
    (
        2,
        'Vacation Fund',
        500000,
        180000,
        '2025-12-01',
        10000,
        'Low',
        'Active'
    ),
    (
        3,
        'Early Retirement',
        80000000,
        12500000,
        '2036-01-01',
        100000,
        'High',
        'Active'
    ),
    (
        4,
        'Emergency Fund',
        1000000,
        750000,
        '2025-06-01',
        20000,
        'High',
        'Active'
    ),
    (
        5,
        'Business Expansion',
        5000000,
        1800000,
        '2028-01-01',
        35000,
        'Medium',
        'Active'
    );

-- Insert Sample Transactions (2024)
INSERT INTO
    transactions (
        client_id,
        transaction_date,
        fund_name,
        transaction_type,
        amount,
        units,
        nav,
        folio_number,
        status
    )
VALUES (
        1,
        '2024-01-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        142.85,
        105.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-01-05',
        'Axis Midcap Fund',
        'SIP',
        10000,
        89.28,
        112.00,
        'AXIS-789012',
        'Completed'
    ),
    (
        1,
        '2024-01-05',
        'SBI Small Cap Fund',
        'SIP',
        8000,
        52.63,
        152.00,
        'SBI-345678',
        'Completed'
    ),
    (
        1,
        '2024-02-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        140.18,
        107.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-02-05',
        'Axis Midcap Fund',
        'SIP',
        10000,
        86.95,
        115.00,
        'AXIS-789012',
        'Completed'
    ),
    (
        1,
        '2024-02-05',
        'SBI Small Cap Fund',
        'SIP',
        8000,
        50.31,
        159.00,
        'SBI-345678',
        'Completed'
    ),
    (
        1,
        '2024-03-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        137.61,
        109.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-03-10',
        'Parag Parikh Flexi Cap',
        'Purchase',
        100000,
        1538.46,
        65.00,
        'PPFC-901234',
        'Completed'
    ),
    (
        1,
        '2024-04-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        135.13,
        111.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-05-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        132.74,
        113.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-06-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        130.43,
        115.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-06-15',
        'Quant Active Fund',
        'Purchase',
        50000,
        312.50,
        160.00,
        'QUANT-567890',
        'Completed'
    ),
    (
        1,
        '2024-07-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        128.20,
        117.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-08-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        126.05,
        119.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-09-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        123.96,
        121.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-09-20',
        'ABSL Frontline Equity',
        'Redemption',
        -75000,
        -535.71,
        140.00,
        'ABSL-234567',
        'Completed'
    ),
    (
        1,
        '2024-10-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        121.95,
        123.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-11-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        120.00,
        125.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        1,
        '2024-12-05',
        'HDFC Top 100 Fund',
        'SIP',
        15000,
        118.11,
        127.00,
        'HDFC-123456',
        'Completed'
    ),
    (
        2,
        '2024-01-10',
        'Mirae Asset Large Cap',
        'SIP',
        20000,
        166.66,
        120.00,
        'MIRAE-111111',
        'Completed'
    ),
    (
        2,
        '2024-02-10',
        'Mirae Asset Large Cap',
        'SIP',
        20000,
        163.93,
        122.00,
        'MIRAE-111111',
        'Completed'
    ),
    (
        2,
        '2024-03-10',
        'Mirae Asset Large Cap',
        'SIP',
        20000,
        161.29,
        124.00,
        'MIRAE-111111',
        'Completed'
    ),
    (
        3,
        '2024-01-15',
        'Quant Active Fund',
        'Purchase',
        200000,
        1250.00,
        160.00,
        'QUANT-222222',
        'Completed'
    ),
    (
        3,
        '2024-04-15',
        'Quant Active Fund',
        'Purchase',
        200000,
        1111.11,
        180.00,
        'QUANT-222222',
        'Completed'
    ),
    (
        3,
        '2024-07-15',
        'Kotak Emerging Equity',
        'Purchase',
        150000,
        1136.36,
        132.00,
        'KOTAK-333333',
        'Completed'
    );

-- Insert SIP Registrations
INSERT INTO
    sip_registrations (
        client_id,
        fund_name,
        sip_amount,
        sip_date,
        start_date,
        end_date,
        status,
        mandate_id
    )
VALUES (
        1,
        'HDFC Top 100 Fund',
        15000,
        5,
        '2022-07-01',
        '2032-07-01',
        'Active',
        'MND-001'
    ),
    (
        1,
        'Axis Midcap Fund',
        10000,
        5,
        '2022-07-01',
        '2032-07-01',
        'Active',
        'MND-002'
    ),
    (
        1,
        'SBI Small Cap Fund',
        8000,
        5,
        '2022-07-01',
        '2032-07-01',
        'Active',
        'MND-003'
    ),
    (
        1,
        'Parag Parikh Flexi Cap',
        12000,
        10,
        '2024-04-01',
        '2034-04-01',
        'Active',
        'MND-004'
    ),
    (
        2,
        'Mirae Asset Large Cap',
        20000,
        10,
        '2023-02-01',
        '2035-02-01',
        'Active',
        'MND-005'
    ),
    (
        2,
        'HDFC Flexi Cap Fund',
        10000,
        10,
        '2023-02-01',
        '2035-02-01',
        'Active',
        'MND-006'
    ),
    (
        3,
        'Quant Active Fund',
        50000,
        15,
        '2024-01-01',
        '2036-01-01',
        'Active',
        'MND-007'
    ),
    (
        3,
        'Kotak Emerging Equity',
        50000,
        15,
        '2024-07-01',
        '2036-07-01',
        'Active',
        'MND-008'
    ),
    (
        4,
        'UTI Nifty 50 Index',
        20000,
        1,
        '2023-09-01',
        '2025-09-01',
        'Active',
        'MND-009'
    ),
    (
        5,
        'Canara Robeco Bluechip',
        35000,
        20,
        '2022-12-01',
        '2028-12-01',
        'Active',
        'MND-010'
    );

-- Create Views for Analysis
CREATE VIEW IF NOT EXISTS v_client_portfolio_summary AS
SELECT
    c.id as client_id,
    c.name as client_name,
    c.risk_profile,
    COUNT(DISTINCT t.fund_name) as funds_held,
    SUM(
        CASE
            WHEN t.transaction_type IN (
                'Purchase',
                'SIP',
                'Switch In',
                'Dividend Reinvest'
            ) THEN t.amount
            ELSE 0
        END
    ) as total_invested,
    SUM(
        CASE
            WHEN t.transaction_type IN ('Redemption', 'Switch Out') THEN ABS(t.amount)
            ELSE 0
        END
    ) as total_redeemed
FROM clients c
    LEFT JOIN transactions t ON c.id = t.client_id
GROUP BY
    c.id,
    c.name,
    c.risk_profile;

CREATE VIEW IF NOT EXISTS v_monthly_sip_summary AS
SELECT
    strftime('%Y-%m', transaction_date) as month,
    fund_name,
    SUM(amount) as sip_amount,
    SUM(units) as units_purchased,
    AVG(nav) as avg_nav
FROM transactions
WHERE
    transaction_type = 'SIP'
GROUP BY
    strftime('%Y-%m', transaction_date),
    fund_name
ORDER BY month DESC;

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_transactions_client ON transactions (client_id);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date);

CREATE INDEX IF NOT EXISTS idx_goals_client ON portfolio_goals (client_id);