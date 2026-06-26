-- Row Level Security policies for tenant isolation
-- Applied on database init via docker-compose

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentMember" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Operation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SyncCursor" ENABLE ROW LEVEL SECURITY;

-- Application uses Prisma with service role; RLS enforced via API layer.
-- These policies provide defense-in-depth when using SET app.current_user_id.

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS TEXT AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '');
$$ LANGUAGE SQL STABLE;

CREATE POLICY document_select ON "Document"
  FOR SELECT USING (
    "ownerId" = current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM "DocumentMember" m
      WHERE m."documentId" = "Document".id
        AND m."userId" = current_app_user_id()
    )
  );

CREATE POLICY document_member_select ON "DocumentMember"
  FOR SELECT USING (
    "userId" = current_app_user_id()
    OR EXISTS (
      SELECT 1 FROM "Document" d
      WHERE d.id = "documentId" AND d."ownerId" = current_app_user_id()
    )
  );

CREATE POLICY operation_select ON "Operation"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Document" d
      WHERE d.id = "documentId"
        AND (
          d."ownerId" = current_app_user_id()
          OR EXISTS (
            SELECT 1 FROM "DocumentMember" m
            WHERE m."documentId" = d.id AND m."userId" = current_app_user_id()
          )
        )
    )
  );

CREATE POLICY version_select ON "DocumentVersion"
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM "Document" d
      WHERE d.id = "documentId"
        AND (
          d."ownerId" = current_app_user_id()
          OR EXISTS (
            SELECT 1 FROM "DocumentMember" m
            WHERE m."documentId" = d.id AND m."userId" = current_app_user_id()
          )
        )
    )
  );
