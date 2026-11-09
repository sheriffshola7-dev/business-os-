"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, Mail, Phone, Plus, Search, UserRound, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Client = { id:string; name:string; email:string|null; phone:string|null; company:string|null; notes:string|null; status:string; created_at:string };
type Interaction = { id:string; customer_id:string; interaction_type:string; subject:string; notes:string|null; follow_up_at:string|null; follow_up_completed_at:string|null; created_by:string; created_at:string };
type Props = { supabase:SupabaseClient<Database>|null; workspaceId:string; userId:string; role:string };

const dateLabel=(value:string)=>new Date(value).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
const canEdit=(role:string)=>["owner","admin","manager"].includes(role);

export default function CustomersDashboard({supabase,workspaceId,userId,role}:Props){
 const [customers,setCustomers]=useState<Client[]>([]);
 const [selectedId,setSelectedId]=useState("");
 const [interactions,setInteractions]=useState<Interaction[]>([]);
 const [followUps,setFollowUps]=useState<(Interaction & {customer_name:string})[]>([]);
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [showProfile,setShowProfile]=useState(false);
 const [showInteraction,setShowInteraction]=useState(false);
 const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [phone,setPhone]=useState(""); const [company,setCompany]=useState(""); const [notes,setNotes]=useState(""); const [status,setStatus]=useState("active");
 const [kind,setKind]=useState("call"); const [subject,setSubject]=useState(""); const [detail,setDetail]=useState(""); const [followUp,setFollowUp]=useState(""); const [busy,setBusy]=useState(false);
 const selected=customers.find(c=>c.id===selectedId)||null;
 const load=useCallback(async()=>{
  if(!supabase||!workspaceId){setLoading(false);return;}
  setLoading(true);setError("");
  const {data,error:loadError}=await supabase.from("customers").select("id,name,email,phone,company,notes,status,created_at").eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(200);
  if(loadError){setError(loadError.message);setLoading(false);return;}
  const rows=(data||[]) as Client[];setCustomers(rows);setSelectedId(current=>rows.some(c=>c.id===current)?current:rows[0]?.id||"");setLoading(false);
 },[supabase,workspaceId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  let live=true;
  async function loadFollowUps(){
   if(!supabase||!workspaceId){setFollowUps([]);return;}
   const {data,error:followError}=await supabase.from("customer_interactions").select("id,customer_id,interaction_type,subject,notes,follow_up_at,follow_up_completed_at,created_by,created_at").eq("workspace_id",workspaceId).not("follow_up_at","is",null).is("follow_up_completed_at",null).order("follow_up_at",{ascending:true}).limit(100);
   if(!live)return;
   if(followError){setError(followError.message);return;}
   const rows=(data||[]) as Interaction[];
   setFollowUps(rows.map(item=>({...item,customer_name:customers.find(customer=>customer.id===item.customer_id)?.name||"Customer"})));
  }
  void loadFollowUps();return()=>{live=false;};
 },[supabase,workspaceId,customers]);
 useEffect(()=>{
  let live=true;
  async function loadInteractions(){
   if(!supabase||!selectedId){setInteractions([]);return;}
   const {data,error:queryError}=await supabase.from("customer_interactions").select("id,customer_id,interaction_type,subject,notes,follow_up_at,created_at").eq("workspace_id",workspaceId).eq("customer_id",selectedId).order("created_at",{ascending:false}).limit(100);
   if(!live)return;
   if(queryError)setError(queryError.message);else setInteractions((data||[]) as Interaction[]);
  }
  void loadInteractions();return()=>{live=false;};
 },[supabase,workspaceId,selectedId]);
 const filtered=useMemo(()=>customers.filter(c=>(c.name+" "+(c.company||"")+" "+(c.email||"")).toLowerCase().includes(search.toLowerCase())),[customers,search]);
 function editProfile(c:Client){setSelectedId(c.id);setName(c.name);setEmail(c.email||"");setPhone(c.phone||"");setCompany(c.company||"");setNotes(c.notes||"");setStatus(c.status||"active");setShowProfile(true);}
 async function saveProfile(e:FormEvent){
  e.preventDefault();if(!supabase||!selected)return;setBusy(true);setError("");setNotice("");
  const {error:saveError}=await supabase.from("customers").update({name:name.trim(),email:email.trim()||null,phone:phone.trim()||null,company:company.trim()||null,notes:notes.trim()||null,status}).eq("id",selected.id).eq("workspace_id",workspaceId);
  if(saveError)setError(saveError.message);else{setCustomers(rows=>rows.map(c=>c.id===selected.id?{...c,name:name.trim(),email:email.trim()||null,phone:phone.trim()||null,company:company.trim()||null,notes:notes.trim()||null,status}:c));setNotice("Customer profile updated.");setShowProfile(false);}
  setBusy(false);
 }
 async function saveInteraction(e:FormEvent){
  e.preventDefault();if(!supabase||!selected||!userId)return;setBusy(true);setError("");setNotice("");
  const {data, error:saveError}=await supabase.from("customer_interactions").insert({workspace_id:workspaceId,customer_id:selected.id,interaction_type:kind,subject:subject.trim(),notes:detail.trim()||null,follow_up_at:followUp?new Date(followUp).toISOString():null,created_by:userId}).select("id,customer_id,interaction_type,subject,notes,follow_up_at,created_at").single();
  if(saveError)setError(saveError.message);else{setInteractions(rows=>[data as Interaction,...rows]);setSubject("");setDetail("");setFollowUp("");setShowInteraction(false);setNotice("Customer interaction saved.");}
  setBusy(false);
 }
 if(!supabase)return <div className="subtle-card p-5 text-sm">Connect Supabase to manage customers.</div>;
 return <div className="space-y-4">
  {error&&<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}
  {notice&&<div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</div>}
  <section className="subtle-card p-4">
   <div className="mb-3 flex items-center justify-between gap-2"><div><h2 className="text-sm font-bold">Follow-up tracker</h2><p className="mt-1 text-[10px] text-[#929c95]">Upcoming and overdue customer follow-ups</p></div><span className="rounded-full bg-[#eaf2ec] px-2.5 py-1 text-[10px] font-semibold text-[#16865b]">{followUps.filter(item=>new Date(item.follow_up_at||"")>=new Date()).length} upcoming</span></div>
   {followUps.length?<div className="grid gap-2 md:grid-cols-2">{followUps.map(item=>{const overdue=!!item.follow_up_at&&new Date(item.follow_up_at)<new Date();return <div key={item.id} onClick={()=>setSelectedId(item.customer_id)} className="flex min-w-0 items-start gap-3 rounded-lg border border-[#edf0ee] p-3 text-left hover:bg-[#fafbfa]"><button type="button" onClick={()=>setSelectedId(item.customer_id)} className="flex min-w-0 flex-1 items-start gap-3 text-left"><CalendarClock size={15} className={overdue?"mt-0.5 text-amber-600":"mt-0.5 text-[#16865b]"}/><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#34433a]">{item.subject}</span><span className="mt-1 block truncate text-[10px] text-[#929c95]">{item.customer_name} · {item.follow_up_at?dateLabel(item.follow_up_at):""}</span></span><span className={"shrink-0 rounded-full px-2 py-1 text-[9px] "+(overdue?"bg-amber-50 text-amber-700":"bg-[#eef5ef] text-[#16865b]")}>{overdue?"Overdue":"Upcoming"}</span></button>{item.created_by===userId&&<button type="button" onClick={async()=>{if(!supabase)return;const {error:completeError}=await supabase.from("customer_interactions").update({follow_up_completed_at:new Date().toISOString()}).eq("id",item.id).eq("workspace_id",workspaceId);if(completeError)setError(completeError.message);else setFollowUps(rows=>rows.filter(row=>row.id!==item.id));}} className="shrink-0 rounded-md border border-[#dcebe0] px-2 py-1 text-[9px] font-semibold text-[#16865b]">Done</button>}</div>})}</div>:<div className="rounded-lg bg-[#fafbfa] px-4 py-5 text-center text-xs text-[#929c95]">No customer follow-ups scheduled.</div>}
  </section>
  <div className="grid gap-4 lg:grid-cols-[minmax(240px,.8fr)_minmax(0,1.5fr)]">
   <section className="subtle-card overflow-hidden">
    <div className="border-b border-[#edf0ee] p-4"><div className="text-sm font-bold">Customer directory</div><div className="relative mt-3"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#929c95]"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search customers..." className="field !pl-9"/></div></div>
    {loading?<div className="p-8 text-center text-xs text-[#929c95]">Loading customers…</div>:filtered.length?filtered.map(c=><button key={c.id} onClick={()=>setSelectedId(c.id)} className={"flex w-full items-center gap-3 border-b border-[#f0f3f1] p-4 text-left last:border-0 "+(selectedId===c.id?"bg-[#f3f8f4]":"hover:bg-[#fafbfa]")}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#eaf2ec] text-[#16865b]"><UserRound size={16}/></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[#34433a]">{c.name}</span><span className="mt-1 block truncate text-[10px] text-[#929c95]">{c.company||c.email||"Customer"}</span></span><span className="rounded-full bg-[#f0f3f1] px-2 py-1 text-[9px] capitalize text-[#68756d]">{c.status||"active"}</span></button>):<div className="p-8 text-center text-xs text-[#929c95]">No customers match this search.</div>}
   </section>
   <section className="subtle-card min-h-[380px]">
    {selected?<><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0ee] p-5"><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#eaf2ec] text-[#16865b]"><UserRound size={20}/></span><div className="min-w-0"><h2 className="truncate text-base font-bold text-[#34433a]">{selected.name}</h2><p className="mt-1 text-xs text-[#929c95]">{selected.company||"No company added"}</p></div></div>{canEdit(role)&&<button onClick={()=>editProfile(selected)} className="action-button">Edit profile</button>}</div>
    <div className="grid gap-3 border-b border-[#edf0ee] p-5 sm:grid-cols-2"><div className="flex items-center gap-2 text-xs text-[#69756e]"><Mail size={14}/>{selected.email||"No email"}</div><div className="flex items-center gap-2 text-xs text-[#69756e]"><Phone size={14}/>{selected.phone||"No phone"}</div><div className="text-xs text-[#69756e]">Status: <span className="font-semibold capitalize">{selected.status||"active"}</span></div><div className="text-xs text-[#929c95]">Added {new Date(selected.created_at).toLocaleDateString()}</div>{selected.notes&&<p className="sm:col-span-2 whitespace-pre-wrap text-xs leading-relaxed text-[#69756e]">{selected.notes}</p>}</div>
    <div className="p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold">Interaction history</h3><p className="mt-1 text-[10px] text-[#929c95]">Calls, emails, meetings, messages and notes</p></div>{canEdit(role)&&<button onClick={()=>setShowInteraction(true)} className="primary-button"><Plus size={14}/>Log interaction</button>}</div>
    {interactions.length? <div className="space-y-4">{interactions.map(i=><div key={i.id} className="relative border-l-2 border-[#dcebe0] pb-1 pl-4"><span className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-[#16865b]"/><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-semibold capitalize text-[#34433a]">{i.subject}</span><span className="text-[9px] capitalize text-[#929c95]">{i.interaction_type} · {dateLabel(i.created_at)}</span></div>{i.notes&&<p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[#69756e]">{i.notes}</p>}{i.follow_up_at&&<div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-[#16865b]"><CalendarClock size={12}/>Follow up {dateLabel(i.follow_up_at)}</div>}</div>)}</div>:<div className="rounded-lg bg-[#fafbfa] px-4 py-8 text-center text-xs text-[#929c95]">No interactions recorded for this customer yet.</div>}
    </div></>:<div className="flex min-h-[360px] items-center justify-center p-8 text-center text-xs text-[#929c95]">Select a customer to view their profile and activity.</div>}
   </section>
  </div>
  {showProfile&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowProfile(false);}}><form onSubmit={saveProfile} className="modal"><div className="flex justify-between"><h2 className="text-lg font-bold">Edit customer profile</h2><button type="button" onClick={()=>setShowProfile(false)}><X size={18}/></button></div><div className="mt-4 space-y-3">{[["Name",name,setName],["Email",email,setEmail],["Phone",phone,setPhone],["Company",company,setCompany]].map(([label,value,setter])=><label key={label as string} className="block text-xs font-semibold text-[#526057]">{label as string}<input value={value as string} onChange={e=>(setter as (v:string)=>void)(e.target.value)} className="field"/></label>)}<label className="block text-xs font-semibold text-[#526057]">Status<select value={status} onChange={e=>setStatus(e.target.value)} className="field"><option value="lead">Lead</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="block text-xs font-semibold text-[#526057]">Notes<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="field"/></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowProfile(false)} className="action-button">Cancel</button><button disabled={busy} className="primary-button">Save profile</button></div></form></div>}
  {showInteraction&&selected&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowInteraction(false);}}><form onSubmit={saveInteraction} className="modal"><div className="flex justify-between"><h2 className="text-lg font-bold">Log customer interaction</h2><button type="button" onClick={()=>setShowInteraction(false)}><X size={18}/></button></div><div className="mt-4 space-y-3"><label className="block text-xs font-semibold text-[#526057]">Type<select value={kind} onChange={e=>setKind(e.target.value)} className="field"><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="message">Message</option><option value="note">Note</option></select></label><label className="block text-xs font-semibold text-[#526057]">Subject<input required maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)} className="field" placeholder="e.g. Discussed project requirements"/></label><label className="block text-xs font-semibold text-[#526057]">Details<textarea rows={3} value={detail} onChange={e=>setDetail(e.target.value)} className="field" placeholder="Add a short summary..."/></label><label className="block text-xs font-semibold text-[#526057]">Follow-up (optional)<input type="datetime-local" value={followUp} onChange={e=>setFollowUp(e.target.value)} className="field"/></label></div><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setShowInteraction(false)} className="action-button">Cancel</button><button disabled={busy} className="primary-button">Save interaction</button></div></form></div>}
 </div>;
}
