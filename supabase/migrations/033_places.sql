-- ============================================================
-- 033_places.sql
--
-- Gives campuses a real address and a pin (the local anchor for the map,
-- rethink §5), and derives every gathering's map coordinates in the
-- database so no code path can put a home on a map.
--
-- The rule: a gathering's pin is never sharper than its own page.
--   campus        the campus pin
--   public_place  the geocoded venue, unless the address is held until
--                 RSVP, in which case the campus pin
--   home          the campus pin, always (homes are never geocoded)
--   online        no pin
-- ============================================================

ALTER TABLE campuses
  ADD COLUMN address_line1 TEXT,
  ADD COLUMN address_line2 TEXT,
  ADD COLUMN city          TEXT,
  ADD COLUMN region        TEXT,
  ADD COLUMN postal_code   TEXT,
  ADD COLUMN country       TEXT NOT NULL DEFAULT 'US',
  ADD COLUMN lat           NUMERIC(9,6),
  ADD COLUMN lng           NUMERIC(9,6),
  ADD COLUMN geocoded_at   TIMESTAMPTZ,
  ADD CONSTRAINT chk_campus_coords
    CHECK ((lat IS NULL) = (lng IS NULL)
           AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)));

CREATE INDEX idx_campuses_coords ON campuses(lat, lng) WHERE lat IS NOT NULL;

ALTER TABLE event_addresses
  ADD CONSTRAINT chk_event_address_coords
    CHECK ((lat IS NULL) = (lng IS NULL)
           AND (lat IS NULL OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)));

-- ── Derivation ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ec_event_public_coords(
  p_event_id UUID, p_campus_id UUID, p_venue TEXT,
  p_visibility ec_event_visibility, p_hide_address BOOLEAN,
  OUT lat NUMERIC, OUT lng NUMERIC
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  gated BOOLEAN := p_visibility = 'private' AND p_hide_address;
BEGIN
  IF p_venue = 'online' THEN
    RETURN;
  END IF;

  IF p_venue = 'public_place' AND NOT gated THEN
    SELECT a.lat, a.lng INTO lat, lng FROM event_addresses a WHERE a.event_id = p_event_id;
    IF lat IS NOT NULL THEN
      RETURN;
    END IF;
  END IF;

  -- campus, home, a held public place, or a venue that failed to geocode:
  -- the campus pin, or nothing.
  SELECT c.lat, c.lng INTO lat, lng FROM campuses c WHERE c.id = p_campus_id;
END;
$$;

CREATE OR REPLACE FUNCTION ec_set_event_public_coords()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT * INTO c FROM ec_event_public_coords(
    NEW.id, NEW.campus_id, NEW.venue_kind, NEW.visibility, NEW.hide_address_until_rsvp);
  NEW.public_lat := c.lat;
  NEW.public_lng := c.lng;
  RETURN NEW;
END;
$$;

-- Runs after the guard trigger (alphabetical order: "events_guard_changes"
-- < "events_set_public_coords"), so whatever a caller sends for
-- public_lat / public_lng is overwritten.
CREATE TRIGGER events_set_public_coords
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION ec_set_event_public_coords();

-- When an address or a campus pin changes, recompute the affected
-- gatherings. SECURITY DEFINER: the recompute is the database's own
-- bookkeeping, not an edit by the caller, so it passes the gathering guard.
CREATE OR REPLACE FUNCTION ec_touch_event_coords_from_address()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE events SET public_lat = public_lat
  WHERE id = COALESCE(NEW.event_id, OLD.event_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER event_addresses_touch_coords
  AFTER INSERT OR UPDATE OR DELETE ON event_addresses
  FOR EACH ROW EXECUTE FUNCTION ec_touch_event_coords_from_address();

CREATE OR REPLACE FUNCTION ec_touch_event_coords_from_campus()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.lat IS DISTINCT FROM OLD.lat OR NEW.lng IS DISTINCT FROM OLD.lng THEN
    UPDATE events SET public_lat = public_lat WHERE campus_id = NEW.id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER campuses_touch_event_coords
  AFTER UPDATE OF lat, lng ON campuses
  FOR EACH ROW EXECUTE FUNCTION ec_touch_event_coords_from_campus();

-- ── Public campus places for the signed-out map ──────────────
-- Campus addresses are public information (a church building), but the
-- campuses table also holds landing-page drafts, so anonymous readers get
-- this narrow projection rather than the table.
CREATE OR REPLACE FUNCTION ec_public_campus_pins(cid UUID)
RETURNS TABLE (id UUID, name TEXT, lat NUMERIC, lng NUMERIC, city TEXT, region TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.name, c.lat, c.lng, c.city, c.region
  FROM campuses c
  JOIN churches ch ON ch.id = c.church_id
  WHERE c.church_id = cid AND c.is_active AND ch.is_active AND c.lat IS NOT NULL;
$$;

-- Church pins for the map: listed, verified, active churches only, at their
-- campuses' public coordinates, with a count of upcoming public gatherings.
-- Never people, never homes, never private gatherings.
CREATE OR REPLACE FUNCTION ec_listed_church_pins()
RETURNS TABLE (
  church_id UUID, church_name TEXT, slug TEXT, connect_name TEXT,
  campus_id UUID, campus_name TEXT, lat NUMERIC, lng NUMERIC,
  city TEXT, region TEXT, upcoming_public INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ch.id, ch.name, ch.slug, ch.connect_name,
         c.id, c.name, c.lat, c.lng, c.city, c.region,
         (SELECT COUNT(*)::int FROM events e
          WHERE e.church_id = ch.id AND e.visibility = 'public' AND e.status = 'published'
            AND e.starts_at >= NOW() AND e.starts_at < NOW() + INTERVAL '30 days')
  FROM churches ch
  JOIN campuses c ON c.church_id = ch.id
  WHERE ch.is_active AND ch.listed_on_map AND ch.verified_at IS NOT NULL
    AND c.is_active AND c.lat IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION
  ec_event_public_coords(UUID, UUID, TEXT, ec_event_visibility, BOOLEAN),
  ec_public_campus_pins(UUID),
  ec_listed_church_pins()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
