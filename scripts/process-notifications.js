'use strict';

const { Pool } = require('pg');

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;

function messageFor(row) {
  const data = row.metadata || {};
  const ar = data.language === 'ar';
  const reference = data.referenceCode || '';
  const service = data.serviceName || (ar ? 'الخدمة القانونية' : 'legal service');
  const status = data.status || '';
  const publicMessage = data.publicMessage || '';
  const mode = data.mode === 'video' ? (ar ? 'مكالمة فيديو' : 'video call')
    : data.mode === 'phone' ? (ar ? 'مكالمة هاتفية' : 'phone call')
    : (ar ? 'مقابلة حضورية' : 'in-person consultation');
  const date = data.startsAt ? String(data.startsAt) : '';
  const statusLabels = {
    en:{new:'New',triage:'Initial review',awaiting_client:'Awaiting your response',assigned:'Assigned',in_progress:'In progress',awaiting_payment:'Awaiting payment',scheduled:'Scheduled',completed:'Completed',declined:'Declined',cancelled:'Cancelled',archived:'Archived',requested:'Awaiting confirmation',confirmed:'Confirmed',rescheduled:'Rescheduled',no_show:'No-show',submitted:'Submitted',under_review:'Under review',rejected:'Rejected',refunded:'Refunded'},
    ar:{new:'جديد',triage:'فرز أولي',awaiting_client:'بانتظار ردك',assigned:'تم الإسناد',in_progress:'قيد التنفيذ',awaiting_payment:'بانتظار الدفع',scheduled:'مجدول',completed:'مكتمل',declined:'مرفوض',cancelled:'ملغي',archived:'مؤرشف',requested:'بانتظار التأكيد',confirmed:'مؤكد',rescheduled:'أعيدت جدولته',no_show:'لم يحضر',submitted:'تم الإرسال',under_review:'قيد المراجعة',rejected:'مرفوض',refunded:'مسترد'}
  };
  const state = statusLabels[ar?'ar':'en'][status] || status;
  switch (row.template_code) {
    case 'request_received':
      return {
        subject: ar ? 'تم استلام طلبك لدى HA Advocates' : 'Your HA Advocates request was received',
        text: ar
          ? 'تم استلام طلبك بنجاح.\nالخدمة: '+service+'\nالرقم المرجعي: '+reference+'\n\nيمكنك متابعة الحالة من بوابة العميل. لا ترسل مستندات سرية عبر البريد.'
          : 'We received your request.\nService: '+service+'\nReference: '+reference+'\n\nTrack its status in the client portal. Please do not send confidential documents by email.'
      };
    case 'request_status':
      return {
        subject: ar ? 'تحديث بشأن طلبك '+reference : 'An update on your request '+reference,
        text: (ar?'حالة طلبك: ':'Request status: ')+state+'\n'+(publicMessage||'')+'\n\n'+(ar?'الرقم المرجعي: ':'Reference: ')+reference
      };
    case 'appointment_requested':
      return {
        subject: ar ? 'تم استلام طلب الموعد' : 'Your appointment request was received',
        text: ar
          ? 'تم استلام طلب موعدك وهو بانتظار التأكيد من المكتب.\nالنوع: '+mode+'\nالموعد المقترح: '+date+'\nالرقم المرجعي: '+reference
          : 'Your appointment request was received and is awaiting confirmation by the firm.\nType: '+mode+'\nProposed time: '+date+'\nReference: '+reference
      };
    case 'appointment_status':
      return {
        subject: ar ? 'تحديث بشأن موعدك' : 'An update on your appointment',
        text: (ar?'حالة الموعد: ':'Appointment status: ')+state+'\n'+(ar?'الموعد: ':'Time: ')+date+'\n'+(ar?'الرقم المرجعي: ':'Reference: ')+reference
      };
    case 'payment_submitted':
      return {
        subject: ar ? 'تم استلام سجل الدفع' : 'Payment record received',
        text: ar
          ? 'تم استلام بيانات التحويل وربطها بطلبك، وهي بانتظار المراجعة.\nالرقم المرجعي: '+reference
          : 'Your transfer details were received and linked to your request. They are awaiting review.\nReference: '+reference
      };
    case 'payment_status':
      return {
        subject: ar ? 'تحديث بشأن سجل الدفع' : 'An update on your payment record',
        text: (ar?'حالة سجل الدفع: ':'Payment record status: ')+state+'\n'+(ar?'الرقم المرجعي: ':'Reference: ')+reference
      };
    default:
      throw new Error('Unknown notification template.');
  }
}

async function sendEmail(row) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  const message = messageFor(row);
  const response = await fetch('https://api.resend.com/emails', {
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[row.recipient_email],subject:message.subject,text:message.text}),
    signal:AbortSignal.timeout(10000)
  });
  const result = await response.json().catch(()=>({}));
  if (!response.ok) {
    const error = new Error('EMAIL_PROVIDER_REJECTED');
    error.providerStatus = response.status;
    throw error;
  }
  return result.id || null;
}

async function claimBatch(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `WITH candidates AS (
         SELECT id FROM notification_events
          WHERE channel='email' AND status='queued' AND next_attempt_at <= NOW()
            AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '10 minutes')
            AND attempt_count < $1
          ORDER BY created_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       UPDATE notification_events n
          SET locked_at=NOW(),attempt_count=n.attempt_count+1
         FROM candidates c WHERE n.id=c.id
       RETURNING n.id,n.recipient_email,n.template_code,n.related_request_id,n.metadata,n.attempt_count`,
      [MAX_ATTEMPTS,BATCH_SIZE]
    );
    await client.query('COMMIT');
    return result.rows;
  } catch (error) {
    await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally {
    client.release();
  }
}

async function processOne(pool,row) {
  try {
    const providerId = await sendEmail(row);
    await pool.query(
      `UPDATE notification_events SET status='sent',provider_message_id=$1,sent_at=NOW(),
        locked_at=NULL,failure_code=NULL WHERE id=$2`,
      [providerId,row.id]
    );
    return 'sent';
  } catch (error) {
    const finalAttempt = row.attempt_count >= MAX_ATTEMPTS;
    const delaySeconds = Math.min(3600,60 * (2 ** Math.max(0,row.attempt_count-1)));
    await pool.query(
      `UPDATE notification_events
          SET status=$1,locked_at=NULL,failure_code=$2,
              next_attempt_at=CASE WHEN $1='queued' THEN NOW()+($3 * INTERVAL '1 second') ELSE next_attempt_at END
        WHERE id=$4`,
      [finalAttempt?'failed':'queued',error.providerStatus?'PROVIDER_HTTP_'+error.providerStatus:error.message==='EMAIL_PROVIDER_NOT_CONFIGURED'?'EMAIL_PROVIDER_NOT_CONFIGURED':'DELIVERY_FAILED',delaySeconds,row.id]
    );
    console.error('Notification delivery failed:',row.id,error.message);
    return finalAttempt?'failed':'retry';
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({
    connectionString:process.env.DATABASE_URL,
    ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined,
    max:3,
    connectionTimeoutMillis:5000,
    application_name:'haavocato-notification-worker'
  });
  try {
    let total=0;
    while(true) {
      const batch=await claimBatch(pool);
      if(!batch.length)break;
      for(const row of batch) {
        const result=await processOne(pool,row);
        total++;
        console.log('Notification',row.id,result);
      }
    }
    console.log('Notification worker finished. Processed:',total);
  } finally {
    await pool.end();
  }
}

main().catch(error=>{console.error('Notification worker stopped:',error.message);process.exitCode=1;});
