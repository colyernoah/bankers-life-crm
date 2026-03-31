import { useState, useMemo, useRef, useEffect, useCallback } from "react";

// ─── Supabase ────────────────────────────────────────────────
const SUPABASE_URL = "https://oozgemenwmfzvchpqtme.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9vemdlbWVud21menZjaHBxdG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MjI0NDcsImV4cCI6MjA5MDQ5ODQ0N30.-vYetdVfOrhnqI88CdA_hkA6UA2QGpTjmrAV0FhJUY8";

async function sb(path, options={}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": options.prefer || "",
      ...options.headers,
    },
    ...options,
  });
  if(!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Map DB row → app client shape
function dbToClient(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone||"",
    email: row.email||"",
    product: row.product||"",
    policyNumber: row.policy_number||"",
    carrier: row.carrier||"Bankers Life",
    premium: Number(row.premium)||0,
    stage: row.stage||"new_lead",
    followUp: row.follow_up||"",
    notes: row.notes||"",
    rating: row.rating||null,
    allPolicies: row.all_policies||[],
    activityLog: row.activity_log||[],
    factFinder: row.fact_finder||null,
    dismissedAlerts: row.dismissed_alerts||{},
  };
}

// Map app client → DB row shape
function clientToDb(c) {
  return {
    name: c.name,
    phone: c.phone||"",
    email: c.email||"",
    product: c.product||"",
    policy_number: c.policyNumber||"",
    carrier: c.carrier||"Bankers Life",
    premium: Number(c.premium)||0,
    stage: c.stage||"new_lead",
    follow_up: c.followUp||null,
    notes: c.notes||"",
    rating: c.rating||null,
    all_policies: c.allPolicies||[],
    activity_log: c.activityLog||[],
    fact_finder: c.factFinder||null,
    dismissed_alerts: c.dismissedAlerts||{},
  };
}

// Map DB row → app referral shape
function dbToReferral(row) {
  return {
    id: row.id,
    fromClientId: row.from_client_id||null,
    referredName: row.referred_name||"",
    referredPhone: row.referred_phone||"",
    referredEmail: row.referred_email||"",
    product: row.product||"",
    notes: row.notes||"",
    date: row.date||"",
    status: row.status||"new",
  };
}

function referralToDb(r) {
  return {
    from_client_id: r.fromClientId||null,
    referred_name: r.referredName||"",
    referred_phone: r.referredPhone||"",
    referred_email: r.referredEmail||"",
    product: r.product||"",
    notes: r.notes||"",
    date: r.date||null,
    status: r.status||"new",
  };
}

const PIPELINE_STAGES = [
  { id: "new_lead",       label: "New Lead",       color: "#94a3b8" },
  { id: "appt_set",       label: "Appt Set",        color: "#60a5fa" },
  { id: "appt_completed", label: "Appt Completed",  color: "#a78bfa" },
  { id: "app_submitted",  label: "App Submitted",   color: "#fb923c" },
  { id: "policy_issued",  label: "Policy Issued",   color: "#f59e0b" },
];
const CLIENT_STAGES = ["delivered","annual_review"];
const STAGE_MAP = {
  new_lead:       { label:"New Lead",       color:"#94a3b8" },
  appt_set:       { label:"Appt Set",        color:"#60a5fa" },
  appt_completed: { label:"Appt Completed",  color:"#a78bfa" },
  app_submitted:  { label:"App Submitted",   color:"#fb923c" },
  policy_issued:  { label:"Policy Issued",   color:"#f59e0b" },
  delivered:      { label:"Delivered",       color:"#34d399" },
  annual_review:  { label:"Annual Review",   color:"#f472b6" },
};
const PRODUCTS = ["Medicare Supplement","Medicare Advantage","Life Insurance","Annuity","Long-Term Care","Final Expense","Other"];
const PRODUCT_FILTERS = [
  { id:"Medicare Supplement", label:"Med Supp" },
  { id:"Medicare Advantage",  label:"Med Adv" },
  { id:"Long-Term Care",      label:"LTC" },
  { id:"Annuity",             label:"Annuity" },
  { id:"Life Insurance",      label:"Life" },
];
const CONTACT_TYPES = [
  { id:"call",      label:"Phone Call", icon:"📞" },
  { id:"email",     label:"Email",      icon:"✉️" },
  { id:"in_person", label:"In-Person",  icon:"🤝" },
  { id:"text",      label:"Text",       icon:"💬" },
  { id:"voicemail", label:"Voicemail",  icon:"📱" },
  { id:"other",     label:"Other",      icon:"📝" },
];
const RATINGS = {
  A:{ label:"A Client", color:"#34d399", bg:"#34d39922", desc:"High value — multiple policies or strong cross-sell" },
  B:{ label:"B Client", color:"#60a5fa", bg:"#60a5fa22", desc:"Moderate — 1-2 products, some opportunity" },
  C:{ label:"C Client", color:"#94a3b8", bg:"#94a3b822", desc:"Limited — single product, little room to expand" },
};
const MILESTONES = [
  { age:59.5, label:"59½", desc:"IRA/401k penalty-free withdrawals", icon:"💰" },
  { age:62,   label:"62",  desc:"Early Social Security eligibility",  icon:"🏛️" },
  { age:65,   label:"65",  desc:"Medicare eligibility",               icon:"🏥" },
  { age:75,   label:"75",  desc:"RMDs increase / Medicare review",    icon:"📋" },
];
const REFERRAL_STATUSES = {
  new:      { label:"New",       color:"#60a5fa", bg:"#60a5fa22" },
  contacted:{ label:"Contacted", color:"#fbbf24", bg:"#fbbf2422" },
  appt:     { label:"Appt Set",  color:"#a78bfa", bg:"#a78bfa22" },
  converted:{ label:"Converted", color:"#34d399", bg:"#34d39922" },
  lost:     { label:"No Sale",   color:"#94a3b8", bg:"#94a3b822" },
};

const today = new Date(); today.setHours(0,0,0,0);
const isOverdue  = d => { if(!d) return false; const x=new Date(d); x.setHours(0,0,0,0); return x<today; };
const isDueSoon  = d => { if(!d) return false; const x=new Date(d); x.setHours(0,0,0,0); const diff=(x-today)/86400000; return diff>=0&&diff<=7; };
const fmtDate    = d => { if(!d) return "—"; return new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}); };
const fmtDT      = d => { if(!d) return "—"; const x=new Date(d); return x.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})+" · "+x.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}); };
const calcAge    = dob => { if(!dob) return null; return Math.floor((Date.now()-new Date(dob+"T00:00:00").getTime())/3.15576e10); };
const isClientStage = s => CLIENT_STAGES.includes(s);

function getMilestoneDate(dobStr, ageDecimal) {
  const dob = new Date(dobStr+"T00:00:00");
  if(isNaN(dob)) return null;
  const d = new Date(dob);
  d.setMonth(d.getMonth()+Math.round(ageDecimal*12));
  return d;
}

function getClientAlerts(client) {
  const ff = client.factFinder; if(!ff) return [];
  const dismissed = client.dismissedAlerts||{};
  const alerts = [], people = [];
  if(ff.dob) people.push({name:client.name,dob:ff.dob,relation:"Client"});
  if(ff.spouseDob) people.push({name:ff.spouseName||"Spouse",dob:ff.spouseDob,relation:"Spouse"});
  (ff.children||[]).forEach(ch=>{ if(ch.dob) people.push({name:ch.name||"Child",dob:ch.dob,relation:"Child"}); });
  people.forEach(person=>{
    MILESTONES.forEach(m=>{
      const mDate = getMilestoneDate(person.dob,m.age); if(!mDate) return;
      const diffDays = Math.round((mDate-today)/86400000);
      if(!((diffDays>=0&&diffDays<=90)||(diffDays>=-30&&diffDays<0))) return;
      const key = `${client.id}_${person.name}_${m.label}`;
      if(dismissed[key]) return;
      alerts.push({key,clientId:client.id,clientName:client.name,personName:person.name,
        relation:person.relation,milestone:m,milestoneDate:mDate,diffDays,
        urgency:diffDays<0?"birthday":diffDays<=30?"urgent":"upcoming",
        rating:client.rating,product:client.product});
    });
  });
  return alerts;
}

const urgencyStyle = u => ({
  birthday:{ bg:"#7c3aed22",border:"#7c3aed55",color:"#a78bfa",icon:"🎂" },
  urgent:  { bg:"#dc262622",border:"#dc262655",color:"#f87171",icon:"🔴" },
  upcoming:{ bg:"#d9770622",border:"#d9770655",color:"#fbbf24",icon:"⚠️" },
}[u]||{ bg:"#1e2433",border:"#334155",color:"#94a3b8",icon:"📅" });

const ffComplete = ff => {
  if(!ff) return {pct:0,filled:0,total:8};
  const fields=[ff.dob,ff.occupation,ff.currentHealthInsurance,ff.beneficiary,ff.income,ff.medicareNumber,ff.preferredContactTime,ff.medications];
  const filled=fields.filter(f=>f&&f.trim()).length;
  return {pct:Math.round((filled/8)*100),filled,total:8};
};

const emptyFF = {dob:"",occupation:"",preferredContactTime:"",spouseName:"",spouseDob:"",spousePhone:"",children:[],currentHealthInsurance:"",medicareNumber:"",medicareEffectiveDate:"",medications:"",income:"",beneficiary:""};
const emptyClient = {name:"",phone:"",email:"",product:PRODUCTS[0],policyNumber:"",carrier:"Bankers Life",premium:"",stage:"new_lead",followUp:"",notes:"",activityLog:[],allPolicies:[],rating:null,factFinder:null,dismissedAlerts:{}};
const emptyEntry = {type:"call",text:"",followUpUpdate:""};

// Client data is loaded from Supabase
// Seed data removed — add clients via the + Add button


// ─── Demo referrals ───────────────────────────────────────────
// Referral data is loaded from Supabase

