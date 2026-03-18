import { useState, useEffect, useCallback, useRef } from "react";

// ─── CONFIG ──────────────────────────────────────────────────
const API = "/api/moodle";
const ANTHROPIC_PROXY = "/api/chat";
const USER_ID = 13592;
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAY_NAMES = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
const GRADE_MAP = {A:4,AB:3.5,"A-":3.7,"B+":3.3,B:3,"B-":2.7,"BC":2.5,"C+":2.3,C:2,"C-":1.7,D:1,E:0};

// ─── HELPERS ─────────────────────────────────────────────────
const fmtDate=(d)=>{if(!d)return"-";const dt=new Date(d);return`${dt.getDate()} ${MONTHS[dt.getMonth()]}`;};
const fmtFull=(d)=>{if(!d)return"-";const dt=new Date(d);return`${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;};
const daysUntil=(d)=>{if(!d)return 999;return Math.ceil((new Date(d)-new Date())/864e5);};
const strip=(html)=>(html||"").replace(/<[^>]*>/g,"").substring(0,250);
const uid=()=>Math.random().toString(36).slice(2,9);
const clsx=(...c)=>c.filter(Boolean).join(" ");

// ─── MOODLE FETCH ────────────────────────────────────────────
async function moodle(action, params={}){
  const q=new URLSearchParams(params).toString();
  const r=await fetch(`${API}/${action}${q?"?"+q:""}`);
  if(!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════════════════
export default function AkademiAI(){
  const [tab,setTab]=useState("home");
  const [courses,setCourses]=useState([]);
  const [deadlines,setDeadlines]=useState([]);
  const [assignments,setAssignments]=useState([]);
  const [quizzes,setQuizzes]=useState([]);
  const [notifications,setNotifications]=useState([]);
  const [announcements,setAnnouncements]=useState([]);
  const [grades,setGrades]=useState({});
  const [syncing,setSyncing]=useState(true);
  const [lastSync,setLastSync]=useState(null);
  const [err,setErr]=useState(null);
  const [nav,setNav]=useState(false);
  const [chatMsgs,setChatMsgs]=useState([]);
  const [chatIn,setChatIn]=useState("");
  const [chatLoading,setChatLoading]=useState(false);
  const [attendance,setAttendance]=useState(()=>{try{return JSON.parse(window?.localStorage?.getItem?.("akademi-att")||"[]")}catch{return[]}});
  const chatEnd=useRef(null);

  // Save attendance to localStorage
  useEffect(()=>{try{localStorage.setItem("akademi-att",JSON.stringify(attendance))}catch{}},[attendance]);

  // ─── SYNC ALL DATA ───────────────────────────────────────
  const syncAll=useCallback(async()=>{
    setSyncing(true);setErr(null);
    try{
      const [crs,dl,notif]=await Promise.all([
        moodle("courses",{classification:"inprogress"}),
        moodle("deadlines",{limitnum:60}),
        moodle("notifications",{limit:30}),
      ]);
      setCourses(crs.courses||[]);
      setDeadlines((dl.events||[]).map(e=>({
        id:e.id,name:e.name,desc:strip(e.description),
        type:e.modulename||e.eventtype,
        course:e.course?.shortname||e.course?.fullname||"",
        courseId:e.course?.id,
        date:e.timestart?new Date(e.timestart*1000).toISOString():null,
        url:e.url,action:e.action?.name,overdue:e.overdue,
      })));
      setNotifications((notif.notifications||[]).map(n=>({
        id:n.id,subject:n.subject,text:n.smallmessage||strip(n.fullmessage),
        type:n.component,read:n.read,time:new Date(n.timecreated*1000).toISOString(),url:n.contexturl,
      })));

      // Assignments
      try{
        const asg=await moodle("assignments");
        const all=[];
        for(const c of asg.courses||[])for(const a of c.assignments||[])
          all.push({id:a.id,name:a.name,intro:strip(a.intro),course:c.shortname||c.fullname,courseId:c.id,
            duedate:a.duedate?new Date(a.duedate*1000).toISOString():null,nosubmissions:a.nosubmissions});
        setAssignments(all.sort((a,b)=>(new Date(a.duedate||"2099")-new Date(b.duedate||"2099"))));
      }catch{}

      // Quizzes
      try{
        const qz=await moodle("quizzes");
        setQuizzes((qz.quizzes||[]).map(q=>({id:q.id,name:q.name,course:q.course,
          timeopen:q.timeopen?new Date(q.timeopen*1000).toISOString():null,
          timeclose:q.timeclose?new Date(q.timeclose*1000).toISOString():null,
          timelimit:q.timelimit,maxgrade:q.grade})));
      }catch{}

      // Announcements (from news forums)
      try{
        const forums=await moodle("forums");
        const newsForums=(forums||[]).filter(f=>f.type==="news");
        const anns=[];
        for(const f of newsForums.slice(0,8)){
          try{
            const disc=await moodle("forum-discussions",{forumid:f.id,perpage:3});
            for(const d of disc.discussions||[])
              anns.push({id:d.discussion||d.id,name:d.name,msg:strip(d.message),author:d.userfullname,
                created:new Date(d.created*1000).toISOString(),courseId:f.course,forum:f.name});
          }catch{}
        }
        setAnnouncements(anns.sort((a,b)=>new Date(b.created)-new Date(a.created)));
      }catch{}

      // Grades per course
      try{
        const courseList=crs.courses||[];
        const gradeMap={};
        for(const c of courseList.slice(0,12)){
          try{
            const g=await moodle("grades",{courseid:c.id});
            gradeMap[c.id]={name:c.shortname||c.fullname,items:(g.usergrades?.[0]?.gradeitems||[]).map(gi=>({
              id:gi.id,name:gi.itemname||"Total",type:gi.itemtype,module:gi.itemmodule,
              grade:gi.gradeformatted,raw:gi.graderaw,max:gi.grademax,pct:gi.percentageformatted,letter:gi.lettergradeformatted}))};
          }catch{}
        }
        setGrades(gradeMap);
      }catch{}

      setLastSync(new Date());
    }catch(e){setErr(e.message)}finally{setSyncing(false)}
  },[]);

  useEffect(()=>{syncAll()},[syncAll]);

  // Auto-refresh deadlines every 15min
  useEffect(()=>{const i=setInterval(async()=>{
    try{const dl=await moodle("deadlines",{limitnum:60});
      setDeadlines((dl.events||[]).map(e=>({id:e.id,name:e.name,desc:strip(e.description),type:e.modulename||e.eventtype,course:e.course?.shortname||"",courseId:e.course?.id,date:e.timestart?new Date(e.timestart*1000).toISOString():null,url:e.url,action:e.action?.name,overdue:e.overdue})))
    }catch{}},15*60*1000);return()=>clearInterval(i)},[]);

  // ─── AI CHAT ─────────────────────────────────────────────
  const sendChat=async(msg)=>{
    if(!msg.trim())return;
    const u={role:"user",content:msg,time:new Date().toISOString()};
    setChatMsgs(p=>[...p,u]);setChatIn("");setChatLoading(true);
    try{
      const ctx=`PROFIL: DIMAS LYSTIANTO, NIM 23416255201289, UBP Karawang\n\nMATKUL AKTIF (${courses.length}):\n${courses.map(c=>"- "+c.shortname+" | "+(c.fullname||"")).join("\n")}\n\nDEADLINE MENDATANG:\n${deadlines.slice(0,15).map(d=>"- "+d.name+" ("+d.course+") | "+fmtFull(d.date)+" | "+(d.overdue?"TERLAMBAT":daysUntil(d.date)+"hari lagi")).join("\n")}\n\nTUGAS:\n${assignments.slice(0,10).map(a=>"- "+a.name+" ("+a.course+") | Deadline: "+fmtFull(a.duedate)).join("\n")}\n\nQUIZ/UJIAN:\n${quizzes.slice(0,8).map(q=>"- "+q.name+" | Close: "+fmtFull(q.timeclose)).join("\n")}\n\nNOTIFIKASI TERBARU:\n${notifications.slice(0,5).map(n=>"- "+n.subject).join("\n")}\n\nKEHADIRAN: ${attendance.length} catatan, ${attendance.filter(a=>a.present).length} hadir`;

      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          system:`Kamu AkademiAI, asisten akademik AI untuk mahasiswa UBP Karawang. Jawab dalam Bahasa Indonesia yang friendly. Data real-time dari elearning:\n${ctx}`,
          messages:[...chatMsgs.slice(-8).map(m=>({role:m.role==="user"?"user":"assistant",content:m.content})),{role:"user",content:msg}]})
      });
      const data=await res.json();
      const aiText=data.content?.find(b=>b.type==="text")?.text||"Maaf, gagal merespon.";
      setChatMsgs(p=>[...p,{role:"assistant",content:aiText,time:new Date().toISOString()}]);
    }catch{setChatMsgs(p=>[...p,{role:"assistant",content:"⚠️ Gagal terhubung ke AI.",time:new Date().toISOString()}])}
    setChatLoading(false);
  };

  // ─── COMPUTED ────────────────────────────────────────────
  const urgentDeadlines=deadlines.filter(d=>daysUntil(d.date)>=0&&daysUntil(d.date)<=3);
  const overdueDeadlines=deadlines.filter(d=>d.overdue||daysUntil(d.date)<0);
  const unreadNotif=notifications.filter(n=>!n.read).length;
  const attRate=attendance.length>0?(attendance.filter(a=>a.present).length/attendance.length*100).toFixed(0):0;
  const totalSKS=courses.length*3; // Approximate

  const tabs=[
    {id:"home",label:"Dashboard",icon:"🏠"},
    {id:"deadlines",label:"Deadline",icon:"⏰",badge:urgentDeadlines.length||null},
    {id:"tasks",label:"Tugas",icon:"📝"},
    {id:"quizzes",label:"Quiz/Ujian",icon:"📋"},
    {id:"grades",label:"Nilai",icon:"📊"},
    {id:"attendance",label:"Absensi",icon:"✅"},
    {id:"announcements",label:"Pengumuman",icon:"📢",badge:announcements.length>0?announcements.length:null},
    {id:"notif",label:"Notifikasi",icon:"🔔",badge:unreadNotif||null},
    {id:"chat",label:"AI Chat",icon:"🤖"},
  ];

  return(<>
    <style>{css}</style>
    <div className="app">
      {/* Mobile header */}
      <div className="mob-hdr">
        <div className="mob-hdr-left"><span className="logo-icon">🎓</span><span className="logo-txt">AkademiAI</span></div>
        <button className="mob-menu" onClick={()=>setNav(!nav)}>☰</button>
      </div>

      {/* Sidebar */}
      <nav className={clsx("sidebar",nav&&"open")}>
        <div className="sb-head"><span className="logo-icon">🎓</span><span className="logo-txt">AkademiAI</span></div>
        <div className="sb-user">
          <div className="sb-name">DIMAS LYSTIANTO</div>
          <div className="sb-nim">NIM: 23416255201289</div>
        </div>
        <div className="sb-nav">
          {tabs.map(t=>(
            <button key={t.id} className={clsx("sb-item",tab===t.id&&"active")} onClick={()=>{setTab(t.id);setNav(false)}}>
              <span className="sb-icon">{t.icon}</span><span>{t.label}</span>
              {t.badge&&<span className="sb-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
        <div className="sb-sync">
          <button className="sync-btn" onClick={syncAll} disabled={syncing}>{syncing?"⟳ Syncing...":"🔄 Sync Elearning"}</button>
          {lastSync&&<div className="sync-time">Terakhir: {lastSync.toLocaleTimeString("id-ID")}</div>}
        </div>
      </nav>
      {nav&&<div className="overlay" onClick={()=>setNav(false)}/>}

      {/* Main */}
      <main className="main">
        {err&&<div className="err-bar">⚠️ {err} <button onClick={syncAll}>Coba lagi</button></div>}
        {syncing&&!lastSync&&<div className="loading"><div className="spinner"/>Mengambil data dari elearning...</div>}

        {tab==="home"&&<HomeView {...{courses,deadlines,urgentDeadlines,overdueDeadlines,assignments,quizzes,notifications,announcements,unreadNotif,attRate,totalSKS,grades}}/>}
        {tab==="deadlines"&&<DeadlinesView deadlines={deadlines}/>}
        {tab==="tasks"&&<TasksView assignments={assignments}/>}
        {tab==="quizzes"&&<QuizzesView quizzes={quizzes}/>}
        {tab==="grades"&&<GradesView grades={grades} courses={courses}/>}
        {tab==="attendance"&&<AttendanceView courses={courses} attendance={attendance} setAttendance={setAttendance}/>}
        {tab==="announcements"&&<AnnouncementsView announcements={announcements}/>}
        {tab==="notif"&&<NotifView notifications={notifications}/>}
        {tab==="chat"&&<ChatView msgs={chatMsgs} input={chatIn} setInput={setChatIn} send={sendChat} loading={chatLoading} endRef={chatEnd}/>}
      </main>
    </div>
  </>);
}

// ═══════════════════════════════════════════════════════════════
//  HOME / DASHBOARD
// ═══════════════════════════════════════════════════════════════
function HomeView({courses,deadlines,urgentDeadlines,overdueDeadlines,assignments,quizzes,notifications,announcements,unreadNotif,attRate,totalSKS,grades}){
  // Heatmap next 28 days
  const heatmap=Array.from({length:28},(_,i)=>{
    const d=new Date();d.setDate(d.getDate()+i);const ds=d.toISOString().split("T")[0];
    const count=deadlines.filter(dl=>{const dd=dl.date?new Date(dl.date).toISOString().split("T")[0]:"";return dd===ds}).length;
    return{date:ds,count,label:d.getDate()};
  });

  return(<div className="view">
    <div className="view-hdr">
      <div>
        <h1 className="view-title">Selamat datang, Dimas! 👋</h1>
        <p className="view-sub">BOC - UBP Karawang • {courses.length} Mata Kuliah Aktif • {fmtFull(new Date())}</p>
      </div>
    </div>

    {(urgentDeadlines.length>0||overdueDeadlines.length>0)&&(
      <div className="alert">
        ⚠️ {overdueDeadlines.length>0&&<strong className="c-red">{overdueDeadlines.length} deadline terlambat!</strong>}
        {overdueDeadlines.length>0&&urgentDeadlines.length>0&&" • "}
        {urgentDeadlines.length>0&&<strong className="c-amber">{urgentDeadlines.length} deadline ≤3 hari</strong>}
      </div>
    )}

    <div className="stats">
      <div className="stat-card"><div className="stat-icon bg-blue">📝</div><div className="stat-val">{assignments.length}</div><div className="stat-lbl">Tugas</div></div>
      <div className="stat-card"><div className="stat-icon bg-green">✅</div><div className="stat-val">{attRate}%</div><div className="stat-lbl">Kehadiran</div></div>
      <div className="stat-card"><div className="stat-icon bg-purple">📊</div><div className="stat-val">{Object.keys(grades).length}</div><div className="stat-lbl">Matkul Dinilai</div></div>
      <div className="stat-card"><div className="stat-icon bg-amber">🔔</div><div className="stat-val">{unreadNotif}</div><div className="stat-lbl">Notifikasi Baru</div></div>
    </div>

    {/* Heatmap */}
    <div className="card">
      <h3 className="card-title">📅 Deadline Heatmap (28 Hari)</h3>
      <div className="heatmap">{heatmap.map((h,i)=>(
        <div key={i} className={clsx("hm-cell",h.count===0&&"hm-0",h.count===1&&"hm-1",h.count===2&&"hm-2",h.count>=3&&"hm-3")} title={`${fmtFull(h.date)}: ${h.count} deadline`}>
          <span>{h.label}</span>
        </div>
      ))}</div>
      <div className="hm-legend">
        <span><span className="hm-dot hm-0"/>0</span><span><span className="hm-dot hm-1"/>1</span>
        <span><span className="hm-dot hm-2"/>2</span><span><span className="hm-dot hm-3"/>3+</span>
      </div>
    </div>

    <div className="two-col">
      {/* Upcoming deadlines */}
      <div className="card">
        <h3 className="card-title">⚡ Deadline Terdekat</h3>
        {deadlines.slice(0,6).map(d=>(
          <div key={d.id} className="list-item">
            <div className={clsx("dl-type",d.type==="assign"&&"t-assign",d.type==="quiz"&&"t-quiz")}>{d.type==="assign"?"📝":d.type==="quiz"?"📋":"📅"}</div>
            <div className="list-body">
              <div className="list-title">{d.name}</div>
              <div className="list-sub">{d.course} • {fmtFull(d.date)}</div>
            </div>
            <div className={clsx("days-tag",daysUntil(d.date)<0&&"dt-late",daysUntil(d.date)<=3&&daysUntil(d.date)>=0&&"dt-urgent")}>
              {daysUntil(d.date)<0?"Terlambat":daysUntil(d.date)===0?"Hari ini!":daysUntil(d.date)+"h"}
            </div>
          </div>
        ))}
        {deadlines.length===0&&<p className="empty">Tidak ada deadline mendatang 🎉</p>}
      </div>

      {/* Latest announcements */}
      <div className="card">
        <h3 className="card-title">📢 Pengumuman Terbaru</h3>
        {announcements.slice(0,5).map(a=>(
          <div key={a.id} className="list-item">
            <div className="ann-icon">📌</div>
            <div className="list-body">
              <div className="list-title">{a.name}</div>
              <div className="list-sub">{a.author} • {fmtDate(a.created)}</div>
            </div>
          </div>
        ))}
        {announcements.length===0&&<p className="empty">Belum ada pengumuman</p>}
      </div>
    </div>

    {/* Courses grid */}
    <div className="card">
      <h3 className="card-title">📚 Mata Kuliah Aktif ({courses.length})</h3>
      <div className="course-grid">
        {courses.map(c=>(
          <div key={c.id} className="course-card">
            {c.courseimage&&<div className="course-img" style={{backgroundImage:`url(${c.courseimage})`}}/>}
            <div className="course-info">
              <div className="course-name">{c.shortname||c.fullname}</div>
              {c.progress!=null&&<div className="prog-bar"><div className="prog-fill" style={{width:c.progress+"%"}}/></div>}
              {c.progress!=null&&<div className="course-prog">{Math.round(c.progress)}% selesai</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  DEADLINES VIEW
// ═══════════════════════════════════════════════════════════════
function DeadlinesView({deadlines}){
  const [filter,setFilter]=useState("all");
  let items=[...deadlines];
  if(filter==="overdue")items=items.filter(d=>d.overdue||daysUntil(d.date)<0);
  if(filter==="week")items=items.filter(d=>daysUntil(d.date)>=0&&daysUntil(d.date)<=7);
  if(filter==="month")items=items.filter(d=>daysUntil(d.date)>=0&&daysUntil(d.date)<=30);

  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Semua Deadline ⏰</h1><p className="view-sub">{deadlines.length} deadline dari elearning</p></div></div>
    <div className="filters">
      {[["all","Semua"],["overdue","Terlambat"],["week","7 Hari"],["month","30 Hari"]].map(([k,l])=>(
        <button key={k} className={clsx("fbtn",filter===k&&"active")} onClick={()=>setFilter(k)}>{l}</button>
      ))}
    </div>
    <div className="list-cards">
      {items.map(d=>(
        <a key={d.id} href={d.url||"#"} target="_blank" rel="noopener" className="task-card">
          <div className={clsx("dl-type",d.type==="assign"&&"t-assign",d.type==="quiz"&&"t-quiz")}>{d.type==="assign"?"📝":d.type==="quiz"?"📋":"📅"}</div>
          <div className="tc-body">
            <div className="tc-title">{d.name}</div>
            <div className="tc-meta"><span className="badge">{d.course}</span><span className="badge b-type">{d.type}</span><span>📅 {fmtFull(d.date)}</span></div>
            {d.desc&&<div className="tc-desc">{d.desc}</div>}
          </div>
          <div className={clsx("days-tag",daysUntil(d.date)<0&&"dt-late",daysUntil(d.date)<=3&&daysUntil(d.date)>=0&&"dt-urgent")}>
            {daysUntil(d.date)<0?Math.abs(daysUntil(d.date))+"h late":daysUntil(d.date)===0?"Hari ini!":daysUntil(d.date)+" hari"}
          </div>
        </a>
      ))}
      {items.length===0&&<p className="empty">Tidak ada deadline di filter ini</p>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  TASKS VIEW
// ═══════════════════════════════════════════════════════════════
function TasksView({assignments}){
  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Semua Tugas 📝</h1><p className="view-sub">{assignments.length} tugas dari elearning</p></div></div>
    <div className="list-cards">
      {assignments.map(a=>(
        <div key={a.id} className="task-card">
          <div className="dl-type t-assign">📝</div>
          <div className="tc-body">
            <div className="tc-title">{a.name}</div>
            <div className="tc-meta"><span className="badge">{a.course}</span><span>📅 Deadline: {fmtFull(a.duedate)}</span></div>
            {a.intro&&<div className="tc-desc">{a.intro}</div>}
          </div>
          {a.duedate&&<div className={clsx("days-tag",daysUntil(a.duedate)<0&&"dt-late",daysUntil(a.duedate)<=3&&daysUntil(a.duedate)>=0&&"dt-urgent")}>
            {daysUntil(a.duedate)<0?"Terlambat":daysUntil(a.duedate)===0?"Hari ini!":daysUntil(a.duedate)+"h"}
          </div>}
        </div>
      ))}
      {assignments.length===0&&<p className="empty">Tidak ada tugas</p>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  QUIZZES VIEW
// ═══════════════════════════════════════════════════════════════
function QuizzesView({quizzes}){
  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Quiz & Ujian 📋</h1><p className="view-sub">{quizzes.length} quiz terdaftar</p></div></div>
    <div className="list-cards">
      {quizzes.map(q=>(
        <div key={q.id} className="task-card">
          <div className="dl-type t-quiz">📋</div>
          <div className="tc-body">
            <div className="tc-title">{q.name}</div>
            <div className="tc-meta">
              {q.timeopen&&<span>🟢 Buka: {fmtFull(q.timeopen)}</span>}
              {q.timeclose&&<span>🔴 Tutup: {fmtFull(q.timeclose)}</span>}
              {q.timelimit>0&&<span>⏱ {Math.round(q.timelimit/60)} menit</span>}
              {q.maxgrade&&<span>⭐ Max: {q.maxgrade}</span>}
            </div>
          </div>
          {q.timeclose&&<div className={clsx("days-tag",daysUntil(q.timeclose)<0&&"dt-late",daysUntil(q.timeclose)<=3&&daysUntil(q.timeclose)>=0&&"dt-urgent")}>
            {daysUntil(q.timeclose)<0?"Selesai":daysUntil(q.timeclose)+"h"}
          </div>}
        </div>
      ))}
      {quizzes.length===0&&<p className="empty">Tidak ada quiz</p>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  GRADES VIEW
// ═══════════════════════════════════════════════════════════════
function GradesView({grades,courses}){
  const [open,setOpen]=useState(null);
  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Nilai Akademik 📊</h1><p className="view-sub">Data langsung dari elearning</p></div></div>
    {Object.entries(grades).map(([cid,g])=>(
      <div key={cid} className="card" style={{cursor:"pointer"}} onClick={()=>setOpen(open===cid?null:cid)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h3 className="card-title" style={{margin:0}}>{g.name}</h3>
          <span>{open===cid?"▲":"▼"}</span>
        </div>
        {open===cid&&<div style={{marginTop:12}}>
          {g.items.filter(i=>i.grade&&i.grade!=="-").map(i=>(
            <div key={i.id} className="list-item">
              <div className="list-body">
                <div className="list-title">{i.name}</div>
                <div className="list-sub">{i.module||i.type}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontWeight:800,fontSize:16,color:"#e2e8f0"}}>{i.grade}</div>
                {i.pct&&<div style={{fontSize:11,color:"#94a3b8"}}>{i.pct}</div>}
              </div>
            </div>
          ))}
          {g.items.filter(i=>i.grade&&i.grade!=="-").length===0&&<p className="empty">Belum ada nilai</p>}
        </div>}
      </div>
    ))}
    {Object.keys(grades).length===0&&<p className="empty">Belum ada data nilai dari elearning</p>}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  ATTENDANCE VIEW (Manual — karena plugin tidak tersedia)
// ═══════════════════════════════════════════════════════════════
function AttendanceView({courses,attendance,setAttendance}){
  const addAtt=(course,present)=>setAttendance(p=>[...p,{id:uid(),course,present,date:new Date().toISOString()}]);
  const courseSummary=courses.map(c=>{const recs=attendance.filter(a=>a.course===(c.shortname||c.fullname));const p=recs.filter(a=>a.present).length;const t=recs.length;return{...c,present:p,total:t,rate:t>0?Math.round(p/t*100):0}});

  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Absensi 📋</h1><p className="view-sub">Input manual (plugin absensi tidak tersedia via API)</p></div></div>
    {courses.length>0&&<div className="card">
      <h3 className="card-title">⏰ Catat Kehadiran Hari Ini</h3>
      <div className="att-grid">
        {courses.map(c=><div key={c.id} className="att-card">
          <div className="att-name">{c.shortname||c.fullname}</div>
          <div className="att-btns">
            <button className="att-btn att-yes" onClick={()=>addAtt(c.shortname||c.fullname,true)}>✓ Hadir</button>
            <button className="att-btn att-no" onClick={()=>addAtt(c.shortname||c.fullname,false)}>✗ Absen</button>
          </div>
        </div>)}
      </div>
    </div>}
    <div className="card">
      <h3 className="card-title">📊 Ringkasan per Matkul</h3>
      {courseSummary.map(c=><div key={c.id} style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontWeight:600,color:"#e2e8f0",fontSize:13}}>{c.shortname||c.fullname}</span>
          <span style={{color:c.rate>=80?"#22c55e":c.rate>=60?"#f59e0b":"#ef4444",fontWeight:700,fontSize:13}}>{c.rate}% ({c.present}/{c.total})</span>
        </div>
        <div className="prog-bar"><div className="prog-fill" style={{width:c.rate+"%",background:c.rate>=80?"#22c55e":c.rate>=60?"#f59e0b":"#ef4444"}}/></div>
        {c.rate<75&&c.total>0&&<div style={{fontSize:11,color:"#f59e0b",marginTop:2}}>⚠️ Di bawah batas minimum 75%!</div>}
      </div>)}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  ANNOUNCEMENTS VIEW
// ═══════════════════════════════════════════════════════════════
function AnnouncementsView({announcements}){
  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Pengumuman Dosen 📢</h1><p className="view-sub">{announcements.length} pengumuman dari forum elearning</p></div></div>
    <div className="list-cards">
      {announcements.map(a=>(
        <div key={a.id} className="task-card">
          <div className="ann-icon lg">📌</div>
          <div className="tc-body">
            <div className="tc-title">{a.name}</div>
            <div className="tc-meta"><span className="badge">{a.forum}</span><span>👤 {a.author}</span><span>📅 {fmtFull(a.created)}</span></div>
            {a.msg&&<div className="tc-desc">{a.msg}</div>}
          </div>
        </div>
      ))}
      {announcements.length===0&&<p className="empty">Belum ada pengumuman</p>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  NOTIFICATIONS VIEW
// ═══════════════════════════════════════════════════════════════
function NotifView({notifications}){
  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">Notifikasi 🔔</h1><p className="view-sub">{notifications.length} notifikasi dari elearning</p></div></div>
    <div className="list-cards">
      {notifications.map(n=>(
        <a key={n.id} href={n.url||"#"} target="_blank" rel="noopener" className={clsx("task-card",!n.read&&"unread")}>
          <div className="notif-dot-wrap">{!n.read&&<div className="notif-dot"/>}</div>
          <div className="tc-body">
            <div className="tc-title">{n.subject}</div>
            <div className="tc-meta"><span>{fmtFull(n.time)}</span><span className="badge b-type">{(n.type||"").replace("mod_","")}</span></div>
            {n.text&&<div className="tc-desc">{n.text}</div>}
          </div>
        </a>
      ))}
      {notifications.length===0&&<p className="empty">Tidak ada notifikasi</p>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  AI CHAT VIEW
// ═══════════════════════════════════════════════════════════════
function ChatView({msgs,input,setInput,send,loading,endRef}){
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"})},[msgs.length]);
  const prompts=["Tugas apa yang paling urgent?","Analisis performa saya","Beri saran belajar minggu ini","Rangkum pengumuman terbaru","Bagaimana kehadiran saya?"];

  return(<div className="view">
    <div className="view-hdr"><div><h1 className="view-title">AI Chat 🤖</h1><p className="view-sub">Tanya apapun tentang kuliah kamu — data real-time dari elearning</p></div></div>
    <div className="quick-prompts">{prompts.map((p,i)=><button key={i} className="qp-btn" onClick={()=>send(p)}>{p}</button>)}</div>
    <div className="chat-box">
      {msgs.length===0&&<div className="chat-empty"><div style={{fontSize:40,marginBottom:8}}>🤖</div><p>Halo Dimas! Saya AkademiAI.</p><p>Saya terhubung langsung ke elearning UBP Karawang kamu.</p><p>Tanya apa saja!</p></div>}
      {msgs.map((m,i)=>(
        <div key={i} className={clsx("chat-msg",m.role==="user"?"msg-user":"msg-ai")}>
          {m.role==="assistant"&&<div className="msg-label">🤖 AkademiAI</div>}
          <div className="msg-text">{m.content}</div>
          <div className="msg-time">{new Date(m.time).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}</div>
        </div>
      ))}
      {loading&&<div className="chat-msg msg-ai"><div className="msg-label">🤖 AkademiAI</div><div className="typing"><span/><span/><span/></div></div>}
      <div ref={endRef}/>
    </div>
    <div className="chat-input-row">
      <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send(input)} placeholder="Tanya AkademiAI..." className="chat-input"/>
      <button onClick={()=>send(input)} disabled={loading||!input.trim()} className="send-btn">➤</button>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
//  STYLES
// ═══════════════════════════════════════════════════════════════
const css=`
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#080d19;--bg2:#0f172a;--bg3:#111827;--border:#1e293b;--t1:#e2e8f0;--t2:#94a3b8;--t3:#64748b;--accent:#059669;--accent2:#6ee7b7;}
body{background:var(--bg);color:var(--t1);font-family:'Outfit',sans-serif;-webkit-font-smoothing:antialiased}
.app{display:flex;min-height:100vh}

/* Sidebar */
.sidebar{width:250px;background:var(--bg2);border-right:1px solid var(--border);position:fixed;top:0;bottom:0;left:0;z-index:50;display:flex;flex-direction:column;padding:16px 0;transition:transform .3s}
.sb-head{display:flex;align-items:center;gap:10px;padding:0 20px;margin-bottom:8px}
.logo-icon{font-size:22px}
.logo-txt{font-weight:800;font-size:18px;color:var(--t1);letter-spacing:-.5px}
.sb-user{padding:8px 20px 16px;border-bottom:1px solid var(--border);margin-bottom:8px}
.sb-name{font-weight:700;font-size:13px;color:var(--accent2)}
.sb-nim{font-size:11px;color:var(--t3)}
.sb-nav{flex:1;display:flex;flex-direction:column;gap:2px;padding:4px 8px;overflow-y:auto}
.sb-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--t2);cursor:pointer;font-size:13px;font-weight:500;font-family:inherit;text-align:left;width:100%;transition:all .15s}
.sb-item:hover{background:var(--bg3);color:var(--t1)}
.sb-item.active{background:var(--border);color:var(--accent2);font-weight:600}
.sb-icon{font-size:16px;width:22px;text-align:center}
.sb-badge{background:#ef4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:700;margin-left:auto}
.sb-sync{padding:12px 16px;border-top:1px solid var(--border)}
.sync-btn{width:100%;padding:8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--accent2);font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
.sync-btn:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.sync-btn:disabled{opacity:.5;cursor:not-allowed}
.sync-time{font-size:10px;color:var(--t3);margin-top:4px;text-align:center}

/* Mobile */
.mob-hdr{display:none;position:fixed;top:0;left:0;right:0;height:52px;background:var(--bg2);border-bottom:1px solid var(--border);align-items:center;justify-content:space-between;padding:0 16px;z-index:40}
.mob-hdr-left{display:flex;align-items:center;gap:8px}
.mob-menu{background:none;border:none;color:var(--t2);font-size:22px;cursor:pointer}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:45}
@media(max-width:768px){
  .sidebar{transform:translateX(-100%)}
  .sidebar.open{transform:translateX(0)}
  .mob-hdr{display:flex}
  .main{margin-left:0!important;padding-top:52px!important}
  .two-col{grid-template-columns:1fr!important}
  .stats{grid-template-columns:repeat(2,1fr)!important}
  .course-grid{grid-template-columns:1fr!important}
}

