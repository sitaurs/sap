ALTER TABLE users ADD COLUMN report_email_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE report_assignments (
 report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
 assignee_id uuid NOT NULL REFERENCES users(id), assigned_by uuid NOT NULL REFERENCES users(id),
 due_at timestamptz NOT NULL, note text NOT NULL DEFAULT '',
 progress text NOT NULL DEFAULT 'assigned' CHECK(progress IN ('assigned','accepted','working','done')),
 progress_note text NOT NULL DEFAULT '', revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_assignments_owner_idx ON report_assignments(assignee_id,due_at);
CREATE INDEX report_assignments_due_idx ON report_assignments(due_at) WHERE progress<>'done';

CREATE TABLE area_localities (
 h3_cell text PRIMARY KEY, kelurahan text NOT NULL, kecamatan text NOT NULL,
 city text NOT NULL DEFAULT '', updated_by uuid NOT NULL REFERENCES users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_notification_emails (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 event_key text NOT NULL UNIQUE,report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id),report_revision integer NOT NULL CHECK(report_revision>0),
 report_status text NOT NULL,recipient_email text NOT NULL,sender_email text NOT NULL,
 mail_transport text NOT NULL CHECK(mail_transport IN ('smtp','resend')),
 subject text NOT NULL,body_text text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','skipped')),
 first_attempt_at timestamptz,sent_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_notification_emails_status_idx ON report_notification_emails(status,created_at) WHERE status='pending';
