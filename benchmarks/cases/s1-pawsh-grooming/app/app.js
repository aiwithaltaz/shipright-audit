// Pawsh Grooming: booking site for a small dog groomer in Austin.
const app = document.getElementById('app');

const SERVICES = [
  { code: 'SVC-BATH-S', name: 'Bath and brush', prices: { small: 45, medium: 55, large: 70 }, minutes: 60 },
  { code: 'SVC-FULL-L', name: 'Full groom', prices: { small: 65, medium: 80, large: 105 }, minutes: 60 },
  { code: 'SVC-NAIL-X', name: 'Nail trim', prices: { small: 15, medium: 15, large: 20 }, minutes: 30 },
  { code: 'SVC-PUP-1', name: 'Puppy first visit', prices: { small: 40, medium: 40, large: 40 }, minutes: 60 }
];

const DAYS = [
  { label: 'Sun', date: 'Nov 1', closed: true },
  { label: 'Mon', date: 'Nov 2', closed: true },
  { label: 'Tue', date: 'Nov 3' },
  { label: 'Wed', date: 'Nov 4' },
  { label: 'Thu', date: 'Nov 5' },
  { label: 'Fri', date: 'Nov 6' },
  { label: 'Sat', date: 'Nov 7' }
];

const SLOTS = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'];

const bookings = [
  { day: 'Tue Nov 10', time: '10:00', pet: 'Biscuit', service: 'Full groom', status: 'Confirmed' },
  { day: 'Sat Nov 14', time: '9:00', pet: 'Luna', service: 'Bath and brush', status: 'Waiting for deposit' }
];

let draft = freshDraft();
function freshDraft() {
  return { step: 1, size: '', service: '', day: '', slot: '', pet: '', breed: '', owner: '', phone: '', email: '', phone2: '', error: '' };
}

const STEP_NAMES = ['Service', 'Date and time', 'Your dog', 'Review'];

function home() {
  return `
    <section class="hero">
      <img src="hero.jpg" alt="">
      <div class="hero-text">
        <h1>Happy dogs, fresh coats, no stress.</h1>
        <p>Gentle grooming for dogs of every size, by appointment in East Austin.</p>
        <div class="proof">
          <span>1,284 happy dogs groomed this month</span>
          <span>4.9 ★ from 2,000+ reviews</span>
        </div>
        <a class="btn" href="#/book">Book now</a>
      </div>
    </section>`;
}

function services() {
  const rows = SERVICES.map(s => `
    <tr><td>${s.name}</td><td>$${s.prices.small}</td><td>$${s.prices.medium}</td><td>$${s.prices.large}</td></tr>`).join('');
  return `
    <div class="page">
      <h1>Services and prices</h1>
      <p>Prices depend on your dog's size. Small is under 20 lb, medium 20 to 50 lb, large over 50 lb.</p>
      <div class="card">
        <table>
          <thead><tr><th>Service</th><th>Small</th><th>Medium</th><th>Large</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <a class="btn" href="#/book">Schedule</a>
    </div>`;
}

function stepper() {
  const pills = STEP_NAMES.map((n, i) => `<span class="step ${i + 1 === draft.step ? 'current' : ''}">${i + 1}. ${n}</span>`).join('');
  return `<div class="steps">${pills}</div><p class="step-label">Step ${draft.step} of 4: ${STEP_NAMES[draft.step - 1]}</p>`;
}

function book() {
  let body = '';
  if (draft.step === 1) {
    const sizes = ['small', 'medium', 'large'].map(s => `
      <label class="option"><input type="radio" name="size" value="${s}" ${draft.size === s ? 'checked' : ''}>${s[0].toUpperCase() + s.slice(1)} dog</label>`).join('');
    const opts = SERVICES.map(s => `
      <label class="option"><input type="radio" name="service" value="${s.code}" ${draft.service === s.code ? 'checked' : ''}>${s.code}: ${s.name}</label>`).join('');
    body = `<h2>How big is your dog?</h2>${sizes}<h2>Pick a service</h2>${opts}`;
  }
  if (draft.step === 2) {
    const days = DAYS.map(d => `<button class="day ${draft.day === d.date ? 'selected' : ''}" data-day="${d.date}" ${d.closed ? 'disabled' : ''}>${d.label}<br>${d.date}</button>`).join('');
    const slots = SLOTS.map(t => `<button class="slot ${draft.slot === t ? 'selected' : ''}" data-slot="${t}">${t}</button>`).join('');
    body = `<h2>Pick a day</h2><div class="days">${days}</div><p class="closed-note">We are closed Sundays and Mondays.</p>
      <h2>Pick a time</h2><div class="slots">${slots}</div>`;
  }
  if (draft.step === 3) {
    body = `<h2>Tell us about your dog</h2>
      <input class="field" name="pet" placeholder="Dog's name" value="${draft.pet}">
      <input class="field" name="breed" placeholder="Breed" value="${draft.breed}">
      <input class="field" name="owner" placeholder="Your name" value="${draft.owner}">
      <input class="field" name="phone" placeholder="Phone" value="${draft.phone}">
      <input class="field" name="email" placeholder="Email" value="${draft.email}">`;
  }
  if (draft.step === 4) {
    const svc = SERVICES.find(s => s.code === draft.service);
    const warn = draft.size === 'large'
      ? `<div class="warning">Large dogs need a 2-hour slot. The time you picked is 1 hour. Please pick a new time.</div>` : '';
    body = `<h2>Review your booking</h2>${warn}
      <div class="card">
        <p><strong>Service:</strong> ${svc ? svc.name : ''}</p>
        <p><strong>When:</strong> ${draft.day} at ${draft.slot}</p>
        <p><strong>Dog:</strong> ${draft.pet} (${draft.breed})</p>
        <p>Final price confirmed by email after your visit.</p>
      </div>
      <p>Confirm your phone number</p>
      <input class="field" name="phone2" placeholder="Phone" value="${draft.phone2}">`;
  }
  const error = draft.error ? `<p class="error">${draft.error}</p>` : '';
  const actions = draft.step < 4
    ? `<div class="actions"><button class="btn" id="next">Continue</button></div>`
    : `<div class="actions"><button class="btn" id="cancel">Cancel booking</button><button class="btn" id="confirm">Confirm booking</button></div>`;
  return `<div class="page"><h1>Book a groom</h1>${stepper()}${error}${body}${actions}</div>`;
}

