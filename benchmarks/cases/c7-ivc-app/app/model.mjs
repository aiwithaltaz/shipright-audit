export const JKS=['Dallas HQ','Albuquerque','Denver','Lewisville','Little Rock','Mid-Cities','Oklahoma City','Plano','Tri-Cities','Tyler','Waco','Event-day desk'];
export const SIZES=['Youth S','Youth M','Youth L','Adult XS','Adult S','Adult M','Adult L','Adult XL','Adult 2XL','Adult 3XL'];
export const EVENT_DATE='2026-11-22';
export const feeFor=date=>date<='2026-11-06'?15:20;
export const zoneFor=age=>age<=12?'Youth 8–12':age<=18?'Youth 13–18':age<=64?'Adults 19–64':'Senior 65+';
export const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(value);
export const digits=value=>String(value).replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
export const uid=prefix=>prefix+'-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).slice(0,8);
export const PEOPLE=[
{id:'p-adult',name:'Amina Noor',age:34,phone:'2145550101',jk:'Dallas HQ',active:true,coc:true,team:'Service'},
{id:'p-guardian',name:'Samir Mitha',age:42,phone:'2145550102',jk:'Dallas HQ',guardian:true,active:false,coc:false,team:'Guardian'},
{id:'p-child1',name:'Mariam Mitha',age:10,phone:'2145550102',jk:'Dallas HQ',active:true,coc:true,team:'Youth'},
{id:'p-child2',name:'Rayyan Mitha',age:14,phone:'2145550102',jk:'Dallas HQ',active:true,coc:true,team:'Youth'},
{id:'p-teen',name:'Zara Dossa',age:17,phone:'2145550103',jk:'Dallas HQ',active:true,coc:true,team:'Youth'},
{id:'p-support',name:'Naila Karim',age:58,phone:'2145550104',jk:'Dallas HQ',active:true,coc:true,team:'Hospitality'},
{id:'p-donate',name:'Farid Shah',age:38,phone:'2145550105',jk:'Dallas HQ',active:true,coc:true,team:'Logistics'},
{id:'p-coc',name:'Leena Rahim',age:29,phone:'2145550106',jk:'Dallas HQ',active:true,coc:false,team:'Service'},
{id:'p-inactive',name:'Omar Ali',age:32,phone:'2145550107',jk:'Dallas HQ',active:false,coc:true,team:'Logistics'},
{id:'p-precovered',name:'Idris Amin',age:47,phone:'2145550108',jk:'Dallas HQ',active:true,coc:true,precovered:true,team:'Service'}
];
export function isComplete(r){return Boolean(r.eligible && (!r.guardianRequired||r.guardianId) && (r.age>=18||r.waiver==='Signed') && ['Paid','Covered'].includes(r.payment));}
export function statusFor(r){if(!r.eligible)return'Eligibility needed';if(r.age<18&&r.waiver!=='Signed')return'Waiting on parent';if(r.payment==='Pending')return'Payment pending';return isComplete(r)?'Complete':'Guardian needed';}
export function createInitialState(){
 const names=['Safiya Merchant','Rafiq Sajan','Alina Lakhani','Ayaan Jessa','Salma Virani','Jamil Noor','Nadia Keshav','Imran Dhanani','Zehra Amin','Rayan Karim','Shirin Nasser','Zain Ali','Nargis Dossa','Faisal Mitha','Sana Rahim','Kabir Shah','Rukhsana Noor','Adil Sajan','Maya Merchant','Yasmin Jessa','Arif Lakhani','Sara Virani','Aly Nasser','Noor Amin'];
 const ages=[36,67,17,22,45,72,27,39,66,18,55,24,70,44,31,28,65,33,20,56,43,19,26,35];
 const registrations=names.map((name,i)=>({id:'IVC-'+String(1001+i),personId:'seed-'+i,name,age:ages[i],phone:'469555'+String(110+i).padStart(4,'0'),jk:i<8?'Dallas HQ':JKS[(i-8)%11],deskJk:i<8?'Dallas HQ':JKS[(i-8)%11],team:i%2?'Service':'Hospitality',size:SIZES[3+i%7],eligible:true,active:true,coc:true,guardian:false,guardianRequired:false,guardianId:'',waiver:i===2?'Waiting on parent':ages[i]<18?'Signed':'Not required',parentName:i===2?'Demo Parent':'',parentPhone:'2145550199',payment:i===3?'Pending':i===4?'Covered':'Paid',fee:15,date:'2026-11-05',actor:'Rehana · JK admin',emergencyName:'Demo Contact',emergencyPhone:'2145550198'}));
 const transactions=registrations.filter(r=>r.payment==='Paid').map((r,i)=>({id:'receipt-'+i,date:r.date,jk:r.deskJk,actor:r.actor,registrationIds:[r.id],ticketAmount:r.fee,donation:i===0?35:0,amount:r.fee+(i===0?35:0)}));
 return {version:1,registrations,transactions,closes:[],logs:[{id:'audit-seed',type:'Coverage approved',name:registrations[4].name,actor:'Rehana · JK admin',jk:'Dallas HQ',date:'2026-11-05',time:'10:12 AM',detail:'Demo pre-approved support · $15.00'}],overrides:{}};
}
export function scopedRows(state,ctx){return state.registrations.filter(r=>ctx.role==='super'||r.deskJk===ctx.jk);}
export function aggregate(state,jk='All JKs'){
 const rows=state.registrations.filter(r=>jk==='All JKs'||r.deskJk===jk);
 const tx=state.transactions.filter(r=>jk==='All JKs'||r.jk===jk);
 const countBy=fn=>rows.reduce((a,r)=>(a[fn(r)]=(a[fn(r)]||0)+1,a),{});
 const donations=tx.reduce((a,r)=>a+r.donation,0), covered=rows.filter(r=>r.payment==='Covered').reduce((a,r)=>a+r.fee,0);
 return {rows,count:rows.length,complete:rows.filter(isComplete).length,waiting:rows.filter(r=>r.age<18&&r.waiver!=='Signed').length,pending:rows.filter(r=>r.payment==='Pending').reduce((a,r)=>a+r.fee,0),cash:tx.reduce((a,r)=>a+r.amount,0),ticketCash:tx.reduce((a,r)=>a+r.ticketAmount,0),donations,covered,pool:donations-covered,zones:countBy(r=>zoneFor(r.age)),shirts:countBy(r=>r.size),teams:countBy(r=>r.team||'Not assigned'),guardians:rows.filter(r=>r.guardian).length,early:rows.filter(r=>r.fee===15).length,regular:rows.filter(r=>r.fee===20).length,tx};
}
export function validatePeople(people){
 const errors=[];
 if(!people.length)errors.push('Select at least one person.');
 for(const p of people){
  if(!p.name?.trim())errors.push('Enter each person’s full name.');
  if(!Number.isInteger(+p.age)||p.age<8||p.age>90)errors.push(p.name+': enter an age from 8 to 90.');
  if(digits(p.phone).length!==10)errors.push(p.name+': enter a 10-digit phone number.');
  if(!p.size||!SIZES.includes(p.size))errors.push(p.name+': choose a T-shirt size.');
  if(!p.emergencyName?.trim()||digits(p.emergencyPhone).length!==10)errors.push(p.name+': add an emergency contact and 10-digit phone.');
  if(!p.guardian&&(!p.active||!p.coc))errors.push(p.name+': resolve active status and Code of Conduct.');
  if(p.age<=15){const g=people.find(x=>x.id===p.guardianId);if(!g||g.age<18||g.id===p.id)errors.push(p.name+': choose one accompanying adult guardian.');}
  if(p.guardian && (p.age<18||!people.some(x=>x.age<18&&x.guardianId===p.id)))errors.push(p.name+': a non-volunteer guardian must be an adult linked to a child.');
 }
 return errors;
}
export function paymentTotals(people,cash=0){const due=people.filter(p=>p.payment==='Paid').reduce((s,p)=>s+p.fee,0);return {due,donation:Math.max(0,Math.round((Number(cash)-due)*100)/100),covered:people.filter(p=>p.payment==='Covered').reduce((s,p)=>s+p.fee,0),pending:people.filter(p=>p.payment==='Pending').reduce((s,p)=>s+p.fee,0)};}
export function commitGroup(state,people,cash,ctx){
 if(ctx.date>EVENT_DATE)throw Error('Registration closed after November 22.');
 const errors=validatePeople(people);
 if(errors.length)throw Error(errors[0]);
 if(people.some(p=>state.registrations.some(r=>r.personId===p.id)))throw Error('A selected person is already registered. Open their existing registration.');
 for(const p of people){if(!['Paid','Pending','Covered'].includes(p.payment))throw Error('Choose a payment status for each person.');if(p.age<18&&p.waiver!=='Signed'&&!(p.age>=16&&p.waiver==='Waiting on parent'&&digits(p.parentPhone).length===10))throw Error('Complete the parent waiver or prepare a parent link for '+p.name+'.');if(p.payment==='Covered'&&!p.coverageApproved)throw Error('Approve coverage for '+p.name+'.');}
 const totals=paymentTotals(people,cash);
 if(!Number.isFinite(+cash)||cash<totals.due||cash<0)throw Error('Cash received must cover the people marked Paid.');
 const next=structuredClone(state), map=Object.fromEntries(people.map(p=>[p.id,uid('IVC')]));
 const rows=people.map(p=>({...p,id:map[p.id],personId:p.id,guardianId:map[p.guardianId]||'',guardianRequired:p.age<=15,eligible:true,waiver:p.age>=18?'Not required':p.waiver,date:ctx.date,deskJk:ctx.jk,actor:ctx.actor}));
 next.registrations.push(...rows);
 for(const p of rows){if(p._original){const changed=Object.keys(p._original).filter(k=>String(p._original[k])!==String(p[k]));if(changed.length)next.logs.push({id:uid('audit'),type:'Data corrected at desk',name:p.name,actor:ctx.actor,jk:ctx.jk,date:ctx.date,time:ctx.time,detail:'Event-only changes: '+changed.join(', ')});delete p._original;}}
 for(const p of rows)if(p.payment==='Covered')next.logs.push({id:uid('audit'),type:'Coverage approved',name:p.name,actor:ctx.actor,jk:ctx.jk,date:ctx.date,time:ctx.time,detail:(p.precovered?'Pre-marked support':'Requested at desk')+' · '+money(p.fee)});
 if(+cash>0)next.transactions.push({id:uid('receipt'),date:ctx.date,jk:ctx.jk,actor:ctx.actor,registrationIds:rows.filter(r=>r.payment==='Paid').map(r=>r.id),ticketAmount:totals.due,donation:totals.donation,amount:+cash});
 next.logs.push({id:uid('audit'),type:'Registration saved',name:rows.map(r=>r.name).join(', '),actor:ctx.actor,jk:ctx.jk,date:ctx.date,time:ctx.time,detail:rows.length+' individual registration(s)'});
 return {state:next,ids:rows.map(r=>r.id)};
}
export function collectPayment(state,id,cash,ctx){
 const next=structuredClone(state),r=next.registrations.find(r=>r.id===id);
 if(!r||r.payment!=='Pending')throw Error('This registration has no pending payment.');
 if(ctx.role!=='super'&&r.deskJk!==ctx.jk)throw Error('This registration belongs to another desk.');
 if(!Number.isFinite(+cash)||+cash<r.fee)throw Error('Enter at least '+money(r.fee)+'.');
 r.payment='Paid';next.transactions.push({id:uid('receipt'),date:ctx.date,jk:r.deskJk,actor:ctx.actor,registrationIds:[id],ticketAmount:r.fee,donation:Math.round((cash-r.fee)*100)/100,amount:+cash});
 next.logs.push({id:uid('audit'),type:'Payment received',name:r.name,actor:ctx.actor,jk:r.deskJk,date:ctx.date,time:ctx.time,detail:money(cash)+' cash; '+money(cash-r.fee)+' donation'});
 return next;
}
export function publicPerson(r){return {id:r.id,name:r.name,age:r.age,size:r.size,jk:r.jk,complete:isComplete(r),status:statusFor(r),guardianName:r.guardianName||'',guardian:r.guardian||false};}
