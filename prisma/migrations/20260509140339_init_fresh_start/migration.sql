-- CreateTable
CREATE TABLE "owners" (
    "uid" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owners_pkey" PRIMARY KEY ("uid")
);

-- CreateTable
CREATE TABLE "dreamers" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "alias" TEXT,
    "preferred_states" JSONB,
    "preferred_games" JSONB,
    "preferred_draw_times" JSONB,
    "is_guest" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dreamers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dream_entries" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "dream_date" VARCHAR(10) NOT NULL,
    "raw_text" TEXT NOT NULL,
    "cleaned_text" TEXT,
    "source_type" TEXT,
    "notes" TEXT,
    "all_numbers" JSONB,
    "term_mappings" JSONB,
    "active_window_start" VARCHAR(10),
    "active_window_end" VARCHAR(10),
    "is_reviewed" BOOLEAN NOT NULL DEFAULT true,
    "imported_from" TEXT,
    "metadata" JSONB,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dream_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dream_terms" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dream_entry_id" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT NOT NULL,
    "related_terms" JSONB,
    "line_contexts" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dream_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dream_candidates" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dream_entry_id" TEXT NOT NULL,
    "dream_term_id" TEXT,
    "dreamer_id" TEXT NOT NULL,
    "term_label" TEXT,
    "normalized_term" TEXT,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "source" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dream_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "active_dream_windows" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dream_entry_id" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT NOT NULL,
    "game_type" TEXT NOT NULL,
    "active_start" VARCHAR(10) NOT NULL,
    "active_end" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "states_tracked" JSONB,
    "last_checked_at" TIMESTAMP(3),
    "last_hit_count" INTEGER NOT NULL DEFAULT 0,
    "new_hits_since_last_check" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "active_dream_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dream_hits" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dream_entry_id" TEXT,
    "source_dream_entry_id" TEXT,
    "active_window_id" TEXT,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT,
    "game_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draw_date" VARCHAR(10) NOT NULL,
    "draw_time" TEXT NOT NULL,
    "raw_result" TEXT,
    "normalized_result" TEXT NOT NULL,
    "result_boxed_key" TEXT,
    "hit_type" TEXT NOT NULL,
    "days_from_dream" INTEGER,
    "same_day" BOOLEAN NOT NULL DEFAULT false,
    "detected_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dream_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_dreams" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "dream_date" VARCHAR(10) NOT NULL,
    "raw_text" TEXT NOT NULL,
    "cleaned_text" TEXT,
    "source" TEXT,
    "confidence" TEXT,
    "notes" TEXT,
    "parse_result" JSONB,
    "parsed_term_mappings" JSONB,
    "cash3_numbers" JSONB,
    "cash4_numbers" JSONB,
    "archived_numbers" JSONB,
    "active_window_start" VARCHAR(10),
    "active_window_end" VARCHAR(10),
    "status" TEXT NOT NULL DEFAULT 'intake-saved',
    "replay_source" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_dreams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_windows" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "backtest_dream_id" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "dream_date" VARCHAR(10) NOT NULL,
    "active_window_start" VARCHAR(10),
    "active_window_end" VARCHAR(10),
    "lookahead_days" INTEGER NOT NULL DEFAULT 7,
    "term_mappings" JSONB,
    "cash3_numbers" JSONB,
    "cash4_numbers" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending-results',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_results" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "backtest_dream_id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "game_type" TEXT NOT NULL,
    "draw_time" TEXT NOT NULL,
    "raw_result" TEXT,
    "normalized_result" TEXT NOT NULL,
    "boxed_key" TEXT NOT NULL,
    "source_type" TEXT,
    "game_label" TEXT,
    "bonus_text" TEXT,
    "metadata" JSONB,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_hits" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "backtest_dream_id" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "dream_date" VARCHAR(10),
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT,
    "game_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draw_date" VARCHAR(10) NOT NULL,
    "draw_time" TEXT NOT NULL,
    "raw_result" TEXT,
    "normalized_result" TEXT NOT NULL,
    "result_boxed_key" TEXT,
    "hit_type" TEXT NOT NULL,
    "days_from_dream" INTEGER,
    "same_day" BOOLEAN NOT NULL DEFAULT false,
    "is_verified" BOOLEAN,
    "source_name" TEXT,
    "replay_source" TEXT,
    "canonical_key" TEXT,
    "is_suspected_misattributed" BOOLEAN NOT NULL DEFAULT false,
    "is_shadowed_by_corrected_mapping" BOOLEAN NOT NULL DEFAULT false,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "corrected_to" JSONB,
    "repair_metadata" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backtest_summaries" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "backtest_dream_id" TEXT NOT NULL,
    "dreamer_id" TEXT,
    "dream_date" VARCHAR(10),
    "total_hits" INTEGER NOT NULL DEFAULT 0,
    "straight_hits" INTEGER NOT NULL DEFAULT 0,
    "boxed_hits" INTEGER NOT NULL DEFAULT 0,
    "unique_states" JSONB,
    "best_state" TEXT,
    "best_term" TEXT,
    "status" TEXT,
    "replay_source" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backtest_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_hit_events" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT NOT NULL,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT,
    "game_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draw_date" VARCHAR(10) NOT NULL,
    "draw_time" TEXT NOT NULL,
    "hit_type" TEXT NOT NULL,
    "winning_number" TEXT,
    "normalized_result" TEXT,
    "source" TEXT,
    "source_context_id" TEXT NOT NULL,
    "source_dream_entry_id" TEXT,
    "active_window_id" TEXT,
    "backtest_dream_id" TEXT,
    "days_from_dream" INTEGER,
    "same_day" BOOLEAN NOT NULL DEFAULT false,
    "is_suspected_misattributed" BOOLEAN NOT NULL DEFAULT false,
    "is_shadowed_by_corrected_mapping" BOOLEAN NOT NULL DEFAULT false,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "corrected_to" JSONB,
    "repair_metadata" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_hit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_hit_mappings" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT NOT NULL,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT,
    "game_type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "draw_time" TEXT,
    "draw_date" VARCHAR(10),
    "last_hit_date" VARCHAR(10),
    "hit_type" TEXT,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "straight_count" INTEGER NOT NULL DEFAULT 0,
    "boxed_count" INTEGER NOT NULL DEFAULT 0,
    "state_strength_score" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT,
    "source_dream_entry_id" TEXT,
    "active_window_id" TEXT,
    "backtest_dream_id" TEXT,
    "days_from_dream" INTEGER,
    "same_day" BOOLEAN NOT NULL DEFAULT false,
    "is_suspected_misattributed" BOOLEAN NOT NULL DEFAULT false,
    "is_shadowed_by_corrected_mapping" BOOLEAN NOT NULL DEFAULT false,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "corrected_to" JSONB,
    "repair_metadata" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personal_hit_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_number_mappings" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT NOT NULL,
    "dreamer_id" TEXT NOT NULL,
    "dreamer_name" TEXT,
    "term_label" TEXT NOT NULL,
    "normalized_term" TEXT NOT NULL,
    "number_text" TEXT NOT NULL,
    "boxed_key" TEXT,
    "game_type" TEXT NOT NULL,
    "source" TEXT,
    "confidence_basis" TEXT,
    "raw_context" TEXT,
    "dream_entry_id" TEXT,
    "source_dream_entry_id" TEXT,
    "backtest_dream_id" TEXT,
    "dream_date" VARCHAR(10),
    "is_suspected_misattributed" BOOLEAN NOT NULL DEFAULT false,
    "is_shadowed_by_corrected_mapping" BOOLEAN NOT NULL DEFAULT false,
    "is_deprecated" BOOLEAN NOT NULL DEFAULT false,
    "corrected_to" JSONB,
    "repair_metadata" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_number_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engine_request_logs" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT,
    "request_type" TEXT NOT NULL,
    "route" TEXT,
    "engine_url" TEXT,
    "state" TEXT,
    "game_type" TEXT,
    "anchor_date" VARCHAR(10),
    "lookahead_days" INTEGER,
    "candidate_count" INTEGER,
    "status" TEXT NOT NULL,
    "status_code" INTEGER,
    "duration_ms" INTEGER,
    "error_message" TEXT,
    "request_payload" JSONB,
    "response_summary" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engine_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "owner_uid" TEXT,
    "actor_uid" TEXT,
    "action" TEXT NOT NULL,
    "scope" TEXT,
    "target_table" TEXT,
    "target_id" TEXT,
    "route" TEXT,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dreamers_owner_uid_idx" ON "dreamers"("owner_uid");

