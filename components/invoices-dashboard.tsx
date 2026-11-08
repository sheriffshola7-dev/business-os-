"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ArrowUpRight, CalendarDays, Check, ChevronRight, FilePlus2, LoaderCircle, Plus, ReceiptText, Search, X } from "lucide-react";

type InvoiceStatus = "draft" | "sent" | "partially_paid" | "paid" | "void";
type Invoice = {
  id:string; workspace_id:string; customer_id:string|null; invoice_number:string;
  issue_date:string; due_date:string|null; currency:string; subtotal:number;
  tax_rate:number; tax_amount:number; total_amount:number; amount_paid:number;
  status:InvoiceStatus; notes:string|null; created_at:string;
};
type InvoiceItem = {id:string;description:string;quantity:number;unit_price:number;line_total:number};
type InvoicePayment = {id:string;amount:number;currency:string;payment_date:string;payment_method:string|null;reference:string|null;notes:string|null};
type Customer = {id:string;name:string;email:string|null;company:string|null};
type DraftLine = {description:string;quantity:string;unit_price:string};

const formatMoney=(amount:number,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(amount);
const formatDate=(value:string|null)=>value?new Date(value+"T00:00:00").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"Not set";
const today=()=>new Date().toLocaleDateString("en-CA");

function statusFor(invoice:Invoice){
  if(invoice.status!=="paid"&&invoice.status!=="void"&&invoice.status!=="draft"&&invoice.due_date&&invoice.due_date<today()&&Number(invoice.total_amount)>Number(invoice.amount_paid))return "overdue";
  return invoice.status;
}

export default function InvoicesDashboard({supabase,workspaceId,userId,currency,role,customers}:{supabase:SupabaseClient<Database>;workspaceId:string;userId:string;currency:string;role:string;customers:Customer[]}){
  const db=supabase;
  const [invoices,setInvoices]=useState<Invoice[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [createOpen,setCreateOpen]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(false);
  const [selected,setSelected]=useState<Invoice|null>(null);
  const [items,setItems]=useState<InvoiceItem[]>([]);
  const [payments,setPayments]=useState<InvoicePayment[]>([]);
  const [detailsLoading,setDetailsLoading]=useState(false);
  const [customerId,setCustomerId]=useState("");
  const [issueDate,setIssueDate]=useState(today());
  const [dueDate,setDueDate]=useState("");
  const [taxRate,setTaxRate]=useState("0");
  const [notes,setNotes]=useState("");
  const [lines,setLines]=useState<DraftLine[]>([{description:"",quantity:"1",unit_price:""}]);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentDate,setPaymentDate]=useState(today());
  const [paymentMethod,setPaymentMethod]=useState("");
  const [paymentReference,setPaymentReference]=useState("");
  const [paymentNotes,setPaymentNotes]=useState("");

  const loadInvoices=useCallback(async()=>{
    if(!workspaceId){setLoading(false);return;}
    setLoading(true);setError("");
    const {data,error:loadError}=await db.from("invoices").select("id,workspace_id,customer_id,invoice_number,issue_date,due_date,currency,subtotal,tax_rate,tax_amount,total_amount,amount_paid,status,notes,created_at").eq("workspace_id",workspaceId).order("created_at",{ascending:false}).limit(100);
    if(loadError)setError(loadError.message);
    else setInvoices((data||[]) as Invoice[]);
    setLoading(false);
  },[db,workspaceId]);

  useEffect(()=>{void loadInvoices();},[loadInvoices]);

  const canManage=role==="owner"||role==="admin"||role==="manager";
  const filtered=useMemo(()=>invoices.filter(invoice=>{
    const customer=customers.find(item=>item.id===invoice.customer_id)?.name||"";
    const matches=(invoice.invoice_number+" "+customer).toLowerCase().includes(search.toLowerCase());
    const state=statusFor(invoice);
    return matches&&(filter==="all"||state===filter);
  }),[invoices,customers,search,filter]);
  const outstanding=invoices.filter(item=>item.currency===currency).reduce((sum,item)=>sum+Math.max(0,Number(item.total_amount)-Number(item.amount_paid)),0);
  const mixedCurrencyCount=invoices.filter(item=>item.currency!==currency).length;
  const overdueCount=invoices.filter(item=>statusFor(item)==="overdue").length;
  const paidCount=invoices.filter(item=>item.status==="paid").length;
  const draftCount=invoices.filter(item=>item.status==="draft").length;
  const subtotal=lines.reduce((sum,line)=>sum+Math.round(Math.max(0,Number(line.quantity)||0)*Math.max(0,Number(line.unit_price)||0)*100)/100,0);
  const taxAmount=Math.round(subtotal*(Math.max(0,Math.min(100,Number(taxRate)||0)))/100*100)/100;
  const total=subtotal+taxAmount;

  async function openDetails(invoice:Invoice){
    setSelected(invoice);setDetailsLoading(true);setItems([]);setPayments([]);setError("");
    const [itemResult,paymentResult]=await Promise.all([
      db.from("invoice_items").select("id,description,quantity,unit_price,line_total").eq("invoice_id",invoice.id).order("created_at",{ascending:true}),
      db.from("invoice_payments").select("id,amount,currency,payment_date,payment_method,reference,notes").eq("invoice_id",invoice.id).order("payment_date",{ascending:false})
    ]);
    if(itemResult.error||paymentResult.error)setError(itemResult.error?.message||paymentResult.error?.message||"Could not load invoice details.");
    setItems((itemResult.data||[]) as InvoiceItem[]);
    setPayments((paymentResult.data||[]) as InvoicePayment[]);
    setDetailsLoading(false);
  }

  function resetCreate(){
    setCustomerId("");setIssueDate(today());setDueDate("");setTaxRate("0");setNotes("");
    setLines([{description:"",quantity:"1",unit_price:""}]);
  }

  async function createInvoice(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canManage||!lines.length||lines.some(line=>!line.description.trim()||Number(line.quantity)<=0||Number(line.unit_price)<0))return;
    setSaving(true);setError("");setNotice("");
    const invoiceNumber="INV-"+new Date().getFullYear()+"-"+Math.random().toString(36).slice(2,7).toUpperCase();
    try{
      const {data:created,error:createError}=await db.from("invoices").insert({
        workspace_id:workspaceId,customer_id:customerId||null,invoice_number:invoiceNumber,
        issue_date:issueDate,due_date:dueDate||null,currency,subtotal:0,tax_rate:Number(taxRate)||0,
        status:"draft",notes:notes.trim()||null,created_by:userId
      }).select("id").single();
      if(createError)throw createError;
      const {error:itemError}=await db.from("invoice_items").insert(lines.map(line=>({
        invoice_id:created.id,description:line.description.trim(),quantity:Number(line.quantity),unit_price:Number(line.unit_price)
      })));
      if(itemError){await db.from("invoices").delete().eq("id",created.id).eq("workspace_id",workspaceId);throw itemError;}
      setCreateOpen(false);resetCreate();setNotice("Invoice "+invoiceNumber+" created as a draft.");
      await loadInvoices();
    }catch(e){setError(e instanceof Error?e.message:"Could not create invoice.");}
    finally{setSaving(false);}
  }

  async function recordPayment(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected||!canManage)return;
    const amount=Number(paymentAmount);
    const balance=Number(selected.total_amount)-Number(selected.amount_paid);
    if(!Number.isFinite(amount)||amount<=0||amount>balance){setError("Enter a payment greater than zero and no more than the outstanding balance.");return;}
    setSaving(true);setError("");setNotice("");
    const {error:paymentError}=await db.from("invoice_payments").insert({
      invoice_id:selected.id,amount,currency:selected.currency,payment_date:paymentDate,
      payment_method:paymentMethod.trim()||null,reference:paymentReference.trim()||null,
      notes:paymentNotes.trim()||null,created_by:userId
    });
    if(paymentError){setError(paymentError.message);setSaving(false);return;}
    setPaymentOpen(false);setPaymentAmount("");setPaymentDate(today());setPaymentMethod("");setPaymentReference("");setPaymentNotes("");
    await loadInvoices();
    const {data:updated}=await db.from("invoices").select("id,workspace_id,customer_id,invoice_number,issue_date,due_date,currency,subtotal,tax_rate,tax_amount,total_amount,amount_paid,status,notes,created_at").eq("id",selected.id).single();
    if(updated)await openDetails(updated as Invoice);
    setNotice("Payment recorded and invoice balance updated.");
    setSaving(false);
  }

  async function updateInvoiceStatus(status:"sent"|"void"){
    if(!selected||!canManage)return;
    setSaving(true);setError("");setNotice("");
    const {error:updateError}=await db.from("invoices").update({status,updated_at:new Date().toISOString()}).eq("id",selected.id).eq("workspace_id",workspaceId);
    if(updateError)setError(updateError.message);
    else{
      setNotice(status==="sent"?"Invoice marked as sent.":"Invoice voided.");
      await loadInvoices();
      const updated={...selected,status};setSelected(updated);
    }
    setSaving(false);
  }

  return <div className="space-y-4">
    {error&&<div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-[#f0d9d9] bg-[#fff6f6] px-4 py-3 text-[11px] text-[#a33d3d]"><span>{error}</span><button type="button" onClick={()=>setError("")} aria-label="Dismiss error"><X size={14}/></button></div>}
    {notice&&<div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-[#dcece1] bg-[#f1f8f3] px-4 py-3 text-[11px] text-[#326448]"><span>{notice}</span><button type="button" onClick={()=>setNotice("")} aria-label="Dismiss message"><X size={14}/></button></div>}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="subtle-card p-4"><div className="flex items-center justify-between text-[10px] text-[#929c95]">Invoices <ReceiptText size={15}/></div><p className="mt-2 text-[22px] font-bold">{invoices.length}</p><p className="mt-1 text-[10px] text-[#929c95]">Latest 100 workspace records</p></div>
      <div className="subtle-card p-4"><div className="flex items-center justify-between text-[10px] text-[#929c95]">Outstanding <ArrowUpRight size={15}/></div><p className="mt-2 text-[20px] font-bold">{formatMoney(outstanding,currency)}</p><p className="mt-1 text-[10px] text-[#929c95]">Current workspace currency only</p></div>
      <div className="subtle-card p-4"><div className="flex items-center justify-between text-[10px] text-[#929c95]">Overdue <CalendarDays size={15}/></div><p className="mt-2 text-[22px] font-bold">{overdueCount}</p><p className="mt-1 text-[10px] text-[#929c95]">Past due with a remaining balance</p></div>
      <div className="subtle-card p-4"><div className="flex items-center justify-between text-[10px] text-[#929c95]">Paid <Check size={15}/></div><p className="mt-2 text-[22px] font-bold">{paidCount}</p><p className="mt-1 text-[10px] text-[#929c95]">{draftCount} drafts awaiting issue</p></div>
    </div>

    <section className="subtle-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#edf0ee] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 className="text-[13px] font-bold">Invoices</h2><p className="mt-1 text-[10px] text-[#929c95]">Create invoices and record payments against each balance.</p></div>
        {canManage&&<button onClick={()=>{resetCreate();setCreateOpen(true);setError("");}} className="primary-button"><FilePlus2 size={14}/>Create invoice</button>}
      </div>
      <div className="flex flex-col gap-2 border-b border-[#edf0ee] px-4 py-3 sm:flex-row sm:items-center sm:px-5">
        <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49e]"/><input aria-label="Search invoices" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search invoice number or customer" className="field !mt-0 !pl-9"/></div>
        <select value={filter} onChange={event=>setFilter(event.target.value)} className="field !mt-0 sm:w-[150px]"><option value="all">All statuses</option><option value="draft">Draft</option><option value="sent">Sent</option><option value="partially_paid">Part-paid</option><option value="overdue">Overdue</option><option value="paid">Paid</option><option value="void">Void</option></select>
      </div>
      {mixedCurrencyCount>0&&<p className="border-b border-[#edf0ee] px-4 py-2 text-[10px] text-[#9a6b2f]">{mixedCurrencyCount} invoice(s) use a different currency and are excluded from the outstanding total; no currency conversion is applied.</p>}
      {loading?<div className="flex min-h-[160px] items-center justify-center gap-2 text-[12px] text-[#929c95]"><LoaderCircle size={16} className="animate-spin"/>Loading invoices...</div>:filtered.length===0?<div className="px-5 py-12 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[#edf7f0] text-[#16865b]"><ReceiptText size={19}/></div><p className="mt-3 text-[12px] font-semibold">{invoices.length?"No matching invoices":"No invoices yet"}</p><p className="mt-1 text-[10px] text-[#929c95]">{invoices.length?"Try another search or status filter.":"Create your first invoice to start tracking customer payments."}</p></div>:filtered.map(invoice=>{
        const state=statusFor(invoice);
        const customer=customers.find(item=>item.id===invoice.customer_id);
        const balance=Math.max(0,Number(invoice.total_amount)-Number(invoice.amount_paid));
        return <button key={invoice.id} onClick={()=>void openDetails(invoice)} className="flex w-full flex-col gap-2 border-b border-[#f0f3f1] px-4 py-3 text-left transition hover:bg-[#fafcfa] last:border-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-semibold text-[#46534b]">{invoice.invoice_number}</span><span className="mt-1 block truncate text-[10px] text-[#929c95]">{customer?.name||"No customer linked"} · Issued {formatDate(invoice.issue_date)}</span></span>
          <span className="flex items-center justify-between gap-4 sm:contents"><span className="text-[11px] font-semibold">{formatMoney(Number(invoice.total_amount),invoice.currency)}</span><span className={"rounded-full px-2.5 py-1 text-[9px] font-semibold capitalize "+(state==="paid"?"bg-[#edf7f0] text-[#16865b]":state==="overdue"?"bg-[#fff1ed] text-[#b95d43]":state==="void"?"bg-[#f1f2f2] text-[#7f8983]":"bg-[#f5f6f4] text-[#68746c]")}>{state.replace("_"," ")}</span><span className="text-right text-[10px] text-[#929c95]">{balance>0?formatMoney(balance,invoice.currency)+" due":"Settled"}</span><ChevronRight size={15} className="text-[#a0aaa4]"/></span>
        </button>;
      })}
    </section>

    {createOpen&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setCreateOpen(false);}}><form onSubmit={createInvoice} className="modal max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#16865b]">New invoice</div><h2 className="mt-1 text-[18px] font-bold">Create an invoice</h2><p className="mt-1 text-[11px] text-[#89938d]">Invoice totals are calculated from the line items and tax rate.</p></div><button type="button" aria-label="Close" onClick={()=>setCreateOpen(false)} className="rounded-lg p-2 text-[#89938d]"><X size={16}/></button></div>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-[#526057]">Customer (optional)<select value={customerId} onChange={event=>setCustomerId(event.target.value)} className="field"><option value="">No customer linked</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        <label className="text-[11px] font-semibold text-[#526057]">Issue date<input required type="date" value={issueDate} onChange={event=>setIssueDate(event.target.value)} className="field"/></label>
        <label className="text-[11px] font-semibold text-[#526057]">Due date (optional)<input type="date" min={issueDate} value={dueDate} onChange={event=>setDueDate(event.target.value)} className="field"/></label>
        <label className="text-[11px] font-semibold text-[#526057]">Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={event=>setTaxRate(event.target.value)} className="field"/></label>
      </div>
      <div className="mt-5"><div className="mb-2 flex items-center justify-between"><h3 className="text-[12px] font-bold">Line items</h3><button type="button" onClick={()=>setLines(current=>[...current,{description:"",quantity:"1",unit_price:""}])} className="text-[10px] font-semibold text-[#16865b]"><Plus size={12} className="mr-1 inline"/>Add line</button></div>
        <div className="space-y-2">{lines.map((line,index)=><div key={index} className="grid grid-cols-12 gap-2 rounded-lg border border-[#edf0ee] p-2">
          <label className="col-span-12 text-[10px] font-semibold text-[#69756e] sm:col-span-6">Description<input required maxLength={200} value={line.description} onChange={event=>setLines(current=>current.map((item,i)=>i===index?{...item,description:event.target.value}:item))} className="field"/></label>
          <label className="col-span-4 text-[10px] font-semibold text-[#69756e] sm:col-span-2">Qty<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={event=>setLines(current=>current.map((item,i)=>i===index?{...item,quantity:event.target.value}:item))} className="field"/></label>
          <label className="col-span-6 text-[10px] font-semibold text-[#69756e] sm:col-span-3">Unit price<input required type="number" min="0" step="0.01" value={line.unit_price} onChange={event=>setLines(current=>current.map((item,i)=>i===index?{...item,unit_price:event.target.value}:item))} className="field"/></label>
          <div className="col-span-2 flex items-end justify-end sm:col-span-1"><button type="button" disabled={lines.length===1} onClick={()=>setLines(current=>current.filter((_,i)=>i!==index))} aria-label="Remove line item" className="mb-1 rounded-md p-2 text-[#a0aaa4] disabled:opacity-30"><X size={14}/></button></div>
        </div>)}</div>
      </div>
      <label className="mt-4 block text-[11px] font-semibold text-[#526057]">Notes (optional)<textarea maxLength={1000} value={notes} onChange={event=>setNotes(event.target.value)} rows={2} className="field"/></label>
      <div className="mt-4 rounded-xl bg-[#f7faf7] p-4 text-[11px]"><div className="flex justify-between"><span className="text-[#89938d]">Subtotal</span><strong>{formatMoney(subtotal,currency)}</strong></div><div className="mt-2 flex justify-between"><span className="text-[#89938d]">Tax ({Number(taxRate)||0}%)</span><strong>{formatMoney(taxAmount,currency)}</strong></div><div className="mt-3 flex justify-between border-t border-[#e7eee8] pt-3 text-[13px]"><span className="font-semibold">Total</span><strong>{formatMoney(total,currency)}</strong></div></div>
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setCreateOpen(false)} className="action-button">Cancel</button><button disabled={saving||lines.some(line=>!line.description.trim()||Number(line.quantity)<=0||Number(line.unit_price)<0)} className="primary-button">{saving?<LoaderCircle size={14} className="animate-spin"/>:<FilePlus2 size={14}/>}Save draft</button></div>
    </form></div>}

    {selected&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget){setSelected(null);setPaymentOpen(false);}}}><section className="modal max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#16865b]">Invoice details</div><h2 className="mt-1 text-[18px] font-bold">{selected.invoice_number}</h2><p className="mt-1 text-[11px] text-[#89938d]">{customers.find(item=>item.id===selected.customer_id)?.name||"No customer linked"} · {formatDate(selected.issue_date)}</p></div><button aria-label="Close invoice details" onClick={()=>{setSelected(null);setPaymentOpen(false);}} className="rounded-lg p-2 text-[#89938d]"><X size={16}/></button></div>
      <div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-lg bg-[#f7faf7] p-3"><p className="text-[10px] text-[#929c95]">Invoice total</p><p className="mt-1 text-[15px] font-bold">{formatMoney(Number(selected.total_amount),selected.currency)}</p></div><div className="rounded-lg bg-[#f7faf7] p-3"><p className="text-[10px] text-[#929c95]">Balance due</p><p className="mt-1 text-[15px] font-bold">{formatMoney(Math.max(0,Number(selected.total_amount)-Number(selected.amount_paid)),selected.currency)}</p></div></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-[#89938d]">Status: <strong className="capitalize text-[#46534b]">{statusFor(selected).replace("_"," ")}</strong>{selected.due_date?" · Due "+formatDate(selected.due_date):""}</span>{canManage&&<div className="flex flex-wrap gap-2">{selected.status==="draft"&&<button disabled={saving} onClick={()=>void updateInvoiceStatus("sent")} className="action-button">Mark as sent</button>}{Number(selected.amount_paid)===0&&selected.status!=="void"&&<button disabled={saving} onClick={()=>void updateInvoiceStatus("void")} className="action-button">Void invoice</button>}{selected.status!=="paid"&&selected.status!=="void"&&Number(selected.total_amount)>Number(selected.amount_paid)&&<button onClick={()=>{setPaymentAmount(String((Number(selected.total_amount)-Number(selected.amount_paid)).toFixed(2)));setPaymentOpen(true);setError("");}} className="primary-button"><Plus size={13}/>Record payment</button>}</div>}</div>
      {detailsLoading?<div className="py-8 text-center text-[11px] text-[#929c95]"><LoaderCircle size={15} className="mr-2 inline animate-spin"/>Loading details...</div>:<>
        <div className="mt-5"><h3 className="mb-2 text-[12px] font-bold">Items</h3>{items.map(item=><div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#f0f3f1] py-2 text-[11px]"><span className="min-w-0"><span className="block font-semibold text-[#46534b]">{item.description}</span><span className="mt-0.5 block text-[10px] text-[#929c95]">{item.quantity} × {formatMoney(Number(item.unit_price),selected.currency)}</span></span><strong>{formatMoney(Number(item.line_total),selected.currency)}</strong></div>)}<div className="mt-2 space-y-1 text-right text-[10px] text-[#89938d]"><p>Subtotal: {formatMoney(Number(selected.subtotal),selected.currency)}</p><p>Tax ({Number(selected.tax_rate)}%): {formatMoney(Number(selected.tax_amount),selected.currency)}</p></div></div>
        <div className="mt-5"><h3 className="mb-2 text-[12px] font-bold">Payment history</h3>{payments.map(payment=><div key={payment.id} className="flex items-center justify-between gap-3 border-b border-[#f0f3f1] py-2 text-[11px]"><span><strong>{formatDate(payment.payment_date)}</strong><span className="mt-0.5 block text-[10px] text-[#929c95]">{payment.payment_method||"Payment"}{payment.reference?" · "+payment.reference:""}</span></span><strong>{formatMoney(Number(payment.amount),payment.currency)}</strong></div>)}{!payments.length&&<p className="py-3 text-[10px] text-[#929c95]">No payments recorded yet.</p>}</div>
        {selected.notes&&<div className="mt-4 rounded-lg bg-[#f7faf7] p-3 text-[10px] leading-relaxed text-[#68746c]">{selected.notes}</div>}
      </>}
      {paymentOpen&&<form onSubmit={recordPayment} className="mt-5 rounded-xl border border-[#dfe9e1] p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-[12px] font-bold">Record a payment</h3><button type="button" onClick={()=>setPaymentOpen(false)} className="text-[#89938d]"><X size={14}/></button></div><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-[10px] font-semibold text-[#526057]">Amount ({selected.currency})<input required type="number" min="0.01" max={(Number(selected.total_amount)-Number(selected.amount_paid)).toFixed(2)} step="0.01" value={paymentAmount} onChange={event=>setPaymentAmount(event.target.value)} className="field"/></label>
        <label className="text-[10px] font-semibold text-[#526057]">Payment date<input required type="date" max={today()} value={paymentDate} onChange={event=>setPaymentDate(event.target.value)} className="field"/></label>
        <label className="text-[10px] font-semibold text-[#526057]">Method (optional)<input maxLength={80} value={paymentMethod} onChange={event=>setPaymentMethod(event.target.value)} placeholder="Bank transfer, cash..." className="field"/></label>
        <label className="text-[10px] font-semibold text-[#526057]">Reference (optional)<input maxLength={120} value={paymentReference} onChange={event=>setPaymentReference(event.target.value)} className="field"/></label>
      </div><label className="mt-3 block text-[10px] font-semibold text-[#526057]">Notes (optional)<textarea rows={2} maxLength={500} value={paymentNotes} onChange={event=>setPaymentNotes(event.target.value)} className="field"/></label><div className="mt-4 flex justify-end"><button disabled={saving} className="primary-button">{saving?<LoaderCircle size={13} className="animate-spin"/>:<Check size={13}/>}Save payment</button></div></form>}
    </section></div>}
  </div>;
}
