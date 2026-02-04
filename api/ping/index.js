module.exports = async function (context) {
  context.res = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { ok: true, ts: new Date().toISOString() }
  };
};
