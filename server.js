const express=require("express");
const session=require("express-session");
const pgSession=require("connect-pg-simple")(session);
const bcrypt=require("bcryptjs");
const {Pool}=require("pg");
const path=require("path");

const app=express();
const PORT=process.env.PORT||10000;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?{rejectUnauthorized:false}:false});

const BANK={
  name:process.env.BANK_NAME||"Sterling Bank",
  accountNumber:process.env.BANK_ACCOUNT_NUMBER||"",
  accountName:process.env.BANK_ACCOUNT_NAME||""
};
const WHATSAPP=process.env.WHATSAPP_NUMBER||"";
const FREE_REWARD=Number(process.env.FREE_REWARD||100);
const LEGEND_REWARD=Number(process.env.LEGEND_REWARD||1000);
const LEGEND_FEE=Number(process.env.LEGEND_FEE||2000);
const MIN_WITHDRAWAL=Number(process.env.MIN_WITHDRAWAL||5000);
const REFERRAL_BONUS=Number(process.env.REFERRAL_BONUS||200);

function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos"}).format(new Date())}
function code(name){return (name.replace(/[^a-z0-9]/gi,"").slice(0,5).toUpperCase()+Math.random().toString(36).slice(2,7)).toUpperCase()}
function q(text,params=[]){return pool.query(text,params)}
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS users(
 id SERIAL PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL UNIQUE,email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,referral_code TEXT NOT NULL UNIQUE,referred_by INTEGER REFERENCES users(id),
 plan TEXT NOT NULL DEFAULT 'free',balance INTEGER NOT NULL DEFAULT 0,total_earned INTEGER NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await q(`CREATE TABLE IF NOT EXISTS news(
 id SERIAL PRIMARY KEY,title TEXT NOT NULL,category TEXT NOT NULL,body TEXT NOT NULL,publish_date DATE NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await q(`CREATE TABLE IF NOT EXISTS reading_rewards(
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),news_id INTEGER NOT NULL REFERENCES news(id),
 reward INTEGER NOT NULL,reward_date DATE NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(user_id,reward_date))`);
 await q(`CREATE TABLE IF NOT EXISTS upgrade_requests(
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,reference TEXT,
 proof TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ)`);
 await q(`CREATE TABLE IF NOT EXISTS deposits(
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,reference TEXT,note TEXT,
 status TEXT NOT NULL DEFAULT 'pending',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
 await q(`CREATE TABLE IF NOT EXISTS withdrawals(
 id SERIAL PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),amount INTEGER NOT NULL,account_name TEXT NOT NULL,
 account_number TEXT NOT NULL,bank_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),reviewed_at TIMESTAMPTZ)`);
 await q(`CREATE TABLE IF NOT EXISTS referral_rewards(
 id SERIAL PRIMARY KEY,referrer_id INTEGER NOT NULL REFERENCES users(id),referred_id INTEGER NOT NULL REFERENCES users(id),
 amount INTEGER NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(referrer_id,referred_id))`);
 const c=await q("SELECT COUNT(*)::int AS c FROM news");
 if(c.rows[0].c===0) await q("INSERT INTO news(title,category,body,publish_date) VALUES($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)",[
  "Nigeria Daily Briefing","Nigeria","Welcome to the daily Nigeria news section. Replace this starter article with properly sourced and verified current Nigerian news before publishing.",today(),
  "Business & Economy","Business","Daily business and economy update. Replace this starter text with verified editorial content before publishing.",today(),
  "Sports Roundup","Sports","Daily sports roundup. Replace this starter text with verified editorial content before publishing.",today()
 ]);
}
app.use(express.json({limit:"1mb"}));app.use(express.urlencoded({extended:true}));
app.set("trust proxy",1);
app.use(session({
 store:new pgSession({pool,tableName:"user_sessions",createTableIfMissing:true}),
 secret:process.env.SESSION_SECRET||"change-this-in-production",
 resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:604800000}
}));
app.use(express.static(path.join(__dirname,"public")));

function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"Login required"});next()}
function adminAuth(req,res,next){if(!req.session.admin)return res.status(401).json({error:"Admin login required"});next()}

app.get("/health",async(req,res)=>{try{await q("SELECT 1");res.json({ok:true})}catch(e){res.status(500).json({ok:false})}});
app.get("/api/config",(req,res)=>res.json({bank:BANK,whatsapp:WHATSAPP,legendFee:LEGEND_FEE,freeReward:FREE_REWARD,legendReward:LEGEND_REWARD,minWithdrawal:MIN_WITHDRAWAL,referralBonus:REFERRAL_BONUS,withdrawalWindow:"Every Monday, 8:00 AM–12:00 PM (Africa/Lagos)"}));