-- CreateIndex
CREATE INDEX "dreamers_owner_uid_display_name_idx" ON "dreamers"("owner_uid", "display_name");

-- CreateIndex
CREATE INDEX "dream_entries_owner_uid_idx" ON "dream_entries"("owner_uid");

-- CreateIndex
CREATE INDEX "dream_entries_owner_uid_dreamer_id_idx" ON "dream_entries"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "dream_entries_owner_uid_dream_date_idx" ON "dream_entries"("owner_uid", "dream_date");

-- CreateIndex
CREATE INDEX "dream_entries_owner_uid_dreamer_id_dream_date_idx" ON "dream_entries"("owner_uid", "dreamer_id", "dream_date");

-- CreateIndex
CREATE INDEX "dream_terms_owner_uid_idx" ON "dream_terms"("owner_uid");

-- CreateIndex
CREATE INDEX "dream_terms_owner_uid_dreamer_id_idx" ON "dream_terms"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "dream_terms_owner_uid_dream_entry_id_idx" ON "dream_terms"("owner_uid", "dream_entry_id");

-- CreateIndex
CREATE INDEX "dream_terms_owner_uid_normalized_term_idx" ON "dream_terms"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "dream_terms_owner_uid_dream_entry_id_normalized_term_key" ON "dream_terms"("owner_uid", "dream_entry_id", "normalized_term");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_idx" ON "dream_candidates"("owner_uid");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_dreamer_id_idx" ON "dream_candidates"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_dream_entry_id_idx" ON "dream_candidates"("owner_uid", "dream_entry_id");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_game_type_idx" ON "dream_candidates"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_number_text_idx" ON "dream_candidates"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "dream_candidates_owner_uid_boxed_key_idx" ON "dream_candidates"("owner_uid", "boxed_key");

