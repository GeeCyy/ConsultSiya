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

module.exports = cloudinary;