/* Main */
.main{flex:1;margin-left:250px;min-height:100vh}
.view{padding:24px 28px;max-width:980px;margin:0 auto}
.view-hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px}
.view-title{font-size:24px;font-weight:800;letter-spacing:-.5px}
.view-sub{font-size:13px;color:var(--t2);margin-top:4px}

/* Cards */
.card{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:16px}
.card-title{margin:0 0 12px;font-size:14px;font-weight:700;color:var(--t2)}

/* Stats */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.stat-card{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px;text-align:center}
.stat-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin:0 auto 8px;font-size:18px}
.bg-blue{background:#1e3a5f}.bg-green{background:#065f46}.bg-purple{background:#3b1f6e}.bg-amber{background:#78350f}
.stat-val{font-size:24px;font-weight:800}.stat-lbl{font-size:12px;color:var(--t2);margin-top:2px}

/* Heatmap */
.heatmap{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.hm-cell{aspect-ratio:1;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;min-height:28px;color:var(--t1)}
.hm-0{background:#1e293b}.hm-1{background:#065f46}.hm-2{background:#78350f}.hm-3{background:#991b1b}
.hm-legend{display:flex;gap:12px;margin-top:8px;font-size:11px;color:var(--t2)}
.hm-dot{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:middle}

/* Two column */
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}

/* Alert */
.alert{display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(120,53,15,.15);border:1px solid rgba(120,53,15,.35);border-radius:10px;margin-bottom:16px;font-size:13px}
.c-red{color:#ef4444}.c-amber{color:#f59e0b}

/* Lists */
.list-item{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)}
.list-body{flex:1;min-width:0}
.list-title{font-weight:600;font-size:13px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.list-sub{font-size:11px;color:var(--t2)}
.dl-type{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:16px;background:var(--border)}
.t-assign{background:#1e3a5f}.t-quiz{background:#3b1f6e}
.ann-icon{font-size:16px;flex-shrink:0}.ann-icon.lg{font-size:22px}
.days-tag{padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;color:var(--t1);white-space:nowrap;flex-shrink:0;background:#1e3a5f}
.dt-late{background:#7f1d1d}.dt-urgent{background:#78350f}

/* Task cards */
.list-cards{display:flex;flex-direction:column;gap:8px}
.task-card{display:flex;align-items:center;gap:12px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 16px;text-decoration:none;color:inherit;transition:border-color .15s}
.task-card:hover{border-color:var(--accent)}
.task-card.unread{border-left:3px solid #3b82f6}
.tc-body{flex:1;min-width:0}
.tc-title{font-weight:600;font-size:14px;color:var(--t1)}
.tc-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;font-size:12px;color:var(--t2);align-items:center}
.tc-desc{font-size:12px;color:var(--t3);margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.badge{background:#1e3a5f;color:#93c5fd;padding:1px 8px;border-radius:4px;font-size:11px;font-weight:600}
.b-type{background:#3b1f6e;color:#c4b5fd}
.notif-dot-wrap{width:10px;flex-shrink:0;display:flex;align-items:center}
.notif-dot{width:8px;height:8px;border-radius:50%;background:#3b82f6}

/* Courses grid */
.course-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.course-card{background:var(--bg);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:border-color .15s}
.course-card:hover{border-color:var(--accent)}
.course-img{height:80px;background-size:cover;background-position:center;background-color:var(--border)}
.course-info{padding:10px 12px}
.course-name{font-weight:600;font-size:13px;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.course-prog{font-size:11px;color:var(--t2);margin-top:2px}
.prog-bar{height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-top:6px}
.prog-fill{height:100%;border-radius:3px;background:var(--accent);transition:width .3s}

/* Filters */
.filters{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
.fbtn{padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:transparent;color:var(--t2);cursor:pointer;font-size:12px;font-weight:500;font-family:inherit;transition:all .15s}
.fbtn:hover{border-color:var(--t2)}.fbtn.active{background:var(--border);color:var(--accent2);border-color:rgba(110,231,183,.3)}

/* Attendance */
.att-grid{display:flex;flex-wrap:wrap;gap:8px}
.att-card{background:var(--bg);border-radius:8px;padding:10px 14px;border:1px solid var(--border)}
.att-name{font-weight:600;font-size:13px;color:var(--t1);margin-bottom:6px}
.att-btns{display:flex;gap:6px}
.att-btn{padding:4px 10px;border-radius:6px;border:none;font-family:inherit;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
.att-yes{background:#065f46;color:#6ee7b7}.att-yes:hover{background:#059669}
.att-no{background:#7f1d1d;color:#fca5a5}.att-no:hover{background:#991b1b}

/* Chat */
.quick-prompts{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px}
.qp-btn{padding:5px 12px;border-radius:16px;border:1px solid var(--border);background:var(--bg2);color:var(--t2);cursor:pointer;font-size:11px;font-family:inherit;transition:all .15s}
.qp-btn:hover{border-color:var(--accent);color:var(--accent2)}
.chat-box{display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto;padding:12px 0;margin-bottom:12px}
.chat-empty{text-align:center;padding:40px;color:var(--t3);font-size:14px}
.chat-msg{padding:10px 14px;border-radius:16px;max-width:85%;animation:msgIn .2s ease}
.msg-user{align-self:flex-end;background:#1d4ed8;border-radius:16px 16px 4px 16px}
.msg-ai{align-self:flex-start;background:var(--border);border-radius:16px 16px 16px 4px}
.msg-label{font-size:10px;color:var(--accent2);margin-bottom:4px;font-weight:600}
.msg-text{font-size:13px;line-height:1.6;white-space:pre-wrap}
.msg-time{font-size:10px;color:var(--t3);margin-top:4px}
.chat-input-row{display:flex;gap:8px}
.chat-input{flex:1;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg2);color:var(--t1);font-size:14px;font-family:inherit;outline:none}
.chat-input:focus{border-color:var(--accent)}
.send-btn{width:44px;height:44px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-size:18px;cursor:pointer;transition:all .15s}
.send-btn:hover{background:#047857}.send-btn:disabled{opacity:.4;cursor:not-allowed}
.typing{display:flex;gap:4px;padding:4px 0}
.typing span{width:8px;height:8px;border-radius:50%;background:var(--t3);animation:typingDot .8s infinite}
.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}

/* Loading / Error */
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px;color:var(--t2);font-size:14px;gap:16px}
.spinner{width:32px;height:32px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
.err-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;background:#7f1d1d;border-radius:8px;margin:12px 28px;font-size:13px}
.err-bar button{background:rgba(255,255,255,.15);border:none;color:#fca5a5;padding:4px 12px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:12px}
.empty{color:var(--t3);font-size:13px;text-align:center;padding:16px}

@keyframes spin{to{transform:rotate(360deg)}}
@keyframes msgIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes typingDot{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-4px)}}
`;
