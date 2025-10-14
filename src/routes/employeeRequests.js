const express = require('express');
const Joi = require('joi');
const { requireRole, Roles } = require('../utils/rbac');
const { getEmployeeByEmail } = require('../models/employees');
const { createRequest } = require('../models/employeeRequests');
const { recordAuditLog } = require('../models/auditLogs');

const router = express.Router();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const ptoSchema = Joi.object({
  startDate: Joi.string().pattern(datePattern).required(),
  endDate: Joi.string().pattern(datePattern).required(),
  reason: Joi.string().max(500).required()
}).custom((value, helpers) => {
  if (value.endDate < value.startDate) {
    return helpers.error('any.invalid', { message: 'End date must be on or after the start date.' });
  }
  return value;
});

const workersCompSchema = Joi.object({
  incidentDate: Joi.string().pattern(datePattern).required(),
  description: Joi.string().max(1000).required(),
  location: Joi.string().max(200).allow(null, '').empty(''),
  medicalAttention: Joi.boolean().default(false)
});

const resignationSchema = Joi.object({
  lastDay: Joi.string().pattern(datePattern).required(),
  reason: Joi.string().max(500).required()
});

const transferSchema = Joi.object({
  targetDepartment: Joi.string().max(120).required(),
  reason: Joi.string().max(500).required(),
  targetRole: Joi.string().max(120).allow(null, '').empty('')
});

router.use(requireRole(Roles.EMPLOYEE));

function locateEmployee(req) {
  const email = req.user?.email;
  if (!email) {
    return null;
  }
  return getEmployeeByEmail(email);
}

function registerRequestRoute(path, type, schema) {
  router.post(path, (req, res) => {
    const employee = locateEmployee(req);
    if (!employee) {
      return res.status(404).json({ error: 'Employee profile not found for your account.' });
    }
    const { error, value } = schema.validate(req.body || {}, {
      abortEarly: false,
      stripUnknown: true
    });
    if (error) {
      return res.status(400).json({
        error: 'Invalid request payload',
        details: error.details.map((detail) => detail.message)
      });
    }
    const request = createRequest({
      employeeId: employee.id,
      userId: req.user.id,
      type,
      payload: value
    });
    recordAuditLog({
      actorUserId: req.user.id,
      targetUserId: req.user.id,
      action: 'employee_request_submitted',
      details: {
        requestId: request.id,
        type
      }
    });
    return res.status(201).json({ request });
  });
}

registerRequestRoute('/pto', 'pto', ptoSchema);
registerRequestRoute('/workers-comp', 'workers-comp', workersCompSchema);
registerRequestRoute('/resignation', 'resignation', resignationSchema);
registerRequestRoute('/transfer', 'transfer', transferSchema);

module.exports = router;
