import { pgTable, text, timestamp, boolean, uuid, integer, jsonb, primaryKey, vector, unique, doublePrecision, bigint } from "drizzle-orm/pg-core";

// --- Users ---
export const users = pgTable("pegasus_user", {
    id: text("id").primaryKey(), // WorkOS ID or 'dev_user'
    email: text("email").notNull().unique(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    profilePictureUrl: text("profile_picture_url"),
    subscriptionTier: text("subscription_tier").default("free"),
    purchasedTokens: integer("purchased_tokens").default(0),
    purchasedStorage: integer("purchased_storage").default(0),
    storageUsed: bigint("storage_used", { mode: "number" }).default(0),
    storageProvider: text("storage_provider").default("system"), // 'system', 'aws', 'gcp', 'azure'
    stripeCustomerId: text("stripe_customer_id").default(""),
    config: jsonb("config").default({}),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Data Spaces ---
export const dataSpaces = pgTable("data_space", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    description: text("description"),
    icon: text("icon").default("database"),
    color: text("color").default("#8B5CF6"),
    tags: jsonb("tags").default([]),
    isDefault: boolean("is_default").default(false),
    isPersonal: boolean("is_personal").default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Space Permissions ---
export const spacePermissions = pgTable("space_permission", {
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }).notNull(),
    role: text("role").notNull(), // 'owner', 'editor', 'viewer'
    alias: text("alias"),
}, (t) => ({
    pk: primaryKey({ columns: [t.userId, t.spaceId] }),
}));

// --- Dashboards ---
export const dashboards = pgTable("dashboard", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    ownerId: text("owner_id").references(() => users.id, { onDelete: 'cascade' }),
    isPublic: boolean("is_public").default(false),
    coverImage: text("cover_image"),
    config: jsonb("config"),
    messages: jsonb("messages").default([]),
    storageId: text("storage_id"), // Hybrid Storage
    snapshotStorageId: text("snapshot_storage_id"), // Full state snapshot in S3
    snapshotConfig: jsonb("snapshot_config"), // { mode: 'on_save' | 'scheduled', schedule: '...' }
    lastSnapshotAt: timestamp("last_snapshot_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Dashboard Elements ---
export const dashboardElements = pgTable("dashboard_element", {
    id: uuid("id").primaryKey().defaultRandom(),
    dashboardId: uuid("dashboard_id").references(() => dashboards.id, { onDelete: 'cascade' }),
    type: text("type").notNull(),
    title: text("title"),
    config: jsonb("config"),
    query: text("query"),
    createdBy: text("created_by").references(() => users.id),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Dashboard Permissions ---
export const dashboardPermissions = pgTable("dashboard_permission", {
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    dashboardId: uuid("dashboard_id").references(() => dashboards.id, { onDelete: 'cascade' }).notNull(),
    role: text("role").notNull(),
    alias: text("alias"),
    canShare: boolean("can_share").default(false),
    canDownload: boolean("can_download").default(false),
}, (t) => ({
    pk: primaryKey({ columns: [t.userId, t.dashboardId] }),
}));


// --- Device Codes (Desktop Auth) ---
export const deviceCodes = pgTable("device_code", {
    id: text("id").primaryKey(), // The device_code uuid
    userCode: text("user_code").notNull(),
    status: text("status").default("pending"),
    accessToken: text("access_token"),
    user: jsonb("user"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Knowledge Base (Vector support) ---
export const knowledgeChunks = pgTable("knowledge_chunk", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id),
    fileId: uuid("file_id").references(() => files.id, { onDelete: 'cascade' }),
    noteId: uuid("note_id").references(() => spaceNotes.id, { onDelete: 'cascade' }),
    content: text("content"),
    embedding: vector("embedding", { dimensions: 768 }),
    metadata: jsonb("metadata"),
    chunkHash: text("chunk_hash"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Connections ---
export const connections = pgTable("connection", {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'postgres', 'mongodb', etc.
    config: jsonb("config").notNull(),
    isVirtual: boolean("is_virtual").default(false),
    aiInsights: jsonb("ai_insights").default([]),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Space Sources ---
export const spaceSources = pgTable("space_source", {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Space Files ---
export const spaceFiles = pgTable("space_file", {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    filename: text("filename").notNull(),
    fileType: text("file_type"),
    storagePath: text("storage_path"),
    fileSizeBytes: integer("file_size_bytes").default(0),
    parsedSchema: jsonb("parsed_schema"),
    storageId: text("storage_id"), // Hybrid Storage
    version: integer("version").default(1),
    versions: jsonb("versions").default([]), // [{ version: 1, storageId: '...', createdAt: ... }]
    isRagIndexed: boolean("is_rag_indexed").default(false),
    aiInsights: jsonb("ai_insights").default([]),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Space Notes ---
export const spaceNotes = pgTable("space_note", {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    title: text("title").notNull(),
    content: text("content"),
    storageId: text("storage_id"), // Hybrid Storage: S3 Key
    preview: text("preview"), // First 200 chars for listing
    noteType: text("note_type").default("general"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

import { relations } from 'drizzle-orm';

export const dashboardRelations = relations(dashboards, ({ one, many }) => ({
    owner: one(users, {
        fields: [dashboards.ownerId],
        references: [users.id],
    }),
    elements: many(dashboardElements),
    permissions: many(dashboardPermissions),
}));

export const dashboardElementRelations = relations(dashboardElements, ({ one }) => ({
    dashboard: one(dashboards, {
        fields: [dashboardElements.dashboardId],
        references: [dashboards.id],
    }),
}));

export const dashboardPermissionRelations = relations(dashboardPermissions, ({ one }) => ({
    dashboard: one(dashboards, {
        fields: [dashboardPermissions.dashboardId],
        references: [dashboards.id],
    }),
    user: one(users, {
        fields: [dashboardPermissions.userId],
        references: [users.id],
    }),
}));

export const spaceRelations = relations(dataSpaces, ({ one, many }) => ({
    owner: one(users, {
        fields: [dataSpaces.userId],
        references: [users.id],
    }),
    permissions: many(spacePermissions),
    files: many(spaceFiles),
    notes: many(spaceNotes),
    connections: many(connections),
}));

export const spacePermissionRelations = relations(spacePermissions, ({ one }) => ({
    space: one(dataSpaces, {
        fields: [spacePermissions.spaceId],
        references: [dataSpaces.id],
    }),
    user: one(users, {
        fields: [spacePermissions.userId],
        references: [users.id],
    }),
}));

// --- Recent Access ---
export const recentAccess = pgTable("recent_access", {
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }).notNull(),
    dashboardId: uuid("dashboard_id").references(() => dashboards.id, { onDelete: 'cascade' }).notNull(),
    accessedAt: timestamp("accessed_at").defaultNow(),
}, (t) => ({
    pk: primaryKey({ columns: [t.userId, t.dashboardId] }),
}));

// --- Notifications ---
export const notifications = pgTable("notification", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    dashboardId: uuid("dashboard_id").references(() => dashboards.id, { onDelete: 'cascade' }),
    dashboardTitle: text("dashboard_title"),
    type: text("type"), // 'permission_change', 'mention', etc.
    message: text("message"),
    sender: text("sender"),
    isRead: boolean("is_read").default(false),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Experimental Features ---
export const experimentalRequests = pgTable("experimental_request", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    reason: text("reason"),
    email: text("email"),
    status: text("status").default('pending'), // 'pending', 'approved', 'rejected'
    requestedAt: timestamp("requested_at").defaultNow(),
    reviewedAt: timestamp("reviewed_at"),
    reviewedBy: text("reviewed_by"),
});

export const experimentalAccess = pgTable("experimental_access", {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    hasAccess: boolean("has_access").default(false),
    grantedAt: timestamp("granted_at").defaultNow(),
    grantedBy: text("granted_by"),
});

export const userFeatureFlags = pgTable("user_feature_flag", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    featureId: text("feature_id").notNull(),
    enabled: boolean("enabled").default(false),
    enabledAt: timestamp("enabled_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.userId, t.featureId),
}));

// --- Chat ---
export const chats = pgTable("chat", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    title: text("title").default('New Chat'),
    messages: jsonb("messages").default([]),
    connectionId: uuid("connection_id"),
    storageId: text("storage_id"), // Hybrid Storage
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Query History (AI Usage) ---
export const queryHistory = pgTable("query_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    spaceId: uuid("space_id").references(() => dataSpaces.id, { onDelete: 'cascade' }),
    query: text("query"),
    source: text("source"), // 'ai_generation', 'ai_analysis', etc.
    model: text("model"),
    status: text("status"), // 'success', 'error'
    connectionId: uuid("connection_id").references(() => connections.id, { onDelete: 'set null' }),
    tokensUsed: integer("tokens_used").default(0),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Data Sources (Live Sync) ---
export const dataSources = pgTable("data_source", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    type: text("type").notNull(),
    config: jsonb("config").notNull(),
    pollingInterval: integer("polling_interval").default(300),
    isActive: boolean("is_active").default(true),
    lastResult: jsonb("last_result"),
    lastFetched: timestamp("last_fetched"),
    error: text("error"),
    aiInsights: jsonb("ai_insights").default([]),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Cell Bindings ---
export const cellBindings = pgTable("cell_binding", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    spreadsheetId: text("spreadsheet_id").notNull(),
    cellId: text("cell_id").notNull(),
    dataSourceId: uuid("data_source_id").references(() => dataSources.id, { onDelete: 'cascade' }),
    fieldPath: text("field_path"),
    lastValue: text("last_value"),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.spreadsheetId, t.cellId),
}));

// --- Payments ---
export const userPayments = pgTable("user_payment", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    amount: integer("amount"), // in cents
    currency: text("currency").default('usd'),
    tokens: integer("tokens").default(0),
    storageBytes: integer("storage_bytes").default(0),
    description: text("description"),
    status: text("status"), // 'succeeded', 'pending', 'failed'
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeSessionId: text("stripe_session_id"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Workspace ---
export const connectionWorkspaces = pgTable("connection_workspace", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    connectionId: text("connection_id").notNull(), // Can be 'temp' or a UUID string
    workspaceData: jsonb("workspace_data").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.userId, t.connectionId),
}));

// --- Transactions ---
export const transactionMaster = pgTable("transaction_master", {
    id: uuid("id").primaryKey().defaultRandom(),
    stripeSessionId: text("stripe_session_id").unique(),
    status: text("status"), // 'pending', 'completed', 'failed'
    type: text("type"),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    customerId: text("customer_id"),
    payload: jsonb("payload"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Stocks ---
export const stocksTable = pgTable("stock", {
    symbol: text("symbol").primaryKey(),
    name: text("name"),
    price: doublePrecision("price").default(0),
    change: doublePrecision("change").default(0),
    changePercent: doublePrecision("change_percent").default(0),
    volume: bigint("volume", { mode: 'number' }).default(0),
    marketCap: bigint("market_cap", { mode: 'number' }).default(0),
    isRealData: boolean("is_real_data").default(false),
    lastUpdated: timestamp("last_updated").defaultNow(),
});

export const stockHistory = pgTable("stock_history", {
    id: uuid("id").primaryKey().defaultRandom(),
    symbol: text("symbol").references(() => stocksTable.symbol, { onDelete: 'cascade' }),
    date: text("date").notNull(),
    price: doublePrecision("price").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});

export const stockTransactions = pgTable("stock_transaction", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    symbol: text("symbol").notNull(),
    name: text("name"),
    quantity: doublePrecision("quantity").notNull(),
    price: doublePrecision("price").notNull(),
    type: text("type").notNull(), // 'BUY' or 'SELL'
    date: timestamp("date").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- Weather ---
export const weatherCache = pgTable("weather_cache", {
    location: text("location").primaryKey(),
    temp: doublePrecision("temp"),
    feelsLike: doublePrecision("feels_like"),
    condition: text("condition"),
    icon: text("icon"),
    humidity: integer("humidity"),
    windSpeed: doublePrecision("wind_speed"),
    forecast: jsonb("forecast"),
    cachedAt: timestamp("cached_at").defaultNow(),
    expiresAt: timestamp("expires_at"),
});

// --- Custom Tools ---
export const customTools = pgTable("custom_tool", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    description: text("description"),
    url: text("url").notNull(),
    method: text("method").default('GET'),
    headers: jsonb("headers").default({}),
    parameters: jsonb("parameters").default({}),
    createdAt: timestamp("created_at").defaultNow(),
});

// --- User Secrets ---
export const userSecrets = pgTable("user_secret", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    name: text("name").notNull(),
    value: text("value").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.userId, t.name),
}));

// --- Sanitization Metadata ---
export const sanitizationMetadata = pgTable("sanitization_metadata", {
    id: uuid("id").primaryKey().defaultRandom(),
    originalTable: text("original_table").notNull(),
    logicalName: text("logical_name"),
    uploadId: text("upload_id"),
    currentVersion: integer("current_version").default(1),
    versions: jsonb("versions").default([]),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

// --- Spreadsheet Permissions ---
export const spreadsheetPermissions = pgTable("spreadsheet_permission", {
    id: uuid("id").primaryKey().defaultRandom(),
    spreadsheet: text("spreadsheet").notNull(),
    userEmail: text("user_email").notNull(),
    accessLevel: text("access_level").notNull(), // 'view', 'edit'
    grantedBy: text("granted_by").references(() => users.id),
    grantedAt: timestamp("granted_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.spreadsheet, t.userEmail),
}));

// --- Storage ---
export const files = pgTable("file", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    storageId: text("storage_id").notNull(),
    filename: text("filename").notNull(),
    description: text("description"),
    size: bigint("size", { mode: "number" }),
    mimeType: text("mime_type"),
    provider: text("provider").default('default'), // 'default' or 'custom'
    createdAt: timestamp("created_at").defaultNow(),
});

export const storageCredentials = pgTable("storage_credential", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'cascade' }),
    providerType: text("provider_type").notNull(), // 's3', 'azure', 'gcp'
    name: text("name").notNull(),
    config: jsonb("config").notNull(),
    isEnabled: boolean("is_enabled").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
    unq: unique().on(t.userId, t.name),
}));
// --- Support ---
export const supportReports = pgTable("support_report", {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: 'set null' }),
    url: text("url"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    errorDetails: text("error_details"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow(),
});
