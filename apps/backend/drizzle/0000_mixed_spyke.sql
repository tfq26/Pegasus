CREATE TABLE "cell_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"spreadsheet_id" text NOT NULL,
	"cell_id" text NOT NULL,
	"data_source_id" uuid,
	"field_path" text,
	"last_value" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "cell_binding_spreadsheet_id_cell_id_unique" UNIQUE("spreadsheet_id","cell_id")
);
--> statement-breakpoint
CREATE TABLE "chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"title" text DEFAULT 'New Chat',
	"messages" jsonb DEFAULT '[]'::jsonb,
	"storage_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "connection_workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"connection_id" text NOT NULL,
	"workspace_data" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "connection_workspace_user_id_connection_id_unique" UNIQUE("user_id","connection_id")
);
--> statement-breakpoint
CREATE TABLE "connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid,
	"user_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_virtual" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "custom_tool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text,
	"url" text NOT NULL,
	"method" text DEFAULT 'GET',
	"headers" jsonb DEFAULT '{}'::jsonb,
	"parameters" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dashboard_element" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid,
	"type" text NOT NULL,
	"title" text,
	"config" jsonb,
	"query" text,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dashboard_permission" (
	"user_id" text NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"role" text NOT NULL,
	"alias" text,
	"can_share" boolean DEFAULT false,
	"can_download" boolean DEFAULT false,
	CONSTRAINT "dashboard_permission_user_id_dashboard_id_pk" PRIMARY KEY("user_id","dashboard_id")
);
--> statement-breakpoint
CREATE TABLE "dashboard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"owner_id" text,
	"is_public" boolean DEFAULT false,
	"cover_image" text,
	"config" jsonb,
	"messages" jsonb DEFAULT '[]'::jsonb,
	"storage_id" text,
	"snapshot_storage_id" text,
	"snapshot_config" jsonb,
	"last_snapshot_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb NOT NULL,
	"polling_interval" integer DEFAULT 300,
	"is_active" boolean DEFAULT true,
	"last_result" jsonb,
	"last_fetched" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "data_space" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text DEFAULT 'database',
	"color" text DEFAULT '#8B5CF6',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"is_default" boolean DEFAULT false,
	"is_personal" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"user_code" text NOT NULL,
	"status" text DEFAULT 'pending',
	"access_token" text,
	"user" jsonb,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "experimental_access" (
	"user_id" text PRIMARY KEY NOT NULL,
	"has_access" boolean DEFAULT false,
	"granted_at" timestamp DEFAULT now(),
	"granted_by" text
);
--> statement-breakpoint
CREATE TABLE "experimental_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"reason" text,
	"email" text,
	"status" text DEFAULT 'pending',
	"requested_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	"reviewed_by" text
);
--> statement-breakpoint
CREATE TABLE "file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"storage_id" text NOT NULL,
	"filename" text NOT NULL,
	"description" text,
	"size" bigint,
	"mime_type" text,
	"provider" text DEFAULT 'default',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunk" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"file_id" uuid,
	"note_id" uuid,
	"content" text,
	"embedding" vector(1536),
	"metadata" jsonb,
	"chunk_hash" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"dashboard_id" uuid,
	"dashboard_title" text,
	"type" text,
	"message" text,
	"sender" text,
	"is_read" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "query_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"query" text,
	"source" text,
	"model" text,
	"status" text,
	"connection_id" uuid,
	"tokens_used" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recent_access" (
	"user_id" text NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"accessed_at" timestamp DEFAULT now(),
	CONSTRAINT "recent_access_user_id_dashboard_id_pk" PRIMARY KEY("user_id","dashboard_id")
);
--> statement-breakpoint
CREATE TABLE "sanitization_metadata" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_table" text NOT NULL,
	"logical_name" text,
	"upload_id" text,
	"current_version" integer DEFAULT 1,
	"versions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "space_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid,
	"filename" text NOT NULL,
	"file_type" text,
	"storage_path" text,
	"file_size_bytes" integer DEFAULT 0,
	"parsed_schema" jsonb,
	"storage_id" text,
	"version" integer DEFAULT 1,
	"versions" jsonb DEFAULT '[]'::jsonb,
	"is_rag_indexed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "space_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid,
	"title" text NOT NULL,
	"content" text,
	"storage_id" text,
	"preview" text,
	"note_type" text DEFAULT 'general',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "space_permission" (
	"user_id" text NOT NULL,
	"space_id" uuid NOT NULL,
	"role" text NOT NULL,
	"alias" text,
	CONSTRAINT "space_permission_user_id_space_id_pk" PRIMARY KEY("user_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "space_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"config" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "spreadsheet_permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spreadsheet" text NOT NULL,
	"user_email" text NOT NULL,
	"access_level" text NOT NULL,
	"granted_by" text,
	"granted_at" timestamp DEFAULT now(),
	CONSTRAINT "spreadsheet_permission_spreadsheet_user_email_unique" UNIQUE("spreadsheet","user_email")
);
--> statement-breakpoint
CREATE TABLE "stock_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol" text,
	"date" text NOT NULL,
	"price" double precision NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"symbol" text NOT NULL,
	"name" text,
	"quantity" double precision NOT NULL,
	"price" double precision NOT NULL,
	"type" text NOT NULL,
	"date" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock" (
	"symbol" text PRIMARY KEY NOT NULL,
	"name" text,
	"price" double precision DEFAULT 0,
	"change" double precision DEFAULT 0,
	"change_percent" double precision DEFAULT 0,
	"volume" bigint DEFAULT 0,
	"market_cap" bigint DEFAULT 0,
	"is_real_data" boolean DEFAULT false,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "storage_credential" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"provider_type" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "storage_credential_user_id_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "transaction_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_session_id" text,
	"status" text,
	"type" text,
	"user_id" text,
	"customer_id" text,
	"payload" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "transaction_master_stripe_session_id_unique" UNIQUE("stripe_session_id")
);
--> statement-breakpoint
CREATE TABLE "user_feature_flag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"feature_id" text NOT NULL,
	"enabled" boolean DEFAULT false,
	"enabled_at" timestamp DEFAULT now(),
	CONSTRAINT "user_feature_flag_user_id_feature_id_unique" UNIQUE("user_id","feature_id")
);
--> statement-breakpoint
CREATE TABLE "user_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"amount" integer,
	"currency" text DEFAULT 'usd',
	"tokens" integer DEFAULT 0,
	"storage_bytes" integer DEFAULT 0,
	"description" text,
	"status" text,
	"stripe_payment_intent_id" text,
	"stripe_session_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_secret" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_secret_user_id_name_unique" UNIQUE("user_id","name")
);
--> statement-breakpoint
CREATE TABLE "pegasus_user" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"profile_picture_url" text,
	"subscription_tier" text DEFAULT 'free',
	"purchased_tokens" integer DEFAULT 0,
	"purchased_storage" integer DEFAULT 0,
	"storage_used" bigint DEFAULT 0,
	"storage_provider" text DEFAULT 'system',
	"stripe_customer_id" text DEFAULT '',
	"config" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "pegasus_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weather_cache" (
	"location" text PRIMARY KEY NOT NULL,
	"temp" double precision,
	"feels_like" double precision,
	"condition" text,
	"icon" text,
	"humidity" integer,
	"wind_speed" double precision,
	"forecast" jsonb,
	"cached_at" timestamp DEFAULT now(),
	"expires_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "cell_binding" ADD CONSTRAINT "cell_binding_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_binding" ADD CONSTRAINT "cell_binding_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection_workspace" ADD CONSTRAINT "connection_workspace_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_space_id_data_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."data_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connection" ADD CONSTRAINT "connection_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tool" ADD CONSTRAINT "custom_tool_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_element" ADD CONSTRAINT "dashboard_element_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_element" ADD CONSTRAINT "dashboard_element_created_by_pegasus_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."pegasus_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_permission" ADD CONSTRAINT "dashboard_permission_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_permission" ADD CONSTRAINT "dashboard_permission_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_owner_id_pegasus_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_source" ADD CONSTRAINT "data_source_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_space" ADD CONSTRAINT "data_space_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experimental_access" ADD CONSTRAINT "experimental_access_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experimental_request" ADD CONSTRAINT "experimental_request_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file" ADD CONSTRAINT "file_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_file_id_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunk" ADD CONSTRAINT "knowledge_chunk_note_id_space_note_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."space_note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "query_history" ADD CONSTRAINT "query_history_connection_id_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_access" ADD CONSTRAINT "recent_access_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recent_access" ADD CONSTRAINT "recent_access_dashboard_id_dashboard_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_file" ADD CONSTRAINT "space_file_space_id_data_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."data_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_note" ADD CONSTRAINT "space_note_space_id_data_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."data_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_permission" ADD CONSTRAINT "space_permission_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_permission" ADD CONSTRAINT "space_permission_space_id_data_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."data_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_source" ADD CONSTRAINT "space_source_space_id_data_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."data_space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spreadsheet_permission" ADD CONSTRAINT "spreadsheet_permission_granted_by_pegasus_user_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."pegasus_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history" ADD CONSTRAINT "stock_history_symbol_stock_symbol_fk" FOREIGN KEY ("symbol") REFERENCES "public"."stock"("symbol") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transaction" ADD CONSTRAINT "stock_transaction_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_credential" ADD CONSTRAINT "storage_credential_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_master" ADD CONSTRAINT "transaction_master_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feature_flag" ADD CONSTRAINT "user_feature_flag_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_payment" ADD CONSTRAINT "user_payment_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_secret" ADD CONSTRAINT "user_secret_user_id_pegasus_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."pegasus_user"("id") ON DELETE cascade ON UPDATE no action;