-- CreateIndex
CREATE UNIQUE INDEX "dream_candidates_owner_uid_dream_entry_id_normalized_term_n_key" ON "dream_candidates"("owner_uid", "dream_entry_id", "normalized_term", "number_text", "game_type");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_idx" ON "active_dream_windows"("owner_uid");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_dreamer_id_idx" ON "active_dream_windows"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_dream_entry_id_idx" ON "active_dream_windows"("owner_uid", "dream_entry_id");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_is_active_active_end_idx" ON "active_dream_windows"("owner_uid", "is_active", "active_end");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_game_type_idx" ON "active_dream_windows"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_number_text_idx" ON "active_dream_windows"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_boxed_key_idx" ON "active_dream_windows"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "active_dream_windows_owner_uid_normalized_term_idx" ON "active_dream_windows"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "active_dream_windows_owner_uid_dream_entry_id_dreamer_id_no_key" ON "active_dream_windows"("owner_uid", "dream_entry_id", "dreamer_id", "normalized_term", "number_text", "game_type", "active_start", "active_end");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_idx" ON "dream_hits"("owner_uid");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_dreamer_id_idx" ON "dream_hits"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_dream_entry_id_idx" ON "dream_hits"("owner_uid", "dream_entry_id");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_source_dream_entry_id_idx" ON "dream_hits"("owner_uid", "source_dream_entry_id");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_active_window_id_idx" ON "dream_hits"("owner_uid", "active_window_id");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_state_idx" ON "dream_hits"("owner_uid", "state");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_game_type_idx" ON "dream_hits"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_draw_date_idx" ON "dream_hits"("owner_uid", "draw_date");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_number_text_idx" ON "dream_hits"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_boxed_key_idx" ON "dream_hits"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "dream_hits_owner_uid_normalized_term_idx" ON "dream_hits"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "dream_hits_owner_uid_source_dream_entry_id_dreamer_id_numbe_key" ON "dream_hits"("owner_uid", "source_dream_entry_id", "dreamer_id", "number_text", "game_type", "state", "draw_date", "draw_time", "hit_type", "normalized_result");

-- CreateIndex
CREATE INDEX "backtest_dreams_owner_uid_idx" ON "backtest_dreams"("owner_uid");

-- CreateIndex
CREATE INDEX "backtest_dreams_owner_uid_dreamer_id_idx" ON "backtest_dreams"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "backtest_dreams_owner_uid_dream_date_idx" ON "backtest_dreams"("owner_uid", "dream_date");

-- CreateIndex
CREATE INDEX "backtest_dreams_owner_uid_status_idx" ON "backtest_dreams"("owner_uid", "status");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_windows_backtest_dream_id_key" ON "backtest_windows"("backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_windows_owner_uid_idx" ON "backtest_windows"("owner_uid");

-- CreateIndex
CREATE INDEX "backtest_windows_owner_uid_dreamer_id_idx" ON "backtest_windows"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "backtest_windows_owner_uid_backtest_dream_id_idx" ON "backtest_windows"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_windows_owner_uid_dream_date_idx" ON "backtest_windows"("owner_uid", "dream_date");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_idx" ON "backtest_results"("owner_uid");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_backtest_dream_id_idx" ON "backtest_results"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_state_idx" ON "backtest_results"("owner_uid", "state");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_game_type_idx" ON "backtest_results"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_date_idx" ON "backtest_results"("owner_uid", "date");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_normalized_result_idx" ON "backtest_results"("owner_uid", "normalized_result");

