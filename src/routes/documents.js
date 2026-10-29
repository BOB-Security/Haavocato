'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { requirePermission } = require('../middleware/require-permission');
const { uploadPrivateDocument, downloadPrivateDocument, deletePrivateDocument } = require('../services/document-storage');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: 'draft-8', legacyHeaders: false });

function safeFilename(value) {
  const base = path.basename(String(value || 'document')).replaceAll('/', '_').replaceAll(String.fromCharCode(92), '_').replaceAll(String.fromCharCode(0), '_').replaceAll(String.fromCharCode(13), '_').replaceAll(String.fromCharCode(10), '_');
  const safe = base.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 180);
  return safe || 'document';
}

function validateFile(file) {
  if (!file || !Buffer.isBuffer(file.buffer) || file.size < 1 || file.size > MAX_FILE_BYTES) return false;
  const name = safeFilename(file.originalname).toLowerCase();
  const bytes = file.buffer;
  if (name.endsWith('.pdf')) return file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (name.endsWith('.png')) return file.mimetype === 'image/png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (name.endsWith('.docx')) return file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (name.endsWith('.xlsx')) return file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  return false;
}

function uploadMiddleware(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'The file exceeds the 10 MB limit.' });
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: 'Upload one permitted file at a time.' });
    return res.status(400).json({ error: 'The file could not be accepted.' });
  });
}

