// Northwind Rentals: maintenance requests for a small property manager.
const app = document.getElementById('app');
const nav = document.getElementById('nav');

const requests = [
  { title: 'Leaking kitchen faucet', unit: 'Maple Court · Unit 2B', tenant: 'Priya Shah', phone: '(512) 555-0161', category: 'Plumbing', priority: 'Normal', access: 'Tenant home after 5pm', pets: 'One cat', entry: 'Permission given', reported: 'Oct 21, 2026', pills: ['Open', 'Plumbing'], desc: 'Drips constantly from the base of the spout.' },
  { title: 'Bedroom window will not latch', unit: 'Harbor Lofts · Unit 7', tenant: 'Marcus Lee', phone: '(512) 555-0188', category: 'Windows', priority: 'High', access: 'Use lockbox', pets: 'None', entry: 'Permission given', reported: 'Oct 20, 2026', pills: ['Open', 'Tenant says the noise started after the storm last night'], desc: 'Latch is bent; window rattles in wind.' },
  { title: 'No hot water', unit: 'Elm Street Duplex · Unit A', tenant: 'Dana Ortiz', phone: '(512) 555-0102', category: 'Heating', priority: 'Urgent', access: 'Call first', pets: 'Two dogs', entry: 'Call before entry', reported: 'Oct 19, 2026', pills: ['Open', 'Urgent', 'Heating', 'Water heater', 'Overdue', 'Callback', 'Warranty'], desc: 'Water heater pilot keeps going out.' },
  { title: 'Hallway light flickers', unit: 'Maple Court · Common area', tenant: 'None', phone: 'None', category: 'Electrical', priority: 'Normal', access: 'Common area', pets: 'None', entry: 'Not needed', reported: 'Oct 17, 2026', pills: ['Open', 'Electrical'], desc: 'Second floor, near the stairs.' },
  { title: 'Garbage disposal jammed', unit: 'Harbor Lofts · Unit 3', tenant: 'Ann Kim', phone: '(512) 555-0143', category: 'Appliances', priority: 'Normal', access: 'Tenant home weekends', pets: 'None', entry: 'Permission given', reported: 'Oct 16, 2026', pills: ['Open', 'Appliances'], desc: 'Hums but does not turn.' },
  { title: 'Smoke detector chirping', unit: 'Elm Street Duplex · Unit B', tenant: 'Leo Grant', phone: '(512) 555-0177', category: 'Safety', priority: 'High', access: 'Use lockbox', pets: 'One dog', entry: 'Permission given', reported: 'Oct 15, 2026', pills: ['Open', 'Safety'], desc: 'Battery replaced; still chirps.' }
];
const properties = [
  { name: 'Maple Court', addr: '410 Maple Ave, Austin, TX', units: 12, leased: 11, open: 2 },
  { name: 'Harbor Lofts', addr: '88 Harbor St, Austin, TX', units: 9, leased: 7, open: 2 },
  { name: 'Elm Street Duplex', addr: '1520 Elm St, Austin, TX', units: 2, leased: 2, open: 2 }
];
const vendors = [
  { name: 'Clearflow Plumbing', trade: 'Plumbing', phone: '(512) 555-0110' },
  { name: 'Bright Spark Electric', trade: 'Electrical', phone: '(512) 555-0125' },
  { name: 'Hearth & Home HVAC', trade: 'Heating and cooling', phone: '(512) 555-0139' },
  { name: 'Handy Partners', trade: 'General repairs', phone: '(512) 555-0156' }
];

function renderNav(route) {
  const items = [['#/requests', 'Requests', requests.length], ['#/urgent', 'Urgent', 5], ['#/properties', 'Properties', properties.length], ['#/vendors', 'Vendors', '']];
  nav.innerHTML = items.map(([href, label, n]) => `<a href="${href}" class="${route === href ? 'current' : ''}">${label}${n !== '' ? ` <span class="count">${n}</span>` : ''}</a>`).join('');
}

const pillClass = p => p === 'Open' ? 'pill open-req' : p === 'Urgent' ? 'pill urgent' : p.length > 24 ? 'pill note' : 'pill';
function requestCard(r) {
  return `<article class="card">
    <h3>${r.title}</h3>
    <p class="unit">${r.unit}</p>
    <div class="pills">${r.pills.map(p => `<span class="${pillClass(p)}">${p}</span>`).join('')}</div>
    <p class="desc">${r.desc}</p>
    <dl class="facts">
      <div>Tenant: ${r.tenant}</div><div>Phone: ${r.phone}</div><div>Category: ${r.category}</div>
      <div>Priority: ${r.priority}</div><div>Access: ${r.access}</div><div>Pets: ${r.pets}</div><div>Entry: ${r.entry}</div>
    </dl>
    <div class="meta">
      <span class="date">Reported ${r.reported}</span>
      <span class="card-actions"><button class="iconbtn" title="">✎</button><button class="iconbtn" title="">⋯</button></span>
    </div>
    <button class="btn ghost" style="margin-top:12px">Assign vendor</button>
  </article>`;
}

function requestsPage() {
  return `<div class="head"><div><h1>Requests</h1><p class="sub">${requests.length} open requests · 2 overdue</p></div><button class="btn">New request</button></div>
    <section class="grid">${requests.map(requestCard).join('')}</section>`;
}
function urgentPage() {
  return `<div class="head"><div><h1>Urgent</h1><p class="sub">Requests marked urgent</p></div><button class="btn">New request</button></div>
    <div class="empty">No urgent requests right now.</div>`;
}
function propertiesPage() {
  return `<div class="head"><div><h1>Properties</h1><p class="sub">${properties.length} properties</p></div><button class="btn">New request</button></div>
    <section class="props">${properties.map(p => `<article class="card prop">
      <h3>${p.name}</h3>
      <p class="addr">${p.addr}</p>
      <div class="bar"><span style="width:${Math.round(100 * p.leased / p.units)}%"></span></div>
      <div class="leased">${p.leased} of ${p.units} units leased</div>
      <div class="pills" style="margin-top:10px"><span class="pill open-prop">Open</span><span class="pill">${p.open} requests</span></div>
    </article>`).join('')}</section>`;
}
function vendorsPage() {
  return `<div class="head"><div><h1>Vendors</h1><p class="sub">Who to call for each trade</p></div><button class="btn">New request</button></div>
    <table><thead><tr><th>Vendor</th><th>Trade</th><th>Phone</th></tr></thead>
    <tbody>${vendors.map(v => `<tr><td>${v.name}</td><td>${v.trade}</td><td><a href="tel:${v.phone.replace(/\D/g, '')}">${v.phone}</a></td></tr>`).join('')}</tbody></table>`;
}

function render() {
  const route = location.hash || '#/requests';
  renderNav(route);
  app.innerHTML = route === '#/urgent' ? urgentPage() : route === '#/properties' ? propertiesPage() : route === '#/vendors' ? vendorsPage() : requestsPage();
}

const filter = document.getElementById('filter'), menu = document.getElementById('filter-menu');
filter.addEventListener('click', () => { const open = menu.classList.toggle('open'); filter.setAttribute('aria-expanded', String(open)); });
addEventListener('keydown', e => { if (e.key === 'Escape') { menu.classList.remove('open'); filter.setAttribute('aria-expanded', 'false'); } });
menu.addEventListener('click', () => { menu.classList.remove('open'); filter.setAttribute('aria-expanded', 'false'); });
addEventListener('hashchange', render);
render();
