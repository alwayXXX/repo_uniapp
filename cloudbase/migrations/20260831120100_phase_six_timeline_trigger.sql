CREATE TRIGGER device_timeline_append AFTER INSERT OR UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION gf_append_device_timeline();
