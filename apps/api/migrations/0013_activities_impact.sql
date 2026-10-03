CREATE TABLE activities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),report_id uuid NOT NULL REFERENCES reports(id),
 coordinator_id uuid REFERENCES users(id),coordinator_accepted_at timestamptz,publish_display_name boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),schedule_revision integer NOT NULL DEFAULT 1 CHECK(schedule_revision>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','registration_open','registration_closed','in_progress','awaiting_result','completed','on_hold','cancelled')),
 prior_state text CHECK(prior_state IN ('draft','registration_open','registration_closed','in_progress','awaiting_result')),
 hold_reason text,public_ever boolean NOT NULL DEFAULT false,data jsonb NOT NULL,
 result_outcome text CHECK(result_outcome IN ('partial','complete')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX activities_one_active_report_idx ON activities(report_id) WHERE status NOT IN ('completed','cancelled');
CREATE INDEX activities_public_idx ON activities(created_at DESC,id DESC) WHERE public_ever=true;
CREATE INDEX activities_coordinator_idx ON activities(coordinator_id,created_at DESC,id DESC);
CREATE TABLE activity_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES activities(id),user_id uuid NOT NULL REFERENCES users(id),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),status text NOT NULL CHECK(status IN ('requested','accepted','waitlisted','rejected','cancelled')),
 attendance text NOT NULL DEFAULT 'unknown' CHECK(attendance IN ('unknown','present','absent')),
 reason text,schedule_ack_revision integer NOT NULL DEFAULT 0 CHECK(schedule_ack_revision>=0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(activity_id,user_id)
);
CREATE INDEX activity_memberships_activity_idx ON activity_memberships(activity_id,status,created_at DESC,id DESC);
CREATE INDEX activity_memberships_user_idx ON activity_memberships(user_id,created_at DESC,id DESC);
CREATE TABLE physical_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES activities(id),
 created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE impact_measurements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES activities(id),
 physical_batch_id uuid NOT NULL REFERENCES physical_batches(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 stage text NOT NULL CHECK(stage IN ('collected','handed_over','recycled')),value_kg numeric(12,3) NOT NULL CHECK(value_kg>=0 AND value_kg<=100000),
 method text NOT NULL DEFAULT 'scale' CHECK(method='scale'),source_reference text NOT NULL,
 measured_at timestamptz NOT NULL,evidence_media_ids uuid[] NOT NULL DEFAULT '{}',evidence_hash text NOT NULL,
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','verified','rejected','superseded')),
 supersedes_id uuid REFERENCES impact_measurements(id),created_by uuid NOT NULL REFERENCES users(id),
 verified_at timestamptz,decision_reason text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'verified' OR verified_at IS NOT NULL),CHECK(cardinality(evidence_media_ids) BETWEEN 1 AND 3)
);
CREATE UNIQUE INDEX measurement_one_verified_stage_idx ON impact_measurements(physical_batch_id,stage) WHERE status='verified';
CREATE UNIQUE INDEX measurement_one_pending_stage_idx ON impact_measurements(physical_batch_id,stage) WHERE status='pending_review';
CREATE UNIQUE INDEX measurement_one_pending_correction_idx ON impact_measurements(supersedes_id) WHERE status='pending_review' AND supersedes_id IS NOT NULL;
CREATE INDEX impact_measurements_activity_idx ON impact_measurements(activity_id,created_at DESC,id DESC);
CREATE INDEX impact_measurements_verified_idx ON impact_measurements(measured_at) WHERE status='verified';
CREATE INDEX impact_measurements_provenance_idx ON impact_measurements(source_reference,evidence_hash);
CREATE UNIQUE INDEX measurement_one_verified_provenance_idx ON impact_measurements(stage,evidence_hash,lower(source_reference)) WHERE status='verified';
CREATE TABLE measurement_media (
 measurement_id uuid NOT NULL REFERENCES impact_measurements(id),media_id uuid NOT NULL REFERENCES media(id),PRIMARY KEY(measurement_id,media_id)
);
CREATE INDEX measurement_media_media_idx ON measurement_media(media_id);
CREATE TABLE activity_results (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),activity_id uuid NOT NULL REFERENCES activities(id),report_id uuid NOT NULL REFERENCES reports(id),
 author_id uuid NOT NULL REFERENCES users(id),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','needs_evidence','approved','rejected')),
 observed_at timestamptz NOT NULL,claimed_outcome text NOT NULL CHECK(claimed_outcome IN ('partial','complete')),
 verified_outcome text CHECK(verified_outcome IN ('partial','complete')),public_summary text,data jsonb NOT NULL,
 requested_evidence text[] NOT NULL DEFAULT '{}',decision_reason text,measurement_id uuid REFERENCES impact_measurements(id),
 approved_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status<>'approved' OR (verified_outcome IS NOT NULL AND public_summary IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX activity_one_active_result_idx ON activity_results(activity_id) WHERE status IN ('submitted','needs_evidence','approved');
CREATE INDEX activity_results_pending_idx ON activity_results(created_at DESC,id DESC) WHERE status IN ('submitted','needs_evidence');
CREATE INDEX activity_results_activity_idx ON activity_results(activity_id,created_at DESC,id DESC);
CREATE TABLE notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),event_key text NOT NULL,
 type text NOT NULL CHECK(type IN ('incident_updated','incident_resolved','incident_withdrawn','evidence_requested','membership_decided','coordinator_assigned','activity_changed','activity_cancelled','result_approved')),
 title text NOT NULL,message text NOT NULL,target_path text NOT NULL,read boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,event_key,type)
);
CREATE INDEX notifications_owner_idx ON notifications(user_id,created_at DESC,id DESC);
CREATE INDEX notifications_unread_idx ON notifications(user_id,created_at DESC,id DESC) WHERE read=false;
