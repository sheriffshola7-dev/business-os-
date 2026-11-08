"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownUp, ArrowRight, Bell, BriefcaseBusiness, Check, ChevronDown, CircleHelp, CreditCard, FileText, LayoutDashboard, LoaderCircle, LogOut, Menu, Moon, MoreHorizontal, Package, Pencil, Plus, Search, Settings, ShoppingBag, Sun, Target, TrendingUp, Users, Wallet, X, Zap } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

type Task = { id:string; title:string; status:"todo"|"in_progress"|"done"; due_date:string|null; created_at:string };
type Customer = { id:string; name:string; email:string|null; company:string|null; created_at:string };
type Expense = { id:string; description:string; amount:number; currency:string; incurred_on:string };
type InventoryItem = { id:string; name:string; sku:string|null; quantity:number; reorder_level:number; unit_price:number|null };
type InventoryMovement = { id:string; inventory_item_id:string; movement_type:string; quantity_change:number; note:string|null; created_at:string };
type Sale = { id:string; description:string; amount:number; currency:string; status:"pending"|"completed"|"cancelled"; sold_on:string; customer_id:string|null; inventory_item_id:string|null; quantity:number };
type ModalKind = "task"|"customer"|"expense"|"sale"|"inventory"|"stock"|null;
const navItems=[{label:"Overview",icon:LayoutDashboard},{label:"Tasks & projects",icon:Check},{label:"Customers",icon:Users},{label:"Finances",icon:Wallet},{label:"Sales",icon:TrendingUp},{label:"Inventory",icon:ShoppingBag},{label:"Reports",icon:FileText}];
const descriptions:Record<string,string>={"Tasks & projects":"Keep work moving and see what your team is working on.",Customers:"Keep customer details and relationships organised.",Finances:"Understand the money coming in and going out.",Sales:"Keep track of opportunities and sales activity.",Inventory:"Keep an eye on the products and supplies you manage.",Reports:"Explore activity recorded in your workspace.",Settings:"Manage your workspace preferences."};
const money=(amount:number,currency="NGN")=>new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(amount);
const shortDate=(date:string|null)=>date?new Date(date+"T00:00:00").toLocaleDateString("en-NG",{day:"numeric",month:"short"}):"No due date";

function Metric({title,value,note,icon:Icon,tone}:{title:string;value:string;note:string;icon:React.ElementType;tone:string}){
 return <div className="subtle-card stat-card min-w-0"><div className="flex items-center justify-between gap-3"><span className="stat-label">{title}</span><span className={"grid h-8 w-8 place-items-center rounded-[9px] "+tone}><Icon size={16}/></span></div><div className="stat-value">{value}</div><div className="mt-2 text-[11px] text-[#7b8580]">{note}</div></div>;
}