function myBookings(tab) {
  const active = tab || 'upcoming';
  const rows = active === 'upcoming' ? bookings.map(b => `
    <tr><td>${b.day}</td><td>${b.time}</td><td>${b.pet}</td><td>${b.service}</td>
    <td><span class="badge ${b.status === 'Confirmed' ? 'ok' : 'wait'}">${b.status}</span></td></tr>`).join('') : '';
  return `
    <div class="page">
      <h1>My bookings</h1>
      <div class="tabs">
        <button class="tab ${active === 'upcoming' ? 'active' : ''}" data-tab="upcoming">Upcoming</button>
        <button class="tab ${active === 'past' ? 'active' : ''}" data-tab="past">Past</button>
      </div>
      <div class="card">
        <table>
          <thead><tr><th>Date</th><th>Time</th><th>Dog</th><th>Service</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p>To change a booking, call us at (512) 555-0148.</p>
    </div>`;
}

function contact() {
  return `
    <div class="page">
      <h1>Contact and hours</h1>
      <div class="card">
        <p><strong>Call:</strong> <a href="tel:+15125550148">(512) 555-0148</a></p>
        <p><strong>Visit:</strong> 2214 Manor Rd, Austin, TX 78722</p>
        <table>
          <thead><tr><th>Day</th><th>Hours</th></tr></thead>
          <tbody>
            <tr><td>Tuesday to Friday</td><td>9:00 to 17:00</td></tr>
            <tr><td>Saturday</td><td>8:00 to 15:00</td></tr>
            <tr><td>Sunday and Monday</td><td>Closed</td></tr>
          </tbody>
        </table>
      </div>
    </div>`;
}

function render() {
  const route = location.hash.replace(/^#/, '') || '/';
  if (route === '/') app.innerHTML = home();
  else if (route === '/services') app.innerHTML = services();
  else if (route === '/book') app.innerHTML = book();
  else if (route.startsWith('/bookings')) app.innerHTML = myBookings(route.split('/')[2]);
  else if (route === '/contact') app.innerHTML = contact();
  else app.innerHTML = '';
  window.scrollTo(0, 0);
}

function readFields() {
  app.querySelectorAll('input.field').forEach(i => { draft[i.name] = i.value.trim(); });
  const size = app.querySelector('input[name=size]:checked');
  const svc = app.querySelector('input[name=service]:checked');
  if (size) draft.size = size.value;
  if (svc) draft.service = svc.value;
}

app.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.day) { draft.day = t.dataset.day; render(); return; }
  if (t.dataset.slot) { draft.slot = t.dataset.slot; render(); return; }
  if (t.dataset.tab) { location.hash = '#/bookings/' + t.dataset.tab; return; }
  if (t.id === 'next') {
    readFields();
    draft.error = '';
    if (draft.step === 1 && (!draft.size || !draft.service)) { draft.error = 'Invalid input'; render(); return; }
    if (draft.step === 2 && (!draft.day || !draft.slot)) { draft.error = 'Invalid input'; draft.day = ''; draft.slot = ''; render(); return; }
    if (draft.step === 3 && (!draft.pet || !draft.owner || !draft.phone || !draft.email)) {
      draft.error = 'Invalid input';
      Object.assign(draft, { pet: '', breed: '', owner: '', phone: '', email: '' });
      render(); return;
    }
    draft.step += 1; render(); return;
  }
  if (t.id === 'cancel') { draft = freshDraft(); location.hash = '#/'; return; }
  if (t.id === 'confirm') {
    readFields();
    const svc = SERVICES.find(s => s.code === draft.service);
    bookings.push({ day: draft.day, time: draft.slot, pet: draft.pet, service: svc ? svc.name : '', status: 'Waiting for deposit' });
    draft = freshDraft();
    location.hash = '#/';
  }
});

window.addEventListener('hashchange', () => {
  if (location.hash !== '#/book') draft = freshDraft();
  render();
});
render();
