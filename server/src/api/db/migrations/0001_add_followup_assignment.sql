ALTER TABLE leads ADD COLUMN follow_up_assigned_to text;
ALTER TABLE leads ADD COLUMN follow_up_status text DEFAULT 'PENDING';
ALTER TABLE leads ADD COLUMN follow_up_assigned_at text;