app.post("/api/register",async(req,res)=>{
 const {name,phone,email,password,referralCode}=req.body;
 if(!name||!phone||!email||!password)return res.status(400).json({error:"Please complete all required fields."});
 if(password.length<6)return res.status(400).json({error:"Password must be at least 6 characters."});
 try{
  let referredBy=null;
  if(referralCode){const r=await q("SELECT id FROM users WHERE referral_code=$1",[referralCode.trim().toUpperCase()]);if(r.rows[0])referredBy=r.rows[0].id}
  const hash=bcrypt.hashSync(password,10);
  const r=await q("INSERT INTO users(name,phone,email,password_hash,referral_code,referred_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[name.trim(),phone.trim(),email.trim().toLowerCase(),hash,code(name),referredBy]);
  req.session.userId=r.rows[0].id;res.json({ok:true});
 }catch(e){res.status(400).json({error:e.code==="23505"?"Email or phone already registered.":"Registration failed."})}
});
app.post("/api/login",async(req,res)=>{
 const r=await q("SELECT * FROM users WHERE email=$1",[String(req.body.email||"").toLowerCase().trim()]);
 if(!r.rows[0]||!bcrypt.compareSync(req.body.password||"",r.rows[0].password_hash))return res.status(401).json({error:"Invalid login details."});
 req.session.userId=r.rows[0].id;res.json({ok:true});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get("/api/me",auth,async(req,res)=>{
 const u=(await q("SELECT id,name,phone,email,referral_code,plan,balance,total_earned,created_at FROM users WHERE id=$1",[req.session.userId])).rows[0];
 const claimed=(await q("SELECT 1 FROM reading_rewards WHERE user_id=$1 AND reward_date=$2",[u.id,today()])).rows.length>0;
 const news=(await q("SELECT id,title,category,body,publish_date FROM news WHERE active=TRUE AND publish_date<=CURRENT_DATE ORDER BY publish_date DESC,id DESC")).rows;
 res.json({...u,claimedToday:claimed,news});
});
app.post("/api/read/:newsId",auth,async(req,res)=>{
 const u=(await q("SELECT * FROM users WHERE id=$1",[req.session.userId])).rows[0];
 const n=(await q("SELECT * FROM news WHERE id=$1 AND active=TRUE",[req.params.newsId])).rows[0];
 if(!n)return res.status(404).json({error:"News not found."});
 if(new Date(n.publish_date)>new Date(today()))return res.status(400).json({error:"This article is not published yet."});
 const reward=u.plan==="legend"?LEGEND_REWARD:FREE_REWARD;
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  await client.query("INSERT INTO reading_rewards(user_id,news_id,reward,reward_date) VALUES($1,$2,$3,$4)",[u.id,n.id,reward,today()]);
  await client.query("UPDATE users SET balance=balance+$1,total_earned=total_earned+$1 WHERE id=$2",[reward,u.id]);
  await client.query("COMMIT");res.json({ok:true,reward});
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:"Today's reading reward has already been claimed."})}finally{client.release()}
});
app.post("/api/upgrade-request",auth,async(req,res)=>{await q("INSERT INTO upgrade_requests(user_id,amount,reference,proof) VALUES($1,$2,$3,$4)",[req.session.userId,LEGEND_FEE,req.body.reference||"",req.body.proof||""]);res.json({ok:true,message:"Upgrade request submitted for admin verification."})});
app.post("/api/deposit",auth,async(req,res)=>{
 const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({error:"Enter a valid deposit amount."});
 await q("INSERT INTO deposits(user_id,amount,reference,note) VALUES($1,$2,$3,$4)",[req.session.userId,amount,req.body.reference||"",req.body.note||""]);res.json({ok:true});
});
app.post("/api/withdraw",auth,async(req,res)=>{
 const lagos=new Date(new Date().toLocaleString("en-US",{timeZone:"Africa/Lagos"})),day=lagos.getDay(),hour=lagos.getHours();
 if(day!==1||hour<8||hour>=12)return res.status(400).json({error:"Withdrawals are available every Monday from 8:00 AM to 12:00 PM (Africa/Lagos)."});
 const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<MIN_WITHDRAWAL)return res.status(400).json({error:`Minimum withdrawal is ₦${MIN_WITHDRAWAL.toLocaleString()}.`});
 if(!req.body.accountName||!req.body.accountNumber||!req.body.bankName)return res.status(400).json({error:"Bank name, account name and account number are required."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");const u=(await client.query("SELECT balance FROM users WHERE id=$1 FOR UPDATE",[req.session.userId])).rows[0];
  if(amount>u.balance)throw new Error("INSUFFICIENT");
  await client.query("UPDATE users SET balance=balance-$1 WHERE id=$2",[amount,req.session.userId]);
  await client.query("INSERT INTO withdrawals(user_id,amount,account_name,account_number,bank_name) VALUES($1,$2,$3,$4,$5)",[req.session.userId,amount,req.body.accountName.trim(),req.body.accountNumber.trim(),req.body.bankName.trim()]);
  await client.query("COMMIT");res.json({ok:true});
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message==="INSUFFICIENT"?"Insufficient available balance.":"Withdrawal failed."})}finally{client.release()}
});
app.get("/api/transactions",auth,async(req,res)=>{
 const id=req.session.userId;
 const [w,d,u]=await Promise.all([q("SELECT * FROM withdrawals WHERE user_id=$1 ORDER BY id DESC",[id]),q("SELECT * FROM deposits WHERE user_id=$1 ORDER BY id DESC",[id]),q("SELECT * FROM upgrade_requests WHERE user_id=$1 ORDER BY id DESC",[id])]);
 res.json({withdrawals:w.rows,deposits:d.rows,upgrades:u.rows});
});