// ─── CSS ──────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px;height:5px}
  ::-webkit-scrollbar-track{background:#1a1d27}
  ::-webkit-scrollbar-thumb{background:#334155;border-radius:3px}
  input,select,textarea{font-family:inherit}
  .nb{background:none;border:none;cursor:pointer;padding:7px 14px;border-radius:7px;font-size:13px;font-weight:500;color:#94a3b8;transition:all .2s;white-space:nowrap}
  .nb:hover{background:#1e2433;color:#e2e8f0}
  .nb.on{background:#1e2433;color:#60a5fa}
  .card{background:#161b2e;border:1px solid #1e2d4a;border-radius:12px;padding:18px}
  .bp{background:#3b82f6;color:#fff;border:none;border-radius:7px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer}.bp:hover{background:#2563eb}
  .bg{background:none;border:1px solid #2d3748;color:#94a3b8;border-radius:7px;padding:7px 13px;font-size:13px;cursor:pointer;transition:all .2s}.bg:hover{border-color:#4a5568;color:#e2e8f0}
  .bd{background:none;border:1px solid #7f1d1d;color:#f87171;border-radius:7px;padding:7px 13px;font-size:13px;cursor:pointer}.bd:hover{background:#7f1d1d33}
  .bai{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:7px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}.bai:hover{opacity:.85}.bai:disabled{opacity:.5;cursor:not-allowed}
  .bi{background:none;border:none;cursor:pointer;color:#475569;font-size:13px;padding:3px 6px;border-radius:4px}.bi:hover{color:#f87171;background:#7f1d1d22}
  .inp{background:#1a1d27;border:1px solid #2d3748;border-radius:7px;padding:8px 11px;color:#e2e8f0;font-size:13px;width:100%;outline:none;transition:border .2s}.inp:focus{border-color:#3b82f6}
  .tag{display:inline-flex;align-items:center;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:500}
  .ov{color:#f87171}.ds{color:#fbbf24}
  .pk{background:#1a1d27;border:1px solid #2d3748;border-radius:9px;padding:11px;margin-bottom:7px;cursor:pointer;transition:all .2s}.pk:hover{border-color:#3b82f6;transform:translateY(-1px)}
  .mo{position:fixed;inset:0;background:rgba(0,0,0,.78);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
  .md{background:#161b2e;border:1px solid #1e2d4a;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto}
  .mdw{max-width:680px}
  .fg{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .fg label{display:block;font-size:11px;color:#64748b;margin-bottom:4px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
  select.inp option{background:#1a1d27}
  .pbb{background:#1a1d27;border-radius:4px;height:6px;overflow:hidden}.pb{height:100%;border-radius:4px;transition:width .5s ease}
  .tb{background:none;border:none;cursor:pointer;padding:7px 13px;font-size:13px;font-weight:500;color:#64748b;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap}.tb.on{color:#60a5fa;border-bottom-color:#60a5fa}.tb:hover:not(.on){color:#94a3b8}
  .le{background:#1a1d27;border:1px solid #1e2433;border-radius:9px;padding:12px;margin-bottom:9px}
  .chip{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;background:#1e2433;color:#94a3b8}
  .ctb{background:#1a1d27;border:1px solid #2d3748;border-radius:7px;padding:6px 11px;font-size:12px;cursor:pointer;color:#94a3b8;transition:all .15s;display:flex;align-items:center;gap:5px}.ctb.on{border-color:#3b82f6;background:#3b82f622;color:#60a5fa}.ctb:hover:not(.on){border-color:#4a5568;color:#e2e8f0}
  .pfb{background:#1a1d27;border:1px solid #2d3748;border-radius:7px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;color:#94a3b8;transition:all .15s}.pfb.on{background:#3b82f622;border-color:#3b82f6;color:#60a5fa}.pfb:hover:not(.on){border-color:#4a5568;color:#e2e8f0}
  .ai-box{background:linear-gradient(135deg,#1a1535,#161b2e);border:1px solid #6366f133;border-radius:11px;padding:14px;margin-bottom:14px}
  .ff-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .sec-hdr{display:flex;align-items:center;gap:7px;margin-bottom:10px;padding-bottom:7px;border-bottom:1px solid #1e2433}
  .sm{padding:5px 11px;font-size:12px}
  .dropdown{position:relative;display:inline-block}
  .dropdown-menu{position:absolute;top:calc(100% + 4px);left:0;background:#161b2e;border:1px solid #1e2d4a;border-radius:9px;padding:4px;min-width:160px;z-index:200;box-shadow:0 8px 24px rgba(0,0,0,.4)}
  .dropdown-item{display:block;width:100%;text-align:left;background:none;border:none;padding:8px 12px;font-size:13px;color:#94a3b8;cursor:pointer;border-radius:6px;font-family:inherit}.dropdown-item:hover{background:#1e2433;color:#e2e8f0}
  .dropdown-item.on{color:#60a5fa;background:#1e2433}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}.loading{animation:pulse 1.4s ease-in-out infinite;color:#94a3b8;font-size:13px}
  .pact{padding:10px 12px;border-radius:9px;cursor:pointer;display:flex;align-items:center;gap:10px;transition:filter .15s}.pact:hover{filter:brightness(1.1)}
`;

export default function App() {
  const [clients, setClients]         = useState([]);
  const [referrals, setReferrals]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [saveStatus, setSaveStatus]   = useState(""); // "saving" | "saved" | "error"
  const [view, setView]               = useState("today");
  const [pipelineSubView, setPSV]     = useState("pipeline"); // pipeline | performance | report
  const [showPipeDD, setShowPipeDD]   = useState(false);
  const [calMonth, setCalMonth]       = useState(new Date());
  const [reportMonth, setReportMonth] = useState(new Date());
  const [milestoneTab, setMilestoneTab] = useState("alerts"); // alerts | calendar
  const [sel, setSel]                 = useState(null);
  const [selTab, setSelTab]           = useState("details");
  const [showForm, setShowForm]       = useState(false);
  const [form, setForm]               = useState(emptyClient);
  const [editId, setEditId]           = useState(null);
  const [productFilters, setPF]       = useState([]);
  const [ratingFilter, setRF]         = useState("all");
  const [search, setSearch]           = useState("");
  const [entry, setEntry]             = useState(emptyEntry);
  const [addingEntry, setAddingEntry] = useState(false);
  const [ff, setFf]                   = useState(null);
  const [ffDirty, setFfDirty]         = useState(false);
  const [aiSummary, setAiSummary]     = useState(null);
  const [summaryLoading, setSL]       = useState(false);
  const [aiRating, setAiRating]       = useState(null);
  const [ratingLoading, setRL]        = useState(false);
  const [showRefForm, setShowRefForm] = useState(false);
  const [refForm, setRefForm]         = useState({fromClientId:"",referredName:"",referredPhone:"",referredEmail:"",product:"",notes:"",date:new Date().toISOString().slice(0,10),status:"new"});
  const pipeRef = useRef(null);

  // ─── Load data from Supabase on mount ───────────────────────
  useEffect(()=>{
    async function loadData() {
      setLoading(true);
      try {
        const [clientRows, refRows] = await Promise.all([
          sb("clients?order=created_at.asc&select=*"),
          sb("referrals?order=created_at.asc&select=*"),
        ]);
        setClients((clientRows||[]).map(dbToClient));
        setReferrals((refRows||[]).map(dbToReferral));
      } catch(e) {
        console.error("Failed to load data:", e);
      }
      setLoading(false);
    }
    loadData();
  },[]);

  // ─── Auto-save helper ────────────────────────────────────────
  const showSaved = () => { setSaveStatus("saved"); setTimeout(()=>setSaveStatus(""),2000); };
  const showSaving = () => setSaveStatus("saving");
  const showError = () => { setSaveStatus("error"); setTimeout(()=>setSaveStatus(""),3000); };

  // Close dropdown on outside click
  useEffect(()=>{
    const h = e => { if(pipeRef.current&&!pipeRef.current.contains(e.target)) setShowPipeDD(false); };
    document.addEventListener("mousedown",h);
    return ()=>document.removeEventListener("mousedown",h);
  },[]);

  const nextId  = useMemo(()=>Math.max(0,...clients.map(c=>c.id))+1,[clients]);
  const nextRid = useMemo(()=>Math.max(0,...referrals.map(r=>r.id))+1,[referrals]);

  const allAlerts = useMemo(()=>{
    const a=[]; clients.forEach(c=>a.push(...getClientAlerts(c)));
    return a.sort((a,b)=>a.diffDays-b.diffDays);
  },[clients]);

  const clientBook      = clients.filter(c=>isClientStage(c.stage));
  const pipelineClients = clients.filter(c=>!isClientStage(c.stage));
  const annualReview    = clientBook.filter(c=>c.stage==="annual_review");
  const totalPremium    = clientBook.reduce((s,c)=>s+Number(c.premium||0),0);
  const overdueCount    = clients.filter(c=>isOverdue(c.followUp)).length;
  const dueSoonCount    = clients.filter(c=>isDueSoon(c.followUp)&&!isOverdue(c.followUp)).length;

  const milestoneAlertClients = useMemo(()=>{
    const seen=new Set(), res=[];
    allAlerts.forEach(a=>{ if(!seen.has(a.clientId)){ seen.add(a.clientId); res.push({client:clients.find(c=>c.id===a.clientId),alerts:allAlerts.filter(x=>x.clientId===a.clientId)}); } });
    return res;
  },[allAlerts,clients]);

  const filteredClients = clientBook.filter(c=>{
    const mq=!search||c.name.toLowerCase().includes(search.toLowerCase())||c.phone.includes(search);
    const mr=ratingFilter==="all"||c.rating===ratingFilter||(ratingFilter==="unrated"&&!c.rating);
    const mp=productFilters.length===0||productFilters.some(pf=>[...(c.allPolicies||[]).map(p=>p.product),c.product].includes(pf));
    return mq&&mr&&mp;
  });

  // ─── Actions ────────────────────────────────────────────────
  const openClient = (c,t="details") => {
    setSel(c); setSelTab(t); setAddingEntry(false); setEntry(emptyEntry);
    setAiSummary(null); setAiRating(null);
    setFf(c.factFinder?{...c.factFinder,children:[...(c.factFinder.children||[])]}:{...emptyFF,children:[]});
    setFfDirty(false);
  };
  const closeClient = () => { setSel(null); setFf(null); setFfDirty(false); setAiSummary(null); setAiRating(null); };

  const saveClient = async () => {
    if(!form.name.trim()) return;
    showSaving();
    try {
      if(editId) {
        await sb(`clients?id=eq.${editId}`, {
          method:"PATCH", prefer:"return=representation",
          body: JSON.stringify(clientToDb(form)),
        });
        setClients(p=>p.map(c=>c.id===editId?{...form,id:editId}:c));
      } else {
        const rows = await sb("clients", {
          method:"POST", prefer:"return=representation",
          headers:{"Prefer":"return=representation"},
          body: JSON.stringify(clientToDb({...form,premium:Number(form.premium)||0,activityLog:[],allPolicies:[],rating:null,factFinder:null,dismissedAlerts:{}})),
        });
        if(rows&&rows[0]) setClients(p=>[...p, dbToClient(rows[0])]);
      }
      showSaved();
      setShowForm(false);
    } catch(e) { console.error(e); showError(); }
  };
  const deleteClient = async id => {
    showSaving();
    try {
      await sb(`clients?id=eq.${id}`, { method:"DELETE" });
      setClients(p=>p.filter(c=>c.id!==id));
      setSel(null);
      showSaved();
    } catch(e) { console.error(e); showError(); }
  };
  const moveStage = async (cid,stage) => {
    setClients(p=>p.map(c=>c.id===cid?{...c,stage}:c));
    setSel(p=>p?{...p,stage}:null);
    try { await sb(`clients?id=eq.${cid}`, { method:"PATCH", body: JSON.stringify({stage}) }); }
    catch(e) { console.error(e); }
  };
  const setRating = async (cid,rating) => {
    setClients(p=>p.map(c=>c.id===cid?{...c,rating}:c));
    setSel(p=>p?{...p,rating}:null);
    setAiRating(null);
    try { await sb(`clients?id=eq.${cid}`, { method:"PATCH", body: JSON.stringify({rating}) }); }
    catch(e) { console.error(e); }
  };
  const dismissAlert = async (cid,key) => {
    const client = clients.find(c=>c.id===cid);
    if(!client) return;
    const dismissed = {...(client.dismissedAlerts||{}),[key]:true};
    setClients(p=>p.map(c=>c.id===cid?{...c,dismissedAlerts:dismissed}:c));
    try { await sb(`clients?id=eq.${cid}`, { method:"PATCH", body: JSON.stringify({dismissed_alerts:dismissed}) }); }
    catch(e) { console.error(e); }
  };
  const markContacted = async (cid,key,note) => {
    const client = clients.find(c=>c.id===cid);
    if(!client) return;
    const e={id:Date.now(),date:new Date().toISOString().slice(0,16),type:"call",text:note||"Milestone contact.",followUpUpdate:""};
    const dismissed={...(client.dismissedAlerts||{}),[key]:true};
    const activityLog=[e,...(client.activityLog||[])];
    setClients(p=>p.map(c=>c.id!==cid?c:{...c,dismissedAlerts:dismissed,activityLog}));
    setSel(p=>p?{...p,dismissedAlerts:dismissed}:null);
    try { await sb(`clients?id=eq.${cid}`,{method:"PATCH",body:JSON.stringify({dismissed_alerts:dismissed,activity_log:activityLog})}); }
    catch(e){ console.error(e); }
  };
  const saveFF = async () => {
    if(!sel||!ff) return;
    showSaving();
    try {
      await sb(`clients?id=eq.${sel.id}`,{method:"PATCH",body:JSON.stringify({fact_finder:ff})});
      setClients(p=>p.map(c=>c.id===sel.id?{...c,factFinder:{...ff}}:c));
      setSel(p=>p?{...p,factFinder:{...ff}}:null);
      setFfDirty(false);
      showSaved();
    } catch(e){ console.error(e); showError(); }
  };
  const updFF = (f,v) => { setFf(p=>({...p,[f]:v})); setFfDirty(true); };
  const addChild = () => { setFf(p=>({...p,children:[...(p.children||[]),{name:"",phone:"",dob:""}]})); setFfDirty(true); };
  const updChild = (i,f,v) => { setFf(p=>{ const c=[...(p.children||[])]; c[i]={...c[i],[f]:v}; return {...p,children:c}; }); setFfDirty(true); };
  const rmChild = i => { setFf(p=>{ const c=[...(p.children||[])]; c.splice(i,1); return {...p,children:c}; }); setFfDirty(true); };

  const addLogEntry = async () => {
    if(!entry.text.trim()) return;
    const client = clients.find(c=>c.id===sel.id);
    if(!client) return;
    const e={id:Date.now(),date:new Date().toISOString().slice(0,16),type:entry.type,text:entry.text,followUpUpdate:entry.followUpUpdate};
    const dismissed={};
    allAlerts.filter(a=>a.clientId===sel.id).forEach(a=>{ dismissed[a.key]=true; });
    const activityLog=[e,...(client.activityLog||[])];
    const dismissedAlerts={...(client.dismissedAlerts||{}),...dismissed};
    const patch={activity_log:activityLog,dismissed_alerts:dismissedAlerts};
    if(entry.followUpUpdate) patch.follow_up=entry.followUpUpdate;
    setClients(p=>p.map(c=>{ if(c.id!==sel.id) return c; const u={...c,activityLog,dismissedAlerts}; if(entry.followUpUpdate) u.followUp=entry.followUpUpdate; return u; }));
    setSel(p=>{ const u={...p,activityLog}; if(entry.followUpUpdate) u.followUp=entry.followUpUpdate; return u; });
    setEntry(emptyEntry); setAddingEntry(false); setAiSummary(null);
    try { await sb(`clients?id=eq.${sel.id}`,{method:"PATCH",body:JSON.stringify(patch)}); }
    catch(err){ console.error(err); }
  };
  const delEntry = async (cid,eid) => {
    const client = clients.find(c=>c.id===cid);
    if(!client) return;
    const activityLog=client.activityLog.filter(e=>e.id!==eid);
    setClients(p=>p.map(c=>c.id===cid?{...c,activityLog}:c));
    setSel(p=>p?{...p,activityLog:p.activityLog.filter(e=>e.id!==eid)}:null);
    try { await sb(`clients?id=eq.${cid}`,{method:"PATCH",body:JSON.stringify({activity_log:activityLog})}); }
    catch(e){ console.error(e); }
  };

  const saveReferral = async () => {
    if(!refForm.referredName.trim()) return;
    showSaving();
    try {
      const rows = await sb("referrals",{
        method:"POST", headers:{"Prefer":"return=representation"},
        body:JSON.stringify(referralToDb({...refForm,fromClientId:Number(refForm.fromClientId)||null})),
      });
      if(rows&&rows[0]) setReferrals(p=>[dbToReferral(rows[0]),...p]);
      setShowRefForm(false);
      setRefForm({fromClientId:"",referredName:"",referredPhone:"",referredEmail:"",product:"",notes:"",date:new Date().toISOString().slice(0,10),status:"new"});
      showSaved();
    } catch(e){ console.error(e); showError(); }
  };
  const updateRefStatus = async (id,status) => {
    setReferrals(p=>p.map(r=>r.id===id?{...r,status}:r));
    try { await sb(`referrals?id=eq.${id}`,{method:"PATCH",body:JSON.stringify({status})}); }
    catch(e){ console.error(e); }
  };
  const deleteRef = async id => {
    setReferrals(p=>p.filter(r=>r.id!==id));
    try { await sb(`referrals?id=eq.${id}`,{method:"DELETE"}); }
    catch(e){ console.error(e); }
  };

  async function generateSummary() {
    if(!sel?.activityLog?.length) return;
    setSL(true); setAiSummary(null);
    const CTMAP={call:"Phone Call",email:"Email",in_person:"In-Person",text:"Text",voicemail:"Voicemail",other:"Other"};
    const logText=sel.activityLog.map(e=>`[${fmtDT(e.date)} - ${CTMAP[e.type]||e.type}]: ${e.text}${e.followUpUpdate?` (Follow-up: ${fmtDate(e.followUpUpdate)})`:"" }`).join("\n");
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,messages:[{role:"user",content:`Summarize this insurance client for a Bankers Life agent.\nClient: ${sel.name} | Product: ${sel.product} | Stage: ${STAGE_MAP[sel.stage]?.label}\nNotes: ${sel.notes||"None"}\n\nActivity:\n${logText}\n\n1. **Current Status & Next Steps**\n2. **Relationship History**\n3. **Key Decisions & Products Discussed**\nBullet points, concise.`}]})});
      const data=await res.json();
      setAiSummary(data.content?.map(b=>b.text||"").join("")||"Unable to generate summary.");
    } catch { setAiSummary("Error generating summary."); }
    setSL(false);
  }

  async function suggestRating() {
    if(!sel) return;
    setRL(true); setAiRating(null);
    const allProds=[...new Set((sel.allPolicies||[]).map(p=>p.product).concat([sel.product]))].join(", ");
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:150,messages:[{role:"user",content:`Rate insurance client. A=high value/multiple policies, B=moderate, C=limited.\nClient: ${sel.name} | Products: ${allProds} | Premium: $${Number(sel.premium||0).toLocaleString()} | Notes: ${sel.notes||"None"}\nRespond ONLY with JSON: {"rating":"A","reason":"1-2 sentences"}`}]})});
      const data=await res.json();
      const text=data.content?.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim();
      setAiRating(JSON.parse(text));
    } catch { setAiRating({rating:"?",reason:"Could not generate suggestion."}); }
    setRL(false);
  }

  // ─── Shared UI helpers ───────────────────────────────────────
  const stageStyle = sid => { const s=STAGE_MAP[sid]; return s?{background:s.color+"22",border:`1px solid ${s.color}55`,color:s.color}:{}; };
  const ct = tid => CONTACT_TYPES.find(t=>t.id===tid)||CONTACT_TYPES[5];
  const RatingBadge = ({rating,size="sm"}) => {
    if(!rating) return null; const r=RATINGS[rating];
    return <span style={{background:r.bg,border:`1px solid ${r.color}55`,color:r.color,borderRadius:20,padding:size==="lg"?"4px 13px":"2px 8px",fontSize:size==="lg"?12:10,fontWeight:700}}>{rating}</span>;
  };
  const SHdr = ({icon,title}) => (
    <div className="sec-hdr"><span style={{fontSize:15}}>{icon}</span><span style={{fontSize:12,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em"}}>{title}</span></div>
  );
  const FFField = ({label,value,onChange,type="text",placeholder=""}) => (
    <div><div style={{fontSize:11,color:"#475569",marginBottom:3,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</div>
    <input className="inp" type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder||label}/></div>
  );
  const FFArea = ({label,value,onChange,placeholder,rows=2}) => (
    <div><div style={{fontSize:11,color:"#475569",marginBottom:3,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</div>
    <textarea className="inp" value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder||label} rows={rows} style={{resize:"vertical"}}/></div>
  );
  const renderMd = t => t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/^- (.+)$/gm,'<div style="display:flex;gap:7px;margin:2px 0"><span style="color:#3b82f6;flex-shrink:0">•</span><span>$1</span></div>').replace(/\n/g,"<br/>");

  const pipelineDD = ["pipeline","performance","report"].includes(view);

  return (
    <div style={{fontFamily:"'DM Sans','Segoe UI',sans-serif",minHeight:"100vh",background:"#0f1117",color:"#e2e8f0"}}>
      {loading&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,17,23,.95)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",zIndex:999}}>
          <div style={{fontSize:32,marginBottom:12}}>🏦</div>
          <div style={{fontSize:16,fontWeight:700,color:"#e2e8f0",marginBottom:6}}>Bankers Life CRM</div>
          <div style={{fontSize:13,color:"#475569"}}>Loading your book of business…</div>
        </div>
      )}
      {saveStatus&&(
        <div style={{position:"fixed",bottom:20,right:20,background:saveStatus==="error"?"#7f1d1d":saveStatus==="saved"?"#065f46":"#1e2433",border:`1px solid ${saveStatus==="error"?"#f87171":saveStatus==="saved"?"#34d399":"#334155"}`,color:saveStatus==="error"?"#f87171":saveStatus==="saved"?"#34d399":"#94a3b8",borderRadius:9,padding:"8px 16px",fontSize:13,fontWeight:600,zIndex:999,boxShadow:"0 4px 12px rgba(0,0,0,.4)"}}>
          {saveStatus==="saving"?"💾 Saving…":saveStatus==="saved"?"✓ Saved":saveStatus==="error"?"⚠ Save failed — check connection":""}
        </div>
      )}
      <style>{CSS}</style>

      {/* ── Header / Nav ─────────────────────────────────── */}
      <div style={{background:"#0d1018",borderBottom:"1px solid #1e2433",padding:"0 20px",display:"flex",alignItems:"center",gap:4,height:54,flexWrap:"nowrap",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginRight:12,flexShrink:0}}>
          <div style={{width:28,height:28,borderRadius:7,background:"linear-gradient(135deg,#3b82f6,#6366f1)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🏦</div>
          <span style={{fontSize:13,fontWeight:700,color:"#e2e8f0",letterSpacing:"-0.02em",whiteSpace:"nowrap"}}>Bankers Life</span>
        </div>

        {/* Simple tabs */}
        <button className={`nb ${view==="today"?"on":""}`} onClick={()=>setView("today")}>
          ☀️ Today
          {(overdueCount+allAlerts.filter(a=>a.urgency!=="upcoming").length)>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:20,padding:"1px 5px",fontSize:9,fontWeight:700,marginLeft:5}}>{overdueCount+allAlerts.filter(a=>a.urgency!=="upcoming").length}</span>}
        </button>
        <button className={`nb ${view==="clients"?"on":""}`} onClick={()=>setView("clients")}>Clients</button>
        <button className={`nb ${view==="milestones"?"on":""}`} onClick={()=>setView("milestones")}>
          🗿 Milestones
          {allAlerts.length>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:20,padding:"1px 5px",fontSize:9,fontWeight:700,marginLeft:5}}>{allAlerts.length}</span>}
        </button>
        <button className={`nb ${view==="referrals"?"on":""}`} onClick={()=>setView("referrals")}>🤝 Referrals</button>
        <button className={`nb ${view==="followups"?"on":""}`} onClick={()=>setView("followups")}>Follow-Ups</button>

        {/* Pipeline dropdown */}
        <div className="dropdown" ref={pipeRef}>
          <button className={`nb ${pipelineDD?"on":""}`} onClick={()=>setShowPipeDD(p=>!p)} style={{display:"flex",alignItems:"center",gap:4}}>
            {view==="performance"?"📊 Performance":view==="report"?"📋 Report":"🔄 Pipeline"}
            <span style={{fontSize:10,color:"#475569",marginLeft:2}}>▾</span>
          </button>
          {showPipeDD&&(
            <div className="dropdown-menu">
              {[["pipeline","🔄 Pipeline"],["performance","📊 Performance"],["report","📋 Report"]].map(([v,l])=>(
                <button key={v} className={`dropdown-item ${view===v?"on":""}`} onClick={()=>{ setView(v); setPSV(v); setShowPipeDD(false); }}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
          {overdueCount>0&&<span style={{background:"#7f1d1d33",color:"#f87171",border:"1px solid #7f1d1d55",borderRadius:20,padding:"2px 9px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>⚠ {overdueCount}</span>}
          <button className="bp sm" onClick={()=>{ setForm({...emptyClient,activityLog:[],allPolicies:[],rating:null,factFinder:null,dismissedAlerts:{}}); setEditId(null); setShowForm(true); }}>+ Add</button>
        </div>
      </div>

      {/* ── Stats bar (always visible) ───────────────────── */}
      <div style={{background:"#0d1018",borderBottom:"1px solid #1e2433",padding:"10px 20px",display:"flex",gap:24,overflowX:"auto"}}>
        {[
          {label:"Clients",value:clientBook.length,color:"#60a5fa"},
          {label:"In Pipeline",value:pipelineClients.length,color:"#a78bfa"},
          {label:"Premium",value:`$${totalPremium.toLocaleString("en-US",{maximumFractionDigits:0})}`,color:"#fbbf24"},
          {label:"A Clients",value:clients.filter(c=>c.rating==="A").length,color:"#34d399"},
          {label:"Alerts",value:allAlerts.length,color:allAlerts.length>0?"#f87171":"#475569"},
          {label:"Open Referrals",value:referrals.filter(r=>["new","contacted","appt"].includes(r.status)).length,color:"#60a5fa"},
        ].map(s=>(
          <div key={s.label} style={{display:"flex",alignItems:"center",gap:7,flexShrink:0}}>
            <span style={{fontSize:18,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace"}}>{s.value}</span>
            <span style={{fontSize:11,color:"#475569",fontWeight:500}}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main content ─────────────────────────────────── */}
      <div style={{padding:"20px",maxWidth:1400,margin:"0 auto"}}>

        {/* TODAY */}
        {view==="today"&&(()=>{
          const overdueFollowUps = clients.filter(c=>isOverdue(c.followUp)).sort((a,b)=>new Date(a.followUp)-new Date(b.followUp));
          const dueSoonFU = clients.filter(c=>isDueSoon(c.followUp)&&!isOverdue(c.followUp)).sort((a,b)=>new Date(a.followUp)-new Date(b.followUp));
          const policyReady = pipelineClients.filter(c=>c.stage==="policy_issued");
          const urgentAlerts = allAlerts.filter(a=>a.urgency==="birthday"||a.urgency==="urgent");
          const newReferrals = referrals.filter(r=>r.status==="new");
          const todayStr = today.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});

          const allPriorities = [
            ...overdueFollowUps.map(c=>({type:"overdue",client:c})),
            ...urgentAlerts.map(a=>({type:"alert",alert:a})),
            ...policyReady.map(c=>({type:"deliver",client:c})),
            ...newReferrals.map(r=>({type:"referral",referral:r})),
            ...dueSoonFU.map(c=>({type:"soon",client:c})),
          ];

          const allClear = allPriorities.length===0;

          return (
          <div>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:22,fontWeight:700,color:"#e2e8f0",marginBottom:2}}>Good morning ☀️</div>
              <div style={{fontSize:13,color:"#475569"}}>{todayStr}</div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 340px",gap:20}}>
              <div className="card">
                <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:16}}>🎯 Today's Priorities</div>
                {allClear?(
                  <div style={{textAlign:"center",padding:"28px 0",color:"#475569"}}>
                    <div style={{fontSize:28,marginBottom:8}}>🎉</div>
                    <div style={{fontSize:14,fontWeight:500}}>All caught up — nothing urgent today!</div>
                  </div>
                ):(
                  <div style={{display:"flex",flexDirection:"column",gap:7}}>
                    {allPriorities.slice(0,8).map((item,i)=>{
                      if(item.type==="overdue") return (
                        <div key={i} className="pact" style={{background:"#7f1d1d22",border:"1px solid #7f1d1d44"}} onClick={()=>openClient(item.client,"history")}>
                          <span style={{fontSize:15}}>🔴</span>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.client.name}</div><div style={{fontSize:11,color:"#f87171"}}>Follow-up overdue · {fmtDate(item.client.followUp)}</div></div>
                          <RatingBadge rating={item.client.rating}/>
                        </div>
                      );
                      if(item.type==="alert") return (
                        <div key={i} className="pact" style={{background:"#6366f122",border:"1px solid #6366f144"}} onClick={()=>setView("milestones")}>
                          <span style={{fontSize:15}}>{item.alert.urgency==="birthday"?"🎂":"🗿"}</span>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.alert.clientName}</div><div style={{fontSize:11,color:"#a78bfa"}}>{item.alert.personName} — Age {item.alert.milestone.label} · {item.alert.diffDays<0?"Birthday month":`${item.alert.diffDays}d`}</div></div>
                          <RatingBadge rating={item.alert.rating}/>
                        </div>
                      );
                      if(item.type==="deliver") return (
                        <div key={i} className="pact" style={{background:"#05966922",border:"1px solid #05966944"}} onClick={()=>openClient(item.client)}>
                          <span style={{fontSize:15}}>✅</span>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.client.name}</div><div style={{fontSize:11,color:"#34d399"}}>Policy issued — ready to deliver</div></div>
                          <RatingBadge rating={item.client.rating}/>
                        </div>
                      );
                      if(item.type==="referral") return (
                        <div key={i} className="pact" style={{background:"#3b82f622",border:"1px solid #3b82f644"}} onClick={()=>setView("referrals")}>
                          <span style={{fontSize:15}}>🤝</span>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.referral.referredName}</div><div style={{fontSize:11,color:"#60a5fa"}}>New referral{clients.find(c=>c.id===item.referral.fromClientId)?` from ${clients.find(c=>c.id===item.referral.fromClientId).name}`:""}</div></div>
                        </div>
                      );
                      if(item.type==="soon") return (
                        <div key={i} className="pact" style={{background:"#78350f22",border:"1px solid #78350f44"}} onClick={()=>openClient(item.client,"history")}>
                          <span style={{fontSize:15}}>🟡</span>
                          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{item.client.name}</div><div style={{fontSize:11,color:"#fbbf24"}}>Follow-up due {fmtDate(item.client.followUp)}</div></div>
                          <RatingBadge rating={item.client.rating}/>
                        </div>
                      );
                      return null;
                    })}
                    {allPriorities.length>8&&<div style={{fontSize:12,color:"#475569",padding:"4px 8px"}}>+{allPriorities.length-8} more items</div>}
                  </div>
                )}
              </div>

              {/* Right sidebar */}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Pipeline snapshot */}
                <div className="card">
                  <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                    🔄 Pipeline
                    <button style={{marginLeft:"auto",background:"none",border:"none",color:"#60a5fa",fontSize:11,cursor:"pointer",fontWeight:500}} onClick={()=>setView("pipeline")}>View →</button>
                  </div>
                  {PIPELINE_STAGES.map(s=>{ const cnt=pipelineClients.filter(c=>c.stage===s.id).length; if(!cnt) return null; return (
                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"4px 6px",borderRadius:6,cursor:"pointer"}} onClick={()=>setView("pipeline")} onMouseEnter={e=>e.currentTarget.style.background="#1a1d27"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:s.color,flexShrink:0}}/>
                      <div style={{flex:1,fontSize:12,color:"#94a3b8"}}>{s.label}</div>
                      <div style={{fontSize:12,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace"}}>{cnt}</div>
                    </div>
                  ); })}
                  {annualReview.length>0&&<div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 6px",borderTop:"1px solid #1e2433",marginTop:6,paddingTop:10}}><div style={{width:8,height:8,borderRadius:"50%",background:"#f472b6",flexShrink:0}}/><div style={{flex:1,fontSize:12,color:"#94a3b8"}}>Annual Review</div><div style={{fontSize:12,fontWeight:700,color:"#f472b6",fontFamily:"'DM Mono',monospace"}}>{annualReview.length}</div></div>}
                </div>

                {/* Upcoming milestones */}
                {allAlerts.length>0&&(
                  <div className="card">
                    <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0",marginBottom:12,display:"flex",alignItems:"center",gap:6}}>
                      🗿 Milestones
                      <button style={{marginLeft:"auto",background:"none",border:"none",color:"#60a5fa",fontSize:11,cursor:"pointer",fontWeight:500}} onClick={()=>setView("milestones")}>View All →</button>
                    </div>
                    {allAlerts.slice(0,4).map(a=>{ const us=urgencyStyle(a.urgency); return (
                      <div key={a.key} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7,padding:"4px 6px",borderRadius:6,cursor:"pointer"}} onClick={()=>setView("milestones")} onMouseEnter={e=>e.currentTarget.style.background="#1a1d27"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <span style={{fontSize:13}}>{a.milestone.icon}</span>
                        <div style={{flex:1}}><div style={{fontSize:12,color:"#e2e8f0",fontWeight:500}}>{a.clientName}</div><div style={{fontSize:10,color:us.color}}>{a.personName} · Age {a.milestone.label} · {a.diffDays<0?"This month":`${a.diffDays}d`}</div></div>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })()}

        {/* CLIENTS */}
        {view==="clients"&&(
          <div>
            <div style={{display:"flex",gap:10,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              <h2 style={{fontSize:17,fontWeight:700,color:"#e2e8f0"}}>Clients <span style={{fontSize:13,color:"#475569",fontWeight:400}}>({filteredClients.length})</span></h2>
              <div style={{marginLeft:"auto",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <input className="inp" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:180}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:6,marginBottom:14,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#475569",fontWeight:600}}>PRODUCT:</span>
              {PRODUCT_FILTERS.map(pf=>(<button key={pf.id} className={`pfb ${productFilters.includes(pf.id)?"on":""}`} onClick={()=>setPF(prev=>prev.includes(pf.id)?prev.filter(x=>x!==pf.id):[...prev,pf.id])}>{pf.label}</button>))}
              <div style={{width:1,height:16,background:"#2d3748",margin:"0 2px"}}/>
              <span style={{fontSize:11,color:"#475569",fontWeight:600}}>RATING:</span>
              {["all","A","B","C","unrated"].map(r=>(<button key={r} className={`pfb ${ratingFilter===r?"on":""}`} onClick={()=>setRF(r)} style={r!=="all"&&r!=="unrated"?{borderColor:ratingFilter===r?RATINGS[r]?.color+"88":"",color:ratingFilter===r?RATINGS[r]?.color:""}:{}}>{r==="all"?"All":r==="unrated"?"Unrated":`${r}`}</button>))}
              {(productFilters.length>0||ratingFilter!=="all"||search)&&(<button className="bg sm" onClick={()=>{ setPF([]); setRF("all"); setSearch(""); }}>✕ Clear</button>)}
            </div>
            <div className="card" style={{padding:0,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse"}}>
                <thead><tr style={{background:"#1a1d27"}}>
                  {["Client","Phone","Product","Rating","Fact Finder","Status","Premium"].map(h=>(
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {filteredClients.map(c=>{
                    const {pct}=ffComplete(c.factFinder);
                    const cAlerts=getClientAlerts(c);
                    const allProds=[...new Set((c.allPolicies||[]).map(p=>p.product).concat([c.product]))];
                    return (
                      <tr key={c.id} onClick={()=>openClient(c)} style={{borderTop:"1px solid #1e2433",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background="#1a1d27"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#e2e8f0",display:"flex",alignItems:"center",gap:6}}>
                            {c.name}
                            {cAlerts.length>0&&<span style={{background:"#a78bfa22",border:"1px solid #a78bfa44",color:"#a78bfa",borderRadius:20,padding:"1px 6px",fontSize:9,fontWeight:700}}>🗿{cAlerts.length}</span>}
                          </div>
                          <div style={{fontSize:10,color:"#475569",fontFamily:"'DM Mono',monospace"}}>{c.policyNumber}</div>
                        </td>
                        <td style={{padding:"10px 14px",fontSize:12,color:"#94a3b8"}}>{c.phone||"—"}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                            {allProds.slice(0,2).map((p,i)=><span key={i} style={{background:"#1e2433",color:"#94a3b8",borderRadius:4,padding:"1px 6px",fontSize:10}}>{p}</span>)}
                            {allProds.length>2&&<span style={{background:"#1e2433",color:"#64748b",borderRadius:4,padding:"1px 6px",fontSize:10}}>+{allProds.length-2}</span>}
                          </div>
                        </td>
                        <td style={{padding:"10px 14px"}}>{c.rating?<RatingBadge rating={c.rating}/>:<span style={{fontSize:11,color:"#334155"}}>—</span>}</td>
                        <td style={{padding:"10px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:5}}>
                            <div style={{width:36,height:4,background:"#1e2433",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:pct===100?"#34d399":pct>50?"#60a5fa":"#475569",borderRadius:2}}/></div>
                            <span style={{fontSize:10,color:pct===100?"#34d399":pct>0?"#94a3b8":"#334155"}}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px"}}><span className="tag" style={stageStyle(c.stage)}>{STAGE_MAP[c.stage]?.label}</span></td>
                        <td style={{padding:"10px 14px",fontSize:12,color:c.premium?"#34d399":"#475569",fontFamily:"'DM Mono',monospace"}}>{c.premium?`$${Number(c.premium).toLocaleString()}`:"—"}</td>
                      </tr>
                    );
                  })}
                  {filteredClients.length===0&&<tr><td colSpan={7} style={{padding:36,textAlign:"center",color:"#475569"}}>No clients match filters</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MILESTONES + CALENDAR */}
        {view==="milestones"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
              <h2 style={{fontSize:17,fontWeight:700,color:"#e2e8f0"}}>🗿 Milestones</h2>
              <div style={{display:"flex",gap:4,background:"#1a1d27",borderRadius:8,padding:3}}>
                <button className={`nb sm ${milestoneTab==="alerts"?"on":""}`} onClick={()=>setMilestoneTab("alerts")}>Alerts {allAlerts.length>0&&<span style={{background:"#dc2626",color:"#fff",borderRadius:20,padding:"1px 5px",fontSize:9,fontWeight:700,marginLeft:4}}>{allAlerts.length}</span>}</button>
                <button className={`nb sm ${milestoneTab==="calendar"?"on":""}`} onClick={()=>setMilestoneTab("calendar")}>Calendar</button>
              </div>
              {milestoneTab==="calendar"&&(
                <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:"auto"}}>
                  <button className="bg sm" onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1))}>←</button>
                  <span style={{fontSize:13,fontWeight:700,color:"#e2e8f0",minWidth:130,textAlign:"center"}}>{calMonth.toLocaleDateString("en-US",{month:"long",year:"numeric"})}</span>
                  <button className="bg sm" onClick={()=>setCalMonth(new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1))}>→</button>
                  <button className="bg sm" onClick={()=>setCalMonth(new Date())}>Today</button>
                </div>
              )}
            </div>

            {milestoneTab==="alerts"&&(
              <div>
                {allAlerts.length===0?(
                  <div className="card" style={{textAlign:"center",padding:44,color:"#475569"}}>
                    <div style={{fontSize:36,marginBottom:10}}>🗿</div>
                    <div style={{fontSize:15,fontWeight:600,color:"#64748b",marginBottom:6}}>No active milestone alerts</div>
                    <div style={{fontSize:12}}>Add DOBs in each client's fact finder to start tracking milestones.</div>
                  </div>
                ):(
                  allAlerts.map(alert=>{
                    const us=urgencyStyle(alert.urgency);
                    const daysLabel=alert.diffDays<0?`Birthday month — ${Math.abs(alert.diffDays)}d ago`:alert.diffDays===0?"Today!":`${alert.diffDays} days away`;
                    return (
                      <div key={alert.key} style={{background:us.bg,border:`1px solid ${us.border}`,borderRadius:11,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:14}}>
                        <div style={{width:46,height:46,borderRadius:10,background:us.bg,border:`1px solid ${us.border}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          <div style={{fontSize:16}}>{alert.milestone.icon}</div>
                          <div style={{fontSize:10,fontWeight:800,color:us.color}}>{alert.milestone.label}</div>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                            <span style={{fontWeight:700,fontSize:14,color:"#e2e8f0",cursor:"pointer"}} onClick={()=>openClient(clients.find(c=>c.id===alert.clientId))}>{alert.clientName}</span>
                            {alert.rating&&<RatingBadge rating={alert.rating}/>}
                            <span style={{fontSize:11,color:"#64748b"}}>· {alert.product}</span>
                          </div>
                          <div style={{fontSize:12,color:us.color,fontWeight:600,marginBottom:2}}>{us.icon} {alert.personName} ({alert.relation}) — Age {alert.milestone.label}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{alert.milestone.desc} · <span style={{color:us.color,fontWeight:600}}>{daysLabel}</span></div>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
                          <button style={{background:"#34d39922",border:"1px solid #34d39955",color:"#34d399",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}} onClick={()=>markContacted(alert.clientId,alert.key,`Milestone contact: ${alert.personName} approaching age ${alert.milestone.label} — ${alert.milestone.desc}`)}>✓ Contacted</button>
                          <button style={{background:"none",border:"1px solid #2d3748",color:"#475569",borderRadius:7,padding:"5px 10px",fontSize:11,cursor:"pointer"}} onClick={()=>dismissAlert(alert.clientId,alert.key)}>Dismiss</button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {milestoneTab==="calendar"&&(()=>{
              const year=calMonth.getFullYear(), month=calMonth.getMonth();
              const firstDay=new Date(year,month,1).getDay(), daysInMonth=new Date(year,month+1,0).getDate();
              const monthEvents={}, followUpEvents={};
              clients.forEach(c=>{
                const ff=c.factFinder; if(!ff) return;
                const people=[];
                if(ff.dob) people.push({name:c.name,dob:ff.dob,relation:"Client"});
                if(ff.spouseDob) people.push({name:ff.spouseName||"Spouse",dob:ff.spouseDob,relation:"Spouse"});
                (ff.children||[]).forEach(ch=>{ if(ch.dob) people.push({name:ch.name||"Child",dob:ch.dob,relation:"Child"}); });
                people.forEach(person=>{ MILESTONES.forEach(m=>{ const mDate=getMilestoneDate(person.dob,m.age); if(!mDate||mDate.getFullYear()!==year||mDate.getMonth()!==month) return; const day=mDate.getDate(); if(!monthEvents[day]) monthEvents[day]=[]; const dismissed=(c.dismissedAlerts||{})[`${c.id}_${person.name}_${m.label}`]; monthEvents[day].push({clientId:c.id,clientName:c.name,personName:person.name,relation:person.relation,milestone:m,rating:c.rating,dismissed}); }); });
                if(c.followUp){ const d=new Date(c.followUp+"T00:00:00"); if(d.getFullYear()===year&&d.getMonth()===month){ const day=d.getDate(); if(!followUpEvents[day]) followUpEvents[day]=[]; followUpEvents[day].push({clientId:c.id,clientName:c.name,rating:c.rating}); } }
              });
              const cells=[]; for(let i=0;i<firstDay;i++) cells.push(null); for(let d=1;d<=daysInMonth;d++) cells.push(d);
              const isToday=(y,m,d)=>today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d;
              return (
                <div>
                  <div style={{display:"flex",gap:12,marginBottom:10}}>
                    {[["🗿","Milestone","#a78bfa"],["📅","Follow-Up","#60a5fa"],["✓","Contacted","#34d399"]].map(([ic,lb,cl])=>(
                      <div key={lb} style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:cl}}><span>{ic}</span><span>{lb}</span></div>
                    ))}
                  </div>
                  <div className="card" style={{padding:0,overflow:"hidden"}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:"#1a1d27"}}>
                      {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{padding:"8px 0",textAlign:"center",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase"}}>{d}</div>)}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
                      {cells.map((day,i)=>{
                        if(!day) return <div key={`e${i}`} style={{minHeight:80,borderTop:"1px solid #1e2433",borderRight:"1px solid #1e2433",background:"#0d1018"}}/>;
                        const mEvs=monthEvents[day]||[], fEvs=followUpEvents[day]||[];
                        const isT=isToday(year,month,day), isPast=today.getFullYear()===year&&today.getMonth()===month&&day<today.getDate();
                        return (
                          <div key={day} style={{minHeight:80,borderTop:"1px solid #1e2433",borderRight:"1px solid #1e2433",padding:"5px 6px",background:isT?"#1e2433":isPast?"#0d1018":"transparent"}}>
                            <div style={{fontSize:12,fontWeight:isT?700:400,color:isT?"#60a5fa":isPast?"#334155":"#94a3b8",marginBottom:3}}>
                              {isT?<span style={{width:18,height:18,borderRadius:"50%",background:"#3b82f6",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",fontWeight:700}}>{day}</span>:day}
                            </div>
                            {mEvs.map((ev,ei)=>(
                              <div key={ei} onClick={()=>openClient(clients.find(c=>c.id===ev.clientId),"milestones")} style={{background:ev.dismissed?"#34d39922":"#a78bfa22",border:`1px solid ${ev.dismissed?"#34d39955":"#a78bfa55"}`,borderRadius:3,padding:"1px 4px",fontSize:9,color:ev.dismissed?"#34d399":"#a78bfa",marginBottom:2,cursor:"pointer",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                {ev.dismissed?"✓":"🗿"} {ev.clientName} {ev.milestone.label}
                              </div>
                            ))}
                            {fEvs.map((ev,ei)=>(
                              <div key={`f${ei}`} onClick={()=>openClient(clients.find(c=>c.id===ev.clientId),"history")} style={{background:"#3b82f622",border:"1px solid #3b82f655",borderRadius:3,padding:"1px 4px",fontSize:9,color:"#60a5fa",marginBottom:2,cursor:"pointer",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                📅 {ev.clientName}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* REFERRALS */}
        {view==="referrals"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
              <h2 style={{fontSize:17,fontWeight:700,color:"#e2e8f0"}}>🤝 Referrals</h2>
              <button className="bp sm" style={{marginLeft:"auto"}} onClick={()=>setShowRefForm(true)}>+ Log Referral</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:20}}>
              {[
                {label:"Total",value:referrals.length,color:"#60a5fa",icon:"🤝"},
                {label:"Converted",value:referrals.filter(r=>r.status==="converted").length,color:"#34d399",icon:"✅"},
                {label:"Conversion Rate",value:referrals.length?`${Math.round((referrals.filter(r=>r.status==="converted").length/referrals.length)*100)}%`:"0%",color:"#fbbf24",icon:"📊"},
                {label:"In Progress",value:referrals.filter(r=>["new","contacted","appt"].includes(r.status)).length,color:"#a78bfa",icon:"🔄"},
              ].map(s=>(
                <div key={s.label} className="card" style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:22}}>{s.icon}</span>
                  <div><div style={{fontSize:20,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace"}}>{s.value}</div><div style={{fontSize:11,color:"#64748b"}}>{s.label}</div></div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:16}}>
              <div className="card" style={{padding:0,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr style={{background:"#1a1d27"}}>{["Referred By","Prospect","Product","Date","Status",""].map(h=><th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em"}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {referrals.length===0&&<tr><td colSpan={6} style={{padding:36,textAlign:"center",color:"#475569"}}>No referrals yet. Click + Log Referral to add one.</td></tr>}
                    {referrals.map(r=>{
                      const fc=clients.find(c=>c.id===r.fromClientId);
                      const st=REFERRAL_STATUSES[r.status]||REFERRAL_STATUSES.new;
                      return (
                        <tr key={r.id} style={{borderTop:"1px solid #1e2433"}}>
                          <td style={{padding:"10px 14px"}}>{fc?<div><div style={{fontSize:12,fontWeight:600,color:"#e2e8f0",cursor:"pointer"}} onClick={()=>openClient(fc)}>{fc.name}</div><RatingBadge rating={fc.rating}/></div>:<span style={{fontSize:12,color:"#475569"}}>—</span>}</td>
                          <td style={{padding:"10px 14px"}}><div style={{fontWeight:600,fontSize:12,color:"#e2e8f0"}}>{r.referredName}</div>{r.referredPhone&&<div style={{fontSize:11,color:"#64748b"}}>{r.referredPhone}</div>}{r.notes&&<div style={{fontSize:10,color:"#475569",marginTop:1,maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.notes}</div>}</td>
                          <td style={{padding:"10px 14px",fontSize:12,color:"#94a3b8"}}>{r.product||"—"}</td>
                          <td style={{padding:"10px 14px",fontSize:11,color:"#64748b"}}>{fmtDate(r.date)}</td>
                          <td style={{padding:"10px 14px"}}><span style={{background:st.bg,border:`1px solid ${st.color}44`,color:st.color,borderRadius:20,padding:"2px 8px",fontSize:11,fontWeight:600}}>{st.label}</span></td>
                          <td style={{padding:"10px 14px"}}>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {Object.entries(REFERRAL_STATUSES).filter(([k])=>k!==r.status).map(([k,s])=>(
                                <button key={k} onClick={()=>updateRefStatus(r.id,k)} style={{background:"none",border:`1px solid ${s.color}33`,color:s.color,borderRadius:5,padding:"2px 7px",fontSize:10,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=s.bg} onMouseLeave={e=>e.currentTarget.style.background="none"}>{s.label}</button>
                              ))}
                              <button onClick={()=>deleteRef(r.id)} style={{background:"none",border:"1px solid #7f1d1d44",color:"#f87171",borderRadius:5,padding:"2px 6px",fontSize:10,cursor:"pointer"}}>✕</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                <div className="card">
                  <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:".05em"}}>🏆 Top Referrers</div>
                  {(()=>{ const cnt={}; referrals.forEach(r=>{ if(r.fromClientId) cnt[r.fromClientId]=(cnt[r.fromClientId]||0)+1; }); const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,n])=>({client:clients.find(c=>c.id===Number(id)),count:n})).filter(x=>x.client); return top.length===0?<div style={{fontSize:12,color:"#475569",textAlign:"center",padding:"12px 0"}}>No referrals yet</div>:top.map(({client,count},i)=>(
                    <div key={client.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,cursor:"pointer",padding:"4px 6px",borderRadius:7}} onClick={()=>openClient(client)} onMouseEnter={e=>e.currentTarget.style.background="#1a1d27"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div style={{width:20,height:20,borderRadius:"50%",background:i===0?"#fbbf2433":"#1e2433",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:i===0?"#fbbf24":"#475569",flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1,fontSize:12,color:"#e2e8f0"}}>{client.name}</div>
                      <RatingBadge rating={client.rating}/>
                      <span style={{fontSize:12,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>{count}</span>
                    </div>
                  )); })()}
                </div>
                <div className="card">
                  <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:12,textTransform:"uppercase",letterSpacing:".05em"}}>Pipeline</div>
                  {Object.entries(REFERRAL_STATUSES).map(([key,s])=>{ const cnt=referrals.filter(r=>r.status===key).length; return (<div key={key} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:s.color}}>{s.label}</span><span style={{fontSize:12,fontWeight:700,color:s.color,fontFamily:"'DM Mono',monospace"}}>{cnt}</span></div><div className="pbb"><div className="pb" style={{width:`${referrals.length>0?(cnt/referrals.length)*100:0}%`,background:s.color}}/></div></div>); })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FOLLOW-UPS */}
        {view==="followups"&&(
          <div>
            <h2 style={{fontSize:17,fontWeight:700,marginBottom:16,color:"#e2e8f0"}}>Follow-Ups</h2>
            {clients.filter(c=>c.followUp).length===0?(<div className="card" style={{textAlign:"center",padding:36,color:"#475569"}}><div style={{fontSize:28,marginBottom:8}}>📅</div><div>No follow-ups scheduled</div></div>):(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {[...clients].filter(c=>c.followUp).sort((a,b)=>new Date(a.followUp)-new Date(b.followUp)).slice(0,20).map(c=>{
                  const ov=isOverdue(c.followUp), sn=isDueSoon(c.followUp), last=c.activityLog?.[0];
                  return (
                    <div key={c.id} className="card" onClick={()=>openClient(c,"history")} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:14,padding:"13px 16px",borderColor:ov?"#7f1d1d":sn?"#78350f":"#1e2d4a"}}>
                      <div style={{width:38,height:38,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,background:ov?"#7f1d1d33":sn?"#78350f33":"#1a1d27",flexShrink:0}}>{ov?"🔴":sn?"🟡":"🔵"}</div>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"center",gap:7}}><div style={{fontWeight:600,fontSize:14,color:"#e2e8f0"}}>{c.name}</div><RatingBadge rating={c.rating}/></div>
                        <div style={{fontSize:12,color:"#64748b"}}>{c.product} · {STAGE_MAP[c.stage]?.label}</div>
                        {last&&<div style={{fontSize:11,color:"#475569",marginTop:2}}>{ct(last.type).icon} {last.text.slice(0,65)}{last.text.length>65?"…":""}</div>}
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:13,fontWeight:600}} className={ov?"ov":sn?"ds":""}>{fmtDate(c.followUp)}</div>
                        <div style={{fontSize:11,color:ov?"#f87171":sn?"#fbbf24":"#475569"}}>{ov?"Overdue":sn?"Due soon":"Upcoming"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* PIPELINE */}
        {view==="pipeline"&&(
          <div>
            <h2 style={{fontSize:17,fontWeight:700,marginBottom:4,color:"#e2e8f0"}}>Pipeline</h2>
            <p style={{fontSize:12,color:"#475569",marginBottom:18}}>Move to <strong style={{color:"#34d399"}}>Delivered</strong> once policy is delivered — client moves to your book automatically.</p>
            <div style={{display:"flex",gap:12,overflowX:"auto",paddingBottom:14}}>
              {PIPELINE_STAGES.map(stage=>{
                const sc=pipelineClients.filter(c=>c.stage===stage.id);
                return (
                  <div key={stage.id} style={{flex:"0 0 185px"}}>
                    <div style={{marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:10,fontWeight:700,color:stage.color,textTransform:"uppercase",letterSpacing:".05em"}}>{stage.label}</span>
                        <span style={{background:stage.color+"22",color:stage.color,borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{sc.length}</span>
                      </div>
                      <div style={{height:3,background:stage.color+"33",borderRadius:2}}><div style={{height:"100%",width:sc.length?"100%":"0%",background:stage.color,borderRadius:2}}/></div>
                    </div>
                    {sc.map(c=>(
                      <div key={c.id} className="pk" onClick={()=>openClient(c)}>
                        <div style={{fontWeight:600,fontSize:12,color:"#e2e8f0",marginBottom:3}}>{c.name}</div>
                        <div style={{fontSize:10,color:"#64748b",marginBottom:4}}>{c.product}</div>
                        {c.activityLog?.length>0&&<div style={{fontSize:10,color:"#475569",marginBottom:3}}>💬 {c.activityLog.length}</div>}
                        {c.followUp&&<div style={{fontSize:10,fontWeight:500}} className={isOverdue(c.followUp)?"ov":isDueSoon(c.followUp)?"ds":""}>📅 {fmtDate(c.followUp)}</div>}
                      </div>
                    ))}
                  </div>
                );
              })}
              <div style={{flex:"0 0 185px",borderLeft:"1px solid #1e2d4a",paddingLeft:12}}>
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:10,fontWeight:700,color:"#f472b6",textTransform:"uppercase",letterSpacing:".05em"}}>Annual Review</span>
                    <span style={{background:"#f472b622",color:"#f472b6",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{annualReview.length}</span>
                  </div>
                  <div style={{height:3,background:"#f472b633",borderRadius:2}}><div style={{height:"100%",width:annualReview.length?"100%":"0%",background:"#f472b6",borderRadius:2}}/></div>
                  <div style={{fontSize:9,color:"#475569",marginTop:3}}>From client book</div>
                </div>
                {annualReview.map(c=>(
                  <div key={c.id} className="pk" onClick={()=>openClient(c)} style={{borderColor:"#f472b633"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}><div style={{fontWeight:600,fontSize:12,color:"#e2e8f0"}}>{c.name}</div><RatingBadge rating={c.rating}/></div>
                    <div style={{fontSize:10,color:"#64748b",marginBottom:3}}>{c.product}</div>
                    {c.followUp&&<div style={{fontSize:10,fontWeight:500}} className={isOverdue(c.followUp)?"ov":isDueSoon(c.followUp)?"ds":""}>📅 {fmtDate(c.followUp)}</div>}
                  </div>
                ))}
              </div>
              {milestoneAlertClients.length>0&&(
                <div style={{flex:"0 0 185px",borderLeft:"1px solid #1e2d4a",paddingLeft:12}}>
                  <div style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#a78bfa",textTransform:"uppercase",letterSpacing:".05em"}}>🗿 Milestones</span>
                      <span style={{background:"#a78bfa22",color:"#a78bfa",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700}}>{milestoneAlertClients.length}</span>
                    </div>
                    <div style={{height:3,background:"#a78bfa33",borderRadius:2}}><div style={{height:"100%",background:"#a78bfa",borderRadius:2,width:"100%"}}/></div>
                    <div style={{fontSize:9,color:"#475569",marginTop:3}}>Needs contact</div>
                  </div>
                  {milestoneAlertClients.map(({client,alerts})=>{ const top=alerts[0]; const us=urgencyStyle(top.urgency); return (
                    <div key={client.id} className="pk" onClick={()=>openClient(client,"milestones")} style={{borderColor:us.border,background:us.bg}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}><div style={{fontWeight:600,fontSize:12,color:"#e2e8f0"}}>{client.name}</div><RatingBadge rating={client.rating}/></div>
                      <div style={{fontSize:10,color:us.color,fontWeight:600,marginBottom:2}}>{us.icon} Age {top.milestone.label} · {top.personName}</div>
                      <div style={{fontSize:10,color:"#64748b"}}>{top.diffDays<0?"This month":`${top.diffDays}d`}</div>
                    </div>
                  ); })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PERFORMANCE */}
        {view==="performance"&&(
          <div>
            <h2 style={{fontSize:17,fontWeight:700,marginBottom:18,color:"#e2e8f0"}}>Performance</h2>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
              <div className="card">
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:14,textTransform:"uppercase",letterSpacing:".05em"}}>Client Ratings</div>
                {Object.entries(RATINGS).map(([key,r])=>{ const cnt=clients.filter(c=>c.rating===key).length; return (<div key={key} style={{marginBottom:12}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:r.color,fontWeight:600}}>{r.label}</span><span style={{fontSize:12,fontWeight:700,color:r.color,fontFamily:"'DM Mono',monospace"}}>{cnt}</span></div><div className="pbb"><div className="pb" style={{width:`${clients.length?(cnt/clients.length)*100:0}%`,background:r.color}}/></div><div style={{fontSize:10,color:"#475569",marginTop:1}}>{r.desc}</div></div>); })}
                <div style={{fontSize:11,color:"#475569",marginTop:4}}>Unrated: {clients.filter(c=>!c.rating).length}</div>
              </div>
              <div className="card">
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:14,textTransform:"uppercase",letterSpacing:".05em"}}>Product Mix</div>
                {PRODUCTS.map(p=>{ const cnt=clients.filter(c=>c.product===p).length; if(!cnt) return null; return (<div key={p} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#94a3b8"}}>{p}</span><span style={{fontSize:12,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>{cnt}</span></div><div className="pbb"><div className="pb" style={{width:`${(cnt/clients.length)*100}%`,background:"#3b82f6"}}/></div></div>); })}
              </div>
              <div className="card" style={{gridColumn:"1 / -1"}}>
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:14,textTransform:"uppercase",letterSpacing:".05em"}}>Key Metrics</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
                  {[
                    {label:"Book of Business",value:clientBook.length,sub:"Delivered clients"},
                    {label:"Avg Premium",value:clientBook.filter(c=>c.premium>0).length?`$${Math.round(clientBook.filter(c=>c.premium>0).reduce((s,c)=>s+c.premium,0)/clientBook.filter(c=>c.premium>0).length).toLocaleString()}`:"—",sub:"Per paying policy"},
                    {label:"Fact Finders",value:`${clients.filter(c=>ffComplete(c.factFinder).pct===100).length}/${clientBook.length}`,sub:"Complete profiles"},
                    {label:"Active Alerts",value:allAlerts.length,sub:"Milestone contacts needed"},
                  ].map(m=>(<div key={m.label} style={{background:"#1a1d27",borderRadius:9,padding:14,textAlign:"center"}}><div style={{fontSize:24,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>{m.value}</div><div style={{fontSize:12,fontWeight:600,color:"#94a3b8",margin:"3px 0 2px"}}>{m.label}</div><div style={{fontSize:10,color:"#475569"}}>{m.sub}</div></div>))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REPORT */}
        {view==="report"&&(()=>{
          const rY=reportMonth.getFullYear(), rM=reportMonth.getMonth();
          const rLabel=reportMonth.toLocaleDateString("en-US",{month:"long",year:"numeric"});
          const prev=new Date(rY,rM-1,1), pY=prev.getFullYear(), pM=prev.getMonth();
          const prevLabel=prev.toLocaleDateString("en-US",{month:"short",year:"numeric"});
          const logsInMonth=(y,m)=>{ const a=[]; clients.forEach(c=>{ (c.activityLog||[]).forEach(e=>{ const d=new Date(e.date); if(d.getFullYear()===y&&d.getMonth()===m) a.push({...e,clientId:c.id,clientName:c.name,clientRating:c.rating}); }); }); return a; };
          const curLogs=logsInMonth(rY,rM), prevLogs=logsInMonth(pY,pM);
          const refsInMonth=(y,m)=>referrals.filter(r=>{ const d=new Date(r.date+"T00:00:00"); return d.getFullYear()===y&&d.getMonth()===m; });
          const curRefs=refsInMonth(rY,rM), prevRefs=refsInMonth(pY,pM);
          const curAppts=curLogs.filter(e=>e.type==="in_person"), prevAppts=prevLogs.filter(e=>e.type==="in_person");
          const delta=(c,p)=>p===0?c>0?"+"+c:"—":(c-p>=0?"+":"")+(c-p);
          const dc=(c,p)=>c>=p?"#34d399":"#f87171";
          const daysInM=new Date(rY,rM+1,0).getDate();
          const weeks=[0,0,0,0,0]; curLogs.forEach(e=>{ const d=new Date(e.date).getDate(); weeks[Math.min(Math.floor((d-1)/7),4)]++; });
          const contactBreakdown=CONTACT_TYPES.map(ct=>({...ct,count:curLogs.filter(e=>e.type===ct.id).length})).filter(ct=>ct.count>0);
          const clientContactCnt={}; curLogs.forEach(e=>{ clientContactCnt[e.clientId]=(clientContactCnt[e.clientId]||0)+1; });
          const topContacted=Object.entries(clientContactCnt).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([id,cnt])=>({client:clients.find(c=>c.id===Number(id)),count:cnt})).filter(x=>x.client);

          return (
          <div>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
              <div><h2 style={{fontSize:17,fontWeight:700,color:"#e2e8f0"}}>📋 Monthly Report</h2><div style={{fontSize:12,color:"#475569"}}>{rLabel}</div></div>
              <div style={{display:"flex",gap:6,marginLeft:"auto",alignItems:"center"}}>
                <button className="bg sm" onClick={()=>setReportMonth(new Date(rY,rM-1,1))}>←</button>
                <span style={{fontSize:13,fontWeight:700,color:"#e2e8f0",minWidth:130,textAlign:"center"}}>{rLabel}</span>
                <button className="bg sm" onClick={()=>setReportMonth(new Date(rY,rM+1,1))}>→</button>
                <button className="bg sm" onClick={()=>setReportMonth(new Date())}>This Month</button>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:18}}>
              {[
                {icon:"📞",label:"Total Contacts",value:curLogs.length,d:delta(curLogs.length,prevLogs.length),dc:dc(curLogs.length,prevLogs.length)},
                {icon:"🤝",label:"Appointments",value:curAppts.length,d:delta(curAppts.length,prevAppts.length),dc:dc(curAppts.length,prevAppts.length)},
                {icon:"📋",label:"New Referrals",value:curRefs.length,d:delta(curRefs.length,prevRefs.length),dc:dc(curRefs.length,prevRefs.length)},
                {icon:"🗿",label:"Milestone Contacts",value:curLogs.filter(e=>e.text&&e.text.toLowerCase().includes("milestone")).length,d:null},
              ].map(s=>(
                <div key={s.label} style={{background:"#1a1d27",borderRadius:10,padding:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                    <span style={{fontSize:18}}>{s.icon}</span>
                    {s.d&&<span style={{fontSize:10,fontWeight:700,color:s.dc,background:s.dc+"22",borderRadius:20,padding:"1px 7px"}}>{s.d} vs {prevLabel}</span>}
                  </div>
                  <div style={{fontSize:24,fontWeight:700,color:"#e2e8f0",fontFamily:"'DM Mono',monospace",marginBottom:2}}>{s.value}</div>
                  <div style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
              <div className="card">
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:14,textTransform:"uppercase",letterSpacing:".05em"}}>Activity by Week</div>
                {curLogs.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#475569",fontSize:12}}>No activity for {rLabel}</div>:
                  weeks.map((cnt,i)=>{ const sd=i*7+1,ed=Math.min((i+1)*7,daysInM); if(sd>daysInM) return null; const mw=Math.max(...weeks,1); return (<div key={i} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#94a3b8"}}>Week {i+1} <span style={{color:"#475569",fontSize:10}}>({sd}–{ed})</span></span><span style={{fontSize:12,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>{cnt}</span></div><div className="pbb"><div className="pb" style={{width:`${(cnt/mw)*100}%`,background:"#3b82f6"}}/></div></div>); })
                }
              </div>
              <div className="card">
                <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:14,textTransform:"uppercase",letterSpacing:".05em"}}>Contact Type Breakdown</div>
                {contactBreakdown.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#475569",fontSize:12}}>No activity for {rLabel}</div>:
                  contactBreakdown.map(ct=>(<div key={ct.id} style={{marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:12,color:"#94a3b8"}}>{ct.icon} {ct.label}</span><span style={{fontSize:12,fontWeight:700,color:"#60a5fa",fontFamily:"'DM Mono',monospace"}}>{ct.count}</span></div><div className="pbb"><div className="pb" style={{width:`${(ct.count/curLogs.length)*100}%`,background:"#3b82f6"}}/></div></div>))
                }
              </div>
            </div>
            <div className="card">
              <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",marginBottom:4,textTransform:"uppercase",letterSpacing:".05em"}}>Activity Log — {rLabel}</div>
              <div style={{fontSize:11,color:"#475569",marginBottom:14}}>{curLogs.length} entries</div>
              {curLogs.length===0?<div style={{textAlign:"center",padding:"20px 0",color:"#475569",fontSize:12}}>No activity logged for {rLabel}. Log contacts from each client's Activity Log tab.</div>:
                [...curLogs].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((e,i)=>{ const cti=CONTACT_TYPES.find(t=>t.id===e.type)||CONTACT_TYPES[5]; return (<div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"7px 10px",background:"#1a1d27",borderRadius:7,marginBottom:5,cursor:"pointer"}} onClick={()=>openClient(clients.find(c=>c.id===e.clientId),"history")} onMouseEnter={ev=>ev.currentTarget.style.background="#1e2433"} onMouseLeave={ev=>ev.currentTarget.style.background="#1a1d27"}><span style={{fontSize:14,flexShrink:0}}>{cti.icon}</span><div style={{flex:1}}><div style={{display:"flex",gap:7,alignItems:"center",marginBottom:2}}><span style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{e.clientName}</span><RatingBadge rating={e.clientRating}/><span style={{fontSize:10,color:"#475569"}}>{cti.label}</span></div><div style={{fontSize:11,color:"#94a3b8"}}>{e.text}</div></div><div style={{fontSize:10,color:"#475569",flexShrink:0}}>{fmtDT(e.date)}</div></div>); })
              }
            </div>
          </div>
          );
        })()}

      </div>

      {/* ── CLIENT MODAL ─────────────────────────────────── */}
      {sel&&ff&&(
        <div className="mo" onClick={closeClient}>
          <div className="md mdw" onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 22px 0"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:9,marginBottom:5}}>
                    <h2 style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{sel.name}</h2>
                    <RatingBadge rating={sel.rating} size="lg"/>
                    {getClientAlerts(sel).length>0&&<span style={{background:"#a78bfa22",border:"1px solid #a78bfa44",color:"#a78bfa",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:700}}>🗿 {getClientAlerts(sel).length}</span>}
                  </div>
                  <span className="tag" style={stageStyle(sel.stage)}>{STAGE_MAP[sel.stage]?.label}</span>
                </div>
                <button className="bg sm" onClick={closeClient}>✕</button>
              </div>
              <div style={{display:"flex",borderBottom:"1px solid #1e2433",marginTop:14,overflowX:"auto"}}>
                {[["details","Details"],["milestones","🗿 Milestones"],["rating","Rating"],["history","Activity"]].map(([t,l])=>(
                  <button key={t} className={`tb ${selTab===t?"on":""}`} onClick={()=>setSelTab(t)}>
                    {l}
                    {t==="history"&&sel.activityLog?.length>0&&<span style={{background:"#3b82f622",color:"#60a5fa",borderRadius:10,padding:"1px 6px",fontSize:9,marginLeft:4}}>{sel.activityLog.length}</span>}
                    {t==="milestones"&&getClientAlerts(sel).length>0&&<span style={{background:"#dc262622",color:"#f87171",borderRadius:10,padding:"1px 6px",fontSize:9,marginLeft:4}}>{getClientAlerts(sel).length}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* DETAILS TAB */}
            {selTab==="details"&&(
              <div style={{padding:"16px 22px"}}>
                {/* Policy */}
                <div style={{marginBottom:16}}>
                  <SHdr icon="📋" title="Policy"/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    {[["Product",sel.product],["Carrier",sel.carrier||"—"],["Policy #",sel.policyNumber||"—"],["Premium",sel.premium?`$${Number(sel.premium).toLocaleString()}`:"—"]].map(([l,v])=>(
                      <div key={l}><div style={{fontSize:10,color:"#475569",marginBottom:2,textTransform:"uppercase",fontWeight:600}}>{l}</div><div style={{fontSize:13,color:"#e2e8f0"}}>{v}</div></div>
                    ))}
                  </div>
                  {sel.allPolicies?.length>1&&(
                    <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:4}}>
                      {[...new Map(sel.allPolicies.map(p=>[p.policy_number,p])).values()].map((p,i)=>(
                        <div key={i} style={{background:"#1a1d27",borderRadius:6,padding:"6px 10px",display:"flex",justifyContent:"space-between"}}>
                          <div><div style={{fontSize:11,color:"#e2e8f0",fontFamily:"'DM Mono',monospace"}}>{p.policy_number}</div><div style={{fontSize:10,color:"#64748b"}}>{p.product}</div></div>
                          {p.premium>0&&<div style={{fontSize:11,color:"#34d399",fontFamily:"'DM Mono',monospace"}}>${p.premium.toLocaleString()}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Fact Finder progress */}
                {(()=>{ const {pct,filled,total}=ffComplete(ff); return (
                  <div style={{background:"#1a1d27",borderRadius:8,padding:"9px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:11,fontWeight:600,color:"#94a3b8"}}>Fact Finder</span><span style={{fontSize:11,fontWeight:700,color:pct===100?"#34d399":"#60a5fa"}}>{filled}/{total} · {pct}%</span></div><div className="pbb" style={{height:5}}><div className="pb" style={{width:`${pct}%`,background:pct===100?"#34d399":"#3b82f6"}}/></div></div>
                  </div>
                ); })()}

                {/* Personal */}
                <div style={{marginBottom:14}}>
                  <SHdr icon="👤" title="Personal"/>
                  <div className="ff-grid">
                    <FFField label="Date of Birth" value={ff.dob} onChange={v=>updFF("dob",v)} type="date"/>
                    <FFField label="Occupation" value={ff.occupation} onChange={v=>updFF("occupation",v)} placeholder="Occupation / retired"/>
                    <FFField label="Preferred Contact Time" value={ff.preferredContactTime} onChange={v=>updFF("preferredContactTime",v)} placeholder="e.g. Mornings"/>
                    <FFField label="Beneficiary" value={ff.beneficiary} onChange={v=>updFF("beneficiary",v)} placeholder="Name & relationship"/>
                  </div>
                  {ff.dob&&(()=>{
                    const age=calcAge(ff.dob);
                    const mDates=MILESTONES.map(m=>({...m,date:getMilestoneDate(ff.dob,m.age)})).filter(m=>m.date);
                    return (
                      <div style={{marginTop:10}}>
                        <div style={{fontSize:10,color:"#475569",marginBottom:6,fontWeight:600,textTransform:"uppercase",letterSpacing:".04em"}}>🗿 Milestones {age!==null&&<span style={{color:"#64748b",fontWeight:400}}>· Age {age}</span>}</div>
                        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:5}}>
                          {mDates.map(m=>{ const d=Math.round((m.date-today)/86400000); const passed=d<-30; return (
                            <div key={m.age} style={{background:passed?"#1a1d27":"#1e2433",border:`1px solid ${passed?"#2d3748":"#334155"}`,borderRadius:6,padding:"6px 8px",display:"flex",alignItems:"center",gap:7}}>
                              <div style={{width:28,height:28,borderRadius:5,background:passed?"#2d3748":"#3b82f622",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:800,color:passed?"#475569":"#60a5fa",flexShrink:0}}>{m.label}</div>
                              <div><div style={{fontSize:10,fontWeight:600,color:passed?"#475569":"#e2e8f0"}}>{m.desc}</div><div style={{fontSize:9,color:passed?"#334155":d<=90?"#f472b6":"#64748b"}}>{passed?`Passed ${m.date.toLocaleDateString("en-US",{month:"short",year:"numeric"})}`:d<=90?<span style={{color:"#f472b6",fontWeight:600}}>{d}d away</span>:m.date.toLocaleDateString("en-US",{month:"short",year:"numeric"})}</div></div>
                            </div>
                          ); })}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Spouse */}
                <div style={{marginBottom:14}}>
                  <SHdr icon="💑" title="Spouse / Partner"/>
                  <div className="ff-grid">
                    <FFField label="Name" value={ff.spouseName} onChange={v=>updFF("spouseName",v)} placeholder="Full name"/>
                    <FFField label="DOB" value={ff.spouseDob} onChange={v=>updFF("spouseDob",v)} type="date"/>
                    <div style={{gridColumn:"1/-1"}}><FFField label="Phone" value={ff.spousePhone} onChange={v=>updFF("spousePhone",v)} placeholder="Phone number"/></div>
                  </div>
                </div>

                {/* Children */}
                <div style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,paddingBottom:7,borderBottom:"1px solid #1e2433"}}>
                    <span style={{fontSize:15}}>👨‍👩‍👧‍👦</span><span style={{fontSize:12,fontWeight:700,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".05em"}}>Children</span>
                    <button className="bg sm" style={{marginLeft:"auto"}} onClick={addChild}>+ Add</button>
                  </div>
                  {(!ff.children||ff.children.length===0)?<div style={{fontSize:12,color:"#334155",textAlign:"center",padding:"6px 0"}}>No children added</div>:(
                    ff.children.map((ch,i)=>(
                      <div key={i} style={{background:"#1a1d27",borderRadius:7,padding:"9px 11px",marginBottom:7}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:7}}><span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Child {i+1}</span><button className="bi" onClick={()=>rmChild(i)}>✕</button></div>
                        <div className="ff-grid">
                          <FFField label="Name" value={ch.name} onChange={v=>updChild(i,"name",v)} placeholder="Full name"/>
                          <FFField label="Phone" value={ch.phone} onChange={v=>updChild(i,"phone",v)} placeholder="Contact number"/>
                          <div style={{gridColumn:"1/-1"}}><FFField label="DOB" value={ch.dob} onChange={v=>updChild(i,"dob",v)} type="date"/></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Health */}
                <div style={{marginBottom:14}}>
                  <SHdr icon="🏥" title="Health & Medicare"/>
                  <div className="ff-grid">
                    <div style={{gridColumn:"1/-1"}}><FFField label="Current Health Insurance" value={ff.currentHealthInsurance} onChange={v=>updFF("currentHealthInsurance",v)} placeholder="Carrier & plan"/></div>
                    <FFField label="Medicare Number" value={ff.medicareNumber} onChange={v=>updFF("medicareNumber",v)} placeholder="Medicare ID"/>
                    <FFField label="Medicare Effective Date" value={ff.medicareEffectiveDate} onChange={v=>updFF("medicareEffectiveDate",v)} type="date"/>
                    <div style={{gridColumn:"1/-1"}}><FFArea label="Medications" value={ff.medications} onChange={v=>updFF("medications",v)} placeholder="Current medications..." rows={2}/></div>
                  </div>
                </div>

                {/* Financial */}
                <div style={{marginBottom:14}}>
                  <SHdr icon="💵" title="Financial"/>
                  <FFArea label="Income / Retirement Sources" value={ff.income} onChange={v=>updFF("income",v)} placeholder="Social Security, pension, 401k..." rows={2}/>
                </div>

                {sel.notes&&<div style={{background:"#1a1d27",borderRadius:7,padding:10,marginBottom:14}}><div style={{fontSize:10,color:"#475569",marginBottom:3,textTransform:"uppercase",fontWeight:600}}>Quick Notes</div><div style={{fontSize:12,color:"#94a3b8"}}>{sel.notes}</div></div>}

                <div style={{marginBottom:16}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:7,textTransform:"uppercase",fontWeight:600}}>Move Stage</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                    {Object.entries(STAGE_MAP).map(([id,s])=>(
                      <button key={id} onClick={()=>moveStage(sel.id,id)} style={{padding:"4px 9px",borderRadius:5,fontSize:11,border:`1px solid ${s.color}44`,background:sel.stage===id?s.color+"33":"transparent",color:s.color,cursor:"pointer",fontWeight:sel.stage===id?700:400}}>{s.label}</button>
                    ))}
                  </div>
                </div>

                <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                  <button className="bd sm" onClick={()=>deleteClient(sel.id)}>Delete</button>
                  <button className="bg sm" onClick={closeClient}>Close</button>
                  {ffDirty&&<button className="bp sm" onClick={saveFF}>💾 Save</button>}
                  <button className="bg sm" onClick={()=>{ setForm({...sel}); setEditId(sel.id); setShowForm(true); setSel(null); }}>Edit</button>
                </div>
              </div>
            )}

            {/* MILESTONES TAB */}
            {selTab==="milestones"&&(
              <div style={{padding:"16px 22px"}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Household milestone alerts. Mark contacted to log and clear.</div>
                {(()=>{
                  const alerts=getClientAlerts(sel);
                  if(!alerts.length) return <div style={{textAlign:"center",padding:"28px 0",color:"#475569"}}><div style={{fontSize:28,marginBottom:6}}>🗿</div><div style={{fontSize:13}}>No active alerts — add DOBs in the fact finder</div></div>;
                  return alerts.map(alert=>{ const us=urgencyStyle(alert.urgency); return (
                    <div key={alert.key} style={{background:us.bg,border:`1px solid ${us.border}`,borderRadius:10,padding:13,marginBottom:9}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                        <div style={{fontSize:20}}>{alert.milestone.icon}</div>
                        <div style={{flex:1}}><div style={{fontWeight:700,fontSize:13,color:us.color}}>{alert.personName} ({alert.relation}) — Age {alert.milestone.label}</div><div style={{fontSize:11,color:"#64748b"}}>{alert.milestone.desc} · {alert.diffDays<0?"Birthday month":`${alert.diffDays}d away`}</div></div>
                      </div>
                      <div style={{display:"flex",gap:7}}>
                        <button style={{flex:1,background:"#34d39922",border:"1px solid #34d39944",color:"#34d399",borderRadius:6,padding:"5px 0",fontSize:12,fontWeight:700,cursor:"pointer"}} onClick={()=>{ markContacted(sel.id,alert.key,`Milestone contact: ${alert.personName} — Age ${alert.milestone.label}`); setSel(p=>p?{...p,dismissedAlerts:{...(p.dismissedAlerts||{}),[alert.key]:true}}:null); }}>✓ Mark Contacted</button>
                        <button style={{background:"none",border:"1px solid #2d3748",color:"#475569",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer"}} onClick={()=>{ dismissAlert(sel.id,alert.key); setSel(p=>p?{...p,dismissedAlerts:{...(p.dismissedAlerts||{}),[alert.key]:true}}:null); }}>Dismiss</button>
                      </div>
                    </div>
                  ); });
                })()}
              </div>
            )}

            {/* RATING TAB */}
            {selTab==="rating"&&(
              <div style={{padding:"16px 22px"}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Rate based on existing policies and household opportunity.</div>
                <div style={{display:"flex",gap:8,marginBottom:18}}>
                  {Object.entries(RATINGS).map(([key,r])=>(
                    <button key={key} onClick={()=>setRating(sel.id,key)} style={{flex:1,background:sel.rating===key?r.bg:"#1a1d27",border:`2px solid ${sel.rating===key?r.color:r.color+"33"}`,color:sel.rating===key?r.color:r.color+"77",borderRadius:7,padding:"10px 6px",cursor:"pointer"}}>
                      <div style={{fontSize:20,fontWeight:800,marginBottom:3}}>{key}</div><div style={{fontSize:10,fontWeight:600}}>{r.label}</div>
                    </button>
                  ))}
                  {sel.rating&&<button className="bg" style={{padding:"10px 8px"}} onClick={()=>setRating(sel.id,null)}><div style={{fontSize:11}}>Clear</div></button>}
                </div>
                <div style={{borderTop:"1px solid #1e2433",paddingTop:14}}>
                  <div style={{fontSize:10,color:"#475569",marginBottom:9,textTransform:"uppercase",fontWeight:600}}>AI Suggestion</div>
                  {!aiRating&&!ratingLoading&&<button className="bai" onClick={suggestRating}>✨ Get AI Suggestion</button>}
                  {ratingLoading&&<p className="loading">✨ Analyzing…</p>}
                  {aiRating&&(
                    <div className="ai-box">
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:9}}><span style={{fontSize:10,color:"#a78bfa",fontWeight:700}}>✨ AI SUGGESTS</span><RatingBadge rating={aiRating.rating} size="lg"/></div>
                      <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6,marginBottom:10}}>{aiRating.reason}</div>
                      <div style={{display:"flex",gap:7}}>
                        {["A","B","C"].includes(aiRating.rating)&&<button className="bp sm" onClick={()=>setRating(sel.id,aiRating.rating)}>✓ Accept {aiRating.rating}</button>}
                        <button className="bg sm" onClick={()=>setAiRating(null)}>Dismiss</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ACTIVITY TAB */}
            {selTab==="history"&&(
              <div style={{padding:"16px 22px"}}>
                {sel.activityLog?.length>0&&(
                  <div style={{marginBottom:14}}>
                    {!aiSummary&&!summaryLoading&&<button className="bai" onClick={generateSummary}>✨ AI Summarize</button>}
                    {summaryLoading&&<div className="ai-box"><p className="loading">✨ Generating summary…</p></div>}
                    {aiSummary&&(
                      <div className="ai-box">
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}><div style={{fontSize:12,fontWeight:700,color:"#a78bfa"}}>✨ AI Summary</div><button className="bg sm" onClick={()=>setAiSummary(null)}>✕</button></div>
                        <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6}} dangerouslySetInnerHTML={{__html:renderMd(aiSummary)}}/>
                        <button className="bai sm" style={{marginTop:10}} onClick={generateSummary} disabled={summaryLoading}>↺ Regenerate</button>
                      </div>
                    )}
                  </div>
                )}
                {!addingEntry?(
                  <button className="bp sm" onClick={()=>setAddingEntry(true)} style={{marginBottom:14}}>+ Log Activity</button>
                ):(
                  <div style={{background:"#1a1d27",border:"1px solid #3b82f644",borderRadius:10,padding:14,marginBottom:14}}>
                    <div style={{fontSize:12,fontWeight:600,color:"#94a3b8",marginBottom:10}}>New Entry</div>
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#475569",marginBottom:6,textTransform:"uppercase",fontWeight:600}}>Contact Type</div>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{CONTACT_TYPES.map(c=>(<button key={c.id} className={`ctb ${entry.type===c.id?"on":""}`} onClick={()=>setEntry(p=>({...p,type:c.id}))}>{c.icon} {c.label}</button>))}</div>
                    </div>
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#475569",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Notes</div>
                      <textarea className="inp" rows={3} placeholder="What happened?" value={entry.text} onChange={e=>setEntry(p=>({...p,text:e.target.value}))} style={{resize:"vertical"}}/>
                    </div>
                    <div style={{marginBottom:12}}>
                      <div style={{fontSize:10,color:"#475569",marginBottom:4,textTransform:"uppercase",fontWeight:600}}>Update Follow-Up <span style={{color:"#334155",fontWeight:400,textTransform:"none"}}>(optional)</span></div>
                      <input className="inp" type="date" value={entry.followUpUpdate} onChange={e=>setEntry(p=>({...p,followUpUpdate:e.target.value}))} style={{width:180}}/>
                    </div>
                    <div style={{display:"flex",gap:7}}><button className="bg sm" onClick={()=>{setAddingEntry(false);setEntry(emptyEntry);}}>Cancel</button><button className="bp sm" onClick={addLogEntry}>Save</button></div>
                  </div>
                )}
                {(!sel.activityLog||!sel.activityLog.length)?<div style={{textAlign:"center",padding:"24px 0",color:"#475569"}}><div style={{fontSize:28,marginBottom:6}}>📋</div><div style={{fontSize:13}}>No activity logged yet</div></div>:(
                  sel.activityLog.map(e=>{ const c=ct(e.type); return (
                    <div key={e.id} className="le">
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:7}}><div style={{display:"flex",gap:7,alignItems:"center"}}><span className="chip">{c.icon} {c.label}</span><span style={{fontSize:11,color:"#475569"}}>{fmtDT(e.date)}</span></div><button className="bi" onClick={()=>delEntry(sel.id,e.id)}>✕</button></div>
                      <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.5}}>{e.text}</div>
                      {e.followUpUpdate&&<div style={{marginTop:6,fontSize:11,color:"#60a5fa"}}>📅 Follow-up → {fmtDate(e.followUpUpdate)}</div>}
                    </div>
                  ); })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ADD/EDIT CLIENT MODAL ────────────────────────── */}
      {showForm&&(
        <div className="mo" onClick={()=>setShowForm(false)}>
          <div className="md" onClick={e=>e.stopPropagation()}>
            <div style={{padding:20}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#e2e8f0",marginBottom:16}}>{editId?"Edit Client":"Add New Client"}</h2>
              <div className="fg" style={{marginBottom:12}}>
                <div style={{gridColumn:"1 / -1"}}><label>Full Name *</label><input className="inp" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Client name"/></div>
                <div><label>Phone</label><input className="inp" value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></div>
                <div><label>Email</label><input className="inp" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
                <div><label>Product</label><select className="inp" value={form.product} onChange={e=>setForm(p=>({...p,product:e.target.value}))}>{PRODUCTS.map(p=><option key={p}>{p}</option>)}</select></div>
                <div><label>Stage</label><select className="inp" value={form.stage} onChange={e=>setForm(p=>({...p,stage:e.target.value}))}>{Object.entries(STAGE_MAP).map(([id,s])=><option key={id} value={id}>{s.label}</option>)}</select></div>
                <div><label>Carrier</label><input className="inp" value={form.carrier} onChange={e=>setForm(p=>({...p,carrier:e.target.value}))}/></div>
                <div><label>Policy #</label><input className="inp" value={form.policyNumber} onChange={e=>setForm(p=>({...p,policyNumber:e.target.value}))}/></div>
                <div><label>Premium ($)</label><input className="inp" type="number" value={form.premium} onChange={e=>setForm(p=>({...p,premium:e.target.value}))}/></div>
                <div><label>Follow-Up</label><input className="inp" type="date" value={form.followUp} onChange={e=>setForm(p=>({...p,followUp:e.target.value}))}/></div>
                <div style={{gridColumn:"1 / -1"}}><label>Notes</label><textarea className="inp" value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} rows={2} style={{resize:"vertical"}}/></div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="bg" onClick={()=>setShowForm(false)}>Cancel</button><button className="bp" onClick={saveClient}>{editId?"Save":"Add Client"}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD REFERRAL MODAL ───────────────────────────── */}
      {showRefForm&&(
        <div className="mo" onClick={()=>setShowRefForm(false)}>
          <div className="md" onClick={e=>e.stopPropagation()}>
            <div style={{padding:20}}>
              <h2 style={{fontSize:16,fontWeight:700,color:"#e2e8f0",marginBottom:16}}>Log a Referral</h2>
              <div className="fg" style={{marginBottom:12}}>
                <div style={{gridColumn:"1 / -1"}}><label>Referred By</label><select className="inp" value={refForm.fromClientId} onChange={e=>setRefForm(p=>({...p,fromClientId:e.target.value}))}><option value="">— Select client —</option>{[...clients].sort((a,b)=>a.name.localeCompare(b.name)).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
                <div style={{gridColumn:"1 / -1"}}><label>Prospect Name *</label><input className="inp" value={refForm.referredName} onChange={e=>setRefForm(p=>({...p,referredName:e.target.value}))} placeholder="Full name"/></div>
                <div><label>Phone</label><input className="inp" value={refForm.referredPhone} onChange={e=>setRefForm(p=>({...p,referredPhone:e.target.value}))}/></div>
                <div><label>Email</label><input className="inp" value={refForm.referredEmail} onChange={e=>setRefForm(p=>({...p,referredEmail:e.target.value}))}/></div>
                <div><label>Product Interest</label><select className="inp" value={refForm.product} onChange={e=>setRefForm(p=>({...p,product:e.target.value}))}><option value="">— Unknown —</option>{PRODUCTS.map(p=><option key={p}>{p}</option>)}</select></div>
                <div><label>Date</label><input className="inp" type="date" value={refForm.date} onChange={e=>setRefForm(p=>({...p,date:e.target.value}))}/></div>
                <div style={{gridColumn:"1 / -1"}}><label>Notes</label><textarea className="inp" value={refForm.notes} onChange={e=>setRefForm(p=>({...p,notes:e.target.value}))} placeholder="Relationship, context..." rows={2} style={{resize:"vertical"}}/></div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}><button className="bg" onClick={()=>setShowRefForm(false)}>Cancel</button><button className="bp" onClick={saveReferral}>Save Referral</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
