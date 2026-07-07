const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary blocks unsigned delivery of non-image ("raw") files like PDFs by default
// on newer accounts (the "Restricted media types" security setting) — uploads succeed
// but the plain secure_url 401s when fetched. Signed URLs are exempt from that
// restriction, so re-sign raw delivery URLs before redirecting a browser to them.
cloudinary.toDeliverableUrl = function toDeliverableUrl(secureUrl) {
  if (!secureUrl || !secureUrl.includes('/raw/upload/')) return secureUrl;
  const match = secureUrl.match(/\/upload\/v\d+\/(.+)$/);
  if (!match) return secureUrl;
  return cloudinary.url(match[1], { resource_type: 'raw', type: 'upload', sign_url: true, secure: true });
};

// Fetches a stored file server-side and returns its bytes, or throws an Error
// with `.status` (safe to send to the client) and `.logDetail` (full upstream
// body, for server logs only) so callers stop flattening every failure into a
// bare 502 — the real Cloudinary rejection reason (auth, restricted media
// type, etc.) becomes visible instead of only ever seeing "502".
cloudinary.fetchDeliverable = async function fetchDeliverable(secureUrl) {
  const { cloud_name, api_key, api_secret } = cloudinary.config();
  if (!cloud_name || !api_key || !api_secret) {
    const err = new Error('File storage is not configured.');
    err.status = 500;
    throw err;
  }

  const deliveryUrl = cloudinary.toDeliverableUrl(secureUrl);
  let upstream;
  try {
    upstream = await fetch(deliveryUrl);
  } catch (fetchErr) {
    const err = new Error('Could not reach file storage.');
    err.status = 502;
    err.logDetail = fetchErr.message;
    throw err;
  }

  if (!upstream.ok) {
    const bodyText = await upstream.text().catch(() => '');
    const cldError = upstream.headers.get('x-cld-error'); // e.g. "deny or ACL failure" — Cloudinary's actual rejection reason
    let message = bodyText;
    try {
      const parsed = JSON.parse(bodyText);
      message = parsed?.error?.message || parsed?.error || bodyText;
    } catch { /* not JSON — use raw body */ }
    const err = new Error((message || cldError || `File storage returned ${upstream.status}.`).slice(0, 300));
    err.status = upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
    err.logDetail = `${deliveryUrl} -> ${upstream.status}${cldError ? ` [x-cld-error: ${cldError}]` : ''}: ${bodyText.slice(0, 500)}`;
    throw err;
  }

  return {
    buffer: Buffer.from(await upstream.arrayBuffer()),
    contentType: upstream.headers.get('content-type') || 'application/octet-stream',
  };
};

module.exports = cloudinary;
