// Harvest Table: volunteer shift tool for food bank staff.
const app = document.getElementById('app');
const nav = document.getElementById('nav');

const shifts = [
  { id: 's1', day: 'Thursday, November 5', name: 'Pantry sorting', start: '2026-11-05T09:00', end: '12:00', time: '9:00 to 12:00', filled: 8, needed: 8 },
  { id: 's2', day: 'Thursday, November 5', name: 'Evening distribution', start: '2026-11-05T17:00', end: '19:30', time: '17:00 to 19:30', filled: 10, needed: 12 },
  { id: 's3', day: 'Friday, November 6', name: 'Delivery drivers', start: '2026-11-06T08:00', end: '11:00', time: '8:00 to 11:00', filled: 4, needed: 5 },
  { id: 's4', day: 'Saturday, November 7', name: 'Warehouse restock', start: '2026-11-07T08:00', end: '12:00', time: '8:00 to 12:00', filled: 6, needed: 12 },
  { id: 's5', day: 'Saturday, November 7', name: 'Saturday market table', start: '2026-11-07T10:00', end: '14:00', time: '10:00 to 14:00', filled: 7, needed: 8 },
  { id: 's6', day: 'Sunday, November 8', name: 'Kitchen prep', start: '2026-11-08T13:00', end: '16:00', time: '13:00 to 16:00', filled: 9, needed: 10 }
];

const volunteers = [
  { id: 'V-0193', name: 'Maya Chen', email: 'maya.chen@example.com', hours: 112, last: 'October 31', next: 'Confirmed', shifts: ['s1', 's4'] },
  { id: 'V-0207', name: 'Luis Ortega', email: 'lortega@example.com', hours: 64, last: 'October 24', next: 'Pending', shifts: ['s4'] },
  { id: 'V-0118', name: 'Priya Raman', email: 'priya.r@example.com', hours: 230, last: 'November 1', next: 'Confirmed', shifts: ['s2'] },
  { id: 'V-0251', name: 'Tom Becker', email: 'tbecker@example.com', hours: 18, last: 'October 17', next: 'Pending', shifts: ['s3'] },
  { id: 'V-0164', name: 'Grace Okafor', email: 'grace.okafor@example.com', hours: 96, last: 'October 30', next: 'Confirmed', shifts: ['s5', 's6'] },
  { id: 'V-0232', name: 'Sam Whitfield', email: 'swhitfield@example.com', hours: 41, last: 'October 26', next: 'Confirmed', shifts: ['s2'] }
];

const roster = {
  s4: [
    { vid: 'V-0193', status: 'Confirmed' }, { vid: 'V-0207', status: 'Pending' }, { vid: 'V-0164', status: 'Confirmed' },
    { vid: 'V-0118', status: 'Confirmed' }, { vid: 'V-0232', status: 'Pending' }, { vid: 'V-0251', status: 'Confirmed' }
  ]
};

let selected = null;
let query = '';
let formError = '';

function status(s) {
  if (s.filled >= s.needed) return '<span class="badge b-full">Full</span>';
  if (s.filled / s.needed < 0.6) return '<span class="badge b-under">Understaffed</span>';
  return '<span class="badge b-open">Open</span>';
}
const vname = id => (volunteers.find(v => v.id === id) || {}).name || id;

function renderNav(route) {
  const items = [
    ['#/dashboard', 'Dashboard', ''],
    ['#/shifts', 'Shifts', shifts.length],
    ['#/volunteers', 'Volunteers', 214],
    ['#/reports', 'Reports', ''],
    ['#/settings', 'Settings', '']
  ];
  nav.innerHTML = items.map(([href, label, count]) =>
    `<a href="${href}" class="${route.startsWith(href.slice(1)) ? 'current' : ''}">${label}<span class="count">${count}</span></a>`).join('');
}

