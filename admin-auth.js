'use strict';
const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const { Pool } = require('pg');
const email = (process.env.ADMIN_EMAIL || 'hazem.mustafa17@gmail.com').trim().toLowerCase();
const cookieName = 'haavocato_admin';
let pool;
let ready;
function hash(value,salt){return crypto.scryptSync(String(value),salt,64).toString('hex');}
function match(value,salt,stored){if(!salt||!stored)return false;const a=Buffer.from(hash(value,salt),'hex'),b=Buffer.from(stored,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b);}
async function db(){
 if(!process.env.DATABASE_URL)throw new Error('DATABASE_NOT_READY');
 if(!pool){pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:true}:undefined,max:3,connectionTimeoutMillis:5000});
 ready=pool.query(`CREATE TABLE IF NOT EXISTS admin_auth (id SMALLINT PRIMARY KEY CHECK(id=1),password_hash TEXT,password_salt TEXT,otp_hash TEXT,otp_salt TEXT,otp_expires_at TIMESTAMPTZ,otp_attempts INTEGER NOT NULL DEFAULT 0,otp_purpose VARCHAR(10),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);}
 await ready; return pool;
}
async function sendCode(code,purpose){
 if(!process.env.RESEND_API_KEY||!process.env.RESEND_FROM_EMAIL)throw new Error('EMAIL_NOT_CONFIGURED');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[email],subject:purpose==='setup'?'تفعيل لوحة تحكم أفوكاتو':'إعادة تعيين كلمة مرور أفوكاتو',text:'رمز التحقق: '+code+'\nصالح لمدة 10 دقائق ويستخدم مرة واحدة.'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok){console.error('Resend error status:',response.status);throw new Error('EMAIL_SEND_FAILED');}
}
router.post('/request-code',async(req,res)=>{
 const purpose=String(req.body.purpose||'');if(!['setup','reset'].includes(purpose))return res.status(400).json({error:'نوع الطلب غير صالح.'});
 if(!process.env.ADMIN_SESSION_SECRET||process.env.ADMIN_SESSION_SECRET.length<32)return res.status(503).json({error:'إعداد ADMIN_SESSION_SECRET غير مكتمل في Azure.'});
 try{const p=await db();const found=await p.query('SELECT password_hash FROM admin_auth WHERE id=1');
 if(purpose==='setup'&&found.rows[0]?.password_hash)return res.status(409).json({error:'كلمة المرور مضبوطة بالفعل. استخدم استعادة كلمة المرور.'});
 if(purpose==='reset'&&!found.rows[0]?.password_hash)return res.status(409).json({error:'يجب إكمال التفعيل الأول أولًا.'});
 const code=String(crypto.randomInt(0,1000000)).padStart(6,'0'),salt=crypto.randomBytes(16).toString('hex');
 await p.query(`INSERT INTO admin_auth(id,otp_hash,otp_salt,otp_expires_at,otp_attempts,otp_purpose) VALUES(1,$1,$2,NOW()+INTERVAL '10 minutes',0,$3) ON CONFLICT(id) DO UPDATE SET otp_hash=$1,otp_salt=$2,otp_expires_at=NOW()+INTERVAL '10 minutes',otp_attempts=0,otp_purpose=$3`,[hash(code,salt),salt,purpose]);
 try{await sendCode(code,purpose);}catch(e){await p.query('UPDATE admin_auth SET otp_hash=NULL,otp_salt=NULL,otp_expires_at=NULL,otp_purpose=NULL WHERE id=1');throw e;}
 return res.json({ok:true,message:'أرسلنا رمز التحقق إلى البريد المعتمد.'});
 }catch(e){if(e.message==='EMAIL_NOT_CONFIGURED')return res.status(503).json({error:'يلزم ضبط RESEND_API_KEY وRESEND_FROM_EMAIL في Azure.'});if(e.message==='DATABASE_NOT_READY')return res.status(503).json({error:'يلزم إعداد DATABASE_URL في Azure.'});console.error('Admin code request failed:',e.message);return res.status(502).json({error:'تعذر إرسال البريد. تأكد من إعداد خدمة البريد وعنوان المرسل.'});}
});
router.post('/complete-password',async(req,res)=>{
 const code=String(req.body.code||'').trim(),password=String(req.body.password||'');
 if(!/^\d{6}$/.test(code))return res.status(400).json({error:'أدخل رمز التحقق المكوّن من 6 أرقام.'});
 if(password.length<12||password.length>200)return res.status(400).json({error:'كلمة المرور يجب أن تكون 12 حرفًا على الأقل.'});
 try{const p=await db(),r=await p.query('SELECT * FROM admin_auth WHERE id=1');const a=r.rows[0];
 if(!a?.otp_hash||!a.otp_expires_at||new Date(a.otp_expires_at).getTime()<=Date.now()||a.otp_attempts>=5)return res.status(400).json({error:'الرمز منتهي أو غير صالح. اطلب رمزًا جديدًا.'});
 if(!match(code,a.otp_salt,a.otp_hash)){await p.query('UPDATE admin_auth SET otp_attempts=otp_attempts+1 WHERE id=1');return res.status(400).json({error:'رمز التحقق غير صحيح.'});}
 if(a.otp_purpose==='setup'&&a.password_hash)return res.status(409).json({error:'تم إعداد كلمة المرور بالفعل. استخدم الاستعادة.'});
 if(a.otp_purpose==='reset'&&!a.password_hash)return res.status(409).json({error:'لم يتم تفعيل الحساب بعد.'});
 const salt=crypto.randomBytes(16).toString('hex');
 await p.query(`UPDATE admin_auth SET password_hash=$1,password_salt=$2,otp_hash=NULL,otp_salt=NULL,otp_expires_at=NULL,otp_attempts=0,otp_purpose=NULL,updated_at=NOW() WHERE id=1`,[hash(password,salt),salt]);
 return res.json({ok:true,message:'تم حفظ كلمة المرور. يمكنك تسجيل الدخول الآن.'});
 }catch(e){console.error('Admin password update failed:',e.message);return res.status(503).json({error:'تعذر حفظ كلمة المرور. تأكد من قاعدة البيانات.'});}
});
router.post('/login',async(req,res)=>{
 const secret=process.env.ADMIN_SESSION_SECRET;if(!secret||secret.length<32)return res.status(503).json({error:'إعداد ADMIN_SESSION_SECRET غير مكتمل في Azure.'});
 if(String(req.body.email||'').trim().toLowerCase()!==email)return res.status(401).json({error:'البريد أو كلمة المرور غير صحيحة.'});
 try{const p=await db(),r=await p.query('SELECT password_hash,password_salt FROM admin_auth WHERE id=1'),a=r.rows[0];
 if(!a?.password_hash||!match(String(req.body.password||''),a.password_salt,a.password_hash))return res.status(401).json({error:'البريد أو كلمة المرور غير صحيحة.'});
 const payload=Buffer.from(JSON.stringify({user:email,exp:Date.now()+8*60*60*1000})).toString('base64url');
 const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
 res.setHeader('Set-Cookie',cookieName+'='+payload+'.'+sig+'; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=28800; Secure');
 return res.json({ok:true,message:'تم تسجيل الدخول.'});
 }catch(e){console.error('Admin login failed:',e.message);return res.status(503).json({error:'قاعدة البيانات غير جاهزة.'});}
});
module.exports=router;
