const express = require('express');
const { verifyBadgeToken, recordBadgeScan } = require('../services/employeeBadges');
const { getUserById } = require('../models/users');
const { getProfile } = require('../models/employeeRequests');

const router = express.Router();

router.get('/verify', (req, res) => {
  const token = req.query.token;
  if (!token) {
    return res.status(400).json({ error: 'Badge token missing' });
  }
  try {
    const decoded = verifyBadgeToken(token);
    const employee = getUserById(decoded.sub);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const profile = getProfile(employee.id);
    recordBadgeScan({
      employeeId: employee.id,
      badgeId: decoded.badgeId,
      tokenId: token,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    return res.json({
      badgeId: decoded.badgeId,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        role: employee.role,
        department: employee.department || null,
        status: employee.status || 'active',
        emergencyContact: profile.emergencyContactName
          ? {
              name: profile.emergencyContactName,
              phone: profile.emergencyContactPhone,
              relationship: profile.emergencyContactRelationship
            }
          : null
      },
      token: {
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
        issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null
      }
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired badge token' });
  }
});

module.exports = router;