function dashboard() {
  const rows = shifts.map(s => `
    <tr><td>${s.name}</td><td>${s.day}</td><td><span class="small">${s.filled} of ${s.needed}</span></td><td>${status(s)}</td></tr>`).join('');
  return `
    <h1>Dashboard</h1>
    <section class="tips">
      <h2>Welcome back, Dana!</h2>
      <p>Tip of the day: volunteers who get a thank-you note within 48 hours are more likely to come back. Try the Message button on the Volunteers page.</p>
      <blockquote>"No one has ever become poor by giving." Anne Frank</blockquote>
    </section>
    <div class="tiles">
      <div class="tile"><div class="label">Active volunteers</div><div class="value">214</div></div>
      <div class="tile"><div class="label">Hours this month</div><div class="value">1,320</div></div>
      <div class="tile"><div class="label">Shifts this week</div><div class="value">${shifts.length}</div></div>
      <div class="tile"><div class="label">No-show rate</div><div class="value">14%</div></div>
    </div>
    <h2>Upcoming shifts</h2>
    <div class="card"><table>
      <thead><tr><th>Shift</th><th>Day</th><th>Filled</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function shiftList() {
  const days = [...new Set(shifts.map(s => s.day))];
  const groups = days.map(day => {
    const rows = shifts.filter(s => s.day === day).map(s => `
      <tr draggable="true">
        <td class="handle">⋮⋮ Drag to set priority</td>
        <td><a href="#/shifts/${s.id}">${s.name}</a></td>
        <td class="time">${s.time}</td>
        <td><span class="bar"><span style="width:${Math.round(100 * s.filled / s.needed)}%"></span></span>${s.filled} of ${s.needed} filled</td>
        <td>${status(s)}</td>
        <td class="row-actions"><button class="btn" data-dup="${s.id}">Duplicate shift</button></td>
      </tr>`).join('');
    return `<h2>${day}</h2><div class="card"><table class="shift-table"><tbody>${rows}</tbody></table></div>`;
  }).join('');
  return `<h1>Shifts</h1>${groups}`;
}

function shiftDetail(id) {
  const s = shifts.find(x => x.id === id);
  if (!s) return shiftList();
  const list = (roster[id] || []).map((r, i) => `
    <tr><td>${vname(r.vid)}</td><td>${r.vid}</td>
    <td><span class="badge ${r.status === 'Confirmed' ? 'b-confirmed-green' : 'b-pending-amber'}">${r.status}</span></td>
    <td><button class="btn" data-remove="${id}:${i}">Remove</button></td></tr>`).join('');
  return `
    <h1>${s.name}</h1>
    <div class="card meta">
      <p><strong>Starts:</strong> ${s.start}</p>
      <p><strong>slot_capacity:</strong> ${s.needed}</p>
      <p><strong>Filled:</strong> ${s.filled}</p>
    </div>
    <h2>Volunteers on this shift</h2>
    <div class="card"><table>
      <thead><tr><th>Name</th><th>ID</th><th>Status</th><th></th></tr></thead>
      <tbody>${list || '<tr><td colspan="4">No volunteers yet.</td></tr>'}</tbody>
    </table></div>
    <h2>Add volunteer</h2>
    <div class="card">
      <label class="field-label" for="vid">Volunteer ID (e.g. V-0193)</label>
      <input class="field" id="vid" style="max-width:240px">
      ${formError ? `<p class="error">${formError}</p>` : ''}
      <button class="btn primary" data-add="${id}">Add</button>
    </div>`;
}

function volunteerPage() {
  const list = volunteers.filter(v => !query || v.email.toLowerCase().includes(query.toLowerCase()));
  const rows = list.map(v => `
    <tr data-vol="${v.id}" style="cursor:pointer">
      <td>${v.name}</td><td>${v.email}</td><td>${v.hours}</td>
      <td><span class="badge ${v.next === 'Confirmed' ? 'b-confirmed-blue' : 'b-pending-grey'}">${v.next}</span></td>
      <td><a class="btn" href="mailto:${v.email}">Message</a></td>
    </tr>`).join('');
  const v = volunteers.find(x => x.id === selected);
  const panel = v ? `
      <h2 style="margin-top:0">${v.name}</h2>
      <div class="meta"><p><strong>Total hours:</strong> ${v.hours}</p><p><strong>Last shift:</strong> ${v.last}</p></div>
      <h2>Upcoming shifts</h2>
      ${v.shifts.map(id => { const s = shifts.find(x => x.id === id); return `<p>${s.name}, ${s.day} <button class="btn" data-unassign="${v.id}:${id}">Unassign</button></p>`; }).join('')}
      <label class="field-label" for="notes">Notes</label>
      <textarea class="field" id="notes" rows="3"></textarea>
      <div class="row-actions"><button class="btn primary" data-savevol="1">Save changes</button><button class="btn danger" data-delvol="${v.id}">Delete volunteer</button></div>`
    : `<p class="empty">Select a volunteer to see details</p>`;
  return `
    <h1>Volunteers</h1>
    <label class="field-label" for="q">Search</label>
    <input class="field search" id="q" placeholder="Search by email" value="${query}">
    <div class="split">
      <div class="card"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Hours</th><th>Next shift</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <aside class="panel">${panel}</aside>
    </div>`;
}

function settings() {
  return `
    <h1>Settings</h1>
    <div class="card" style="max-width:520px">
      <label class="field-label" for="org">Organization name</label>
      <input class="field" id="org" value="Harvest Table Food Bank">
      <label class="field-label" for="len">Default shift length (hours)</label>
      <input class="field" id="len" type="number" value="3">
      <label><input type="checkbox" checked> Send reminder emails 24 hours before a shift</label>
      <p></p>
      <button class="btn primary" id="save-settings">Save</button>
    </div>`;
}

function reports() {
  return `
    <h1>Reports</h1>
    <div class="card"><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p></div>`;
}

function render() {
  const route = location.hash.replace(/^#/, '') || '/dashboard';
  renderNav(route);
  if (route.startsWith('/shifts/')) app.innerHTML = shiftDetail(route.split('/')[2]);
  else if (route === '/shifts') app.innerHTML = shiftList();
  else if (route === '/volunteers') app.innerHTML = volunteerPage();
  else if (route === '/settings') app.innerHTML = settings();
  else if (route === '/reports') app.innerHTML = reports();
  else app.innerHTML = dashboard();
}

app.addEventListener('click', e => {
  const row = e.target.closest('tr[data-vol]');
  const b = e.target.closest('button');
  if (b && b.dataset.add) {
    const val = document.getElementById('vid').value.trim().toUpperCase();
    const s = shifts.find(x => x.id === b.dataset.add);
    if (!/^V-\d{4}$/.test(val) || !volunteers.find(v => v.id === val)) { formError = 'Validation failed (code 3)'; render(); return; }
    formError = '';
    (roster[s.id] = roster[s.id] || []).push({ vid: val, status: 'Pending' });
    s.filled += 1; render(); return;
  }
  if (b && b.dataset.remove) {
    const [id, i] = b.dataset.remove.split(':');
    roster[id].splice(Number(i), 1);
    shifts.find(x => x.id === id).filled -= 1; render(); return;
  }
  if (b && b.dataset.savevol) { b.textContent = 'Saved'; return; }
  if (b && b.dataset.dup) {
    const s = shifts.find(x => x.id === b.dataset.dup);
    shifts.push({ ...s, id: s.id + 'n', day: s.day + ' (next week)', filled: 0 }); render(); return;
  }
  if (b && b.dataset.delvol) {
    volunteers.splice(volunteers.findIndex(v => v.id === b.dataset.delvol), 1); selected = null; render(); return;
  }
  if (b && b.dataset.unassign) { b.closest('p').remove(); return; }
  if (b) return;
  if (row) { selected = row.dataset.vol; render(); }
});

app.addEventListener('input', e => {
  if (e.target.id === 'q') {
    query = e.target.value; render();
    const q = document.getElementById('q'); q.focus(); q.setSelectionRange(query.length, query.length);
  }
});

window.addEventListener('hashchange', () => { formError = ''; render(); });
render();
