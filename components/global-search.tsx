"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, LoaderCircle, CheckSquare, Users, Wallet, TrendingUp, Package, ReceiptText } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

type Section = "Tasks & projects" | "Customers" | "Finances" | "Sales" | "Inventory" | "Invoices";
type Result = { id:string; title:string; detail:string; section:Section; icon:"task"|"customer"|"expense"|"sale"|"inventory"|"invoice" };
type Props = { supabase:SupabaseClient<Database>|null; workspaceId:string; onNavigate:(section:Section)=>void };

export default function GlobalSearch({supabase,workspaceId,onNavigate}:Props){
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<Result[]>([]);
  const [loading,setLoading]=useState(false);
  const [searchError,setSearchError]=useState("");
  const [open,setOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const rootRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    if(!open)return;
    const close=(event:MouseEvent)=>{if(rootRef.current&&!rootRef.current.contains(event.target as Node))setOpen(false);};
    const key=(event:globalThis.KeyboardEvent)=>{if(event.key==="Escape"){setOpen(false);setMobileOpen(false);}};
    document.addEventListener("mousedown",close);
    document.addEventListener("keydown",key);
    return()=>{document.removeEventListener("mousedown",close);document.removeEventListener("keydown",key);};
  },[open]);

  useEffect(()=>{
    const term=query.trim();
    if(!term||term.length<2||!supabase||!workspaceId){setResults([]);setLoading(false);setSearchError("");return;}
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      setLoading(true);setSearchError("");
      const safeTerm=term.replace(/[(),.%_\\"]/g," ").trim();
      if(!safeTerm){setResults([]);setLoading(false);return;}
      const pattern="%"+term.replace(/[\\%_]/g,"\\$&")+"%";
      try{
        const [tasks,customers,expenses,sales,inventory,invoices]=await Promise.all([
          supabase.from("tasks").select("id,title,status,due_date").eq("workspace_id",workspaceId).ilike("title",pattern).order("created_at",{ascending:false}).limit(5),
          supabase.from("customers").select("id,name,email,company").eq("workspace_id",workspaceId).or("name.ilike.%"+safeTerm+"%,email.ilike.%"+safeTerm+"%,company.ilike.%"+safeTerm+"%").order("created_at",{ascending:false}).limit(5),
          supabase.from("expenses").select("id,description,amount,currency,incurred_on").eq("workspace_id",workspaceId).ilike("description",pattern).order("incurred_on",{ascending:false}).limit(5),
          supabase.from("sales").select("id,description,amount,currency,status,sold_on").eq("workspace_id",workspaceId).ilike("description",pattern).order("sold_on",{ascending:false}).limit(5),
          supabase.from("inventory_items").select("id,name,sku,quantity,currency").eq("workspace_id",workspaceId).or("name.ilike.%"+safeTerm+"%,sku.ilike.%"+safeTerm+"%").order("name",{ascending:true}).limit(5),
          supabase.from("invoices").select("id,invoice_number,status,total_amount,currency,due_date").eq("workspace_id",workspaceId).ilike("invoice_number",pattern).order("created_at",{ascending:false}).limit(5)
        ]);
        const failed=[tasks,customers,expenses,sales,inventory,invoices].find(item=>item.error);
        if(failed?.error)throw failed.error;
        if(cancelled)return;
        const found:Result[]=[
          ...(tasks.data||[]).map(item=>({id:item.id,title:item.title,detail:"Task · "+item.status.replace("_"," ")+(item.due_date?" · due "+item.due_date:""),section:"Tasks & projects" as const,icon:"task" as const})),
          ...(customers.data||[]).map(item=>({id:item.id,title:item.name,detail:"Customer · "+[item.company,item.email].filter(Boolean).join(" · "),section:"Customers" as const,icon:"customer" as const})),
          ...(expenses.data||[]).map(item=>({id:item.id,title:item.description,detail:"Expense · "+new Intl.NumberFormat(undefined,{style:"currency",currency:item.currency,maximumFractionDigits:2}).format(Number(item.amount)),section:"Finances" as const,icon:"expense" as const})),
          ...(sales.data||[]).map(item=>({id:item.id,title:item.description,detail:"Sale · "+item.status+" · "+new Intl.NumberFormat(undefined,{style:"currency",currency:item.currency,maximumFractionDigits:2}).format(Number(item.amount)),section:"Sales" as const,icon:"sale" as const})),
          ...(inventory.data||[]).map(item=>({id:item.id,title:item.name,detail:"Inventory · "+item.quantity+" in stock"+(item.sku?" · SKU "+item.sku:""),section:"Inventory" as const,icon:"inventory" as const})),
          ...(invoices.data||[]).map(item=>({id:item.id,title:item.invoice_number,detail:"Invoice · "+item.status+" · "+new Intl.NumberFormat(undefined,{style:"currency",currency:item.currency,maximumFractionDigits:2}).format(Number(item.total_amount)),section:"Invoices" as const,icon:"invoice" as const}))
        ];
        setResults(found);
      }catch(error){if(!cancelled){setResults([]);setSearchError(error instanceof Error?error.message:"Search could not be completed.");}}
      finally{if(!cancelled)setLoading(false);}
    },250);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[query,supabase,workspaceId]);

  function choose(item:Result){onNavigate(item.section);setQuery("");setOpen(false);setMobileOpen(false);}
  function showMobileSearch(){setMobileOpen(true);setOpen(true);window.setTimeout(()=>inputRef.current?.focus(),0);}
  const iconFor=(kind:Result["icon"])=>kind==="task"?CheckSquare:kind==="customer"?Users:kind==="expense"?Wallet:kind==="sale"?TrendingUp:kind==="inventory"?Package:ReceiptText;
  const searchBox=<div className="relative w-full">
    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49e]"/>
    <input ref={inputRef} aria-label="Search your workspace" placeholder="Search everything..." value={query} onFocus={()=>setOpen(true)} onChange={event=>{setQuery(event.target.value);setOpen(true);}} className="w-full rounded-lg border border-[#e9eeeb] bg-[#fbfcfb] py-2 pl-9 pr-8 text-[11px] text-[#46534b] outline-none focus:border-[#b7d5c1]"/>
    {query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#929c95]"><X size={12}/></button>}
  </div>;
  const panel=open&&<div className="fixed left-3 right-3 top-[112px] z-[70] overflow-hidden rounded-xl border border-[#e6ebe7] bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[min(390px,calc(100vw-24px))]">
    <div className="flex items-center justify-between border-b border-[#edf0ee] px-3 py-2.5"><span className="text-[10px] font-semibold text-[#89938d]">Workspace results</span>{loading?<LoaderCircle size={13} className="animate-spin text-[#16865b]"/>:<span className="text-[9px] text-[#a0aaa4]">{results.length} found</span>}</div>
    {searchError?<p className="px-4 py-5 text-center text-[11px] text-[#a33d3d]">{searchError}</p>:!query.trim()||query.trim().length<2?<p className="px-4 py-5 text-center text-[11px] text-[#929c95]">Type at least 2 characters to search tasks, customers, finances, sales, inventory and invoices.</p>:loading&&results.length===0?<p className="px-4 py-5 text-center text-[11px] text-[#929c95]">Searching this workspace…</p>:results.length===0?<p className="px-4 py-5 text-center text-[11px] text-[#929c95]">No matching records found.</p>:<div className="max-h-[min(420px,60vh)] overflow-y-auto">{results.map(item=>{const Icon=iconFor(item.icon);return <button type="button" key={item.section+item.id} onClick={()=>choose(item)} className="flex w-full items-start gap-3 border-b border-[#f0f3f1] px-3 py-3 text-left last:border-0 hover:bg-[#f7faf8]"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#edf7f0] text-[#16865b]"><Icon size={14}/></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-[#46534b]">{item.title}</span><span className="mt-1 block truncate text-[10px] text-[#929c95]">{item.detail||item.section}</span></span><span className="shrink-0 pt-0.5 text-[9px] text-[#929c95]">{item.section}</span></button>;})}</div>}
    <div className="border-t border-[#edf0ee] px-3 py-2 text-[9px] text-[#a0aaa4]">Results are limited to your active workspace and your account's permissions.</div>
  </div>;

  return <div ref={rootRef} className="relative">
    <div className="hidden w-[220px] sm:block">{searchBox}</div>
    <button type="button" aria-label="Search your workspace" onClick={showMobileSearch} className="grid h-9 w-9 place-items-center rounded-lg border border-[#e9eeeb] bg-white text-[#69756e] sm:hidden"><Search size={16}/></button>
    {panel}
    {mobileOpen&&<div className="fixed inset-x-3 top-16 z-[80] rounded-xl border border-[#e6ebe7] bg-white p-3 shadow-2xl sm:hidden"><div className="flex items-center gap-2">{searchBox}<button type="button" aria-label="Close search" onClick={()=>{setMobileOpen(false);setOpen(false);}} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[#e9eeeb] text-[#69756e]"><X size={15}/></button></div></div>}
  </div>;
}
