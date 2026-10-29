'use strict';

const express = require('express');
const { requirePermission } = require('../middleware/require-permission');
const { changeRequestStatus, listRequests } = require('../services/request-service');
const { listStatuses } = require('../domain/request-status');

function createAdminRequestRouter(pool) {
  const router = express.Router();

  router.get('/',
    requirePermission(pool, 'requests.read'),
    async (req, res) => {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      if (status && !listStatuses().includes(status)) {
        return res.status(400).json({ error: 'Invalid request status filter.' });
      }
      const limit = Number(req.query.limit || 50);
      const offset = Number(req.query.offset || 0);
      if (!Number.isInteger(limit) || !Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: 'Invalid pagination parameters.' });
      }
      try {
        const requests = await listRequests(pool, { status, assignedTo: (req.auth.roles.has('lawyer') && !req.auth.roles.has('super_admin') && !req.auth.roles.has('operations_admin') && !req.auth.roles.has('intake_staff')) ? req.auth.userId : undefined, limit, offset });
        return res.json({ requests, page: { limit: Math.min(Math.max(limit, 1), 100), offset } });
      } catch (error) {
        console.error('Admin request list failed:', error.message);
        return res.status(500).json({ error: 'Could not load requests.' });
      }
    }
  );

  router.patch('/:id/status',
    requirePermission(pool, 'requests.status.update'),
    async (req, res) => {
      const requestId = String(req.params.id || '');
      const toStatus = String(req.body.status || '');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        return res.status(400).json({ error: 'Invalid request identifier.' });
      }
      if (!listStatuses().includes(toStatus)) {
        return res.status(400).json({ error: 'Invalid request status.' });
      }
      const publicMessage = typeof req.body.publicMessage === 'string' ? req.body.publicMessage.trim().slice(0, 1000) : null;
      const internalNote = typeof req.body.internalNote === 'string' ? req.body.internalNote.trim().slice(0, 4000) : null;
      try {
        const request = await changeRequestStatus(pool, {
          requestId, toStatus, actorUserId: req.auth.userId, publicMessage, internalNote,
          mustBeAssignedTo: (req.auth.roles.has('lawyer') && !req.auth.roles.has('super_admin') && !req.auth.roles.has('operations_admin') && !req.auth.roles.has('intake_staff')) ? req.auth.userId : null,
        });
        return res.json({ request });
      } catch (error) {
        if (error.code === 'REQUEST_NOT_FOUND' || error.code === 'REQUEST_NOT_ASSIGNED') return res.status(404).json({ error: 'Request not found.' });
        if (error.code === 'INVALID_STATUS_TRANSITION') return res.status(409).json({ error: error.message });
        console.error('Admin request status update failed:', error.message);
        return res.status(500).json({ error: 'Could not update request status.' });
      }
    }
  );

  return router;
}

module.exports = { createAdminRequestRouter };
