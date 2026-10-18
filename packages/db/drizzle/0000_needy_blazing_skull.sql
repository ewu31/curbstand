CREATE TYPE "public"."bid_status" AS ENUM('submitted', 'selected', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."completion_status" AS ENUM('pending', 'completed');--> statement-breakpoint
CREATE TYPE "public"."deposit_status" AS ENUM('pending', 'confirmed_manual', 'refunded_manual', 'forfeited_manual');--> statement-breakpoint
CREATE TYPE "public"."group_buy_status" AS ENUM('open', 'funding', 'matched', 'ready_for_pickup', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('individual', 'restaurant');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'producer', 'operator');--> statement-breakpoint
CREATE TABLE "bids" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_buy_id" uuid NOT NULL,
	"producer_id" uuid NOT NULL,
	"price_per_lb" numeric(10, 2) NOT NULL,
	"available_lbs" numeric(10, 2) NOT NULL,
	"availability_window_start" timestamp with time zone NOT NULL,
	"availability_window_end" timestamp with time zone NOT NULL,
	"notes" text,
	"status" "bid_status" DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_buy_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" varchar(80) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_buy_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_buy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_lbs" numeric(10, 2) NOT NULL,
	"deposit_amount" numeric(10, 2) NOT NULL,
	"deposit_status" "deposit_status" DEFAULT 'pending' NOT NULL,
	"completion_status" "completion_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_buys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produce_type" varchar(80) NOT NULL,
	"target_lbs" numeric(10, 2) NOT NULL,
	"pickup_location_id" uuid NOT NULL,
	"pickup_window_start" timestamp with time zone NOT NULL,
	"pickup_window_end" timestamp with time zone NOT NULL,
	"join_deadline" timestamp with time zone NOT NULL,
	"bid_deadline" timestamp with time zone NOT NULL,
	"status" "group_buy_status" DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"selected_bid_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text NOT NULL,
	"region" varchar(80) DEFAULT 'Seattle / Puget Sound' NOT NULL,
	"timezone" varchar(64) DEFAULT 'America/Los_Angeles' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "produce_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "produce_catalog_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "producer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"farm_name" varchar(200) NOT NULL,
	"produce_types" text[] NOT NULL,
	"service_radius_miles" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"name" varchar(200) NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text NOT NULL,
	"organization_type" "organization_type",
	"contact" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_producer_id_users_id_fk" FOREIGN KEY ("producer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participants" ADD CONSTRAINT "group_buy_participants_group_buy_id_group_buys_id_fk" FOREIGN KEY ("group_buy_id") REFERENCES "public"."group_buys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buy_participants" ADD CONSTRAINT "group_buy_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_buys" ADD CONSTRAINT "group_buys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;