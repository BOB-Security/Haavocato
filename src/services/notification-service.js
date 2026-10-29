'use strict';

async function enqueueEmail(client, { recipientEmail, templateCode, relatedRequestId = null, metadata = {} }) {
  if (typeof recipientEmail !== 'string' || !recipientEmail.includes('@')) return null;
  const result = await client.query(
    `INSERT INTO notification_events
      (recipient_email, channel, template_code, status, related_request_id, metadata)
     VALUES ($1,'email',$2,'queued',$3,$4::jsonb)
     RETURNING id`,
    [recipientEmail, templateCode, relatedRequestId, JSON.stringify(metadata)]
  );
  return result.rows[0]?.id || null;
}

module.exports = { enqueueEmail };