app.post("/api/admin/login",(req,res)=>{
 const email=String(process.env.ADMIN_EMAIL||"admin@example.com").toLowerCase(),pass=process.env.ADMIN_PASSWORD||"change-me";
 if(String(req.body.email||"").toLowerCase()===email&&req.body.password===pass){req.session.admin=true;return res.json({ok:true})}
 res.status(401).json({error:"Invalid admin credentials."})
});
app.post("/api/admin/logout",(req,res)=>{req.session.admin=false;res.json({ok:true})});
app.get("/api/admin/stats",adminAuth,async(req,res)=>{
 const [u,l,pu,pw,b]=await Promise.all([
  q("SELECT COUNT(*)::int c FROM users"),q("SELECT COUNT(*)::int c FROM users WHERE plan='legend'"),
  q("SELECT COUNT(*)::int c FROM upgrade_requests WHERE status='pending'"),q("SELECT COUNT(*)::int c FROM withdrawals WHERE status='pending'"),
  q("SELECT COALESCE(SUM(balance),0)::int s FROM users")]);
 res.json({users:u.rows[0].c,legend:l.rows[0].c,pendingUpgrades:pu.rows[0].c,pendingWithdrawals:pw.rows[0].c,balance:b.rows[0].s});
});
app.get("/api/admin/users",adminAuth,async(req,res)=>res.json((await q("SELECT id,name,phone,email,referral_code,plan,balance,total_earned,created_at FROM users ORDER BY id DESC")).rows));
app.get("/api/admin/upgrades",adminAuth,async(req,res)=>res.json((await q("SELECT u.name,u.email,u.phone,r.* FROM upgrade_requests r JOIN users u ON u.id=r.user_id ORDER BY r.id DESC")).rows));
app.get("/api/admin/withdrawals",adminAuth,async(req,res)=>res.json((await q("SELECT u.name,u.email,w.* FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC")).rows));

app.post("/api/admin/upgrades/:id/:action",adminAuth,async(req,res)=>{
 const action=req.params.action;if(!["approve","reject"].includes(action))return res.status(400).json({error:"Invalid action."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");const r=(await client.query("SELECT * FROM upgrade_requests WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
  if(!r||r.status!=="pending")throw new Error("INVALID");
  await client.query("UPDATE upgrade_requests SET status=$1,reviewed_at=NOW() WHERE id=$2",[action==="approve"?"approved":"rejected",r.id]);
  if(action==="approve"){
   const u=(await client.query("SELECT referred_by,plan FROM users WHERE id=$1 FOR UPDATE",[r.user_id])).rows[0];
   if(u.plan!=="legend"){
    await client.query("UPDATE users SET plan='legend' WHERE id=$1",[r.user_id]);
    if(u.referred_by){
     const ex=await client.query("SELECT 1 FROM referral_rewards WHERE referrer_id=$1 AND referred_id=$2",[u.referred_by,r.user_id]);
     if(!ex.rows.length){await client.query("INSERT INTO referral_rewards(referrer_id,referred_id,amount) VALUES($1,$2,$3)",[u.referred_by,r.user_id,REFERRAL_BONUS]);await client.query("UPDATE users SET balance=balance+$1,total_earned=total_earned+$1 WHERE id=$2",[REFERRAL_BONUS,u.referred_by])}
    }
   }
  }
  await client.query("COMMIT");res.json({ok:true});
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:"Unable to review request."})}finally{client.release()}
});
app.post("/api/admin/withdrawals/:id/:action",adminAuth,async(req,res)=>{
 const action=req.params.action;if(!["approve","reject"].includes(action))return res.status(400).json({error:"Invalid action."});
 const client=await pool.connect();
 try{
  await client.query("BEGIN");const r=(await client.query("SELECT * FROM withdrawals WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
  if(!r||r.status!=="pending")throw new Error("INVALID");
  await client.query("UPDATE withdrawals SET status=$1,reviewed_at=NOW() WHERE id=$2",[action==="approve"?"approved":"rejected",r.id]);
  if(action==="reject")await client.query("UPDATE users SET balance=balance+$1 WHERE id=$2",[r.amount,r.user_id]);
  await client.query("COMMIT");res.json({ok:true});
 }catch(e){await client.query("ROLLBACK");res.status(400).json({error:"Unable to review withdrawal."})}finally{client.release()}
});
app.post("/api/admin/news",adminAuth,async(req,res)=>{
 const {title,category,body,publishDate}=req.body;if(!title||!category||!body||!publishDate)return res.status(400).json({error:"All fields required."});
 await q("INSERT INTO news(title,category,body,publish_date) VALUES($1,$2,$3,$4)",[title,category,body,publishDate]);res.json({ok:true});
});
app.get("*",(req,res)=>{if(!req.path.startsWith("/api/")&&!req.path.startsWith("/health"))res.sendFile(path.join(__dirname,"public","index.html"))});
init().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("Running on port "+PORT))).catch(e=>{console.error(e);process.exit(1)});