-- CreateIndex
CREATE INDEX "backtest_results_owner_uid_boxed_key_idx" ON "backtest_results"("owner_uid", "boxed_key");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_results_owner_uid_backtest_dream_id_state_date_dra_key" ON "backtest_results"("owner_uid", "backtest_dream_id", "state", "date", "draw_time", "game_type", "normalized_result");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_idx" ON "backtest_hits"("owner_uid");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_dreamer_id_idx" ON "backtest_hits"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_backtest_dream_id_idx" ON "backtest_hits"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_state_idx" ON "backtest_hits"("owner_uid", "state");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_game_type_idx" ON "backtest_hits"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_draw_date_idx" ON "backtest_hits"("owner_uid", "draw_date");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_number_text_idx" ON "backtest_hits"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_boxed_key_idx" ON "backtest_hits"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "backtest_hits_owner_uid_normalized_term_idx" ON "backtest_hits"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_hits_owner_uid_backtest_dream_id_dreamer_id_normal_key" ON "backtest_hits"("owner_uid", "backtest_dream_id", "dreamer_id", "normalized_term", "number_text", "game_type", "state", "draw_date", "draw_time", "hit_type", "normalized_result");

-- CreateIndex
CREATE UNIQUE INDEX "backtest_summaries_backtest_dream_id_key" ON "backtest_summaries"("backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_summaries_owner_uid_idx" ON "backtest_summaries"("owner_uid");

-- CreateIndex
CREATE INDEX "backtest_summaries_owner_uid_dreamer_id_idx" ON "backtest_summaries"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "backtest_summaries_owner_uid_backtest_dream_id_idx" ON "backtest_summaries"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "backtest_summaries_owner_uid_status_idx" ON "backtest_summaries"("owner_uid", "status");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_idx" ON "personal_hit_events"("owner_uid");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_dreamer_id_idx" ON "personal_hit_events"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_source_dream_entry_id_idx" ON "personal_hit_events"("owner_uid", "source_dream_entry_id");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_active_window_id_idx" ON "personal_hit_events"("owner_uid", "active_window_id");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_backtest_dream_id_idx" ON "personal_hit_events"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_state_idx" ON "personal_hit_events"("owner_uid", "state");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_game_type_idx" ON "personal_hit_events"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_draw_date_idx" ON "personal_hit_events"("owner_uid", "draw_date");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_number_text_idx" ON "personal_hit_events"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_boxed_key_idx" ON "personal_hit_events"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "personal_hit_events_owner_uid_normalized_term_idx" ON "personal_hit_events"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "personal_hit_events_owner_uid_dreamer_id_normalized_term_nu_key" ON "personal_hit_events"("owner_uid", "dreamer_id", "normalized_term", "number_text", "game_type", "state", "draw_date", "draw_time", "hit_type", "source_context_id");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_idx" ON "personal_hit_mappings"("owner_uid");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_dreamer_id_idx" ON "personal_hit_mappings"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_source_dream_entry_id_idx" ON "personal_hit_mappings"("owner_uid", "source_dream_entry_id");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_active_window_id_idx" ON "personal_hit_mappings"("owner_uid", "active_window_id");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_backtest_dream_id_idx" ON "personal_hit_mappings"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_state_idx" ON "personal_hit_mappings"("owner_uid", "state");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_game_type_idx" ON "personal_hit_mappings"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_draw_date_idx" ON "personal_hit_mappings"("owner_uid", "draw_date");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_number_text_idx" ON "personal_hit_mappings"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_boxed_key_idx" ON "personal_hit_mappings"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "personal_hit_mappings_owner_uid_normalized_term_idx" ON "personal_hit_mappings"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "personal_hit_mappings_owner_uid_dreamer_id_normalized_term__key" ON "personal_hit_mappings"("owner_uid", "dreamer_id", "normalized_term", "number_text", "game_type", "state");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_idx" ON "term_number_mappings"("owner_uid");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_dreamer_id_idx" ON "term_number_mappings"("owner_uid", "dreamer_id");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_dream_entry_id_idx" ON "term_number_mappings"("owner_uid", "dream_entry_id");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_source_dream_entry_id_idx" ON "term_number_mappings"("owner_uid", "source_dream_entry_id");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_backtest_dream_id_idx" ON "term_number_mappings"("owner_uid", "backtest_dream_id");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_game_type_idx" ON "term_number_mappings"("owner_uid", "game_type");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_number_text_idx" ON "term_number_mappings"("owner_uid", "number_text");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_boxed_key_idx" ON "term_number_mappings"("owner_uid", "boxed_key");

-- CreateIndex
CREATE INDEX "term_number_mappings_owner_uid_normalized_term_idx" ON "term_number_mappings"("owner_uid", "normalized_term");

-- CreateIndex
CREATE UNIQUE INDEX "term_number_mappings_owner_uid_dreamer_id_normalized_term_n_key" ON "term_number_mappings"("owner_uid", "dreamer_id", "normalized_term", "number_text", "game_type");

-- CreateIndex
CREATE INDEX "engine_request_logs_owner_uid_idx" ON "engine_request_logs"("owner_uid");

-- CreateIndex
CREATE INDEX "engine_request_logs_request_type_idx" ON "engine_request_logs"("request_type");

-- CreateIndex
CREATE INDEX "engine_request_logs_state_idx" ON "engine_request_logs"("state");

-- CreateIndex
CREATE INDEX "engine_request_logs_game_type_idx" ON "engine_request_logs"("game_type");

-- CreateIndex
CREATE INDEX "engine_request_logs_anchor_date_idx" ON "engine_request_logs"("anchor_date");

-- CreateIndex
CREATE INDEX "engine_request_logs_created_at_idx" ON "engine_request_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_owner_uid_idx" ON "audit_logs"("owner_uid");

-- CreateIndex
CREATE INDEX "audit_logs_actor_uid_idx" ON "audit_logs"("actor_uid");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_scope_idx" ON "audit_logs"("scope");

-- CreateIndex
CREATE INDEX "audit_logs_target_table_idx" ON "audit_logs"("target_table");

-- CreateIndex
CREATE INDEX "audit_logs_target_id_idx" ON "audit_logs"("target_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "dreamers" ADD CONSTRAINT "dreamers_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_entries" ADD CONSTRAINT "dream_entries_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_terms" ADD CONSTRAINT "dream_terms_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_terms" ADD CONSTRAINT "dream_terms_dream_entry_id_fkey" FOREIGN KEY ("dream_entry_id") REFERENCES "dream_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_candidates" ADD CONSTRAINT "dream_candidates_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_candidates" ADD CONSTRAINT "dream_candidates_dream_entry_id_fkey" FOREIGN KEY ("dream_entry_id") REFERENCES "dream_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_candidates" ADD CONSTRAINT "dream_candidates_dream_term_id_fkey" FOREIGN KEY ("dream_term_id") REFERENCES "dream_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_dream_windows" ADD CONSTRAINT "active_dream_windows_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "active_dream_windows" ADD CONSTRAINT "active_dream_windows_dream_entry_id_fkey" FOREIGN KEY ("dream_entry_id") REFERENCES "dream_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_hits" ADD CONSTRAINT "dream_hits_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_hits" ADD CONSTRAINT "dream_hits_dream_entry_id_fkey" FOREIGN KEY ("dream_entry_id") REFERENCES "dream_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dream_hits" ADD CONSTRAINT "dream_hits_active_window_id_fkey" FOREIGN KEY ("active_window_id") REFERENCES "active_dream_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_dreams" ADD CONSTRAINT "backtest_dreams_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_windows" ADD CONSTRAINT "backtest_windows_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_windows" ADD CONSTRAINT "backtest_windows_backtest_dream_id_fkey" FOREIGN KEY ("backtest_dream_id") REFERENCES "backtest_dreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_results" ADD CONSTRAINT "backtest_results_backtest_dream_id_fkey" FOREIGN KEY ("backtest_dream_id") REFERENCES "backtest_dreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_hits" ADD CONSTRAINT "backtest_hits_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_hits" ADD CONSTRAINT "backtest_hits_backtest_dream_id_fkey" FOREIGN KEY ("backtest_dream_id") REFERENCES "backtest_dreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_summaries" ADD CONSTRAINT "backtest_summaries_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backtest_summaries" ADD CONSTRAINT "backtest_summaries_backtest_dream_id_fkey" FOREIGN KEY ("backtest_dream_id") REFERENCES "backtest_dreams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_hit_events" ADD CONSTRAINT "personal_hit_events_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_hit_mappings" ADD CONSTRAINT "personal_hit_mappings_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_number_mappings" ADD CONSTRAINT "term_number_mappings_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engine_request_logs" ADD CONSTRAINT "engine_request_logs_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_owner_uid_fkey" FOREIGN KEY ("owner_uid") REFERENCES "owners"("uid") ON DELETE SET NULL ON UPDATE CASCADE;
