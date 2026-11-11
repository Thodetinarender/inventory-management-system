const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'stockflow-dev-secret-key-9921';
const TOKEN_EXPIRY = '7d';

async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
      organizationName: user.organizationName
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.token;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded || !decoded.organizationId) {
      return res.status(401).json({ success: false, error: 'Invalid session. Please log in again.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired. Please log in again.' });
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  requireAuth
};
