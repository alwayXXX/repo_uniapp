// Temporary replacement for gearflow-api during the separately authorized migration.
// It performs no database, storage, subscription, or AI operations.
exports.main = async (event) => {
  if (event?.action === 'health') return { ok: true, data: { maintenance: true } }
  return { ok: false, errorCode: 'INTERNAL_ERROR' }
}
