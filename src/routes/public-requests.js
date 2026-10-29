'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createRequest } = require('../services/request-service');

function createPublicRequestRouter(pool) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  });

  router.post('/', limiter, async (req, res) => {
    const requesterName = typeof req.body.requesterName === 'string' ? req.body.requesterName.trim() : '';
    const requesterEmail = typeof req.body.requesterEmail === 'string' ? req.body.requesterEmail.trim() : '';
    const requesterPhone = typeof req.body.requesterPhone === 'string' ? req.body.requesterPhone.trim() : '';
    const description = typeof req.body.description === 'string' ? req.body.description.trim() : '';
    const serviceId = typeof req.body.serviceId === 'string' ? req.body.serviceId : '';
    const preferredLanguage = req.body.preferredLanguage === 'ar' ? 'ar' : 'en';

    if (!requesterName || requesterName.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(requesterEmail) || requesterEmail.length > 254 ||
        !requesterPhone || requesterPhone.length > 40 ||
        !description || description.length > 4000 ||
        !/^[0-9a-f-]{36}$/i.test(serviceId)) {
      return res.status(400).json({ error: 'Review the required fields and try again.' });
    }

    try {
      const serviceResult = await pool.query(
        'SELECT id, name_en, name_ar FROM legal_services WHERE id = $1 AND is_published = TRUE LIMIT 1',
        [serviceId]
      );
      const service = serviceResult.rows[0];
      if (!service) return res.status(400).json({ error: 'The selected service is not available.' });

      const request = await createRequest(pool, {
        requesterName, requesterEmail, requesterPhone, description, serviceId,
        serviceName: preferredLanguage === 'ar' ? service.name_ar : service.name_en,
        preferredLanguage,
      });
      return res.status(201).json({
        message: preferredLanguage === 'ar' ? 'تم استلام طلبك.' : 'Your request has been received.',
        referenceCode: request.reference_code,
        status: request.status,
      });
    } catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ error: error.message });
      console.error('Public request submission failed:', error.message);
      return res.status(503).json({ error: 'We could not accept your request right now. Please try again later.' });
    }
  });

  return router;
}

module.exports = { createPublicRequestRouter };
