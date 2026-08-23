export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.headers['x-user-role'];
    const userId = req.headers['x-user-id'];

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    req.user = { role, id: userId };
    next();
  };
}