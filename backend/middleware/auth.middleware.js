const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  // Accept token from httpOnly cookie (preferred), Authorization: Bearer header (SPA fallback),
  // or ?token= query param (for links embedded in generated PDFs — e.g. the advising-slip
  // report — that get opened via plain browser navigation with no header/cookie control,
  // and where frontend/backend live on different domains so SameSite cookies aren't reliable).
  const cookieToken = req.cookies?.auth_token;
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;

  const token = cookieToken || bearerToken || queryToken;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, role }
    req.token = token;
    next();
  } catch (err) {
    res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