export default function Home(){
 const supabase=useMemo(()=>createSupabaseBrowserClient(),[]);
 const [active,setActive]=useState("Overview");
 const [theme,setTheme]=useState<"light"|"dark">("light");
 const [mobileOpen,setMobileOpen]=useState(false);
 const [user,setUser]=useState<User|null>(null);
 const [workspaceId,setWorkspaceId]=useState("");
 const [workspaceName,setWorkspaceName]=useState("My Business");
 const [tasks,setTasks]=useState<Task[]>([]);
 const [customers,setCustomers]=useState<Customer[]>([]);
 const [expenses,setExpenses]=useState<Expense[]>([]);
 const [sales,setSales]=useState<Sale[]>([]);
 const [inventory,setInventory]=useState<InventoryItem[]>([]);
 const [inventoryMovements,setInventoryMovements]=useState<InventoryMovement[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const [modal,setModal]=useState<ModalKind>(null);
 const [taskTitle,setTaskTitle]=useState("");
 const [customerName,setCustomerName]=useState("");
 const [customerEmail,setCustomerEmail]=useState("");
 const [expenseDescription,setExpenseDescription]=useState("");
 const [expenseAmount,setExpenseAmount]=useState("");
 const [saleDescription,setSaleDescription]=useState("");
 const [saleAmount,setSaleAmount]=useState("");
 const [saleCustomerId,setSaleCustomerId]=useState("");
 const [saleStatus,setSaleStatus]=useState<"pending"|"completed"|"cancelled">("pending");
 const [saleDate,setSaleDate]=useState(()=>new Date().toISOString().slice(0,10));
 const [saleInventoryItemId,setSaleInventoryItemId]=useState("");
 const [saleQuantity,setSaleQuantity]=useState("1");
 const [editingInventoryId,setEditingInventoryId]=useState("");
 const [inventoryName,setInventoryName]=useState("");
 const [inventorySku,setInventorySku]=useState("");
 const [inventoryQuantity,setInventoryQuantity]=useState("0");
 const [inventoryReorderLevel,setInventoryReorderLevel]=useState("0");
 const [inventoryUnitPrice,setInventoryUnitPrice]=useState("");
 const [stockItemId,setStockItemId]=useState("");
 const [stockChange,setStockChange]=useState("");
 const [stockNote,setStockNote]=useState("");

 useEffect(()=>{const saved=window.localStorage.getItem("business-os-theme");if(saved==="dark"||saved==="light")setTheme(saved);},[]);
 useEffect(()=>{document.documentElement.dataset.theme=theme;window.localStorage.setItem("business-os-theme",theme);},[theme]);

 const loadData=useCallback(async()=>{
  if(!supabase){setLoading(false);setError("Add the Supabase URL and publishable key in your hosting environment to connect your workspace.");return;}
  setLoading(true);setError("");
  try{
   const {data:userData,error:userError}=await supabase.auth.getUser();
   if(userError)throw userError;
   if(!userData.user){setLoading(false);return;}
   setUser(userData.user);
   const {data:membership,error:memberError}=await supabase.from("workspace_members").select("workspace_id, workspaces(name)").eq("user_id",userData.user.id).limit(1).maybeSingle();
   if(memberError)throw memberError;
   if(!membership){setError("Your account does not have a workspace yet. Sign out and sign in again to initialise it.");setLoading(false);return;}
   const wsId=membership.workspace_id;
   setWorkspaceId(wsId);
   const joined=membership.workspaces as unknown as {name:string}|null;
   if(joined?.name)setWorkspaceName(joined.name);
   const [taskRes,customerRes,expenseRes,saleRes,inventoryRes,movementRes]=await Promise.all([
    supabase.from("tasks").select("id,title,status,due_date,created_at").eq("workspace_id",wsId).order("created_at",{ascending:false}).limit(100),
    supabase.from("customers").select("id,name,email,company,created_at").eq("workspace_id",wsId).order("created_at",{ascending:false}).limit(100),
    supabase.from("expenses").select("id,description,amount,currency,incurred_on").eq("workspace_id",wsId).order("incurred_on",{ascending:false}).limit(100),
    supabase.from("sales").select("id,description,amount,currency,status,sold_on,customer_id,inventory_item_id,quantity").eq("workspace_id",wsId).order("sold_on",{ascending:false}).limit(100),
    supabase.from("inventory_items").select("id,name,sku,quantity,reorder_level,unit_price").eq("workspace_id",wsId).order("name",{ascending:true}).limit(200),
    supabase.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity_change,note,created_at").eq("workspace_id",wsId).order("created_at",{ascending:false}).limit(8)
   ]);
   for(const result of [taskRes,customerRes,expenseRes,saleRes,inventoryRes,movementRes])if(result.error)throw result.error;
   setTasks((taskRes.data||[]) as Task[]);
   setCustomers((customerRes.data||[]) as Customer[]);
   setExpenses((expenseRes.data||[]) as Expense[]);
   setSales((saleRes.data||[]) as Sale[]);
   setInventory((inventoryRes.data||[]) as InventoryItem[]);
   setInventoryMovements((movementRes.data||[]) as InventoryMovement[]);
  }catch(e){setError(e instanceof Error?e.message:"Could not load your business data.");}
  finally{setLoading(false);}
 },[supabase]);

 useEffect(()=>{void loadData();},[loadData]);
 const visibleTasks=useMemo(()=>tasks.filter(t=>t.title.toLowerCase().includes(search.toLowerCase())),[tasks,search]);
 const activeTasks=tasks.filter(t=>t.status!=="done").length;
 const revenue=sales.filter(s=>s.status==="completed").reduce((sum,s)=>sum+Number(s.amount),0);
 const totalExpenses=expenses.reduce((sum,e)=>sum+Number(e.amount),0);
 const openModal=(kind:ModalKind)=>{setNotice("");setModal(kind);};
 function openInventoryEditor(item?:InventoryItem){setNotice("");setEditingInventoryId(item?.id||"");setInventoryName(item?.name||"");setInventorySku(item?.sku||"");setInventoryQuantity(String(item?.quantity??0));setInventoryReorderLevel(String(item?.reorder_level??0));setInventoryUnitPrice(item?.unit_price==null?"":String(item.unit_price));setModal("inventory");}
 function openStockAdjustment(item:InventoryItem){setNotice("");setStockItemId(item.id);setStockChange("");setStockNote("");setModal("stock");}
 async function saveModal(event?:FormEvent){
  event?.preventDefault();
  if(!supabase||!user||!workspaceId)return;
  setBusy(true);setError("");setNotice("");
  try{
   if(modal==="task"&&taskTitle.trim()){
    const {data,error:insertError}=await supabase.from("tasks").insert({workspace_id:workspaceId,title:taskTitle.trim(),created_by:user.id}).select("id,title,status,due_date,created_at").single();
    if(insertError)throw insertError;
    setTasks(current=>[data as Task,...current]);setTaskTitle("");setNotice("Task saved to your workspace.");
   }else if(modal==="customer"&&customerName.trim()){
    const {data,error:insertError}=await supabase.from("customers").insert({workspace_id:workspaceId,name:customerName.trim(),email:customerEmail.trim()||null,created_by:user.id}).select("id,name,email,company,created_at").single();
    if(insertError)throw insertError;
    setCustomers(current=>[data as Customer,...current]);setCustomerName("");setCustomerEmail("");setNotice("Customer saved to your workspace.");
   }else if(modal==="expense"&&expenseDescription.trim()&&Number(expenseAmount)>0){
    const {data,error:insertError}=await supabase.from("expenses").insert({workspace_id:workspaceId,description:expenseDescription.trim(),amount:Number(expenseAmount),currency:"NGN",created_by:user.id}).select("id,description,amount,currency,incurred_on").single();
    if(insertError)throw insertError;
    setExpenses(current=>[data as Expense,...current]);setExpenseDescription("");setExpenseAmount("");setNotice("Expense saved to your workspace.");
   }else if(modal==="sale"&&saleDescription.trim()&&Number(saleAmount)>0&&Number(saleQuantity)>0){
    const {data,error:insertError}=await supabase.from("sales").insert({workspace_id:workspaceId,description:saleDescription.trim(),amount:Number(saleAmount),currency:"NGN",customer_id:saleCustomerId||null,status:saleStatus,sold_on:saleDate,inventory_item_id:saleInventoryItemId||null,quantity:Number(saleQuantity),created_by:user.id}).select("id,description,amount,currency,status,sold_on,customer_id,inventory_item_id,quantity").single();
    if(insertError)throw insertError;
    setSales(current=>[data as Sale,...current]);setSaleDescription("");setSaleAmount("");setSaleCustomerId("");setSaleStatus("pending");setSaleDate(new Date().toISOString().slice(0,10));setSaleInventoryItemId("");setSaleQuantity("1");setNotice("Sale saved to your workspace.");
    if(saleStatus==="completed"&&saleInventoryItemId)await loadData();
   }else if(modal==="inventory"&&inventoryName.trim()&&Number(inventoryQuantity)>=0&&Number(inventoryReorderLevel)>=0){
    const values={name:inventoryName.trim(),sku:inventorySku.trim()||null,reorder_level:Number(inventoryReorderLevel),unit_price:inventoryUnitPrice.trim()?Number(inventoryUnitPrice):null};
    if(editingInventoryId){const {data,error:editError}=await supabase.from("inventory_items").update(values).eq("id",editingInventoryId).eq("workspace_id",workspaceId).select("id,name,sku,quantity,reorder_level,unit_price").single();if(editError)throw editError;setInventory(current=>current.map(item=>item.id===editingInventoryId?data as InventoryItem:item));setNotice("Product details updated.");}
    else{const {data,error:insertError}=await supabase.from("inventory_items").insert({...values,quantity:Number(inventoryQuantity),workspace_id:workspaceId,created_by:user.id}).select("id,name,sku,quantity,reorder_level,unit_price").single();if(insertError)throw insertError;setInventory(current=>[...current,data as InventoryItem].sort((a,b)=>a.name.localeCompare(b.name)));setNotice("Product added to your inventory.");}
   }else if(modal==="stock"&&stockItemId&&Number(stockChange)!==0){
    const {error:adjustError}=await supabase.rpc("adjust_inventory_stock",{p_inventory_item_id:stockItemId,p_quantity_change:Number(stockChange),p_note:stockNote.trim()});if(adjustError)throw adjustError;
    await loadData();setNotice("Stock quantity updated.");
   }
   setModal(null);
  }catch(e){setError(e instanceof Error?e.message:"Could not save this record.");}
  finally{setBusy(false);}
 }
 async function updateTaskStatus(task:Task){
  if(!supabase)return;
  const next=task.status==="todo"?"in_progress":task.status==="in_progress"?"done":"todo";
  const {error:updateError}=await supabase.from("tasks").update({status:next}).eq("id",task.id).eq("workspace_id",workspaceId);
  if(updateError){setError(updateError.message);return;}
  setTasks(current=>current.map(t=>t.id===task.id?{...t,status:next}:t));
 }
 async function updateSaleStatus(sale:Sale,status:Sale["status"]){
  if(!supabase||sale.status===status)return;
  const {error:updateError}=await supabase.from("sales").update({status}).eq("id",sale.id).eq("workspace_id",workspaceId);
  if(updateError){setError(updateError.message);return;}
  setSales(current=>current.map(item=>item.id===sale.id?{...item,status}:item));
  await loadData();
 }
 const overview=active==="Overview";
 const signOut=async()=>{if(supabase)await supabase.auth.signOut();};

 return <div data-theme={theme} className="min-h-screen">
 {mobileOpen&&<button aria-label="Close navigation" onClick={()=>setMobileOpen(false)} className="fixed inset-0 z-20 bg-black/20 md:hidden"/>}
 <aside className={"sidebar "+(mobileOpen?"mobile-open":"")}>
  <div className="flex items-center gap-3 px-2"><div className="brand-mark"><BriefcaseBusiness size={18}/></div><div><div className="text-[15px] font-bold tracking-[-.4px]">Business OS</div><div className="mt-0.5 text-[9px] font-semibold tracking-[.13em] text-[#8a958e]">BY SHORLAH CLOUD</div></div></div>
  <div className="nav-label">Workspace</div>
  <div className="workspace-card"><span className="workspace-avatar">{workspaceName.slice(0,2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-semibold">{workspaceName}</span><span className="mt-0.5 block text-[10px] text-[#8a958e]">Business workspace</span></span><ChevronDown size={14} className="text-[#8a958e]"/></div>
  <div className="nav-label">Menu</div><nav className="space-y-1">{navItems.map(({label,icon:Icon})=><button key={label} onClick={()=>{setActive(label);setMobileOpen(false);}} className={"nav-item "+(active===label?"active":"")}><Icon size={16}/><span>{label}</span>{label==="Tasks & projects"&&<span className="ml-auto rounded-full bg-[#f0f3f1] px-2 py-0.5 text-[10px]">{activeTasks}</span>}</button>)}</nav>
  <div className="nav-label">Preferences</div><button onClick={()=>{setActive("Settings");setMobileOpen(false);}} className={"nav-item "+(active==="Settings"?"active":"")}><Settings size={16}/><span>Settings</span></button>
  <button onClick={()=>setNotice("Help and support will be added in a later release.")} className="nav-item"><CircleHelp size={16}/><span>Help & support</span></button>
  <div className="sidebar-bottom"><div className="mb-3 rounded-xl bg-[#f7faf7] p-3"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#34433a]"><Zap size={14} className="text-[#24875a]"/>Business assistant</div><p className="mb-2 mt-1.5 text-[10px] leading-relaxed text-[#89938d]">Insights based on your recorded business activity.</p><span className="text-[10px] font-semibold text-[#16865b]">Coming soon</span></div><div className="flex items-center gap-2.5 border-t border-[#edf0ee] px-1 pt-4"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#e8eee9] text-[10px] font-bold">{(user?.email||"U").slice(0,1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{user?.email||"Your account"}</div><div className="text-[10px] text-[#929c95]">Workspace member</div></div><button onClick={signOut} aria-label="Sign out" title="Sign out" className="text-[#929c95]"><LogOut size={15}/></button></div></div>
 </aside>
 <main className="main-area"><header className="topbar"><div className="flex items-center gap-3"><button aria-label="Open navigation" className="mobile-menu action-button !px-2.5" onClick={()=>setMobileOpen(true)}><Menu size={17}/></button><div className="hidden text-[12px] text-[#929c95] sm:block">Workspace <span className="mx-2 text-[#c5ccc7]">/</span><span className="font-semibold text-[#46534b]">{active}</span></div><div className="text-[12px] font-semibold sm:hidden">{active}</div></div><div className="flex items-center gap-2.5"><div className="relative hidden sm:block"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9aa49e]"/><input aria-label="Search tasks" placeholder="Search tasks..." value={search} onChange={e=>setSearch(e.target.value)} className="w-[190px] rounded-lg border border-[#e9eeeb] bg-[#fbfcfb] py-2 pl-9 pr-3 text-[11px] outline-none focus:border-[#b7d5c1]"/></div><button aria-label={theme==="light"?"Switch to dark mode":"Switch to light mode"} title={theme==="light"?"Dark mode":"Light mode"} onClick={()=>setTheme(v=>v==="light"?"dark":"light")} className="grid h-9 w-9 place-items-center rounded-lg border border-[#e9eeeb] bg-white text-[#69756e]">{theme==="light"?<Moon size={16}/>:<Sun size={16}/>}</button><button aria-label="Refresh data" onClick={()=>void loadData()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#e9eeeb] bg-white text-[#69756e]"><Activity size={16}/></button><div className="grid h-8 w-8 place-items-center rounded-full bg-[#e9f0eb] text-[10px] font-bold">{(user?.email||"U").slice(0,1).toUpperCase()}</div></div></header>
 <div className="content">
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="eyebrow">{overview?"Your business at a glance":"Your workspace"}</div><h1 className="page-title">{overview?"Welcome back.":active}</h1><p className="mt-2 text-[12px] text-[#89938d]">{overview?"Here is the latest activity recorded in your workspace.":descriptions[active]||"Manage your business workspace."}</p></div><div className="flex items-center gap-2"><button onClick={()=>void loadData()} className="action-button"><Activity size={14}/>Refresh</button><button onClick={()=>active==="Inventory"?openInventoryEditor():openModal(active==="Customers"?"customer":active==="Finances"?"expense":active==="Sales"?"sale":"task")} className="primary-button"><Plus size={15}/>{active==="Inventory"?"Add product":"Add new"}</button></div></div>
  {error&&<div role="alert" className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-[#f0d9d9] bg-[#fff6f6] px-4 py-3 text-[12px] text-[#a33d3d]"><span>{error}</span><button onClick={()=>setError("")}><X size={15}/></button></div>}
  {notice&&<div role="status" className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-[#dcece1] bg-[#f1f8f3] px-4 py-3 text-[12px] text-[#326448]"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={15}/></button></div>}
  {loading?<div className="subtle-card flex min-h-[240px] items-center justify-center gap-3 text-[12px] text-[#7b8580]"><LoaderCircle size={18} className="animate-spin text-[#16865b]"/>Loading your business records...</div>:overview?<><div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric title="Revenue" value={money(revenue)} note="Completed sales recorded" icon={Wallet} tone="bg-[#edf7f0] text-[#23845a]"/><Metric title="Expenses" value={money(totalExpenses)} note="Recorded expenses" icon={CreditCard} tone="bg-[#fff5e9] text-[#c17b2e]"/><Metric title="Active tasks" value={String(activeTasks)} note="Tasks not yet completed" icon={Target} tone="bg-[#eef4fb] text-[#4779b7]"/><Metric title="Customers" value={String(customers.length)} note="Customers in this workspace" icon={Users} tone="bg-[#f3f0fb] text-[#8066b5]"/></div>
   <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]"><section className="subtle-card p-5"><div className="flex items-center justify-between"><div><h2 className="text-[13px] font-bold">Recent activity</h2><p className="mt-1 text-[10px] text-[#929c95]">Latest records from your workspace</p></div><Activity size={16} className="text-[#16865b]"/></div><div className="mt-4 space-y-3">{[...tasks.slice(0,3).map(t=>({id:t.id,label:t.title,kind:"Task",date:t.created_at})),...customers.slice(0,2).map(c=>({id:c.id,label:c.name,kind:"Customer",date:c.created_at}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,4).map(item=><div key={item.kind+item.id} className="flex items-center justify-between gap-3 border-b border-[#f0f3f1] pb-3 text-[11px]"><span className="min-w-0 truncate font-semibold text-[#46534b]">{item.label}</span><span className="shrink-0 text-[#929c95]">{item.kind}</span></div>)}{!tasks.length&&!customers.length&&<p className="py-6 text-center text-[11px] text-[#929c95]">Your activity will appear here as you add records.</p>}</div></section><section className="subtle-card p-5"><div className="flex items-center justify-between"><div><h2 className="text-[13px] font-bold">Quick actions</h2><p className="mt-1 text-[10px] text-[#929c95]">Add information to your workspace</p></div><Zap size={16} className="text-[#16865b]"/></div><div className="mt-4 grid grid-cols-2 gap-2.5"><button onClick={()=>openModal("task")} className="quick-action"><Check size={15}/>Add task</button><button onClick={()=>openModal("customer")} className="quick-action"><Users size={15}/>Add customer</button><button onClick={()=>openModal("expense")} className="quick-action"><Wallet size={15}/>Record expense</button><button onClick={()=>setActive("Sales")} className="quick-action"><TrendingUp size={15}/>View sales</button></div></section></div>
   <section className="subtle-card overflow-hidden"><div className="flex items-center justify-between gap-3 px-5 py-4"><div><h2 className="text-[13px] font-bold">My tasks</h2><p className="mt-1 text-[10px] text-[#929c95]">Your latest tasks</p></div><button onClick={()=>setActive("Tasks & projects")} className="text-[11px] font-semibold text-[#16865b]">View all <ArrowRight size={13} className="ml-1 inline"/></button></div>{tasks.slice(0,5).map(task=><div key={task.id} className="table-row"><span className="min-w-0 truncate font-semibold text-[#46534b]">{task.title}</span><span className="text-[#929c95]">{shortDate(task.due_date)}</span><span><button onClick={()=>void updateTaskStatus(task)} className="rounded-full bg-[#f0f5f1] px-2.5 py-1 text-[9px] font-semibold text-[#47745a]">{task.status.replace("_"," ")}</button></span></div>)}{!tasks.length&&<div className="px-5 py-8 text-center text-[12px] text-[#929c95]">No tasks yet. Add your first task to get started.</div>}</section>
  </>:active==="Tasks & projects"?<section className="subtle-card overflow-hidden"><div className="px-5 py-4"><h2 className="text-[13px] font-bold">Tasks & projects</h2><p className="mt-1 text-[10px] text-[#929c95]">Select a task status to move it through your workflow.</p></div>{visibleTasks.map(task=><div key={task.id} className="table-row"><span className="truncate font-semibold text-[#46534b]">{task.title}</span><span className="text-[#929c95]">{shortDate(task.due_date)}</span><span><button onClick={()=>void updateTaskStatus(task)} className="rounded-full bg-[#f0f5f1] px-2.5 py-1 text-[9px] font-semibold text-[#47745a]">{task.status.replace("_"," ")}</button></span></div>)}{!visibleTasks.length&&<div className="px-5 py-10 text-center text-[12px] text-[#929c95]">No tasks found. Create a task to start tracking work.</div>}</section>:active==="Customers"?<section className="subtle-card overflow-hidden"><div className="px-5 py-4"><h2 className="text-[13px] font-bold">Customers</h2><p className="mt-1 text-[10px] text-[#929c95]">Customer records saved in this workspace.</p></div>{customers.map(c=><div key={c.id} className="table-row"><span className="truncate font-semibold text-[#46534b]">{c.name}</span><span className="truncate text-[#929c95]">{c.email||"No email"}</span><span className="text-[#929c95]">{c.company||"—"}</span></div>)}{!customers.length&&<div className="px-5 py-10 text-center text-[12px] text-[#929c95]">No customers yet. Add your first customer.</div>}</section>:active==="Finances"?<section className="subtle-card overflow-hidden"><div className="px-5 py-4"><h2 className="text-[13px] font-bold">Expenses</h2><p className="mt-1 text-[10px] text-[#929c95]">Expenses recorded in your workspace.</p></div>{expenses.map(e=><div key={e.id} className="table-row"><span className="truncate font-semibold text-[#46534b]">{e.description}</span><span className="text-[#929c95]">{shortDate(e.incurred_on)}</span><span className="font-semibold">{money(Number(e.amount),e.currency)}</span></div>)}{!expenses.length&&<div className="px-5 py-10 text-center text-[12px] text-[#929c95]">No expenses recorded yet.</div>}</section>:active==="Sales"?<section className="subtle-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4"><div><h2 className="text-[13px] font-bold">Sales</h2><p className="mt-1 text-[10px] text-[#929c95]">Record sales and track pending, completed, and cancelled payments.</p></div><div className="text-[11px] font-semibold text-[#16865b]">{sales.length} records</div></div>{sales.map(s=><div key={s.id} className="table-row"><span className="min-w-0"><span className="block truncate font-semibold text-[#46534b]">{s.description}</span><span className="mt-1 block text-[10px] text-[#929c95]">{shortDate(s.sold_on)}{s.inventory_item_id?" · "+(inventory.find(item=>item.id===s.inventory_item_id)?.name||"Inventory item")+" × "+s.quantity:""}</span></span><select aria-label={"Payment status for "+s.description} value={s.status} onChange={e=>void updateSaleStatus(s,e.target.value as Sale["status"])} className="max-w-[112px] rounded-lg border border-[#e9eeeb] bg-transparent px-2 py-1 text-[10px] capitalize outline-none"><option value="pending">Pending</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><span className="font-semibold">{money(Number(s.amount),s.currency)}</span></div>)}{!sales.length&&<div className="px-5 py-10 text-center text-[12px] text-[#929c95]">No sales recorded yet. Add your first sale to start tracking revenue.</div>}</section>:active === "Inventory" ? (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="subtle-card p-4"><p className="text-[10px] text-[#929c95]">Products</p><p className="mt-1 text-[22px] font-bold">{inventory.length}</p></div>
        <div className="subtle-card p-4"><p className="text-[10px] text-[#929c95]">Low stock</p><p className="mt-1 text-[22px] font-bold">{inventory.filter((item) => Number(item.quantity) <= Number(item.reorder_level)).length}</p></div>
        <div className="subtle-card p-4"><p className="text-[10px] text-[#929c95]">Units on hand</p><p className="mt-1 text-[22px] font-bold">{inventory.reduce((sum, item) => sum + Number(item.quantity), 0)}</p></div>
      </section>
      <section className="subtle-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
          <div><h2 className="text-[13px] font-bold">Products & stock</h2><p className="mt-1 text-[10px] text-[#929c95]">Manage quantities, prices and low-stock thresholds.</p></div>
          <span className="text-[11px] font-semibold text-[#16865b]">{inventory.length} products</span>
        </div>
        {inventory.map((item) => (
          <div key={item.id} className="table-row">
            <span className="min-w-0"><span className="block truncate font-semibold text-[#46534b]">{item.name}</span><span className="mt-1 block text-[10px] text-[#929c95]">{item.sku || "No SKU"}{item.unit_price != null ? " · " + money(Number(item.unit_price)) + " / unit" : ""}</span></span>
            <span className="text-[11px] font-semibold">{Number(item.quantity)} <span className="text-[10px] font-normal text-[#929c95]">in stock</span>{Number(item.quantity) <= Number(item.reorder_level) ? <span className="mt-1 block text-[9px] font-semibold text-[#b7792e]">Low stock</span> : null}</span>
            <span className="flex items-center justify-end gap-1"><button type="button" title="Adjust stock" aria-label={"Adjust stock for " + item.name} onClick={() => openStockAdjustment(item)} className="rounded-lg border border-[#e9eeeb] p-2 text-[#69756e]"><ArrowDownUp size={13}/></button><button type="button" title="Edit product" aria-label={"Edit " + item.name} onClick={() => openInventoryEditor(item)} className="rounded-lg border border-[#e9eeeb] p-2 text-[#69756e]"><Pencil size={13}/></button></span>
          </div>
        ))}
        {inventory.length === 0 ? <div className="px-5 py-10 text-center text-[12px] text-[#929c95]">No products yet. Add your first product to begin tracking stock.</div> : null}
      </section>
      <section className="subtle-card overflow-hidden">
        <div className="px-5 py-4"><h2 className="text-[13px] font-bold">Recent stock movements</h2><p className="mt-1 text-[10px] text-[#929c95]">Sales and manual stock adjustments.</p></div>
        {inventoryMovements.map((move) => (
          <div key={move.id} className="table-row">
            <span className="min-w-0"><span className="block truncate font-semibold text-[#46534b]">{inventory.find((item) => item.id === move.inventory_item_id)?.name || "Inventory item"}</span><span className="mt-1 block text-[10px] text-[#929c95]">{move.note || move.movement_type.replace("_", " ")} · {new Date(move.created_at).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span></span>
            <span className={"font-semibold " + (Number(move.quantity_change) > 0 ? "text-[#16865b]" : "text-[#a66b6b]")}>{Number(move.quantity_change) > 0 ? "+" : ""}{Number(move.quantity_change)}</span>
          </div>
        ))}
        {inventoryMovements.length === 0 ? <div className="px-5 py-7 text-center text-[11px] text-[#929c95]">Stock movements will appear here as stock changes.</div> : null}
      </section>
    </div>
  ):<section className="subtle-card flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#edf7f0] text-[#16865b]"><BriefcaseBusiness size={21}/></div><h2 className="mt-4 text-[15px] font-bold">{active}</h2><p className="mt-2 max-w-[360px] text-[12px] leading-relaxed text-[#89938d]">This module is being prepared. Your existing business records remain safely stored in your workspace.</p><button onClick={()=>setActive("Overview")} className="action-button mt-5">Back to overview</button></section>}
  <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[#a0aaa4]"><span>Business OS by Shorlah Cloud · Build. Manage. Grow.</span><span>{workspaceName} · Live workspace data</span></div>
 </div></main>
 {modal ? (<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null);}}><form onSubmit={saveModal} className="modal"><div className="flex items-start justify-between gap-4"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#16865b]">Workspace record</div><h2 className="mt-1 text-[18px] font-bold">{modal==="task"?"Create a task":modal==="customer"?"Add a customer":modal==="expense"?"Record an expense":modal==="sale"?"Record a sale":modal==="inventory"?(editingInventoryId?"Edit product":"Add product"):"Adjust stock"}</h2><p className="mt-1 text-[11px] text-[#89938d]">This record will be saved to your Supabase workspace.</p></div><button type="button" aria-label="Close" onClick={()=>setModal(null)} className="grid h-8 w-8 place-items-center rounded-lg text-[#8b9690] hover:bg-[#f4f7f4]"><X size={17}/></button></div><div className="mt-5 space-y-3">{modal==="task"&&<label className="block text-[11px] font-semibold text-[#526057]">Task name<input autoFocus required value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="e.g. Prepare monthly report" className="field"/></label>}{modal==="customer"&&<><label className="block text-[11px] font-semibold text-[#526057]">Customer name<input autoFocus required value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Customer name" className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Email (optional)<input type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="field"/></label></>}{modal==="expense"&&<><label className="block text-[11px] font-semibold text-[#526057]">Description<input autoFocus required value={expenseDescription} onChange={e=>setExpenseDescription(e.target.value)} placeholder="e.g. Office supplies" className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Amount (NGN)<input required type="number" min="1" step="0.01" value={expenseAmount} onChange={e=>setExpenseAmount(e.target.value)} placeholder="25000" className="field"/></label></>}{modal==="sale"&&<><label className="block text-[11px] font-semibold text-[#526057]">What was sold?<input autoFocus required maxLength={200} value={saleDescription} onChange={e=>setSaleDescription(e.target.value)} placeholder="e.g. Website design project" className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Sale amount (NGN)<input required type="number" min="0.01" step="0.01" value={saleAmount} onChange={e=>setSaleAmount(e.target.value)} placeholder="85000" className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Customer (optional)<select value={saleCustomerId} onChange={e=>setSaleCustomerId(e.target.value)} className="field"><option value="">No customer linked</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="block text-[11px] font-semibold text-[#526057]">Payment status<select value={saleStatus} onChange={e=>setSaleStatus(e.target.value as "pending"|"completed"|"cancelled")} className="field"><option value="pending">Pending</option><option value="completed">Completed / paid</option><option value="cancelled">Cancelled</option></select></label><label className="block text-[11px] font-semibold text-[#526057]">Sale date<input required type="date" value={saleDate} onChange={e=>setSaleDate(e.target.value)} className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Inventory product (optional)<select value={saleInventoryItemId} onChange={e=>setSaleInventoryItemId(e.target.value)} className="field"><option value="">No stock item linked</option>{inventory.map(item=><option key={item.id} value={item.id}>{item.name} · {Number(item.quantity)} available</option>)}</select></label>{saleInventoryItemId&&<label className="block text-[11px] font-semibold text-[#526057]">Quantity sold<input required type="number" min="0.01" step="0.01" value={saleQuantity} onChange={e=>setSaleQuantity(e.target.value)} className="field"/></label>}</>}</div>{modal==="inventory"&&<><label className="block text-[11px] font-semibold text-[#526057]">Product name<input autoFocus required maxLength={160} value={inventoryName} onChange={e=>setInventoryName(e.target.value)} placeholder="e.g. Office chair" className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">SKU (optional)<input maxLength={80} value={inventorySku} onChange={e=>setInventorySku(e.target.value)} placeholder="e.g. CHR-001" className="field"/></label>{!editingInventoryId&&<label className="block text-[11px] font-semibold text-[#526057]">Starting stock<input required type="number" min="0" step="0.01" value={inventoryQuantity} onChange={e=>setInventoryQuantity(e.target.value)} className="field"/></label>}<label className="block text-[11px] font-semibold text-[#526057]">Low-stock alert level<input required type="number" min="0" step="0.01" value={inventoryReorderLevel} onChange={e=>setInventoryReorderLevel(e.target.value)} className="field"/></label><label className="block text-[11px] font-semibold text-[#526057]">Unit price (NGN, optional)<input type="number" min="0" step="0.01" value={inventoryUnitPrice} onChange={e=>setInventoryUnitPrice(e.target.value)} placeholder="0" className="field"/></label></>}{modal==="stock"&&<><label className="block text-[11px] font-semibold text-[#526057]">Product<select required value={stockItemId} onChange={e=>setStockItemId(e.target.value)} className="field">{inventory.map(item=><option key={item.id} value={item.id}>{item.name} · {Number(item.quantity)} in stock</option>)}</select></label><label className="block text-[11px] font-semibold text-[#526057]">Quantity change<input autoFocus required type="number" step="0.01" value={stockChange} onChange={e=>setStockChange(e.target.value)} placeholder="Use a positive number to add, negative to remove" className="field"/></label><p className="text-[10px] text-[#89938d]">Stock cannot be reduced below zero.</p><label className="block text-[11px] font-semibold text-[#526057]">Note (optional)<input maxLength={200} value={stockNote} onChange={e=>setStockNote(e.target.value)} placeholder="e.g. New delivery received" className="field"/></label></>}{<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setModal(null)} className="action-button">Cancel</button><button disabled={busy} className="primary-button">{busy&&<LoaderCircle size={14} className="animate-spin"/>}Save record</button></div></form></div>) : null}
 </div>;
}