function createDocumentRouter(pool) {
  const router = express.Router();

  router.get('/mine', requirePermission(pool, 'client.documents.manage_own'), async (req,res) => {
    try {
      const result=await pool.query(
        `SELECT d.id,d.request_id,sr.reference_code,d.original_filename,d.media_type,d.byte_size,
                d.scan_status,d.created_at
           FROM private_documents d
           LEFT JOIN service_requests sr ON sr.id=d.request_id
          WHERE d.client_user_id=$1 AND d.deleted_at IS NULL
          ORDER BY d.created_at DESC LIMIT 100`,
        [req.auth.userId]
      );
      return res.json({documents:result.rows});
    } catch(error) {
      console.error('Client document list failed:',error.message);
      return res.status(503).json({error:'Your document list is temporarily unavailable.'});
    }
  });

  router.post('/', requirePermission(pool,'client.documents.manage_own'), uploadLimiter, uploadMiddleware, async (req,res) => {
    const requestId=String(req.body.requestId||'');
    if(!UUID.test(requestId))return res.status(400).json({error:'Select a valid request before uploading a document.'});
    if(!validateFile(req.file))return res.status(415).json({error:'Allowed files: PDF, DOCX, XLSX, JPEG, or PNG with a matching file signature.'});

    let storageKey=null;
    try{
      const owned=await pool.query(
        'SELECT id FROM service_requests WHERE id=$1 AND client_user_id=$2 LIMIT 1',
        [requestId,req.auth.userId]
      );
      if(!owned.rows[0])return res.status(404).json({error:'Linked request not found.'});
      const originalFilename=safeFilename(req.file.originalname);
      const checksum=crypto.createHash('sha256').update(req.file.buffer).digest('hex');
      storageKey='documents/'+crypto.randomUUID();
      await uploadPrivateDocument(storageKey,req.file.buffer,checksum);
      const result=await pool.query(
        `INSERT INTO private_documents
          (request_id,client_user_id,uploaded_by,original_filename,media_type,byte_size,
           storage_provider,storage_key,checksum_sha256,scan_status,visibility)
         VALUES ($1,$2,$2,$3,$4,$5,'azure_blob',$6,$7,'pending','client_and_team')
         RETURNING id,request_id,original_filename,media_type,byte_size,scan_status,created_at`,
        [requestId,req.auth.userId,originalFilename,req.file.mimetype,req.file.size,storageKey,checksum]
      );
      await pool.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,request_id,outcome,metadata)
         VALUES ($1,'document.uploaded','document',$2,$3,'success',$4)`,
        [req.auth.userId,result.rows[0].id,requestId,JSON.stringify({byteSize:req.file.size,scanStatus:'pending'})]
      );
      return res.status(201).json({document:result.rows[0],message:'Document uploaded to private storage and held until a trusted security scan clears it.'});
    }catch(error){
      if(storageKey)await deletePrivateDocument(storageKey).catch(()=>{});
      if(error.code==='STORAGE_NOT_CONFIGURED')return res.status(503).json({error:'Private document storage is not configured.'});
      console.error('Private document upload failed:',error.message);
      return res.status(503).json({error:'The document could not be stored securely.'});
    }
  });

  router.get('/:id/download', requirePermission(pool,'client.documents.manage_own'), async (req,res) => {
    const id=String(req.params.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Document not found.'});
    try{
      const found=await pool.query(
        `SELECT id,original_filename,media_type,storage_key,scan_status
           FROM private_documents
          WHERE id=$1 AND client_user_id=$2 AND deleted_at IS NULL LIMIT 1`,
        [id,req.auth.userId]
      );
      const document=found.rows[0];
      if(!document)return res.status(404).json({error:'Document not found.'});
      if(document.scan_status!=='clean')return res.status(423).json({error:'This document is unavailable until the configured security scanner clears it.'});
      const stream=await downloadPrivateDocument(document.storage_key);
      res.setHeader('Content-Type','application/octet-stream');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(document.original_filename))}`);
      stream.on('error',(error)=>{console.error('Private document download stream failed:',error.message);if(!res.headersSent)res.status(503).end();else res.destroy(error);});
      stream.pipe(res);
    }catch(error){
      if(error.code==='STORAGE_NOT_CONFIGURED')return res.status(503).json({error:'Private document storage is not configured.'});
      console.error('Client document download failed:',error.message);
      return res.status(503).json({error:'The document could not be downloaded.'});
    }
  });

  router.get('/admin/:id/download', requirePermission(pool,'documents.download'), async (req,res) => {
    const id=String(req.params.id||'');
    if(!UUID.test(id))return res.status(404).json({error:'Document not found.'});
    try{
      const result=await pool.query(
        `SELECT d.id,d.original_filename,d.storage_key,d.scan_status,sr.assigned_to
           FROM private_documents d
           LEFT JOIN service_requests sr ON sr.id=d.request_id
          WHERE d.id=$1 AND d.deleted_at IS NULL LIMIT 1`,
        [id]
      );
      const document=result.rows[0];
      if(!document|| (req.auth.roles.has('lawyer')&&!req.auth.roles.has('super_admin')&&!req.auth.roles.has('operations_admin')&&!req.auth.roles.has('intake_staff')&&document.assigned_to!==req.auth.userId)) {
        return res.status(404).json({error:'Document not found.'});
      }
      if(document.scan_status!=='clean')return res.status(423).json({error:'This document is unavailable until the configured security scanner clears it.'});
      const stream=await downloadPrivateDocument(document.storage_key);
      await pool.query(
        `INSERT INTO audit_events (actor_user_id,action_code,entity_type,entity_id,request_id,outcome)
         SELECT $1,'document.downloaded','document',$2,request_id,'success' FROM private_documents WHERE id=$2`,
        [req.auth.userId,id]
      );
      res.setHeader('Content-Type','application/octet-stream');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(safeFilename(document.original_filename))}`);
      stream.on('error',(error)=>{console.error('Private document download stream failed:',error.message);if(!res.headersSent)res.status(503).end();else res.destroy(error);});
      stream.pipe(res);
    }catch(error){
      if(error.code==='STORAGE_NOT_CONFIGURED')return res.status(503).json({error:'Private document storage is not configured.'});
      console.error('Admin document download failed:',error.message);
      return res.status(503).json({error:'The document could not be downloaded.'});
    }
  });

  return router;
}

function createDocumentScanWebhook(pool) {
  const router=express.Router();
  router.post('/scan-result',async(req,res)=>{
    const secret=process.env.DOCUMENT_SCAN_WEBHOOK_SECRET||'';
    const supplied=String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
    if(Buffer.byteLength(secret)<32||Buffer.byteLength(supplied)!==Buffer.byteLength(secret)||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(secret))) {
      return res.status(401).json({error:'Invalid scanner credentials.'});
    }
    const storageKey=typeof req.body.storageKey==='string'?req.body.storageKey:'';
    const scanStatus=String(req.body.scanStatus||'');
    const scannerName=typeof req.body.scannerName==='string'?req.body.scannerName.trim().slice(0,120):'';
    const scanId=typeof req.body.scanId==='string'?req.body.scanId.trim().slice(0,200):'';
    if(!/^documents\/[0-9a-f-]{36}$/i.test(storageKey)||!['clean','quarantined','failed'].includes(scanStatus)||!scannerName||!scanId) {
      return res.status(400).json({error:'Invalid scan result payload.'});
    }
    try{
      const result=await pool.query(
        'UPDATE private_documents SET scan_status=$1 WHERE storage_key=$2 AND deleted_at IS NULL RETURNING id,request_id',
        [scanStatus,storageKey]
      );
      if(!result.rows[0])return res.status(404).json({error:'Document not found.'});
      await pool.query(
        `INSERT INTO audit_events (action_code,entity_type,entity_id,request_id,outcome,metadata)
         VALUES ('document.scan_result','document',$1,$2,'success',$3)`,
        [result.rows[0].id,result.rows[0].request_id,JSON.stringify({scanStatus,scannerName,scanId})]
      );
      return res.json({ok:true});
    }catch(error){
      console.error('Document scan webhook failed:',error.message);
      return res.status(503).json({error:'Scan result could not be recorded.'});
    }
  });
  return router;
}

module.exports = { createDocumentRouter, createDocumentScanWebhook };
