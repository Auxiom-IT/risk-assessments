module.exports = async function (context, req) {
  try {
    context.log('Ping function invoked');
    context.res = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true, ts: new Date().toISOString() })
    };
  } catch (err) {
    context.log('Ping error:', err);
    context.res = {
      status: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Ping failed' })
    };
  }
};
