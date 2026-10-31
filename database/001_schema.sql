BEGIN;
-- Private schema, not exposed through the Supabase Data API.
CREATE SCHEMA IF NOT EXISTS bean;
CREATE TABLE IF NOT EXISTS bean.accounts (
 id text PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('Customer','Admin')),
 member_tier text CHECK (member_tier IN ('normal','prime')),
 CHECK ((role='Customer' AND member_tier IS NOT NULL) OR (role='Admin' AND member_tier IS NULL))
);
CREATE TABLE IF NOT EXISTS bean.products (
 id text PRIMARY KEY, name text NOT NULL, price integer NOT NULL CHECK (price BETWEEN 1 AND 50000),
 weight_gram integer NOT NULL CHECK (weight_gram>0), stock integer NOT NULL CHECK (stock>=0), on_sale boolean NOT NULL
);
-- stock may exceed 9999 after cancellation adds reserved stock back; admin input still caps at 9999.
CREATE TABLE IF NOT EXISTS bean.coupons (
 code text PRIMARY KEY, percent integer NOT NULL CHECK (percent BETWEEN 0 AND 100),
 min_spend integer NOT NULL CHECK (min_spend>=0), active boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS bean.customer_carts (
 user_id text PRIMARY KEY REFERENCES bean.accounts(id), stage text NOT NULL CHECK (stage IN ('cart','checkout','success')),
 coupon_code text REFERENCES bean.coupons(code), current_order_id uuid
);
CREATE TABLE IF NOT EXISTS bean.cart_items (
 user_id text REFERENCES bean.customer_carts(user_id), product_id text REFERENCES bean.products(id),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10), PRIMARY KEY(user_id,product_id)
);
CREATE TABLE IF NOT EXISTS bean.orders (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES bean.accounts(id),
 status text NOT NULL CHECK (status IN ('pending','paid','cancelled')), created_at timestamptz NOT NULL,
 snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object')
);
-- Each order snapshot contains immutable lines and all monetary/shipping fields.
CREATE INDEX IF NOT EXISTS bean_orders_owner_time ON bean.orders(user_id,created_at DESC,id DESC);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bean_current_order_fk' AND conrelid='bean.customer_carts'::regclass) THEN
 ALTER TABLE bean.customer_carts ADD CONSTRAINT bean_current_order_fk FOREIGN KEY(current_order_id) REFERENCES bean.orders(id) DEFERRABLE INITIALLY DEFERRED;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS bean.sessions (
 token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES bean.accounts(id), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS bean_session_expiry ON bean.sessions(expires_at);
CREATE OR REPLACE FUNCTION bean.freeze_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.snapshot IS DISTINCT FROM OLD.snapshot THEN
 RAISE EXCEPTION 'Order snapshot is immutable'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status <> 'pending' OR NEW.status NOT IN ('paid','cancelled')) THEN
 RAISE EXCEPTION 'Invalid order transition'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS freeze_order ON bean.orders;
CREATE TRIGGER freeze_order BEFORE UPDATE ON bean.orders FOR EACH ROW EXECUTE FUNCTION bean.freeze_order();
REVOKE ALL ON SCHEMA bean FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA bean FROM PUBLIC;
DO $$ DECLARE tab text; r text; BEGIN
 FOREACH tab IN ARRAY ARRAY['accounts','products','coupons','customer_carts','cart_items','orders','sessions'] LOOP
 EXECUTE format('ALTER TABLE bean.%I ENABLE ROW LEVEL SECURITY',tab);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
 EXECUTE format('REVOKE ALL ON SCHEMA bean FROM %I',r);
 EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA bean FROM %I',r);
 END IF;
 END LOOP;
END $$;
COMMIT;
